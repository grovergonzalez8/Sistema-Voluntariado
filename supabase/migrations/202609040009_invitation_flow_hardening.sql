-- Invitation Flow Hardening V1, Phase A.
-- Keeps Auth delivery outside PostgreSQL while making its acknowledgement and
-- application authorization durable and generation-specific.

alter table public.invitation_operation_requests
  drop constraint invitation_operation_requests_operation_valid;

alter table public.invitation_operation_requests
  add column request_status text not null default 'in_progress',
  add column provider_auth_user_id uuid null references auth.users (id) on delete restrict,
  add column error_code text null,
  add column completed_at timestamptz null,
  add column updated_at timestamptz not null default statement_timestamp(),
  add constraint invitation_operation_requests_operation_valid check (
    operation in ('create', 'resend', 'replace', 'revoke')
  ),
  add constraint invitation_operation_requests_status_valid check (
    request_status in ('in_progress', 'completed', 'failed')
  ),
  add constraint invitation_operation_requests_error_valid check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  add constraint invitation_operation_requests_completion_valid check (
    (request_status = 'completed') = (completed_at is not null)
  );

create trigger invitation_operation_requests_20_set_updated_at
before update on public.invitation_operation_requests
for each row execute function public.set_updated_at();

alter table public.invitations
  add column delivery_operation text null,
  add column delivery_idempotency_key uuid null,
  add constraint invitations_delivery_operation_valid check (
    delivery_operation is null
    or delivery_operation in ('create', 'resend', 'replace')
  ),
  add constraint invitations_delivery_operation_pair_valid check (
    (delivery_operation is null) = (delivery_idempotency_key is null)
  );

insert into public.invitation_operation_requests (
  actor_user_id,
  operation,
  idempotency_key,
  request_fingerprint,
  source_invitation_id,
  result_invitation_id,
  request_status,
  completed_at,
  error_code
)
select
  invitation.created_by,
  'create',
  invitation.idempotency_key,
  invitation.request_fingerprint,
  invitation.id,
  invitation.id,
  case
    when invitation.status = 'sent' then 'completed'
    else 'failed'
  end,
  case when invitation.status = 'sent' then invitation.sent_at else null end,
  case when invitation.status = 'sent' then null
    else coalesce(invitation.delivery_error_code, 'legacy_result_unknown') end
from public.invitations as invitation
on conflict (actor_user_id, operation, idempotency_key) do nothing;

update public.invitation_operation_requests as operation_request
set request_status = 'failed',
    completed_at = null,
    error_code = 'legacy_result_unknown'
where operation_request.operation in ('resend', 'replace');

update public.invitations as invitation
set status = case when invitation.status = 'pending'
      then 'delivery_failed' else invitation.status end,
    delivery_error_code = coalesce(
      invitation.delivery_error_code,
      'legacy_result_unknown'
    ),
    delivery_attempt_id = null,
    delivery_attempted_at = null,
    delivery_actor_user_id = null,
    delivery_correlation_id = null,
    delivery_operation = null,
    delivery_idempotency_key = null
where invitation.delivery_attempt_id is not null
  and exists (
    select 1
    from public.invitation_operation_requests as operation_request
    where operation_request.result_invitation_id = invitation.id
      and operation_request.request_status = 'failed'
      and operation_request.error_code = 'legacy_result_unknown'
  );

