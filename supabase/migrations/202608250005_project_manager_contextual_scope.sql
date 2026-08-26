insert into public.permissions (code, description)
values
  ('project.read_assigned', 'Consultar proyectos asignados'),
  ('project.manage_assigned', 'Administrar proyectos asignados')
on conflict (code) do update
set description = excluded.description,
    updated_at = statement_timestamp(),
    archived_at = null;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code in ('administrator', 'project_manager')
  and role.archived_at is null
  and permission.code in ('project.read_assigned', 'project.manage_assigned')
  and permission.archived_at is null
on conflict do nothing;

create table public.project_manager_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  manager_account_id uuid not null references public.accounts (id) on delete restrict,
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_manager_assignments_period_valid check (
    ended_at is null or ended_at >= started_at
  ),
  constraint project_manager_assignments_timestamps_valid check (
    updated_at >= created_at and started_at >= created_at
  )
);

create unique index project_manager_assignments_one_active_pair_idx
  on public.project_manager_assignments (project_id, manager_account_id)
  where ended_at is null;

create index project_manager_assignments_project_history_idx
  on public.project_manager_assignments (project_id, started_at desc, id);

create index project_manager_assignments_account_history_idx
  on public.project_manager_assignments (
    manager_account_id,
    started_at desc,
    id
  );

alter table public.project_manager_assignments enable row level security;

revoke all on table public.project_manager_assignments
  from public, anon, authenticated;

