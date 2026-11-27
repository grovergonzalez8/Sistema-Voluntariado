-- AUD-002: G -> target account, matching manage_account_role and legacy.
-- Preserve recovery provenance, RPC signature, authorization and transaction.

create or replace function public.change_account_status(
  requested_account_id uuid,
  requested_status text,
  requested_reason text
)
returns setof public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  account_record public.accounts%rowtype;
  auth_confirmed_at timestamptz;
  profile_complete boolean;
  recovery_provenance_complete boolean;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- AUD-002: acquire the shared administration mutex before any account row.
  -- Legacy reacquires this same transaction lock; do not change its key/order.
  perform pg_catalog.pg_advisory_xact_lock(20260724, 1);

  select account.*
  into account_record
  from public.accounts as account
  where account.id = requested_account_id
  for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if requested_status = 'active'
    and account_record.status = 'pending_profile'
  then
    if not public.user_has_permission(actor_id, 'account.activate') then
      raise exception 'account_transition_denied' using errcode = '42501';
    end if;
    if account_record.auth_user_id is null then
      raise exception 'account_recovery_required' using errcode = '23514';
    end if;

    select auth_user.email_confirmed_at
    into auth_confirmed_at
    from auth.users as auth_user
    where auth_user.id = account_record.auth_user_id;
    if auth_confirmed_at is null then
      raise exception 'account_recovery_required' using errcode = '23514';
    end if;

    select exists (
      select 1
      from public.invitations as invitation
      inner join public.roles as role
        on role.id = invitation.requested_initial_role_id
        and role.archived_at is null
      where invitation.account_id = account_record.id
        and invitation.auth_user_id = account_record.auth_user_id
        and invitation.status = 'accepted'
        and invitation.acceptance_challenge_consumed_at is not null
    ) into recovery_provenance_complete;
    if recovery_provenance_complete is not true then
      raise exception 'account_recovery_required' using errcode = '23514';
    end if;

    select exists (
      select 1
      from public.profiles as profile
      where profile.id = account_record.auth_user_id
        and profile.display_name is not null
        and profile.preferred_locale in ('es', 'en')
        and profile.archived_at is null
    )
    into profile_complete;
    if profile_complete is not true then
      raise exception 'account_recovery_required' using errcode = '23514';
    end if;
  end if;

  return query
  select *
  from public.change_account_status_legacy(
    requested_account_id,
    requested_status,
    requested_reason
  );
end;
$$;

revoke all on function public.change_account_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.change_account_status(uuid, text, text)
  to authenticated;