-- Expiry never cuts a live delivery lease. Once a lease is stale, expiry closes
-- its durable request in the same transaction before terminalizing the invite.
create or replace function public.expire_open_invitations(
  requested_account_id uuid default null,
  requested_email text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  with candidates as materialized (
    select invitation.*
    from public.invitations as invitation
    where invitation.status in ('pending', 'sent', 'delivery_failed')
      and invitation.expires_at <= statement_timestamp()
      and (
        invitation.delivery_attempt_id is null
        or invitation.delivery_attempted_at < statement_timestamp() - interval '2 minutes'
      )
      and (requested_account_id is null or invitation.account_id = requested_account_id)
      and (requested_email is null or invitation.normalized_email = requested_email)
    for update
  ), closed_operations as (
    update public.invitation_operation_requests as operation_request
    set request_status = 'failed',
        completed_at = null,
        error_code = 'invitation_expired'
    from candidates as candidate
    where operation_request.actor_user_id = candidate.delivery_actor_user_id
      and operation_request.operation = candidate.delivery_operation
      and operation_request.idempotency_key = candidate.delivery_idempotency_key
      and operation_request.request_status = 'in_progress'
    returning operation_request.result_invitation_id
  ), expired as (
    update public.invitations as invitation
    set status = 'expired',
        expired_at = statement_timestamp(),
        delivery_attempt_id = null,
        delivery_attempted_at = null,
        delivery_actor_user_id = null,
        delivery_correlation_id = null,
        delivery_operation = null,
        delivery_idempotency_key = null
    from candidates as candidate
    where invitation.id = candidate.id
    returning invitation.id, invitation.account_id, invitation.created_by,
      invitation.correlation_id, candidate.status as previous_status
  )
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    correlation_id, previous_state, new_state, metadata
  )
  select
    null, 'invitation.expired', 'invitation', expired.id,
    array['status', 'expired_at'], expired.correlation_id,
    expired.previous_status, 'expired',
    jsonb_build_object('reason_code', 'invitation.expired')
  from expired;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create function public.prepare_account_invitation_v2(
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
  existing_invitation public.invitations%rowtype;
  reservation record;
  operation_request public.invitation_operation_requests%rowtype;
  outcome text;
  had_operation_request boolean := false;
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

  select role.id into target_role_id
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
    pg_catalog.hashtextextended(canonical_email, 20260724)
  );

  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = 'create'
    and request.idempotency_key = requested_idempotency_key
  for update;
  had_operation_request := found;

  if had_operation_request
    and operation_request.request_fingerprint <> fingerprint
  then
    raise exception 'idempotency_conflict' using errcode = '23505';
  end if;

  if had_operation_request
    and operation_request.request_status in ('completed', 'failed')
  then
    select invitation.* into existing_invitation
    from public.invitations as invitation
    where invitation.id = operation_request.result_invitation_id;
    if not found then
      raise exception 'invitation_operation_not_found' using errcode = 'P0002';
    end if;

    return query select
      existing_invitation.id, existing_invitation.id,
      existing_invitation.account_id, existing_invitation.status,
      existing_invitation.normalized_email, existing_invitation.display_name,
      existing_invitation.preferred_locale, requested_role_code,
      existing_invitation.delivery_attempt_id,
      coalesce(existing_invitation.delivery_correlation_id, existing_invitation.correlation_id),
      case when operation_request.request_status = 'completed'
        then 'replayed' else 'failed' end,
      operation_request.provider_auth_user_id, false;
    return;
  end if;

  select * into reservation
  from public.prepare_account_invitation(
    requested_email,
    requested_display_name,
    requested_locale,
    requested_role_code,
    requested_idempotency_key
  );

  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = auth.uid()
    and request.operation = 'create'
    and request.idempotency_key = requested_idempotency_key
  for update;

  if not found then
    insert into public.invitation_operation_requests (
      actor_user_id, operation, idempotency_key, request_fingerprint,
      source_invitation_id, result_invitation_id, request_status
    )
    select
      invitation.created_by, 'create', invitation.idempotency_key,
      invitation.request_fingerprint, invitation.id, invitation.id, 'in_progress'
    from public.invitations as invitation
    where invitation.id = reservation.invitation_id
    returning * into operation_request;
  end if;

  if operation_request.request_status = 'completed' then
    outcome := 'replayed';
  elsif operation_request.request_status = 'failed' then
    outcome := 'failed';
  elsif had_operation_request
    and reservation.should_deliver
    and operation_request.provider_auth_user_id is null
  then
    update public.invitations as invitation
    set delivery_operation = 'create',
        delivery_idempotency_key = requested_idempotency_key
    where invitation.id = reservation.invitation_id
      and invitation.delivery_attempt_id = reservation.delivery_attempt_id;
    perform public.finalize_account_invitation_delivery_v2(
      reservation.invitation_id,
      reservation.delivery_attempt_id,
      null,
      false,
      'delivery_outcome_unknown'
    );
    select request.* into operation_request
    from public.invitation_operation_requests as request
    where request.actor_user_id = actor_id
      and request.operation = 'create'
      and request.idempotency_key = requested_idempotency_key;
    outcome := 'failed';
  elsif reservation.should_deliver or operation_request.provider_auth_user_id is not null then
    outcome := 'execute';
    update public.invitation_operation_requests as request
    set request_status = 'in_progress', error_code = null, completed_at = null
    where request.actor_user_id = operation_request.actor_user_id
      and request.operation = operation_request.operation
      and request.idempotency_key = operation_request.idempotency_key;
    update public.invitations as invitation
    set delivery_operation = 'create',
        delivery_idempotency_key = requested_idempotency_key
    where invitation.id = reservation.invitation_id
      and invitation.delivery_attempt_id = reservation.delivery_attempt_id;
  else
    outcome := 'in_progress';
  end if;

  return query select
    reservation.invitation_id,
    reservation.invitation_id,
    reservation.account_id,
    case when outcome = 'failed' then (
      select invitation.status
      from public.invitations as invitation
      where invitation.id = reservation.invitation_id
    ) else reservation.invitation_status end,
    reservation.normalized_email,
    reservation.display_name,
    reservation.preferred_locale,
    reservation.requested_initial_role_code,
    reservation.delivery_attempt_id,
    reservation.correlation_id,
    outcome,
    operation_request.provider_auth_user_id,
    outcome = 'execute';