create function public.has_project_contextual_access(
  subject_user_id uuid,
  requested_project_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_permission in (
      'project.read_assigned',
      'project.manage_assigned'
    )
    and public.user_has_active_role(subject_user_id, 'project_manager')
    and public.user_has_permission(subject_user_id, requested_permission)
    and exists (
      select 1
      from public.accounts as account
      inner join public.project_manager_assignments as assignment
        on assignment.manager_account_id = account.id
        and assignment.project_id = requested_project_id
        and assignment.ended_at is null
      where account.auth_user_id = subject_user_id
        and account.status = 'active'
    );
$$;

revoke all on function public.has_project_contextual_access(uuid, uuid, text)
  from public, anon, authenticated;

create function public.lock_project_contextual_access(
  subject_user_id uuid,
  requested_project_id uuid,
  requested_permission text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid;
  active_scope_id uuid;
begin
  if subject_user_id is null
    or requested_permission not in (
      'project.read_assigned',
      'project.manage_assigned'
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select account.id
  into actor_account_id
  from public.accounts as account
  where account.auth_user_id = subject_user_id
    and account.status = 'active'
  for share;

  if actor_account_id is null
    or not public.user_has_active_role(subject_user_id, 'project_manager')
    or not public.user_has_permission(subject_user_id, requested_permission)
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select assignment.id
  into active_scope_id
  from public.project_manager_assignments as assignment
  where assignment.project_id = requested_project_id
    and assignment.manager_account_id = actor_account_id
    and assignment.ended_at is null
  for share;

  if active_scope_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.lock_project_contextual_access(uuid, uuid, text)
  from public, anon, authenticated;

create function public.guard_project_manager_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_user_id uuid;
  manager_status text;
  project_status text;
begin
  if tg_op = 'INSERT' then
    select account.auth_user_id, account.status
    into manager_user_id, manager_status
    from public.accounts as account
    where account.id = new.manager_account_id
    for update;

    if manager_user_id is null or manager_status <> 'active' then
      raise exception 'project_manager_not_eligible' using errcode = '23514';
    end if;
    if not public.user_has_active_role(manager_user_id, 'project_manager')
      or not public.user_has_permission(manager_user_id, 'project.read_assigned')
      or not public.user_has_permission(manager_user_id, 'project.manage_assigned')
    then
      raise exception 'project_manager_not_eligible' using errcode = '23514';
    end if;

    select project.status
    into project_status
    from public.projects as project
    where project.id = new.project_id
    for update;

    if project_status is null then
      raise exception 'project_not_found' using errcode = 'P0002';
    end if;
    if project_status <> 'active' then
      raise exception 'project_closed' using errcode = '23514';
    end if;
    if new.ended_at is not null then
      raise exception 'project_manager_assignment_must_start_active'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.manager_account_id is distinct from old.manager_account_id
    or new.started_at is distinct from old.started_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'project_manager_assignment_immutable_fields'
      using errcode = '22023';
  end if;
  if old.ended_at is not null or new.ended_at is null then
    raise exception 'project_manager_assignment_already_ended'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_manager_assignment_change()
  from public, anon, authenticated;

create trigger project_manager_assignments_10_guard_change
before insert or update on public.project_manager_assignments
for each row execute function public.guard_project_manager_assignment_change();

create function public.guard_project_manager_assignment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'project_manager_assignment_delete_not_allowed'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_project_manager_assignment_delete()
  from public, anon, authenticated;

create trigger project_manager_assignments_11_guard_delete
before delete on public.project_manager_assignments
for each row execute function public.guard_project_manager_assignment_delete();

create trigger project_manager_assignments_20_set_updated_at
before update on public.project_manager_assignments
for each row execute function public.set_updated_at();

create function public.audit_project_manager_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_user_id uuid;
begin
  select account.auth_user_id
  into manager_user_id
  from public.accounts as account
  where account.id = new.manager_account_id;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    target_user_id,
    previous_state,
    new_state,
    metadata
  )
  values (
    (select auth.uid()),
    case when tg_op = 'INSERT'
      then 'project_manager_assignment.created'
      else 'project_manager_assignment.ended'
    end,
    'project_manager_assignment',
    new.id,
    case when tg_op = 'INSERT'
      then array['project_id', 'manager_account_id', 'started_at']
      else array['ended_at']
    end,
    manager_user_id,
    case when tg_op = 'UPDATE' then 'active' end,
    case when tg_op = 'INSERT' then 'active' else 'ended' end,
    '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.audit_project_manager_assignment_change()
  from public, anon, authenticated;

create trigger project_manager_assignments_30_audit_change
after insert or update on public.project_manager_assignments
for each row execute function public.audit_project_manager_assignment_change();

create or replace function public.list_projects(
  requested_search text default '',
  requested_limit integer default 25,
  requested_offset integer default 0
)
returns table (
  project_id uuid,
  name text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  has_global_access boolean;
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  escaped_search text;
begin
  has_global_access := actor_id is not null
    and public.user_has_permission(actor_id, 'project.manage');
  if actor_id is null
    or (
      not has_global_access
      and (
        not public.user_has_active_role(actor_id, 'project_manager')
        or not public.user_has_permission(actor_id, 'project.read_assigned')
      )
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 100
    or requested_offset is null
    or requested_offset < 0
    or char_length(canonical_search) > 120
  then
    raise exception 'invalid_project_query' using errcode = '22023';
  end if;

  escaped_search := replace(
    replace(replace(canonical_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select
    project.id,
    project.name,
    project.description,
    project.status,
    project.created_at,
    project.updated_at,
    count(*) over ()
  from public.projects as project
  where (
      has_global_access
      or public.has_project_contextual_access(
        actor_id,
        project.id,
        'project.read_assigned'
      )
    )
    and (
      canonical_search = ''
      or lower(project.name) like '%' || escaped_search || '%' escape '\'
    )
  order by
    case when project.status = 'active' then 0 else 1 end,
    lower(project.name),
    project.id
  limit requested_limit
  offset requested_offset;
end;
$$;

create or replace function public.get_project_detail(requested_project_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not (
      public.user_has_permission(actor_id, 'project.manage')
      or public.has_project_contextual_access(
        actor_id,
        requested_project_id,
        'project.read_assigned'
      )
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    project.id,
    project.name,
    project.description,
    project.status,
    project.created_at,
    project.updated_at
  from public.projects as project
  where project.id = requested_project_id;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.update_project(
  requested_project_id uuid,
  requested_name text,
  requested_description text
)
returns table (
  id uuid,
  name text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_name text := regexp_replace(
    btrim(coalesce(requested_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  canonical_description text := nullif(
    regexp_replace(
      btrim(coalesce(requested_description, '')),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
begin
  if actor_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_permission(actor_id, 'project.manage') then
    perform public.lock_project_contextual_access(
      actor_id,
      requested_project_id,
      'project.manage_assigned'
    );
  end if;

  return query
  update public.projects as project
  set name = canonical_name,
      description = canonical_description
  where project.id = requested_project_id
  returning
    project.id,
    project.name,
    project.description,
    project.status,
    project.created_at,
    project.updated_at;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.list_project_assignments(
  requested_project_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  volunteer_id uuid,
  volunteer_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not (
      public.user_has_permission(actor_id, 'project.manage')
      or public.has_project_contextual_access(
        actor_id,
        requested_project_id,
        'project.read_assigned'
      )
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    assignment.id,
    assignment.project_id,
    assignment.volunteer_id,
    volunteer.full_name,
    assignment.started_at,
    assignment.ended_at,
    assignment.created_at,
    assignment.updated_at
  from public.project_volunteer_assignments as assignment
  inner join public.volunteers as volunteer on volunteer.id = assignment.volunteer_id
  where assignment.project_id = requested_project_id
  order by assignment.started_at desc, assignment.id;
end;
$$;

create or replace function public.search_project_volunteer_candidates(
  requested_project_id uuid,
  requested_search text default '',
  requested_limit integer default 20
)
returns table (volunteer_id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  escaped_search text;
  project_status text;
begin
  if actor_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_permission(actor_id, 'project.manage')
    and not public.has_project_contextual_access(
      actor_id,
      requested_project_id,
      'project.manage_assigned'
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 50
    or char_length(canonical_search) > 100
  then
    raise exception 'invalid_volunteer_query' using errcode = '22023';
  end if;

  select project.status
  into project_status
  from public.projects as project
  where project.id = requested_project_id;
  if project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;

  escaped_search := replace(
    replace(replace(canonical_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select volunteer.id, volunteer.full_name
  from public.volunteers as volunteer
  where (
      canonical_search = ''
      or lower(volunteer.full_name) like '%' || escaped_search || '%' escape '\'
    )
    and not exists (
      select 1
      from public.project_volunteer_assignments as assignment
      where assignment.project_id = requested_project_id
        and assignment.volunteer_id = volunteer.id
        and assignment.ended_at is null
    )
  order by lower(volunteer.full_name), volunteer.id
  limit requested_limit;
end;
$$;

create or replace function public.assign_volunteer_to_project(
  requested_project_id uuid,
  requested_volunteer_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  volunteer_id uuid,
  volunteer_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_status text;
  new_assignment_id uuid;
begin
  if actor_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_permission(actor_id, 'project.manage') then
    perform public.lock_project_contextual_access(
      actor_id,
      requested_project_id,
      'project.manage_assigned'
    );
  end if;

  select project.status
  into project_status
  from public.projects as project
  where project.id = requested_project_id
  for update;

  if project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.volunteers as volunteer
    where volunteer.id = requested_volunteer_id
  ) then
    raise exception 'volunteer_not_found' using errcode = 'P0002';
  end if;

  begin
    insert into public.project_volunteer_assignments (project_id, volunteer_id)
    values (requested_project_id, requested_volunteer_id)
    returning id into new_assignment_id;
  exception when unique_violation then
    raise exception 'assignment_already_active' using errcode = '23505';
  end;

  return query
  select
    assignment.id,
    assignment.project_id,
    assignment.volunteer_id,
    volunteer.full_name,
    assignment.started_at,
    assignment.ended_at,
    assignment.created_at,
    assignment.updated_at
  from public.project_volunteer_assignments as assignment
  inner join public.volunteers as volunteer on volunteer.id = assignment.volunteer_id
  where assignment.id = new_assignment_id;
end;
$$;

create or replace function public.finish_project_volunteer_assignment(
  requested_assignment_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  volunteer_id uuid,
  volunteer_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  assignment_project_id uuid;
  current_ended_at timestamptz;
begin
  if actor_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select assignment.project_id
  into assignment_project_id
  from public.project_volunteer_assignments as assignment
  where assignment.id = requested_assignment_id;
  if assignment_project_id is null then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;

  if not public.user_has_permission(actor_id, 'project.manage') then
    perform public.lock_project_contextual_access(
      actor_id,
      assignment_project_id,
      'project.manage_assigned'
    );
  end if;

  perform project.id
  from public.projects as project
  where project.id = assignment_project_id
  for update;

  select assignment.ended_at
  into current_ended_at
  from public.project_volunteer_assignments as assignment
  where assignment.id = requested_assignment_id
    and assignment.project_id = assignment_project_id
  for update;

  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;
  if current_ended_at is not null then
    raise exception 'assignment_already_ended' using errcode = '23514';
  end if;

  return query
  with updated as (
    update public.project_volunteer_assignments as assignment
    set ended_at = statement_timestamp()
    where assignment.id = requested_assignment_id
    returning assignment.*
  )
  select
    updated.id,
    updated.project_id,
    updated.volunteer_id,
    volunteer.full_name,
    updated.started_at,
    updated.ended_at,
    updated.created_at,
    updated.updated_at
  from updated
  inner join public.volunteers as volunteer on volunteer.id = updated.volunteer_id;
end;
$$;

create function public.list_project_manager_assignments(
  requested_project_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  manager_account_id uuid,
  manager_display_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    assignment.id,
    assignment.project_id,
    assignment.manager_account_id,
    profile.display_name,
    assignment.started_at,
    assignment.ended_at,
    assignment.created_at,
    assignment.updated_at
  from public.project_manager_assignments as assignment
  inner join public.accounts as account
    on account.id = assignment.manager_account_id
  inner join public.profiles as profile
    on profile.id = account.auth_user_id
  where assignment.project_id = requested_project_id
  order by assignment.started_at desc, assignment.id;
end;
$$;

revoke all on function public.list_project_manager_assignments(uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_manager_assignments(uuid)
  to authenticated;

create function public.search_project_manager_candidates(
  requested_project_id uuid,
  requested_search text default '',
  requested_limit integer default 20
)
returns table (manager_account_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  escaped_search text;
  project_status text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 50
    or char_length(canonical_search) > 100
  then
    raise exception 'invalid_project_manager_query' using errcode = '22023';
  end if;

  select project.status
  into project_status
  from public.projects as project
  where project.id = requested_project_id;
  if project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;

  escaped_search := replace(
    replace(replace(canonical_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select account.id, profile.display_name
  from public.accounts as account
  inner join public.profiles as profile on profile.id = account.auth_user_id
  where account.status = 'active'
    and profile.display_name is not null
    and public.user_has_active_role(account.auth_user_id, 'project_manager')
    and public.user_has_permission(account.auth_user_id, 'project.read_assigned')
    and public.user_has_permission(account.auth_user_id, 'project.manage_assigned')
    and (
      canonical_search = ''
      or lower(profile.display_name) like '%' || escaped_search || '%' escape '\'
    )
    and not exists (
      select 1
      from public.project_manager_assignments as assignment
      where assignment.project_id = requested_project_id
        and assignment.manager_account_id = account.id
        and assignment.ended_at is null
    )
  order by lower(profile.display_name), account.id
  limit requested_limit;
end;
$$;

revoke all on function public.search_project_manager_candidates(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_project_manager_candidates(uuid, text, integer)
  to authenticated;

create function public.assign_project_manager(
  requested_project_id uuid,
  requested_manager_account_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  manager_account_id uuid,
  manager_display_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  manager_user_id uuid;
  manager_status text;
  project_status text;
  new_assignment_id uuid;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select account.auth_user_id, account.status
  into manager_user_id, manager_status
  from public.accounts as account
  where account.id = requested_manager_account_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if manager_user_id is null
    or manager_status <> 'active'
    or not public.user_has_active_role(manager_user_id, 'project_manager')
    or not public.user_has_permission(manager_user_id, 'project.read_assigned')
    or not public.user_has_permission(manager_user_id, 'project.manage_assigned')
  then
    raise exception 'project_manager_not_eligible' using errcode = '23514';
  end if;

  select project.status
  into project_status
  from public.projects as project
  where project.id = requested_project_id
  for update;

  if project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;

  begin
    insert into public.project_manager_assignments (
      project_id,
      manager_account_id
    )
    values (requested_project_id, requested_manager_account_id)
    returning id into new_assignment_id;
  exception when unique_violation then
    raise exception 'project_manager_assignment_already_active'
      using errcode = '23505';
  end;

  return query
  select
    assignment.id,
    assignment.project_id,
    assignment.manager_account_id,
    profile.display_name,
    assignment.started_at,
    assignment.ended_at,
    assignment.created_at,
    assignment.updated_at
  from public.project_manager_assignments as assignment
  inner join public.accounts as account
    on account.id = assignment.manager_account_id
  inner join public.profiles as profile on profile.id = account.auth_user_id
  where assignment.id = new_assignment_id;
end;
$$;

revoke all on function public.assign_project_manager(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_project_manager(uuid, uuid)
  to authenticated;

create function public.finish_project_manager_assignment(
  requested_assignment_id uuid
)
returns table (
  assignment_id uuid,
  project_id uuid,
  manager_account_id uuid,
  manager_display_name text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_ended_at timestamptz;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select assignment.ended_at
  into current_ended_at
  from public.project_manager_assignments as assignment
  where assignment.id = requested_assignment_id
  for update;

  if not found then
    raise exception 'project_manager_assignment_not_found'
      using errcode = 'P0002';
  end if;
  if current_ended_at is not null then
    raise exception 'project_manager_assignment_already_ended'
      using errcode = '23514';
  end if;

  return query
  with updated as (
    update public.project_manager_assignments as assignment
    set ended_at = statement_timestamp()
    where assignment.id = requested_assignment_id
    returning assignment.*
  )
  select
    updated.id,
    updated.project_id,
    updated.manager_account_id,
    profile.display_name,
    updated.started_at,
    updated.ended_at,
    updated.created_at,
    updated.updated_at
  from updated
  inner join public.accounts as account
    on account.id = updated.manager_account_id
  inner join public.profiles as profile on profile.id = account.auth_user_id;
end;
$$;

revoke all on function public.finish_project_manager_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.finish_project_manager_assignment(uuid)
  to authenticated;

revoke all on function public.list_projects(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_projects(text, integer, integer)
  to authenticated;

revoke all on function public.get_project_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_project_detail(uuid) to authenticated;

revoke all on function public.update_project(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_project(uuid, text, text)
  to authenticated;

revoke all on function public.list_project_assignments(uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_assignments(uuid)
  to authenticated;

revoke all on function public.search_project_volunteer_candidates(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_project_volunteer_candidates(uuid, text, integer)
  to authenticated;

revoke all on function public.assign_volunteer_to_project(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_volunteer_to_project(uuid, uuid)
  to authenticated;

revoke all on function public.finish_project_volunteer_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.finish_project_volunteer_assignment(uuid)
  to authenticated;
