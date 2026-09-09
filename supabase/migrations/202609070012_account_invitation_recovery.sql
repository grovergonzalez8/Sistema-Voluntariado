-- FASE B: recover a confirmed Auth identity only when Account and the prior
-- Invitation prove the same ownership. The Account stays invited until the
-- recipient consumes the new challenge and completes onboarding normally.

alter table public.invitation_operation_requests
  drop constraint invitation_operation_requests_operation_valid;
alter table public.invitation_operation_requests
  add constraint invitation_operation_requests_operation_valid check (
    operation in ('create', 'resend', 'replace', 'revoke', 'recover')
  );

alter table public.invitations
  drop constraint invitations_delivery_operation_valid;
alter table public.invitations
  add constraint invitations_delivery_operation_valid check (
    delivery_operation is null
    or delivery_operation in ('create', 'resend', 'replace', 'recover')
  );

insert into public.permissions (code, description)
values ('invitation.recover', 'Recuperar invitaciones con ownership comprobado')
on conflict (code) do update
set description = excluded.description,
    updated_at = statement_timestamp(),
    archived_at = null;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'administrator'
  and role.archived_at is null
  and permission.code = 'invitation.recover'
on conflict do nothing;

create function public.prepare_account_invitation_recovery_v1(
  requested_account_id uuid,
  requested_idempotency_key uuid,
  requested_reason text
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
  actor_id uuid := (select auth.uid());
  account_record public.accounts%rowtype;
  source_invitation public.invitations%rowtype;
  result_invitation public.invitations%rowtype;
  operation_request public.invitation_operation_requests%rowtype;
  role_code text;
  auth_email text;
  auth_confirmed_at timestamptz;
  fingerprint text;
  correlation uuid;
  delivery_attempt uuid;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'invitation.recover')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(requested_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array('recover', requested_account_id, btrim(requested_reason))::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor_id::text || ':recover:' || requested_idempotency_key::text,
      20260907
    )
  );

  select request.*
  into operation_request
  from public.invitation_operation_requests as request
  where request.actor_user_id = actor_id
    and request.operation = 'recover'
    and request.idempotency_key = requested_idempotency_key
  for update;
  if found then
    if operation_request.request_fingerprint <> fingerprint
      or operation_request.source_invitation_id is null
    then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    select invitation.*
    into result_invitation
    from public.invitations as invitation
    where invitation.id = operation_request.result_invitation_id
    for update;
    if not found then
      raise exception 'invitation_operation_not_found' using errcode = 'P0002';
    end if;
    select role.code into role_code
    from public.roles as role
    where role.id = result_invitation.requested_initial_role_id;
    if operation_request.request_status = 'in_progress'
      and result_invitation.delivery_attempted_at is not null
      and (
        operation_request.provider_auth_user_id is not null
        or result_invitation.delivery_attempted_at
          < statement_timestamp() - interval '2 minutes'
      )
    then
      return query select
        result_invitation.id,
        operation_request.source_invitation_id,
        result_invitation.account_id,
        result_invitation.status,
        result_invitation.normalized_email,
        result_invitation.display_name,
        result_invitation.preferred_locale,
        role_code,
        result_invitation.delivery_attempt_id,
        result_invitation.correlation_id,
        'execute'::text,
        result_invitation.auth_user_id,
        false;
      return;
    end if;

    return query select
      result_invitation.id,
      operation_request.source_invitation_id,
      result_invitation.account_id,
      result_invitation.status,
      result_invitation.normalized_email,
      result_invitation.display_name,
      result_invitation.preferred_locale,
      role_code,
      result_invitation.delivery_attempt_id,
      result_invitation.correlation_id,
      case
        when operation_request.request_status = 'completed' then 'replayed'
        when operation_request.request_status = 'failed' then 'failed'
        else 'in_progress'
      end,
      result_invitation.auth_user_id,
      false;
    return;
  end if;

  select account.*
  into account_record
  from public.accounts as account
  where account.id = requested_account_id
  for update;
  if not found or account_record.status <> 'invited'
    or account_record.auth_user_id is null
  then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;

  select auth_user.email, auth_user.email_confirmed_at
  into auth_email, auth_confirmed_at
  from auth.users as auth_user
  where auth_user.id = account_record.auth_user_id;
  if auth_email is null
    or auth_confirmed_at is null
  then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;

  select invitation.*
  into source_invitation
  from public.invitations as invitation
  where invitation.account_id = account_record.id
    and invitation.status in ('revoked', 'expired', 'superseded')
    and lower(auth_email) = invitation.normalized_email
  order by invitation.created_at desc
  limit 1;
  if not found
    or exists (
      select 1
      from public.invitations as accepted
      where accepted.account_id = account_record.id
        and accepted.status = 'accepted'
    )
    or exists (
      select 1
      from public.invitations as open_invitation
      where open_invitation.account_id = account_record.id
        and open_invitation.status in ('pending', 'sent', 'delivery_failed')
    )
  then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;
  if source_invitation.auth_user_id is distinct from account_record.auth_user_id
  then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;

  select role.code into role_code
  from public.roles as role
  where role.id = source_invitation.requested_initial_role_id
    and role.archived_at is null;
  if role_code is null then
    raise exception 'invitation_recovery_required' using errcode = '23514';
  end if;

  correlation := extensions.gen_random_uuid();
  delivery_attempt := extensions.gen_random_uuid();
  insert into public.invitations (
    account_id, normalized_email, display_name, preferred_locale,
    requested_initial_role_id, status, created_by, expires_at,
    auth_user_id, idempotency_key, request_fingerprint,
    delivery_attempt_id, delivery_attempted_at, delivery_actor_user_id,
    delivery_correlation_id, correlation_id
  ) values (
    account_record.id, source_invitation.normalized_email,
    source_invitation.display_name, source_invitation.preferred_locale,
    source_invitation.requested_initial_role_id, 'pending', actor_id,
    statement_timestamp() + interval '1 hour', account_record.auth_user_id,
    requested_idempotency_key, fingerprint, delivery_attempt,
    statement_timestamp(), actor_id, correlation, correlation
  ) returning * into result_invitation;

  insert into public.invitation_operation_requests (
    actor_user_id, operation, idempotency_key, request_fingerprint,
    source_invitation_id, result_invitation_id, request_status
  ) values (
    actor_id, 'recover', requested_idempotency_key, fingerprint,
    source_invitation.id, result_invitation.id, 'in_progress'
  );

  update public.invitations
  set delivery_operation = 'recover',
      delivery_idempotency_key = requested_idempotency_key
  where id = result_invitation.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, previous_state, new_state, metadata
  ) values (
    actor_id, 'invitation.recovery_started', 'invitation', result_invitation.id,
    array['status', 'auth_user_id', 'delivery_attempt_id'],
    account_record.auth_user_id, correlation, source_invitation.status, 'pending',
    jsonb_build_object('reason_code', 'invitation.recovery_started')
  );

  return query select
    result_invitation.id, source_invitation.id, result_invitation.account_id,
    result_invitation.status, result_invitation.normalized_email,
    result_invitation.display_name, result_invitation.preferred_locale,
    role_code, result_invitation.delivery_attempt_id, correlation,
    'execute'::text, result_invitation.auth_user_id, true;
end;
$$;

revoke all on function public.prepare_account_invitation_recovery_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_account_invitation_recovery_v1(uuid, uuid, text)
  to authenticated;
