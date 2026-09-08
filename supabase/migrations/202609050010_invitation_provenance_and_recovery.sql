-- Invitation Flow Hardening V1, Phase A.1.
-- Binds acceptance to one delivery artifact and makes ambiguous Auth outcomes
-- recoverable only after an exact Admin API reconciliation attempt.

alter table public.invitations
  add column acceptance_challenge_hash text null,
  add column acceptance_challenge_generation bigint not null default 0,
  add column acceptance_challenge_consumed_at timestamptz null,
  add constraint invitations_acceptance_challenge_hash_valid check (
    acceptance_challenge_hash is null
    or acceptance_challenge_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint invitations_acceptance_challenge_generation_valid check (
    acceptance_challenge_generation >= 0
  ),
  add constraint invitations_acceptance_challenge_consumption_valid check (
    acceptance_challenge_consumed_at is null or status = 'accepted'
  );

create function public.clear_terminal_invitation_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('accepted', 'revoked', 'expired', 'superseded') then
    new.acceptance_challenge_hash := null;
    if new.status <> 'accepted' then
      new.acceptance_challenge_consumed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger invitations_05_clear_terminal_challenge
  before insert or update of status on public.invitations
  for each row execute function public.clear_terminal_invitation_challenge();

revoke all on function public.clear_terminal_invitation_challenge()
  from public, anon, authenticated, service_role;

create function public.stage_account_invitation_acceptance_challenge(
  requested_invitation_id uuid,
  requested_delivery_attempt_id uuid,
  requested_challenge_hash text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  next_generation bigint;
begin
  if requested_delivery_attempt_id is null then
    raise exception 'delivery_lease_required' using errcode = '22023';
  end if;
  if requested_challenge_hash is null
    or requested_challenge_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_acceptance_challenge_hash' using errcode = '22023';
  end if;

  select invitation.* into invitation_record
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if invitation_record.delivery_attempt_id is distinct from requested_delivery_attempt_id
    or invitation_record.delivery_operation is null
    or invitation_record.delivery_idempotency_key is null
    or invitation_record.status not in ('pending', 'sent', 'delivery_failed')
  then
    raise exception 'delivery_lease_mismatch' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.invitation_operation_requests as operation_request
    where operation_request.actor_user_id = invitation_record.delivery_actor_user_id
      and operation_request.operation = invitation_record.delivery_operation
      and operation_request.idempotency_key = invitation_record.delivery_idempotency_key
      and operation_request.result_invitation_id = invitation_record.id
      and operation_request.request_status = 'in_progress'
  ) then
    raise exception 'invitation_operation_not_found' using errcode = 'P0002';
  end if;

  update public.invitations as invitation
  set acceptance_challenge_hash = requested_challenge_hash,
      acceptance_challenge_generation = invitation.acceptance_challenge_generation + 1,
      acceptance_challenge_consumed_at = null
  where invitation.id = invitation_record.id
  returning invitation.acceptance_challenge_generation into next_generation;

  return next_generation;
end;
$$;

revoke all on function public.stage_account_invitation_acceptance_challenge(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stage_account_invitation_acceptance_challenge(uuid, uuid, text)
  to service_role;

create function public.get_account_invitation_delivery_recovery_context(
  requested_invitation_id uuid,
  requested_delivery_attempt_id uuid
)
returns table (
  acceptance_challenge_hash text,
  acceptance_challenge_generation bigint,
  delivery_attempted_at timestamptz,
  expected_auth_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    invitation.acceptance_challenge_hash,
    invitation.acceptance_challenge_generation,
    invitation.delivery_attempted_at,
    coalesce(invitation.auth_user_id, account.auth_user_id)
  from public.invitations as invitation
  join public.accounts as account on account.id = invitation.account_id
  where invitation.id = requested_invitation_id
    and invitation.delivery_attempt_id = requested_delivery_attempt_id
    and invitation.delivery_operation is not null
    and invitation.delivery_idempotency_key is not null;
end;
$$;

revoke all on function public.get_account_invitation_delivery_recovery_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_account_invitation_delivery_recovery_context(uuid, uuid)
  to service_role;

create or replace function public.acknowledge_account_invitation_delivery(
  requested_invitation_id uuid,
  requested_delivery_attempt_id uuid,
  requested_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  auth_email text;
  auth_invitation_id text;
  auth_delivery_attempt_id text;
  auth_delivery_generation text;
  auth_challenge_hash text;
  auth_invited_at timestamptz;
  auth_confirmed_at timestamptz;
begin
  if requested_delivery_attempt_id is null then
    raise exception 'delivery_lease_required' using errcode = '22023';
  end if;

  select invitation.* into invitation_record
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if invitation_record.delivery_attempt_id is distinct from requested_delivery_attempt_id
    or invitation_record.delivery_operation is null
    or invitation_record.delivery_idempotency_key is null
  then
    raise exception 'delivery_lease_mismatch' using errcode = '23514';
  end if;
  if invitation_record.acceptance_challenge_hash is null
    or invitation_record.acceptance_challenge_generation < 1
  then
    raise exception 'acceptance_challenge_not_staged' using errcode = '23514';
  end if;

  select
    lower(auth_user.email),
    auth_user.raw_app_meta_data ->> 'account_invitation_id',
    auth_user.raw_app_meta_data ->> 'account_invitation_delivery_attempt_id',
    auth_user.raw_app_meta_data ->> 'account_invitation_delivery_generation',
    auth_user.raw_app_meta_data ->> 'account_invitation_acceptance_challenge_hash',
    auth_user.invited_at,
    auth_user.email_confirmed_at
  into
    auth_email,
    auth_invitation_id,
    auth_delivery_attempt_id,
    auth_delivery_generation,
    auth_challenge_hash,
    auth_invited_at,
    auth_confirmed_at
  from auth.users as auth_user
  where auth_user.id = requested_auth_user_id;

  if auth_email is distinct from invitation_record.normalized_email
    or auth_invitation_id is distinct from invitation_record.id::text
    or auth_delivery_attempt_id is distinct from requested_delivery_attempt_id::text
    or auth_delivery_generation is distinct from invitation_record.acceptance_challenge_generation::text
    or auth_challenge_hash is distinct from invitation_record.acceptance_challenge_hash
  then
    raise exception 'auth_user_reconciliation_mismatch' using errcode = '23514';
  end if;
  if auth_confirmed_at is not null
    and invitation_record.delivery_operation <> 'recover'
    and (auth_invited_at is null or auth_confirmed_at < auth_invited_at)
  then
    raise exception 'auth_user_confirmed_before_delivery' using errcode = '23514';
  end if;

  update public.invitation_operation_requests as operation_request
  set provider_auth_user_id = requested_auth_user_id,
      request_status = 'in_progress',
      error_code = null,
      completed_at = null
  where operation_request.actor_user_id = invitation_record.delivery_actor_user_id
    and operation_request.operation = invitation_record.delivery_operation
    and operation_request.idempotency_key = invitation_record.delivery_idempotency_key
    and operation_request.result_invitation_id = invitation_record.id;
  if not found then
    raise exception 'invitation_operation_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.acknowledge_account_invitation_delivery(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_account_invitation_delivery(uuid, uuid, uuid)
  to service_role;

create or replace function public.finalize_account_invitation_delivery_v2(
  requested_invitation_id uuid,
  requested_delivery_attempt_id uuid,
  requested_auth_user_id uuid,
  delivery_succeeded boolean,
  requested_provider_error_code text default null
)
returns table (
  invitation_id uuid,
  account_id uuid,
  invitation_status text,
  auth_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  result_record record;
begin
  if requested_delivery_attempt_id is null then
    raise exception 'delivery_lease_required' using errcode = '22023';
  end if;

  select invitation.* into invitation_record
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if invitation_record.delivery_attempt_id is distinct from requested_delivery_attempt_id
    or invitation_record.delivery_operation is null
    or invitation_record.delivery_idempotency_key is null
  then
    raise exception 'delivery_lease_mismatch' using errcode = '23514';
  end if;

  if delivery_succeeded and not exists (
    select 1
    from public.invitation_operation_requests as operation_request
    where operation_request.actor_user_id = invitation_record.delivery_actor_user_id
      and operation_request.operation = invitation_record.delivery_operation
      and operation_request.idempotency_key = invitation_record.delivery_idempotency_key
      and operation_request.result_invitation_id = invitation_record.id
      and operation_request.request_status = 'in_progress'
      and operation_request.provider_auth_user_id = requested_auth_user_id
  ) then
    raise exception 'delivery_acknowledgement_required' using errcode = '23514';
  end if;

  select * into result_record
  from public.finalize_account_invitation_delivery(
    requested_invitation_id,
    requested_delivery_attempt_id,
    requested_auth_user_id,
    delivery_succeeded,
    requested_provider_error_code
  );

  update public.invitation_operation_requests as operation_request
  set request_status = case when delivery_succeeded then 'completed' else 'failed' end,
      completed_at = case when delivery_succeeded then statement_timestamp() else null end,
      error_code = case when delivery_succeeded then null else requested_provider_error_code end,
      provider_auth_user_id = case
        when delivery_succeeded then requested_auth_user_id
        else operation_request.provider_auth_user_id
      end
  where operation_request.actor_user_id = invitation_record.delivery_actor_user_id
    and operation_request.operation = invitation_record.delivery_operation
    and operation_request.idempotency_key = invitation_record.delivery_idempotency_key
    and operation_request.result_invitation_id = invitation_record.id;

  update public.invitations as invitation
  set delivery_operation = null,
      delivery_idempotency_key = null,
      acceptance_challenge_hash = case
        when delivery_succeeded then invitation.acceptance_challenge_hash
        else null
      end,
      acceptance_challenge_consumed_at = case
        when delivery_succeeded then invitation.acceptance_challenge_consumed_at
        else null
      end
  where invitation.id = requested_invitation_id;

  return query select
    result_record.invitation_id,
    result_record.account_id,
    result_record.invitation_status,
    result_record.auth_user_id;
end;
$$;

create function public.prepare_account_invitation_v3(
  requested_email text,
  requested_display_name text,
  requested_locale text,
  requested_role_code text,
  requested_idempotency_key uuid
)
returns table (
  invitation_id uuid,
  source_invitation_id uuid,
  account_id uuid,
  invitation_status text,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  delivery_attempt_id uuid,
  correlation_id uuid,
  operation_outcome text,
  acknowledged_auth_user_id uuid,
  should_deliver boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  canonical_email text := lower(btrim(requested_email));
  canonical_display_name text := nullif(
    regexp_replace(btrim(coalesce(requested_display_name, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  target_role_id uuid;
  fingerprint text;
  operation_request public.invitation_operation_requests%rowtype;
  invitation_record public.invitations%rowtype;
  role_code text;
begin
  if actor_id is null or not public.user_has_permission(actor_id, 'invitation.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if canonical_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(canonical_email) not between 3 and 254
  then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if requested_locale not in ('es', 'en') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;
  if canonical_display_name is not null
    and char_length(canonical_display_name) not between 1 and 100
  then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select role.id, role.code into target_role_id, role_code
  from public.roles as role
  where role.code = requested_role_code
    and role.archived_at is null;
  if target_role_id is null
    or not public.can_user_grant_role(actor_id, target_role_id, 'grant')
  then
    raise exception 'role_grant_denied' using errcode = '42501';
  end if;

  fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(
          'create', canonical_email, canonical_display_name,
          requested_locale, requested_role_code
        )::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor_id::text || ':create:' || requested_idempotency_key::text,
      20260905
    )
  );

  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = 'create'
    and request.idempotency_key = requested_idempotency_key
  for update;

  if found then
    if operation_request.request_fingerprint <> fingerprint then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    if operation_request.request_status = 'in_progress' then
      select invitation.* into invitation_record
      from public.invitations as invitation
      where invitation.id = operation_request.result_invitation_id
      for update;
      if invitation_record.delivery_attempt_id is not null
        and (
          operation_request.provider_auth_user_id is not null
          or invitation_record.delivery_attempted_at
            < statement_timestamp() - interval '2 minutes'
        )
      then
        return query select
          invitation_record.id, invitation_record.id,
          invitation_record.account_id, invitation_record.status,
          invitation_record.normalized_email, invitation_record.display_name,
          invitation_record.preferred_locale, role_code,
          invitation_record.delivery_attempt_id,
          coalesce(invitation_record.delivery_correlation_id, invitation_record.correlation_id),
          'execute'::text, operation_request.provider_auth_user_id, false;
        return;
      end if;
    end if;
  end if;

  return query select *
  from public.prepare_account_invitation_v2(
    requested_email,
    requested_display_name,
    requested_locale,
    requested_role_code,
    requested_idempotency_key
  );
end;
$$;

create function public.prepare_account_invitation_action_v3(
  requested_invitation_id uuid,
  requested_operation text,
  requested_idempotency_key uuid,
  requested_reason text default null
)
returns table (
  invitation_id uuid,
  source_invitation_id uuid,
  account_id uuid,
  invitation_status text,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  delivery_attempt_id uuid,
  correlation_id uuid,
  operation_outcome text,
  acknowledged_auth_user_id uuid,
  should_deliver boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_invitation public.invitations%rowtype;
  result_invitation public.invitations%rowtype;
  operation_request public.invitation_operation_requests%rowtype;
  fingerprint text;
  canonical_reason text := btrim(coalesce(requested_reason, ''));
  role_code text;
begin
  if requested_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if requested_operation not in ('resend', 'replace', 'revoke') then
    raise exception 'invalid_invitation_operation' using errcode = '22023';
  end if;
  if actor_id is null or not public.user_has_permission(
    actor_id,
    case when requested_operation = 'revoke'
      then 'invitation.revoke' else 'invitation.resend' end
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_operation = 'revoke'
    and char_length(canonical_reason) not between 3 and 500
  then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select invitation.* into source_invitation
  from public.invitations as invitation
  where invitation.id = requested_invitation_id;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  select role.code into role_code
  from public.roles as role
  where role.id = source_invitation.requested_initial_role_id;
  if requested_operation = 'replace'
    and not public.can_user_grant_role(
      actor_id,
      source_invitation.requested_initial_role_id,
      'grant'
    )
  then
    raise exception 'role_grant_denied' using errcode = '42501';
  end if;

  fingerprint := encode(
    extensions.digest(
      convert_to(
        case
          when requested_operation = 'revoke'
            then jsonb_build_array('revoke', source_invitation.id, canonical_reason)
          else jsonb_build_array(
            requested_operation, source_invitation.id,
            source_invitation.normalized_email, source_invitation.display_name,
            source_invitation.preferred_locale, role_code
          )
        end::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor_id::text || ':' || requested_operation || ':' || requested_idempotency_key::text,
      20260905
    )
  );

  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = requested_operation
    and request.idempotency_key = requested_idempotency_key
  for update;

  if found then
    if operation_request.request_fingerprint <> fingerprint
      or operation_request.source_invitation_id <> requested_invitation_id
    then
    raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    if requested_operation in ('resend', 'replace')
      and operation_request.request_status = 'in_progress'
    then
      select invitation.* into result_invitation
      from public.invitations as invitation
      where invitation.id = operation_request.result_invitation_id
      for update;
      if result_invitation.delivery_attempt_id is not null
        and (
          operation_request.provider_auth_user_id is not null
          or result_invitation.delivery_attempted_at
            < statement_timestamp() - interval '2 minutes'
        )
      then
        return query select
          result_invitation.id, requested_invitation_id,
          result_invitation.account_id, result_invitation.status,
          result_invitation.normalized_email, result_invitation.display_name,
          result_invitation.preferred_locale, role_code,
          result_invitation.delivery_attempt_id,
          coalesce(result_invitation.delivery_correlation_id, result_invitation.correlation_id),
          'execute'::text, operation_request.provider_auth_user_id, false;
        return;
      end if;
    end if;
  elsif source_invitation.delivery_attempt_id is not null
    and source_invitation.delivery_operation is not null
    and (
      source_invitation.delivery_operation <> requested_operation
      or source_invitation.delivery_idempotency_key <> requested_idempotency_key
    )
    and source_invitation.delivery_attempted_at
      < statement_timestamp() - interval '2 minutes'
  then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;

  return query select *
  from public.prepare_account_invitation_action_v2(
    requested_invitation_id,
    requested_operation,
    requested_idempotency_key,
    requested_reason
  );
end;
$$;

revoke all on function public.prepare_account_invitation_v2(text, text, text, text, uuid)
  from authenticated;
revoke all on function public.prepare_account_invitation_action_v2(uuid, text, uuid, text)
  from authenticated;
revoke all on function public.prepare_account_invitation_v3(text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_account_invitation_v3(text, text, text, text, uuid)
  to authenticated;
revoke all on function public.prepare_account_invitation_action_v3(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_account_invitation_action_v3(uuid, text, uuid, text)
  to authenticated;

create function public.accept_current_account_invitation_v3(
  requested_acceptance_challenge text
)
returns table (account_id uuid, account_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_claim text := auth.jwt() -> 'app_metadata' ->> 'account_invitation_id';
  invitation_record public.invitations%rowtype;
  delivery_request public.invitation_operation_requests%rowtype;
  presented_hash text;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if invitation_claim is null
    or invitation_claim !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'invitation_context_invalid' using errcode = '23514';
  end if;
  if requested_acceptance_challenge is null
    or requested_acceptance_challenge !~ '^[A-Za-z0-9_-]{43}$'
  then
    raise exception 'invitation_challenge_invalid' using errcode = '23514';
  end if;

  select invitation.* into invitation_record
  from public.invitations as invitation
  where invitation.id = invitation_claim::uuid
    and (
      invitation.auth_user_id = actor_id
      or exists (
        select 1
        from public.invitation_operation_requests as operation_request
        where operation_request.actor_user_id = invitation.delivery_actor_user_id
          and operation_request.operation = invitation.delivery_operation
          and operation_request.idempotency_key = invitation.delivery_idempotency_key
          and operation_request.result_invitation_id = invitation.id
          and operation_request.request_status = 'in_progress'
          and operation_request.provider_auth_user_id = actor_id
      )
    )
  for update;
  if not found then
    raise exception 'invitation_context_mismatch' using errcode = '23514';
  end if;

  if invitation_record.delivery_attempt_id is not null then
    select operation_request.* into delivery_request
    from public.invitation_operation_requests as operation_request
    where operation_request.actor_user_id = invitation_record.delivery_actor_user_id
      and operation_request.operation = invitation_record.delivery_operation
      and operation_request.idempotency_key = invitation_record.delivery_idempotency_key
    for update;

    if found and delivery_request.provider_auth_user_id = actor_id then
      perform public.finalize_account_invitation_delivery_v2(
        invitation_record.id,
        invitation_record.delivery_attempt_id,
        actor_id,
        true,
        null
      );
    else
      raise exception 'invitation_recovery_required' using errcode = '23514';
    end if;

    select invitation.* into invitation_record
    from public.invitations as invitation
    where invitation.id = invitation_claim::uuid
      and invitation.auth_user_id = actor_id
    for update;
    if not found then
      raise exception 'invitation_context_mismatch' using errcode = '23514';
    end if;
  end if;

  case invitation_record.status
    when 'expired' then raise exception 'invitation_expired' using errcode = '23514';
    when 'revoked' then raise exception 'invitation_revoked' using errcode = '23514';
    when 'superseded' then raise exception 'invitation_superseded' using errcode = '23514';
    when 'accepted' then raise exception 'invitation_used' using errcode = '23514';
    when 'pending' then raise exception 'invitation_not_sent' using errcode = '23514';
    when 'delivery_failed' then raise exception 'invitation_delivery_failed' using errcode = '23514';
    else null;
  end case;

  if invitation_record.acceptance_challenge_hash is null
    or invitation_record.acceptance_challenge_consumed_at is not null
  then
    raise exception 'invitation_challenge_unavailable' using errcode = '23514';
  end if;
  presented_hash := encode(
    extensions.digest(
      convert_to(requested_acceptance_challenge, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if presented_hash <> invitation_record.acceptance_challenge_hash then
    raise exception 'invitation_challenge_mismatch' using errcode = '23514';
  end if;

  perform public.accept_current_account_invitation();
  update public.invitations as invitation
  set acceptance_challenge_consumed_at = statement_timestamp()
  where invitation.id = invitation_record.id;

  return query select invitation_record.account_id, 'pending_profile'::text;
end;
$$;

revoke all on function public.accept_current_account_invitation_v2()
  from authenticated;
revoke all on function public.accept_current_account_invitation_v3(text)
  from public, anon, authenticated;
grant execute on function public.accept_current_account_invitation_v3(text)
  to authenticated;