end;
$$;

revoke all on function public.prepare_account_invitation_v2(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_invitation_v2(text, text, text, text, uuid) to authenticated;

create function public.prepare_account_invitation_action_v2(
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
  reservation record;
  fingerprint text;
  canonical_reason text := btrim(coalesce(requested_reason, ''));
  role_code text;
  outcome text;
  previous_status text;
  had_operation_request boolean := false;
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_invitation.normalized_email, 20260724)
  );
  select invitation.* into source_invitation
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;

  -- A retry of the same replacement intent is keyed to the predecessor, while
  -- its delivery lease belongs to the successor. Reconcile that durable
  -- operation before applying terminal-state checks to the predecessor.
  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = requested_operation
    and request.idempotency_key = requested_idempotency_key
  for update;
  if found
    and operation_request.source_invitation_id = requested_invitation_id
    and operation_request.request_status = 'in_progress'
    and operation_request.result_invitation_id <> requested_invitation_id
  then
    select invitation.* into result_invitation
    from public.invitations as invitation
    where invitation.id = operation_request.result_invitation_id
    for update;
    if result_invitation.delivery_attempt_id is not null then
      if result_invitation.delivery_attempted_at
        >= statement_timestamp() - interval '2 minutes'
      then
        return query select
          result_invitation.id, requested_invitation_id, result_invitation.account_id,
          result_invitation.status, result_invitation.normalized_email,
          result_invitation.display_name, result_invitation.preferred_locale,
          role_code, result_invitation.delivery_attempt_id,
          coalesce(result_invitation.delivery_correlation_id, result_invitation.correlation_id),
          'in_progress', operation_request.provider_auth_user_id, false;
        return;
      end if;
      update public.invitation_operation_requests as request
      set request_status = 'failed', completed_at = null,
          error_code = 'delivery_outcome_unknown'
      where request.actor_user_id = operation_request.actor_user_id
        and request.operation = operation_request.operation
        and request.idempotency_key = operation_request.idempotency_key;
      update public.invitations as invitation
      set status = case when invitation.status = 'pending'
            then 'delivery_failed' else invitation.status end,
          delivery_error_code = 'delivery_outcome_unknown',
          delivery_attempt_id = null, delivery_attempted_at = null,
          delivery_actor_user_id = null, delivery_correlation_id = null,
          delivery_operation = null, delivery_idempotency_key = null
      where invitation.id = result_invitation.id
      returning invitation.* into result_invitation;
      return query select
        result_invitation.id, requested_invitation_id, result_invitation.account_id,
        result_invitation.status, result_invitation.normalized_email,
        result_invitation.display_name, result_invitation.preferred_locale,
        role_code, null::uuid,
        coalesce(result_invitation.delivery_correlation_id, result_invitation.correlation_id),
        'failed', operation_request.provider_auth_user_id, false;
      return;
    end if;
  end if;

  -- A different delivery intent may not be cut while its lease is live. A stale
  -- one is closed durably before this new terminal/delivery operation proceeds.
  if source_invitation.delivery_attempt_id is not null
    and source_invitation.delivery_operation is not null
    and (
      source_invitation.delivery_operation <> requested_operation
      or source_invitation.delivery_idempotency_key <> requested_idempotency_key
    )
  then
    if source_invitation.delivery_attempted_at
      >= statement_timestamp() - interval '2 minutes'
    then
      raise exception 'invitation_delivery_in_progress' using errcode = '23514';
    end if;
    update public.invitation_operation_requests as request
    set request_status = 'failed', completed_at = null,
        error_code = 'delivery_outcome_unknown'
    where request.actor_user_id = source_invitation.delivery_actor_user_id
      and request.operation = source_invitation.delivery_operation
      and request.idempotency_key = source_invitation.delivery_idempotency_key
      and request.request_status = 'in_progress';
    update public.invitations as invitation
    set status = case when invitation.status = 'pending'
          then 'delivery_failed' else invitation.status end,
        delivery_error_code = 'delivery_outcome_unknown',
        delivery_attempt_id = null, delivery_attempted_at = null,
        delivery_actor_user_id = null, delivery_correlation_id = null,
        delivery_operation = null, delivery_idempotency_key = null
    where invitation.id = source_invitation.id
    returning invitation.* into source_invitation;
  end if;

  if requested_operation = 'revoke' then
    fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_array('revoke', source_invitation.id, canonical_reason)::text,
          'utf8'
        ),
        'sha256'
      ),
      'hex'
    );

    select request.* into operation_request
    from public.invitation_operation_requests as request
    where request.actor_user_id = actor_id
      and request.operation = 'revoke'
      and request.idempotency_key = requested_idempotency_key
    for update;
    if found then
      if operation_request.request_fingerprint <> fingerprint
        or operation_request.source_invitation_id <> requested_invitation_id
      then
        raise exception 'idempotency_conflict' using errcode = '23505';
      end if;
      select invitation.* into source_invitation
      from public.invitations as invitation
      where invitation.id = operation_request.result_invitation_id;
      outcome := 'replayed';
    else
      perform public.expire_open_invitations(
        source_invitation.account_id,
        source_invitation.normalized_email
      );
      select invitation.* into source_invitation
      from public.invitations as invitation
      where invitation.id = requested_invitation_id
      for update;
      if source_invitation.status not in ('pending', 'sent', 'delivery_failed') then
        raise exception 'invitation_not_revocable' using errcode = '23514';
      end if;
      previous_status := source_invitation.status;

      update public.invitations as invitation
      set status = 'revoked',
          revoked_at = statement_timestamp(),
          revoked_by = actor_id,
          revocation_reason = canonical_reason,
          delivery_attempt_id = null,
          delivery_attempted_at = null,
          delivery_actor_user_id = null,
          delivery_correlation_id = null,
          delivery_operation = null,
          delivery_idempotency_key = null
      where invitation.id = source_invitation.id
      returning invitation.* into source_invitation;

      insert into public.invitation_operation_requests (
        actor_user_id, operation, idempotency_key, request_fingerprint,
        source_invitation_id, result_invitation_id, request_status, completed_at
      ) values (
        actor_id, 'revoke', requested_idempotency_key, fingerprint,
        source_invitation.id, source_invitation.id, 'completed', statement_timestamp()
      );

      insert into public.audit_logs (
        actor_user_id, action, entity_type, entity_id, changed_fields,
        correlation_id, previous_state, new_state, metadata
      ) values (
        actor_id, 'invitation.revoked', 'invitation', source_invitation.id,
        array['status', 'revoked_at', 'revoked_by', 'revocation_reason'],
        source_invitation.correlation_id, previous_status, 'revoked',
        jsonb_build_object('reason_code', 'invitation.revoked')
      );
      outcome := 'completed';
    end if;

    return query select
      source_invitation.id, source_invitation.id, source_invitation.account_id,
      source_invitation.status, source_invitation.normalized_email,
      source_invitation.display_name, source_invitation.preferred_locale,
      role_code, null::uuid, source_invitation.correlation_id, outcome, null::uuid,
      false;
    return;
  end if;

  fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(
          requested_operation, source_invitation.id,
          source_invitation.normalized_email, source_invitation.display_name,
          source_invitation.preferred_locale, role_code
        )::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );
  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = requested_operation
    and request.idempotency_key = requested_idempotency_key
  for update;
  had_operation_request := found;
  if had_operation_request and (
    operation_request.request_fingerprint <> fingerprint
    or operation_request.source_invitation_id <> requested_invitation_id
  ) then
    raise exception 'idempotency_conflict' using errcode = '23505';
  end if;
  if had_operation_request
    and operation_request.request_status in ('completed', 'failed')
  then
    select invitation.* into source_invitation
    from public.invitations as invitation
    where invitation.id = operation_request.result_invitation_id;
    if not found then
      raise exception 'invitation_operation_not_found' using errcode = 'P0002';
    end if;
    return query select
      source_invitation.id, requested_invitation_id, source_invitation.account_id,
      source_invitation.status, source_invitation.normalized_email,
      source_invitation.display_name, source_invitation.preferred_locale,
      role_code, source_invitation.delivery_attempt_id,
      coalesce(source_invitation.delivery_correlation_id, source_invitation.correlation_id),
      case when operation_request.request_status = 'completed'
        then 'replayed' else 'failed' end,
      operation_request.provider_auth_user_id, false;
    return;
  end if;

  select * into reservation
  from public.prepare_account_invitation_action(
    requested_invitation_id,
    requested_operation,
    requested_idempotency_key,
    requested_reason
  );

  if requested_operation = 'replace' then
    update public.audit_logs as audit
    set entity_id = requested_invitation_id,
        new_state = (
          select invitation.status
          from public.invitations as invitation
          where invitation.id = requested_invitation_id
        )
    where audit.action = 'invitation.replaced'
      and audit.entity_id = reservation.invitation_id
      and audit.correlation_id = reservation.correlation_id;
  end if;

  select request.* into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = requested_operation
    and request.idempotency_key = requested_idempotency_key
  for update;

  if operation_request.request_status = 'completed' then
    outcome := 'replayed';
  elsif operation_request.request_status = 'failed' then
    outcome := 'failed';
  elsif had_operation_request
    and reservation.should_deliver
    and operation_request.provider_auth_user_id is null
  then
    update public.invitations as invitation
    set delivery_operation = requested_operation,
        delivery_idempotency_key = requested_idempotency_key
    where invitation.id = reservation.invitation_id
      and invitation.delivery_attempt_id = reservation.delivery_attempt_id;
    perform public.finalize_account_invitation_delivery_v2(
      reservation.invitation_id,
      reservation.delivery_attempt_id,
      null,
      false,
      'delivery_outcome_unknown'
    );
    select request.* into operation_request
    from public.invitation_operation_requests as request
    where request.actor_user_id = actor_id
      and request.operation = requested_operation
      and request.idempotency_key = requested_idempotency_key;
    outcome := 'failed';
  elsif reservation.should_deliver or operation_request.provider_auth_user_id is not null then
    outcome := 'execute';
    update public.invitation_operation_requests as request
    set request_status = 'in_progress', error_code = null, completed_at = null
    where request.actor_user_id = actor_id
      and request.operation = requested_operation
      and request.idempotency_key = requested_idempotency_key;
    update public.invitations as invitation
    set delivery_operation = requested_operation,
        delivery_idempotency_key = requested_idempotency_key
    where invitation.id = reservation.invitation_id
      and invitation.delivery_attempt_id = reservation.delivery_attempt_id;
  else
    outcome := 'in_progress';
  end if;

  return query select
    reservation.invitation_id,
    requested_invitation_id,
    reservation.account_id,
    case when outcome = 'failed' then (
      select invitation.status
      from public.invitations as invitation
      where invitation.id = reservation.invitation_id
    ) else reservation.invitation_status end,
    reservation.normalized_email,
    reservation.display_name,
    reservation.preferred_locale,
    reservation.requested_initial_role_code,
    reservation.delivery_attempt_id,
    reservation.correlation_id,
    outcome,
    operation_request.provider_auth_user_id,
    outcome = 'execute';
