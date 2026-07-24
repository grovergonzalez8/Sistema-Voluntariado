create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text null,
  preferred_locale text not null default 'es',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz null,
  constraint profiles_display_name_valid check (
    display_name is null
    or (
      char_length(display_name) between 1 and 100
      and display_name = btrim(display_name)
    )
  ),
  constraint profiles_preferred_locale_valid check (
    preferred_locale in ('es', 'en')
  ),
  constraint profiles_timestamps_valid check (updated_at >= created_at)
);

create table public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz null,
  constraint roles_code_valid check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint roles_timestamps_valid check (updated_at >= created_at)
);

create table public.permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz null,
  constraint permissions_code_valid check (
    code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint permissions_timestamps_valid check (updated_at >= created_at)
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete restrict,
  role_id uuid not null references public.roles (id) on delete restrict,
  granted_at timestamptz not null default statement_timestamp(),
  granted_by uuid null references auth.users (id) on delete set null,
  primary key (user_id, role_id)
);

create index user_roles_role_id_user_id_idx
  on public.user_roles (role_id, user_id);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete restrict,
  permission_id uuid not null references public.permissions (id) on delete restrict,
  granted_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_role_id_idx
  on public.role_permissions (permission_id, role_id);

create table public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid null references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  changed_fields text[] not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint audit_logs_action_valid check (
    action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint audit_logs_entity_type_valid check (
    entity_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint audit_logs_changed_fields_present check (
    cardinality(changed_fields) > 0
  )
);

create index audit_logs_actor_created_at_idx
  on public.audit_logs (actor_user_id, created_at desc);

create index audit_logs_entity_created_at_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

create function public.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    inner join public.profiles as profile
      on profile.id = ur.user_id
      and profile.archived_at is null
    inner join public.roles as r
      on r.id = ur.role_id
      and r.archived_at is null
    inner join public.role_permissions as rp
      on rp.role_id = r.id
    inner join public.permissions as p
      on p.id = rp.permission_id
      and p.archived_at is null
    where ur.user_id = (select auth.uid())
      and p.code = requested_permission
  );
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
revoke all on function public.has_permission(text) from authenticated;
grant execute on function public.has_permission(text) to authenticated;

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public;
revoke all on function public.create_profile_for_new_user() from anon;
revoke all on function public.create_profile_for_new_user() from authenticated;

create trigger auth_users_10_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and (
      new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.archived_at is distinct from old.archived_at
    )
  then
    raise exception 'protected profile columns cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_protected_columns() from public;
revoke all on function public.guard_profile_protected_columns() from anon;
revoke all on function public.guard_profile_protected_columns() from authenticated;

create trigger profiles_10_guard_protected_columns
before update on public.profiles
for each row execute function public.guard_profile_protected_columns();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.set_updated_at() from authenticated;

create trigger profiles_20_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger roles_20_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger permissions_20_set_updated_at
before update on public.permissions
for each row execute function public.set_updated_at();

create function public.audit_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields_changed text[];
begin
  fields_changed = array_remove(
    array[
      case
        when new.display_name is distinct from old.display_name
          then 'display_name'
      end,
      case
        when new.preferred_locale is distinct from old.preferred_locale
          then 'preferred_locale'
      end,
      case
        when new.archived_at is distinct from old.archived_at
          then 'archived_at'
      end
    ],
    null
  );

  if cardinality(fields_changed) > 0 then
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields
    )
    values (
      (select auth.uid()),
      'profile.updated',
      'profile',
      new.id,
      fields_changed
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_profile_update() from public;
revoke all on function public.audit_profile_update() from anon;
revoke all on function public.audit_profile_update() from authenticated;

create trigger profiles_30_audit_update
after update on public.profiles
for each row execute function public.audit_profile_update();

create policy profiles_read_own
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  and archived_at is null
  and public.has_permission('volunteer.read_self')
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  and archived_at is null
  and public.has_permission('volunteer.update_self')
)
with check (
  id = (select auth.uid())
  and archived_at is null
  and public.has_permission('volunteer.update_self')
);

create policy audit_logs_read_with_permission
on public.audit_logs
for select
to authenticated
using (public.has_permission('audit.read'));

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.roles from public, anon, authenticated;
revoke all on table public.permissions from public, anon, authenticated;
revoke all on table public.user_roles from public, anon, authenticated;
revoke all on table public.role_permissions from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, preferred_locale) on table public.profiles
  to authenticated;
grant select on table public.audit_logs to authenticated;
