create table public.accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid null unique references auth.users (id) on delete restrict,
  status text not null default 'invited',
  origin_invited_by uuid null references auth.users (id) on delete set null,
  authority_version bigint not null default 1,
  status_changed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint accounts_status_valid check (
    status in ('invited', 'pending_profile', 'active', 'suspended', 'archived')
  ),
  constraint accounts_auth_link_valid check (
    status = 'invited' or auth_user_id is not null
  ),
  constraint accounts_authority_version_valid check (authority_version > 0),
  constraint accounts_timestamps_valid check (
    updated_at >= created_at and status_changed_at >= created_at
  )
);

create index accounts_status_updated_at_idx
  on public.accounts (status, updated_at desc);

create index accounts_origin_invited_by_idx
  on public.accounts (origin_invited_by, created_at desc);

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  normalized_email text not null,
  display_name text null,
  preferred_locale text not null default 'es',
  requested_initial_role_id uuid not null references public.roles (id) on delete restrict,
  status text not null default 'pending',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '1 hour'),
  sent_at timestamptz null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users (id) on delete set null,
  revocation_reason text null,
  expired_at timestamptz null,
  superseded_at timestamptz null,
  superseded_by uuid null,
  delivery_error_code text null,
  auth_user_id uuid null references auth.users (id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  delivery_attempt_id uuid null,
  delivery_attempted_at timestamptz null,
  delivery_actor_user_id uuid null references auth.users (id) on delete restrict,
  delivery_correlation_id uuid null,
  correlation_id uuid not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint invitations_status_valid check (
    status in (
      'pending',
      'sent',
      'accepted',
      'revoked',
      'expired',
      'delivery_failed',
      'superseded'
    )
  ),
  constraint invitations_email_valid check (
    normalized_email = lower(btrim(normalized_email))
    and char_length(normalized_email) between 3 and 254
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint invitations_display_name_valid check (
    display_name is null
    or (
      char_length(display_name) between 1 and 100
      and display_name = btrim(display_name)
    )
  ),
  constraint invitations_preferred_locale_valid check (
    preferred_locale in ('es', 'en')
  ),
  constraint invitations_expiry_valid check (expires_at > created_at),
  constraint invitations_revocation_reason_valid check (
    revocation_reason is null
    or char_length(revocation_reason) between 3 and 500
  ),
  constraint invitations_delivery_error_valid check (
    delivery_error_code is null
    or delivery_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint invitations_fingerprint_valid check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint invitations_delivery_attempt_valid check (
    (delivery_attempt_id is null) = (delivery_attempted_at is null)
    and (delivery_attempt_id is null) = (delivery_actor_user_id is null)
    and (delivery_attempt_id is null) = (delivery_correlation_id is null)
  ),
  constraint invitations_timestamps_valid check (updated_at >= created_at),
  constraint invitations_superseded_by_fk
    foreign key (superseded_by)
    references public.invitations (id)
    on delete restrict
    deferrable initially deferred
);

create unique index invitations_one_open_account_idx
  on public.invitations (account_id)
  where status in ('pending', 'sent', 'delivery_failed');

create unique index invitations_one_open_email_idx
  on public.invitations (normalized_email)
  where status in ('pending', 'sent', 'delivery_failed');

create unique index invitations_one_accepted_account_idx
  on public.invitations (account_id)
  where status = 'accepted';

create unique index invitations_create_idempotency_idx
  on public.invitations (created_by, idempotency_key);

create index invitations_created_by_created_at_idx
  on public.invitations (created_by, created_at desc);

create index invitations_auth_user_id_idx
  on public.invitations (auth_user_id, created_at desc)
  where auth_user_id is not null;

create table public.invitation_operation_requests (
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  operation text not null,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  source_invitation_id uuid not null references public.invitations (id) on delete restrict,
  result_invitation_id uuid not null references public.invitations (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (actor_user_id, operation, idempotency_key),
  constraint invitation_operation_requests_operation_valid check (
    operation in ('resend', 'replace')
  ),
  constraint invitation_operation_requests_fingerprint_valid check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

create table public.account_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  actor_user_id uuid null references auth.users (id) on delete set null,
  from_status text null,
  to_status text not null,
  reason text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint account_status_history_from_valid check (
    from_status is null
    or from_status in ('invited', 'pending_profile', 'active', 'suspended', 'archived')
  ),
  constraint account_status_history_to_valid check (
    to_status in ('invited', 'pending_profile', 'active', 'suspended', 'archived')
  ),
  constraint account_status_history_reason_valid check (
    char_length(reason) between 3 and 500
  ),
  constraint account_status_history_changed check (
    from_status is null or from_status <> to_status
  )
);

create index account_status_history_account_created_at_idx
  on public.account_status_history (account_id, created_at desc);

create table public.role_grant_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_role_id uuid not null references public.roles (id) on delete restrict,
  target_role_id uuid not null references public.roles (id) on delete restrict,
  can_grant boolean not null default false,
  can_revoke boolean not null default false,
  is_active boolean not null default true,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (actor_role_id, target_role_id),
  constraint role_grant_policies_operation_present check (
    can_grant or can_revoke
  )
);

create index role_grant_policies_target_role_idx
  on public.role_grant_policies (target_role_id, actor_role_id)
  where is_active;

alter table public.accounts enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_operation_requests enable row level security;
alter table public.account_status_history enable row level security;
alter table public.role_grant_policies enable row level security;

revoke all on table public.accounts from public, anon, authenticated;
revoke all on table public.invitations from public, anon, authenticated;
revoke all on table public.invitation_operation_requests from public, anon, authenticated;
revoke all on table public.account_status_history from public, anon, authenticated;
revoke all on table public.role_grant_policies from public, anon, authenticated;

create trigger accounts_20_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger invitations_20_set_updated_at
before update on public.invitations
for each row execute function public.set_updated_at();

create trigger role_grant_policies_20_set_updated_at
before update on public.role_grant_policies
for each row execute function public.set_updated_at();

create function public.audit_metadata_is_safe(candidate jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(candidate) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(candidate) as key_name
      where key_name not in ('reason_code', 'provider_error_code')
    )
    and (
      not candidate ? 'reason_code'
      or candidate ->> 'reason_code' ~ '^[a-z][a-z0-9_.]{0,63}$'
    )
    and (
      not candidate ? 'provider_error_code'
      or candidate ->> 'provider_error_code' ~ '^[a-z][a-z0-9_]{0,63}$'
    );
$$;

revoke all on function public.audit_metadata_is_safe(jsonb) from public;
revoke all on function public.audit_metadata_is_safe(jsonb) from anon;
revoke all on function public.audit_metadata_is_safe(jsonb) from authenticated;

alter table public.audit_logs
  add column target_user_id uuid null references auth.users (id) on delete set null,
  add column correlation_id uuid null,
  add column previous_state text null,
  add column new_state text null,
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint audit_logs_metadata_safe check (
    public.audit_metadata_is_safe(metadata)
  );

create function public.enforce_account_invitation_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_auth_user_id uuid;
  current_account_id uuid;
  current_invitation_auth_user_id uuid;
begin
  if tg_table_name = 'accounts' then
    select account.auth_user_id
    into linked_auth_user_id
    from public.accounts as account
    where account.id = new.id;

    if exists (
      select 1
      from public.invitations as invitation
      where invitation.account_id = new.id
        and invitation.auth_user_id is not null
        and (
          linked_auth_user_id is null
          or invitation.auth_user_id <> linked_auth_user_id
        )
    ) then
      raise exception 'account_auth_link_mismatch' using errcode = '23514';
    end if;
  else
    select invitation.account_id, invitation.auth_user_id
    into current_account_id, current_invitation_auth_user_id
    from public.invitations as invitation
    where invitation.id = new.id;

    if current_invitation_auth_user_id is not null then
      select account.auth_user_id
      into linked_auth_user_id
      from public.accounts as account
      where account.id = current_account_id;

      if linked_auth_user_id is distinct from current_invitation_auth_user_id then
        raise exception 'invitation_auth_link_mismatch' using errcode = '23514';
      end if;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_account_invitation_auth_link() from public;
revoke all on function public.enforce_account_invitation_auth_link() from anon;
revoke all on function public.enforce_account_invitation_auth_link() from authenticated;

create function public.guard_invitation_auth_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.auth_user_id is not null
    and new.auth_user_id is distinct from old.auth_user_id
  then
    raise exception 'invitation_auth_link_cannot_be_cleared' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_invitation_auth_snapshot() from public;
revoke all on function public.guard_invitation_auth_snapshot() from anon;
revoke all on function public.guard_invitation_auth_snapshot() from authenticated;

create trigger invitations_10_guard_auth_snapshot
before update of auth_user_id on public.invitations
for each row execute function public.guard_invitation_auth_snapshot();

create constraint trigger accounts_90_enforce_invitation_auth_link
after insert or update of auth_user_id on public.accounts
deferrable initially deferred
for each row execute function public.enforce_account_invitation_auth_link();

create constraint trigger invitations_90_enforce_account_auth_link
after insert or update of auth_user_id, account_id on public.invitations
deferrable initially deferred
for each row execute function public.enforce_account_invitation_auth_link();

create function public.user_has_active_role(subject_user_id uuid, requested_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts as account
    inner join public.user_roles as user_role
      on user_role.user_id = account.auth_user_id
    inner join public.roles as role
      on role.id = user_role.role_id
      and role.archived_at is null
    where account.auth_user_id = subject_user_id
      and account.status = 'active'
      and role.code = requested_role
  );
$$;

revoke all on function public.user_has_active_role(uuid, text) from public;
revoke all on function public.user_has_active_role(uuid, text) from anon;
revoke all on function public.user_has_active_role(uuid, text) from authenticated;

create function public.user_has_permission(subject_user_id uuid, requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts as account
    inner join public.user_roles as user_role
      on user_role.user_id = account.auth_user_id
    inner join public.roles as role
      on role.id = user_role.role_id
      and role.archived_at is null
    inner join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    inner join public.permissions as permission
      on permission.id = role_permission.permission_id
      and permission.archived_at is null
    where account.auth_user_id = subject_user_id
      and account.status = 'active'
      and permission.code = requested_permission
  );
$$;

revoke all on function public.user_has_permission(uuid, text) from public;
revoke all on function public.user_has_permission(uuid, text) from anon;
revoke all on function public.user_has_permission(uuid, text) from authenticated;

create or replace function public.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_permission((select auth.uid()), requested_permission);
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
revoke all on function public.has_permission(text) from authenticated;
grant execute on function public.has_permission(text) to authenticated;

create function public.is_account_transition_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status) in (
    ('invited', 'pending_profile'),
    ('pending_profile', 'active'),
    ('active', 'suspended'),
    ('suspended', 'active'),
    ('active', 'archived'),
    ('suspended', 'archived'),
    ('archived', 'active')
  );
$$;

revoke all on function public.is_account_transition_allowed(text, text) from public;
revoke all on function public.is_account_transition_allowed(text, text) from anon;
revoke all on function public.is_account_transition_allowed(text, text) from authenticated;

create function public.can_user_grant_role(
  subject_user_id uuid,
  target_role_id uuid,
  requested_operation text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts as account
    inner join public.user_roles as user_role
      on user_role.user_id = account.auth_user_id
    inner join public.roles as actor_role
      on actor_role.id = user_role.role_id
      and actor_role.archived_at is null
    inner join public.role_grant_policies as policy
      on policy.actor_role_id = actor_role.id
      and policy.target_role_id = can_user_grant_role.target_role_id
      and policy.is_active
    inner join public.roles as target_role
      on target_role.id = policy.target_role_id
      and target_role.archived_at is null
    where account.auth_user_id = subject_user_id
      and account.status = 'active'
      and (
        (requested_operation = 'grant' and policy.can_grant)
        or (requested_operation = 'revoke' and policy.can_revoke)
      )
  );
$$;

revoke all on function public.can_user_grant_role(uuid, uuid, text) from public;
revoke all on function public.can_user_grant_role(uuid, uuid, text) from anon;
revoke all on function public.can_user_grant_role(uuid, uuid, text) from authenticated;

do $$
begin
  if exists (select 1 from auth.users) and exists (
    select 1
    from public.user_roles as user_role
    left join public.profiles as profile on profile.id = user_role.user_id
    where profile.id is null
  ) then
    raise exception 'account_lifecycle_backfill_role_without_profile';
  end if;

  insert into public.accounts (
    auth_user_id,
    status,
    status_changed_at,
    created_at,
    updated_at
  )
  select
    profile.id,
    case when profile.archived_at is null then 'active' else 'archived' end,
    statement_timestamp(),
    profile.created_at,
    statement_timestamp()
  from public.profiles as profile
  where profile.archived_at is not null
    or exists (
      select 1
      from public.user_roles as user_role
      where user_role.user_id = profile.id
    )
  on conflict (auth_user_id) do nothing;

  update public.profiles
  set archived_at = null
  where archived_at is not null;

  if exists (select 1 from auth.users)
    and not exists (
      select 1
      from public.accounts as account
      inner join public.user_roles as user_role
        on user_role.user_id = account.auth_user_id
      inner join public.roles as role
        on role.id = user_role.role_id
      where account.status = 'active'
        and role.code = 'administrator'
        and role.archived_at is null
    )
  then
    raise exception 'account_lifecycle_backfill_requires_active_administrator';
  end if;
end;
$$;

drop policy profiles_read_own on public.profiles;
drop policy profiles_update_own on public.profiles;

create policy profiles_read_own
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  and public.has_permission('volunteer.read_self')
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  and public.has_permission('volunteer.update_self')
)
with check (
  id = (select auth.uid())
  and public.has_permission('volunteer.update_self')
);