end;
$$;

revoke all on function public.prepare_account_invitation_action_v2(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_account_invitation_action_v2(uuid, text, uuid, text) to authenticated;

-- Keep the legacy delivery primitive owner-callable for the V2 wrapper, but move
-- its reconciliation check to server-controlled app_metadata. User metadata is
-- editable by the authenticated subject and therefore cannot be authoritative.
create or replace function public.finalize_account_invitation_delivery(
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
  auth_email text;
  auth_invitation_id text;
  final_status text;
  audit_action text;
begin
  if requested_delivery_attempt_id is null then
    raise exception 'delivery_lease_required' using errcode = '22023';
  end if;

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if invitation_record.delivery_attempt_id is null
    or invitation_record.delivery_attempt_id <> requested_delivery_attempt_id
  then
    raise exception 'delivery_lease_mismatch' using errcode = '23514';
  end if;

  if invitation_record.status not in ('pending', 'sent', 'delivery_failed') then
    raise exception 'invitation_not_deliverable' using errcode = '23514';
  end if;

  if delivery_succeeded then
    if requested_auth_user_id is null then
      raise exception 'auth_user_required' using errcode = '22023';
    end if;

    select
      lower(auth_user.email),
      auth_user.raw_app_meta_data ->> 'account_invitation_id'
    into auth_email, auth_invitation_id
    from auth.users as auth_user
    where auth_user.id = requested_auth_user_id;

    if auth_email is distinct from invitation_record.normalized_email
      or auth_invitation_id is distinct from invitation_record.id::text
    then
      raise exception 'auth_user_reconciliation_mismatch' using errcode = '23514';
    end if;

    update public.accounts as account
    set auth_user_id = requested_auth_user_id,
        authority_version = account.authority_version + 1
    where account.id = invitation_record.account_id
      and (account.auth_user_id is null or account.auth_user_id = requested_auth_user_id);

    if not found then
      raise exception 'account_auth_link_mismatch' using errcode = '23514';
    end if;

    update public.invitations as invitation
    set status = 'sent',
        sent_at = statement_timestamp(),
        expires_at = statement_timestamp() + interval '1 hour',
        delivery_error_code = null,
        auth_user_id = requested_auth_user_id,
        delivery_attempt_id = null,
        delivery_attempted_at = null,
        delivery_actor_user_id = null,
        delivery_correlation_id = null
    where invitation.id = invitation_record.id
    returning invitation.status into final_status;

    audit_action := case
      when invitation_record.status = 'sent' then 'invitation.resent'
      else 'invitation.sent'
    end;
  else
    if requested_provider_error_code is null
      or requested_provider_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
    then
      raise exception 'invalid_provider_error_code' using errcode = '22023';
    end if;

    final_status := case
      when invitation_record.status = 'sent' then 'sent'
      else 'delivery_failed'
    end;
    audit_action := case
      when invitation_record.status = 'sent' then 'invitation.resend_failed'
      else 'invitation.delivery_failed'
    end;

    update public.invitations as invitation
    set status = final_status,
        delivery_error_code = requested_provider_error_code,
        delivery_attempt_id = null,
        delivery_attempted_at = null,
        delivery_actor_user_id = null,
        delivery_correlation_id = null
    where invitation.id = invitation_record.id;
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, previous_state, new_state, metadata
  )
  values (
    invitation_record.delivery_actor_user_id, audit_action,
    'invitation', invitation_record.id,
    case
      when delivery_succeeded and invitation_record.status = 'sent'
        then array['sent_at', 'expires_at', 'delivery_error_code']
      when delivery_succeeded
        then array['status', 'sent_at', 'expires_at', 'delivery_error_code', 'auth_user_id']
      when invitation_record.status = 'sent'
        then array['delivery_error_code']
      else array['status', 'delivery_error_code']
    end,
    case when delivery_succeeded then requested_auth_user_id else null end,
    invitation_record.delivery_correlation_id,
    invitation_record.status, final_status,
    case
      when delivery_succeeded then jsonb_build_object('reason_code', 'invitation.delivered')
      else jsonb_build_object(
        'reason_code', 'invitation.delivery_failed',
        'provider_error_code', requested_provider_error_code
      )
    end
  );

  return query
  select
    invitation_record.id,
    invitation_record.account_id,
    final_status,
    case when delivery_succeeded then requested_auth_user_id
      else invitation_record.auth_user_id end;
end;
$$;

create function public.acknowledge_account_invitation_delivery(
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

  select lower(auth_user.email),
    auth_user.raw_app_meta_data ->> 'account_invitation_id',
    auth_user.invited_at, auth_user.email_confirmed_at
  into auth_email, auth_invitation_id, auth_invited_at, auth_confirmed_at
  from auth.users as auth_user
  where auth_user.id = requested_auth_user_id;
  if auth_email is distinct from invitation_record.normalized_email
    or auth_invitation_id is distinct from invitation_record.id::text
  then
    raise exception 'auth_user_reconciliation_mismatch' using errcode = '23514';
  end if;
  if auth_confirmed_at is not null
    and (auth_invited_at is null or auth_confirmed_at < auth_invited_at)
  then
    raise exception 'auth_user_confirmed_before_delivery' using errcode = '23514';
  end if;

  update public.invitation_operation_requests as request
  set provider_auth_user_id = requested_auth_user_id,
      request_status = 'in_progress',
      error_code = null,
      completed_at = null
  where request.actor_user_id = invitation_record.delivery_actor_user_id
    and request.operation = invitation_record.delivery_operation
    and request.idempotency_key = invitation_record.delivery_idempotency_key
    and request.result_invitation_id = invitation_record.id;
  if not found then
    raise exception 'invitation_operation_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.acknowledge_account_invitation_delivery(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_account_invitation_delivery(uuid, uuid, uuid) to service_role;

create function public.finalize_account_invitation_delivery_v2(
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
    from public.invitation_operation_requests as request
    where request.actor_user_id = invitation_record.delivery_actor_user_id
      and request.operation = invitation_record.delivery_operation
      and request.idempotency_key = invitation_record.delivery_idempotency_key
      and request.result_invitation_id = invitation_record.id
      and request.request_status = 'in_progress'
      and request.provider_auth_user_id = requested_auth_user_id
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

  update public.invitation_operation_requests as request
  set request_status = case when delivery_succeeded then 'completed' else 'failed' end,
      completed_at = case when delivery_succeeded then statement_timestamp() else null end,
      error_code = case when delivery_succeeded then null else requested_provider_error_code end,
      provider_auth_user_id = case
        when delivery_succeeded then requested_auth_user_id
        else request.provider_auth_user_id
      end
  where request.actor_user_id = invitation_record.delivery_actor_user_id
    and request.operation = invitation_record.delivery_operation
    and request.idempotency_key = invitation_record.delivery_idempotency_key
    and request.result_invitation_id = invitation_record.id;

  update public.invitations as invitation
  set delivery_operation = null,
      delivery_idempotency_key = null
  where invitation.id = requested_invitation_id;

  return query select
    result_record.invitation_id,
    result_record.account_id,
    result_record.invitation_status,
    result_record.auth_user_id;
end;
$$;

revoke all on function public.finalize_account_invitation_delivery_v2(uuid, uuid, uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.finalize_account_invitation_delivery_v2(uuid, uuid, uuid, boolean, text) to service_role;

create function public.accept_current_account_invitation_v2()
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
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if invitation_claim is null
    or invitation_claim !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'invitation_context_invalid' using errcode = '23514';
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
    elsif invitation_record.delivery_attempted_at
      >= statement_timestamp() - interval '2 minutes'
    then
      raise exception 'invitation_delivery_in_progress' using errcode = '23514';
    else
      perform public.finalize_account_invitation_delivery_v2(
        invitation_record.id,
        invitation_record.delivery_attempt_id,
        null,
        false,
        'delivery_outcome_unknown'
      );
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

  return query select * from public.accept_current_account_invitation();
end;
$$;

revoke all on function public.accept_current_account_invitation() from authenticated;
revoke all on function public.accept_current_account_invitation_v2() from public, anon, authenticated;
grant execute on function public.accept_current_account_invitation_v2() to authenticated;

create function public.complete_current_account_profile_v2(
  requested_display_name text,
  requested_locale text
)
returns table (account_id uuid, account_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_claim text := auth.jwt() -> 'app_metadata' ->> 'account_invitation_id';
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if invitation_claim is null
    or invitation_claim !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not exists (
      select 1
      from public.invitations as invitation
      where invitation.id = invitation_claim::uuid
        and invitation.auth_user_id = actor_id
        and invitation.status = 'accepted'
    )
  then
    raise exception 'invitation_context_mismatch' using errcode = '23514';
  end if;

  return query select *
  from public.complete_current_account_profile(requested_display_name, requested_locale);
end;
$$;

revoke all on function public.complete_current_account_profile(text, text) from authenticated;
revoke all on function public.complete_current_account_profile_v2(text, text) from public, anon, authenticated;
grant execute on function public.complete_current_account_profile_v2(text, text) to authenticated;

-- The legacy mutation entrypoints remain owner-callable for the V2 wrappers only.
revoke all on function public.prepare_account_invitation(text, text, text, text, uuid) from authenticated;
revoke all on function public.prepare_account_invitation_action(uuid, text, uuid, text) from authenticated;
revoke all on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) from service_role;
