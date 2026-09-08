-- FASE B: administrative recovery is allowed only after durable ownership and
-- completed onboarding evidence. It never grants authority to an invited or
-- partially onboarded identity.

alter function public.change_account_status(uuid, text, text)
  rename to change_account_status_legacy;

revoke all on function public.change_account_status_legacy(uuid, text, text)
  from public, anon, authenticated;

create function public.change_account_status(
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

-- Completing onboarding is another authority transition. Accepted legacy or
-- inconsistent rows without proof of one-time challenge consumption stay closed.
create or replace function public.complete_current_account_profile_v2(
  requested_display_name text,
  requested_locale text
)
returns table (account_id uuid, account_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invitation_claim text := (select auth.jwt()) -> 'app_metadata' ->> 'account_invitation_id';
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
        and invitation.acceptance_challenge_consumed_at is not null
    )
  then
    raise exception 'invitation_context_mismatch' using errcode = '23514';
  end if;

  return query select *
  from public.complete_current_account_profile(
    requested_display_name,
    requested_locale
  );
end;
$$;

revoke all on function public.complete_current_account_profile_v2(text, text)
  from public, anon, authenticated;
grant execute on function public.complete_current_account_profile_v2(text, text)
  to authenticated;