create function public.get_my_account_context()
returns table (
  account_id uuid,
  account_status text,
  permissions text[],
  authority_version bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    account.id,
    account.status,
    case
      when account.status <> 'active' then array[]::text[]
      else coalesce(
        array_agg(distinct permission.code order by permission.code)
          filter (where permission.code is not null),
        array[]::text[]
      )
    end,
    account.authority_version
  from public.accounts as account
  left join public.user_roles as user_role
    on user_role.user_id = account.auth_user_id
  left join public.roles as role
    on role.id = user_role.role_id
    and role.archived_at is null
  left join public.role_permissions as role_permission
    on role_permission.role_id = role.id
  left join public.permissions as permission
    on permission.id = role_permission.permission_id
    and permission.archived_at is null
  where account.auth_user_id = (select auth.uid())
  group by account.id;
$$;

revoke all on function public.get_my_account_context() from public;
revoke all on function public.get_my_account_context() from anon;
revoke all on function public.get_my_account_context() from authenticated;
grant execute on function public.get_my_account_context() to authenticated;

create function public.expire_open_invitations(
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
  with expired as (
    update public.invitations as invitation
    set status = 'expired',
        expired_at = statement_timestamp(),
        delivery_attempt_id = null,
        delivery_attempted_at = null,
        delivery_actor_user_id = null,
        delivery_correlation_id = null
    where invitation.status in ('pending', 'sent', 'delivery_failed')
      and invitation.expires_at <= statement_timestamp()
      and (requested_account_id is null or invitation.account_id = requested_account_id)
      and (requested_email is null or invitation.normalized_email = requested_email)
    returning invitation.id, invitation.account_id, invitation.created_by,
      invitation.correlation_id
  )
  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    correlation_id,
    previous_state,
    new_state,
    metadata
  )
  select
    null,
    'invitation.expired',
    'invitation',
    expired.id,
    array['status', 'expired_at'],
    expired.correlation_id,
    'open',
    'expired',
    jsonb_build_object('reason_code', 'invitation.expired')
  from expired;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.expire_open_invitations(uuid, text) from public;
revoke all on function public.expire_open_invitations(uuid, text) from anon;
revoke all on function public.expire_open_invitations(uuid, text) from authenticated;

create function public.list_account_invitations()
returns table (
  id uuid,
  account_id uuid,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  status text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  sent_at timestamptz,
  superseded_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  can_read_all boolean;
begin
  if actor_id is null or not public.user_has_permission(actor_id, 'invitation.read') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform public.expire_open_invitations();
  can_read_all := public.user_has_active_role(actor_id, 'administrator');

  return query
  select
    invitation.id,
    invitation.account_id,
    invitation.normalized_email,
    invitation.display_name,
    invitation.preferred_locale,
    role.code,
    invitation.status,
    invitation.created_by,
    invitation.created_at,
    invitation.expires_at,
    invitation.sent_at,
    invitation.superseded_by
  from public.invitations as invitation
  inner join public.accounts as account
    on account.id = invitation.account_id
  inner join public.roles as role
    on role.id = invitation.requested_initial_role_id
  where can_read_all or account.origin_invited_by = actor_id
  order by invitation.created_at desc;
end;
$$;

revoke all on function public.list_account_invitations() from public;
revoke all on function public.list_account_invitations() from anon;
revoke all on function public.list_account_invitations() from authenticated;
grant execute on function public.list_account_invitations() to authenticated;

create function public.get_account_invitation_detail(
  requested_invitation_id uuid
)
returns table (
  id uuid,
  account_id uuid,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  status text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  sent_at timestamptz,
  superseded_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select invitation.*
  from public.list_account_invitations() as invitation
  where invitation.id = requested_invitation_id;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_account_invitation_detail(uuid) from public;
revoke all on function public.get_account_invitation_detail(uuid) from anon;
revoke all on function public.get_account_invitation_detail(uuid) from authenticated;
grant execute on function public.get_account_invitation_detail(uuid) to authenticated;

create function public.prepare_account_invitation(
  requested_email text,
  requested_display_name text,
  requested_locale text,
  requested_role_code text,
  requested_idempotency_key uuid
)
returns table (
  invitation_id uuid,
  account_id uuid,
  invitation_status text,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  delivery_attempt_id uuid,
  correlation_id uuid,
  should_deliver boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_email text := lower(btrim(requested_email));
  canonical_display_name text := nullif(
    regexp_replace(btrim(coalesce(requested_display_name, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  target_role_id uuid;
  fingerprint text;
  existing_invitation public.invitations%rowtype;
  new_account_id uuid := extensions.gen_random_uuid();
  new_invitation_id uuid := extensions.gen_random_uuid();
  new_attempt_id uuid := extensions.gen_random_uuid();
  new_correlation_id uuid := extensions.gen_random_uuid();
  lease_claimed boolean := false;
begin
  if actor_id is null or not public.user_has_permission(actor_id, 'invitation.create') then
    raise exception 'permission_denied' using errcode = '42501';
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

  select role.id
  into target_role_id
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
          'create',
          canonical_email,
          canonical_display_name,
          requested_locale,
          requested_role_code
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
  perform public.expire_open_invitations(null, canonical_email);

  select invitation.*
  into existing_invitation
  from public.invitations as invitation
  where invitation.created_by = actor_id
    and invitation.idempotency_key = requested_idempotency_key;

  if found then
    if existing_invitation.request_fingerprint <> fingerprint then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;

    if existing_invitation.status in ('pending', 'delivery_failed')
      and (
        existing_invitation.delivery_attempted_at is null
        or existing_invitation.delivery_attempted_at < statement_timestamp() - interval '2 minutes'
        or existing_invitation.status = 'delivery_failed'
      )
    then
      new_attempt_id := extensions.gen_random_uuid();
      update public.invitations as invitation
      set delivery_attempt_id = new_attempt_id,
          delivery_attempted_at = statement_timestamp(),
          delivery_actor_user_id = actor_id,
          delivery_correlation_id = new_correlation_id,
          delivery_error_code = null
      where invitation.id = existing_invitation.id
      returning invitation.* into existing_invitation;
      lease_claimed := true;
    end if;

    return query
    select
      existing_invitation.id,
      existing_invitation.account_id,
      existing_invitation.status,
      existing_invitation.normalized_email,
      existing_invitation.display_name,
      existing_invitation.preferred_locale,
      requested_role_code,
      existing_invitation.delivery_attempt_id,
      coalesce(
        existing_invitation.delivery_correlation_id,
        existing_invitation.correlation_id
      ),
      lease_claimed;
    return;
  end if;

  if exists (
    select 1
    from auth.users as auth_user
    where lower(auth_user.email) = canonical_email
  ) then
    raise exception 'email_already_registered' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.invitations as invitation
    where invitation.normalized_email = canonical_email
  ) then
    raise exception 'email_already_invited' using errcode = '23505';
  end if;

  insert into public.accounts (
    id,
    status,
    origin_invited_by
  )
  values (
    new_account_id,
    'invited',
    actor_id
  );

  insert into public.invitations (
    id,
    account_id,
    normalized_email,
    display_name,
    preferred_locale,
    requested_initial_role_id,
    status,
    created_by,
    idempotency_key,
    request_fingerprint,
    delivery_attempt_id,
    delivery_attempted_at,
    delivery_actor_user_id,
    delivery_correlation_id,
    correlation_id
  )
  values (
    new_invitation_id,
    new_account_id,
    canonical_email,
    canonical_display_name,
    requested_locale,
    target_role_id,
    'pending',
    actor_id,
    requested_idempotency_key,
    fingerprint,
    new_attempt_id,
    statement_timestamp(),
    actor_id,
    new_correlation_id,
    new_correlation_id
  );

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    correlation_id,
    new_state,
    metadata
  )
  values (
    actor_id,
    'invitation.created',
    'invitation',
    new_invitation_id,
    array['account_id', 'status', 'requested_initial_role_id'],
    new_correlation_id,
    'pending',
    jsonb_build_object('reason_code', 'invitation.created')
  );

  return query
  select
    new_invitation_id,
    new_account_id,
    'pending'::text,
    canonical_email,
    canonical_display_name,
    requested_locale,
    requested_role_code,
    new_attempt_id,
    new_correlation_id,
    true;
end;
$$;

revoke all on function public.prepare_account_invitation(text, text, text, text, uuid) from public;
revoke all on function public.prepare_account_invitation(text, text, text, text, uuid) from anon;
revoke all on function public.prepare_account_invitation(text, text, text, text, uuid) from authenticated;
grant execute on function public.prepare_account_invitation(text, text, text, text, uuid) to authenticated;

create function public.prepare_account_invitation_action(
  requested_invitation_id uuid,
  requested_operation text,
  requested_idempotency_key uuid default null,
  requested_reason text default null
)
returns table (
  invitation_id uuid,
  account_id uuid,
  invitation_status text,
  normalized_email text,
  display_name text,
  preferred_locale text,
  requested_initial_role_code text,
  delivery_attempt_id uuid,
  correlation_id uuid,
  should_deliver boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_invitation public.invitations%rowtype;
  result_invitation public.invitations%rowtype;
  target_role_code text;
  required_permission text;
  fingerprint text;
  existing_request public.invitation_operation_requests%rowtype;
  new_invitation_id uuid;
  new_attempt_id uuid;
  new_correlation_id uuid;
  lease_claimed boolean := false;
begin
  if requested_operation not in ('resend', 'replace', 'revoke') then
    raise exception 'invalid_invitation_operation' using errcode = '22023';
  end if;

  required_permission := case
    when requested_operation = 'revoke' then 'invitation.revoke'
    else 'invitation.resend'
  end;

  if actor_id is null or not public.user_has_permission(actor_id, required_permission) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select invitation.*
  into source_invitation
  from public.invitations as invitation
  where invitation.id = requested_invitation_id;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  select role.code
  into target_role_code
  from public.roles as role
  where role.id = source_invitation.requested_initial_role_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_invitation.normalized_email, 20260724)
  );
  perform public.expire_open_invitations(
    source_invitation.account_id,
    source_invitation.normalized_email
  );

  select invitation.*
  into source_invitation
  from public.invitations as invitation
  where invitation.id = requested_invitation_id
  for update;

  if requested_operation = 'revoke' then
    if source_invitation.status not in ('pending', 'sent', 'delivery_failed') then
      raise exception 'invitation_not_revocable' using errcode = '23514';
    end if;

    if requested_reason is null
      or char_length(btrim(requested_reason)) not between 3 and 500
    then
      raise exception 'invalid_reason' using errcode = '22023';
    end if;

    update public.invitations as invitation
    set status = 'revoked',
        revoked_at = statement_timestamp(),
        revoked_by = actor_id,
        revocation_reason = btrim(requested_reason),
        delivery_attempt_id = null,
        delivery_attempted_at = null,
        delivery_actor_user_id = null,
        delivery_correlation_id = null
    where invitation.id = source_invitation.id
    returning invitation.* into result_invitation;

    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, changed_fields,
      correlation_id, previous_state, new_state, metadata
    )
    values (
      actor_id, 'invitation.revoked', 'invitation', result_invitation.id,
      array['status', 'revoked_at', 'revoked_by', 'revocation_reason'],
      result_invitation.correlation_id, source_invitation.status, 'revoked',
      jsonb_build_object('reason_code', 'invitation.revoked')
    );
  else
    if requested_idempotency_key is null then
      raise exception 'idempotency_key_required' using errcode = '22023';
    end if;

    fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_array(
            requested_operation,
            source_invitation.id,
            source_invitation.normalized_email,
            source_invitation.display_name,
            source_invitation.preferred_locale,
            target_role_code
          )::text,
          'utf8'
        ),
        'sha256'
      ),
      'hex'
    );

    select operation_request.*
    into existing_request
    from public.invitation_operation_requests as operation_request
    where operation_request.actor_user_id = actor_id
      and operation_request.operation = requested_operation
      and operation_request.idempotency_key = requested_idempotency_key;

    if found then
      if existing_request.request_fingerprint <> fingerprint
        or existing_request.source_invitation_id <> source_invitation.id
      then
        raise exception 'idempotency_conflict' using errcode = '23505';
      end if;

      select invitation.*
      into result_invitation
      from public.invitations as invitation
      where invitation.id = existing_request.result_invitation_id;

      if (
        result_invitation.delivery_attempt_id is not null
        and result_invitation.delivery_attempted_at
          < statement_timestamp() - interval '2 minutes'
      ) or (
        result_invitation.delivery_attempt_id is null
        and (
          result_invitation.status = 'delivery_failed'
          or (
            result_invitation.status = 'sent'
            and result_invitation.delivery_error_code is not null
          )
        )
      )
      then
        new_attempt_id := extensions.gen_random_uuid();
        new_correlation_id := extensions.gen_random_uuid();
        update public.invitations as invitation
        set delivery_attempt_id = new_attempt_id,
            delivery_attempted_at = statement_timestamp(),
            delivery_actor_user_id = actor_id,
            delivery_correlation_id = new_correlation_id,
            delivery_error_code = null
        where invitation.id = result_invitation.id
        returning invitation.* into result_invitation;
        lease_claimed := true;
      end if;
    elsif requested_operation = 'resend' then
      if source_invitation.status not in ('sent', 'delivery_failed') then
        raise exception 'invitation_not_resendable' using errcode = '23514';
      end if;

      result_invitation := source_invitation;
      if source_invitation.delivery_attempt_id is null
        or source_invitation.delivery_attempted_at
          < statement_timestamp() - interval '2 minutes'
      then
        new_attempt_id := extensions.gen_random_uuid();
        new_correlation_id := extensions.gen_random_uuid();
        update public.invitations as invitation
        set delivery_attempt_id = new_attempt_id,
            delivery_attempted_at = statement_timestamp(),
            delivery_actor_user_id = actor_id,
            delivery_correlation_id = new_correlation_id,
            delivery_error_code = null
        where invitation.id = source_invitation.id
        returning invitation.* into result_invitation;
        lease_claimed := true;
      end if;

      insert into public.invitation_operation_requests (
        actor_user_id, operation, idempotency_key, request_fingerprint,
        source_invitation_id, result_invitation_id
      )
      values (
        actor_id, requested_operation, requested_idempotency_key, fingerprint,
        source_invitation.id, result_invitation.id
      );
    else
      if source_invitation.status not in (
        'pending', 'sent', 'delivery_failed', 'revoked', 'expired'
      ) then
        raise exception 'invitation_not_replaceable' using errcode = '23514';
      end if;
      if source_invitation.status in ('revoked', 'expired')
        and source_invitation.superseded_by is not null
      then
        raise exception 'invitation_not_replaceable' using errcode = '23514';
      end if;

      if exists (
        select 1
        from auth.users as auth_user
        where lower(auth_user.email) = source_invitation.normalized_email
          and auth_user.email_confirmed_at is not null
      ) then
        raise exception 'invitation_auth_already_confirmed' using errcode = '23514';
      end if;

      if not exists (
        select 1
        from public.accounts as account
        where account.id = source_invitation.account_id
          and account.status = 'invited'
          and not exists (
            select 1
            from public.invitations as accepted_invitation
            where accepted_invitation.account_id = account.id
              and accepted_invitation.status = 'accepted'
          )
      ) then
        raise exception 'account_not_replaceable' using errcode = '23514';
      end if;

      if source_invitation.status in ('pending', 'sent', 'delivery_failed') then
        update public.invitations as invitation
        set status = 'superseded',
            superseded_at = statement_timestamp(),
            delivery_attempt_id = null,
            delivery_attempted_at = null,
            delivery_actor_user_id = null,
            delivery_correlation_id = null
        where invitation.id = source_invitation.id;
      end if;

      if exists (
        select 1
        from public.invitations as invitation
        where invitation.account_id = source_invitation.account_id
          and invitation.status in ('pending', 'sent', 'delivery_failed')
      ) then
        raise exception 'account_has_open_invitation' using errcode = '23505';
      end if;

      new_invitation_id := extensions.gen_random_uuid();
      new_attempt_id := extensions.gen_random_uuid();
      new_correlation_id := extensions.gen_random_uuid();

      insert into public.invitations (
        id, account_id, normalized_email, display_name, preferred_locale,
        requested_initial_role_id, status, created_by, idempotency_key,
        request_fingerprint, delivery_attempt_id, delivery_attempted_at,
        delivery_actor_user_id, delivery_correlation_id, correlation_id
      )
      values (
        new_invitation_id, source_invitation.account_id,
        source_invitation.normalized_email, source_invitation.display_name,
        source_invitation.preferred_locale,
        source_invitation.requested_initial_role_id, 'pending', actor_id,
        requested_idempotency_key, fingerprint, new_attempt_id,
        statement_timestamp(), actor_id, new_correlation_id, new_correlation_id
      )
      returning * into result_invitation;
      lease_claimed := true;

      update public.invitations as invitation
      set superseded_by = result_invitation.id
      where invitation.id = source_invitation.id;

      insert into public.invitation_operation_requests (
        actor_user_id, operation, idempotency_key, request_fingerprint,
        source_invitation_id, result_invitation_id
      )
      values (
        actor_id, requested_operation, requested_idempotency_key, fingerprint,
        source_invitation.id, result_invitation.id
      );

      insert into public.audit_logs (
        actor_user_id, action, entity_type, entity_id, changed_fields,
        correlation_id, previous_state, new_state, metadata
      )
      values (
        actor_id, 'invitation.replaced', 'invitation', result_invitation.id,
        case
          when source_invitation.status in ('pending', 'sent', 'delivery_failed')
            then array['status', 'superseded_by']
          else array['superseded_by']
        end,
        new_correlation_id,
        source_invitation.status, 'pending',
        jsonb_build_object('reason_code', 'invitation.replaced')
      );
    end if;
  end if;

  return query
  select
    result_invitation.id,
    result_invitation.account_id,
    result_invitation.status,
    result_invitation.normalized_email,
    result_invitation.display_name,
    result_invitation.preferred_locale,
    target_role_code,
    result_invitation.delivery_attempt_id,
    coalesce(result_invitation.delivery_correlation_id, result_invitation.correlation_id),
    lease_claimed;
end;
$$;

revoke all on function public.prepare_account_invitation_action(uuid, text, uuid, text) from public;
revoke all on function public.prepare_account_invitation_action(uuid, text, uuid, text) from anon;
revoke all on function public.prepare_account_invitation_action(uuid, text, uuid, text) from authenticated;
grant execute on function public.prepare_account_invitation_action(uuid, text, uuid, text) to authenticated;

create function public.finalize_account_invitation_delivery(
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
      auth_user.raw_user_meta_data ->> 'account_invitation_id'
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
    array['status', 'delivery_error_code', 'auth_user_id'],
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

revoke all on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) from public;
revoke all on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) from anon;
revoke all on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) from authenticated;
revoke all on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) from service_role;
grant execute on function public.finalize_account_invitation_delivery(uuid, uuid, uuid, boolean, text) to service_role;

create function public.accept_current_account_invitation()
returns table (
  account_id uuid,
  account_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invitation_record public.invitations%rowtype;
  account_record public.accounts%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.auth_user_id = actor_id
  order by invitation.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  perform public.expire_open_invitations(invitation_record.account_id, null);

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.id = invitation_record.id
  for update;

  case invitation_record.status
    when 'expired' then
      raise exception 'invitation_expired' using errcode = '23514';
    when 'revoked' then
      raise exception 'invitation_revoked' using errcode = '23514';
    when 'superseded' then
      raise exception 'invitation_superseded' using errcode = '23514';
    when 'accepted' then
      raise exception 'invitation_used' using errcode = '23514';
    when 'pending' then
      raise exception 'invitation_not_sent' using errcode = '23514';
    when 'delivery_failed' then
      raise exception 'invitation_delivery_failed' using errcode = '23514';
    else
      null;
  end case;

  select account.*
  into account_record
  from public.accounts as account
  where account.id = invitation_record.account_id
  for update;

  if account_record.auth_user_id is distinct from actor_id
    or account_record.status <> 'invited'
  then
    raise exception 'account_invitation_state_mismatch' using errcode = '23514';
  end if;

  update public.invitations as invitation
  set status = 'accepted',
      accepted_at = statement_timestamp(),
      delivery_attempt_id = null,
      delivery_attempted_at = null,
      delivery_actor_user_id = null,
      delivery_correlation_id = null
  where invitation.id = invitation_record.id;

  update public.accounts as account
  set status = 'pending_profile',
      status_changed_at = statement_timestamp(),
      authority_version = account.authority_version + 1
  where account.id = account_record.id;

  insert into public.account_status_history (
    account_id, actor_user_id, from_status, to_status, reason, correlation_id
  )
  values (
    account_record.id, actor_id, 'invited', 'pending_profile',
    'invitation.accepted', invitation_record.correlation_id
  );

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, previous_state, new_state, metadata
  )
  values (
    actor_id, 'invitation.accepted', 'invitation', invitation_record.id,
    array['status', 'accepted_at'], actor_id, invitation_record.correlation_id,
    'sent', 'accepted',
    jsonb_build_object('reason_code', 'invitation.accepted')
  );

  return query select account_record.id, 'pending_profile'::text;
end;
$$;

revoke all on function public.accept_current_account_invitation() from public;
revoke all on function public.accept_current_account_invitation() from anon;
revoke all on function public.accept_current_account_invitation() from authenticated;
grant execute on function public.accept_current_account_invitation() to authenticated;

create function public.complete_current_account_profile(
  requested_display_name text,
  requested_locale text
)
returns table (
  account_id uuid,
  account_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_display_name text := regexp_replace(
    btrim(coalesce(requested_display_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  account_record public.accounts%rowtype;
  invitation_record public.invitations%rowtype;
  role_is_active boolean;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(canonical_display_name) not between 1 and 100 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  if requested_locale not in ('es', 'en') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;

  select account.*
  into account_record
  from public.accounts as account
  where account.auth_user_id = actor_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if account_record.status = 'active' then
    return query select account_record.id, 'active'::text;
    return;
  end if;

  if account_record.status <> 'pending_profile' then
    raise exception 'account_not_pending_profile' using errcode = '23514';
  end if;

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.account_id = account_record.id
    and invitation.auth_user_id = actor_id
    and invitation.status = 'accepted'
  order by invitation.accepted_at desc
  limit 1;

  if not found then
    raise exception 'accepted_invitation_required' using errcode = '23514';
  end if;

  select role.archived_at is null
  into role_is_active
  from public.roles as role
  where role.id = invitation_record.requested_initial_role_id;

  if role_is_active is distinct from true then
    raise exception 'initial_role_inactive' using errcode = '23514';
  end if;

  insert into public.profiles (id, display_name, preferred_locale)
  values (actor_id, canonical_display_name, requested_locale)
  on conflict (id) do update
  set display_name = excluded.display_name,
      preferred_locale = excluded.preferred_locale;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (actor_id, invitation_record.requested_initial_role_id, invitation_record.created_by)
  on conflict do nothing;

  update public.accounts as account
  set status = 'active',
      status_changed_at = statement_timestamp(),
      authority_version = account.authority_version + 1
  where account.id = account_record.id;

  insert into public.account_status_history (
    account_id, actor_user_id, from_status, to_status, reason, correlation_id
  )
  values (
    account_record.id, actor_id, 'pending_profile', 'active',
    'profile.completed', invitation_record.correlation_id
  );

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, previous_state, new_state, metadata
  )
  values (
    actor_id, 'account.activated', 'account', account_record.id,
    array['status', 'profile', 'role'], actor_id,
    invitation_record.correlation_id, 'pending_profile', 'active',
    jsonb_build_object('reason_code', 'profile.completed')
  );

  return query select account_record.id, 'active'::text;
end;
$$;

revoke all on function public.complete_current_account_profile(text, text) from public;
revoke all on function public.complete_current_account_profile(text, text) from anon;
revoke all on function public.complete_current_account_profile(text, text) from authenticated;
grant execute on function public.complete_current_account_profile(text, text) to authenticated;

create function public.list_accounts(
  requested_search text default '',
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns table (
  account_id uuid,
  user_id uuid,
  email text,
  display_name text,
  account_status text,
  roles text[],
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  can_read_all boolean;
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
begin
  if actor_id is null or not public.user_has_permission(actor_id, 'account.read') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if requested_limit not between 1 and 100 or requested_offset < 0 then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;

  can_read_all := public.user_has_active_role(actor_id, 'administrator');

  return query
  select
    account.id,
    account.auth_user_id,
    auth_user.email::text,
    profile.display_name,
    account.status,
    coalesce(
      array_agg(distinct role.code order by role.code)
        filter (where role.code is not null),
      array[]::text[]
    ),
    account.updated_at
  from public.accounts as account
  left join auth.users as auth_user
    on auth_user.id = account.auth_user_id
  left join public.profiles as profile
    on profile.id = account.auth_user_id
  left join public.user_roles as user_role
    on user_role.user_id = account.auth_user_id
  left join public.roles as role
    on role.id = user_role.role_id
    and role.archived_at is null
  where (can_read_all or account.origin_invited_by = actor_id)
    and (
      canonical_search = ''
      or lower(coalesce(auth_user.email, '')) like '%' || canonical_search || '%'
      or lower(coalesce(profile.display_name, '')) like '%' || canonical_search || '%'
    )
  group by account.id, auth_user.email, profile.display_name
  order by account.updated_at desc, account.id
  limit requested_limit
  offset requested_offset;
end;
$$;

revoke all on function public.list_accounts(text, integer, integer) from public;
revoke all on function public.list_accounts(text, integer, integer) from anon;
revoke all on function public.list_accounts(text, integer, integer) from authenticated;
grant execute on function public.list_accounts(text, integer, integer) to authenticated;

create function public.get_account_detail(requested_account_id uuid)
returns table (
  account_id uuid,
  user_id uuid,
  email text,
  display_name text,
  account_status text,
  roles text[],
  updated_at timestamptz,
  history jsonb,
  audit jsonb,
  grantable_roles jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  can_read_all boolean;
begin
  if actor_id is null or not public.user_has_permission(actor_id, 'account.read') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  can_read_all := public.user_has_active_role(actor_id, 'administrator');

  if not exists (
    select 1
    from public.accounts as account
    where account.id = requested_account_id
      and (can_read_all or account.origin_invited_by = actor_id)
  ) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    account.id,
    account.auth_user_id,
    auth_user.email::text,
    profile.display_name,
    account.status,
    coalesce(
      (
        select array_agg(role.code order by role.code)
        from public.user_roles as user_role
        inner join public.roles as role
          on role.id = user_role.role_id
          and role.archived_at is null
        where user_role.user_id = account.auth_user_id
      ),
      array[]::text[]
    ),
    account.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'changedAt', status_history.created_at,
            'changedBy', status_history.actor_user_id,
            'fromStatus', status_history.from_status,
            'reason', status_history.reason,
            'toStatus', status_history.to_status
          )
          order by status_history.created_at desc
        )
        from public.account_status_history as status_history
        where status_history.account_id = account.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'action', audit_log.action,
            'entityId', audit_log.entity_id,
            'entityType', audit_log.entity_type,
            'occurredAt', audit_log.created_at
          )
          order by audit_log.created_at desc
        )
        from public.audit_logs as audit_log
        where public.user_has_permission(actor_id, 'audit.read')
          and (
            audit_log.entity_id = account.id
            or audit_log.target_user_id = account.auth_user_id
          )
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('code', role.code, 'description', role.description)
          order by role.code
        )
        from public.roles as role
        where role.archived_at is null
          and public.user_has_permission(actor_id, 'role_assignment.manage')
          and public.can_user_grant_role(actor_id, role.id, 'grant')
      ),
      '[]'::jsonb
    )
  from public.accounts as account
  left join auth.users as auth_user
    on auth_user.id = account.auth_user_id
  left join public.profiles as profile
    on profile.id = account.auth_user_id
  where account.id = requested_account_id;
end;
$$;

revoke all on function public.get_account_detail(uuid) from public;
revoke all on function public.get_account_detail(uuid) from anon;
revoke all on function public.get_account_detail(uuid) from authenticated;
grant execute on function public.get_account_detail(uuid) to authenticated;

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
  previous_status text;
  required_permission text;
  active_admin_count bigint;
  correlation uuid := extensions.gen_random_uuid();
  recovery_invitation public.invitations%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(requested_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260724, 1);

  select account.*
  into account_record
  from public.accounts as account
  where account.id = requested_account_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  required_permission := case
    when account_record.status = 'pending_profile' and requested_status = 'active'
      then 'account.activate'
    when requested_status = 'suspended' then 'account.suspend'
    when requested_status = 'archived' then 'account.archive'
    when requested_status = 'active' then 'account.reactivate'
    else null
  end;

  if required_permission is null
    or not public.is_account_transition_allowed(account_record.status, requested_status)
    or not public.user_has_permission(actor_id, required_permission)
  then
    raise exception 'account_transition_denied' using errcode = '42501';
  end if;

  if requested_status = 'active' then
    if account_record.auth_user_id is null then
      raise exception 'account_not_reactivatable' using errcode = '23514';
    end if;

    if account_record.status = 'pending_profile' then
      if not exists (
        select 1
        from public.profiles as profile
        where profile.id = account_record.auth_user_id
          and profile.display_name is not null
      )
      then
        raise exception 'account_not_reactivatable' using errcode = '23514';
      end if;

      select invitation.*
      into recovery_invitation
      from public.invitations as invitation
      inner join public.roles as role
        on role.id = invitation.requested_initial_role_id
        and role.archived_at is null
      where invitation.account_id = account_record.id
        and invitation.auth_user_id = account_record.auth_user_id
        and invitation.status = 'accepted'
      order by invitation.accepted_at desc
      limit 1;

      if not found then
        raise exception 'accepted_invitation_required' using errcode = '23514';
      end if;

      insert into public.user_roles (user_id, role_id, granted_by)
      values (
        account_record.auth_user_id,
        recovery_invitation.requested_initial_role_id,
        recovery_invitation.created_by
      )
      on conflict do nothing;
    end if;
  end if;

  if account_record.status = 'active'
    and requested_status in ('suspended', 'archived')
    and public.user_has_active_role(account_record.auth_user_id, 'administrator')
  then
    select count(distinct account.auth_user_id)
    into active_admin_count
    from public.accounts as account
    inner join public.user_roles as user_role
      on user_role.user_id = account.auth_user_id
    inner join public.roles as role
      on role.id = user_role.role_id
      and role.code = 'administrator'
      and role.archived_at is null
    where account.status = 'active';

    if active_admin_count <= 1 then
      raise exception 'last_active_administrator' using errcode = '23514';
    end if;
  end if;

  previous_status := account_record.status;

  update public.accounts as account
  set status = requested_status,
      status_changed_at = statement_timestamp(),
      authority_version = account.authority_version + 1
  where account.id = account_record.id
  returning account.* into account_record;

  insert into public.account_status_history (
    account_id, actor_user_id, from_status, to_status, reason, correlation_id
  )
  values (
    account_record.id, actor_id, previous_status, requested_status,
    btrim(requested_reason), correlation
  );

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, previous_state, new_state, metadata
  )
  values (
    actor_id, 'account.' || requested_status, 'account', account_record.id,
    array['status', 'status_changed_at'], account_record.auth_user_id,
    correlation, previous_status, requested_status,
    jsonb_build_object('reason_code', 'account.' || requested_status)
  );

  return next account_record;
end;
$$;

revoke all on function public.change_account_status(uuid, text, text) from public;
revoke all on function public.change_account_status(uuid, text, text) from anon;
revoke all on function public.change_account_status(uuid, text, text) from authenticated;
grant execute on function public.change_account_status(uuid, text, text) to authenticated;

create function public.manage_account_role(
  requested_account_id uuid,
  requested_role_code text,
  requested_operation text
)
returns setof public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  account_record public.accounts%rowtype;
  target_role public.roles%rowtype;
  active_admin_count bigint;
  correlation uuid := extensions.gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if requested_operation not in ('grant', 'revoke') then
    raise exception 'invalid_role_operation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260724, 1);

  if not public.user_has_permission(actor_id, 'role_assignment.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select account.*
  into account_record
  from public.accounts as account
  where account.id = requested_account_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if account_record.auth_user_id = actor_id then
    raise exception 'self_role_change_denied' using errcode = '42501';
  end if;

  if account_record.status <> 'active' or account_record.auth_user_id is null then
    raise exception 'account_roles_frozen' using errcode = '23514';
  end if;

  select role.*
  into target_role
  from public.roles as role
  where role.code = requested_role_code
    and role.archived_at is null;

  if not found
    or not public.can_user_grant_role(actor_id, target_role.id, requested_operation)
  then
    raise exception 'role_assignment_denied' using errcode = '42501';
  end if;

  if requested_operation = 'grant' then
    insert into public.user_roles (user_id, role_id, granted_by)
    values (account_record.auth_user_id, target_role.id, actor_id)
    on conflict do nothing;

    if not found then
      raise exception 'role_already_assigned' using errcode = '23505';
    end if;
  else
    if target_role.code = 'administrator'
      and public.user_has_active_role(account_record.auth_user_id, 'administrator')
    then
      select count(distinct account.auth_user_id)
      into active_admin_count
      from public.accounts as account
      inner join public.user_roles as user_role
        on user_role.user_id = account.auth_user_id
      inner join public.roles as role
        on role.id = user_role.role_id
        and role.code = 'administrator'
        and role.archived_at is null
      where account.status = 'active';

      if active_admin_count <= 1 then
        raise exception 'last_active_administrator' using errcode = '23514';
      end if;
    end if;

    delete from public.user_roles as user_role
    where user_role.user_id = account_record.auth_user_id
      and user_role.role_id = target_role.id;

    if not found then
      raise exception 'role_not_assigned' using errcode = 'P0002';
    end if;
  end if;

  update public.accounts as account
  set authority_version = account.authority_version + 1
  where account.id = account_record.id
  returning account.* into account_record;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, changed_fields,
    target_user_id, correlation_id, metadata
  )
  values (
    actor_id,
    case when requested_operation = 'grant' then 'role.assigned' else 'role.revoked' end,
    'account', account_record.id, array['roles'], account_record.auth_user_id,
    correlation,
    jsonb_build_object(
      'reason_code',
      case when requested_operation = 'grant' then 'role.assigned' else 'role.revoked' end
    )
  );

  return next account_record;
end;
$$;

revoke all on function public.manage_account_role(uuid, text, text) from public;
revoke all on function public.manage_account_role(uuid, text, text) from anon;
revoke all on function public.manage_account_role(uuid, text, text) from authenticated;
grant execute on function public.manage_account_role(uuid, text, text) to authenticated;
