insert into public.permissions (code, description)
values ('project.manage', 'Administrar proyectos y asignaciones de voluntarios')
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
  and permission.code = 'project.manage'
on conflict do nothing;

create table public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  description text null,
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint projects_name_valid check (
    char_length(name) between 1 and 120
    and name = regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')
  ),
  constraint projects_description_valid check (
    description is null
    or (
      char_length(description) between 1 and 1000
      and description = regexp_replace(
        btrim(description),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  ),
  constraint projects_status_valid check (status in ('active', 'closed')),
  constraint projects_timestamps_valid check (updated_at >= created_at)
);

create table public.project_volunteer_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  volunteer_id uuid not null references public.volunteers (id) on delete restrict,
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_assignments_period_valid check (
    ended_at is null or ended_at >= started_at
  ),
  constraint project_assignments_timestamps_valid check (
    updated_at >= created_at and started_at >= created_at
  )
);

create index projects_created_at_id_idx
  on public.projects (created_at desc, id);

create index projects_status_name_id_idx
  on public.projects (status, lower(name), id);

create index projects_name_search_idx
  on public.projects using gin (lower(name) extensions.gin_trgm_ops);

create unique index project_assignments_one_active_pair_idx
  on public.project_volunteer_assignments (project_id, volunteer_id)
  where ended_at is null;

create index project_assignments_project_history_idx
  on public.project_volunteer_assignments (project_id, started_at desc, id);

create index project_assignments_volunteer_history_idx
  on public.project_volunteer_assignments (volunteer_id, started_at desc, id);

alter table public.projects enable row level security;
alter table public.project_volunteer_assignments enable row level security;

revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.project_volunteer_assignments
  from public, anon, authenticated;

create function public.guard_project_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'project_immutable_fields' using errcode = '22023';
  end if;

  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'project_reopen_not_allowed' using errcode = '22023';
  end if;

  if old.status = 'active' and new.status = 'closed' and exists (
    select 1
    from public.project_volunteer_assignments as assignment
    where assignment.project_id = old.id
      and assignment.ended_at is null
  ) then
    raise exception 'project_has_active_assignments' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_update()
  from public, anon, authenticated;

create trigger projects_10_guard_update
before update on public.projects
for each row execute function public.guard_project_update();

create trigger projects_20_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create function public.guard_project_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project_status text;
begin
  if tg_op = 'INSERT' then
    select project.status
    into current_project_status
    from public.projects as project
    where project.id = new.project_id
    for update;

    if current_project_status is null then
      raise exception 'project_not_found' using errcode = 'P0002';
    end if;
    if current_project_status <> 'active' then
      raise exception 'project_closed' using errcode = '23514';
    end if;
    if new.ended_at is not null then
      raise exception 'assignment_must_start_active' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.volunteer_id is distinct from old.volunteer_id
    or new.started_at is distinct from old.started_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'assignment_immutable_fields' using errcode = '22023';
  end if;
  if old.ended_at is not null or new.ended_at is null then
    raise exception 'assignment_already_ended' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_assignment_change()
  from public, anon, authenticated;

create trigger project_assignments_10_guard_change
before insert or update on public.project_volunteer_assignments
for each row execute function public.guard_project_assignment_change();

create trigger project_assignments_20_set_updated_at
before update on public.project_volunteer_assignments
for each row execute function public.set_updated_at();

create function public.audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields_changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      new_state,
      metadata
    )
    values (
      (select auth.uid()),
      'project.created',
      'project',
      new.id,
      array['name', 'description', 'status'],
      'active',
      '{}'::jsonb
    );
    return new;
  end if;

  fields_changed := array_remove(
    array[
      case when new.name is distinct from old.name then 'name' end,
      case when new.description is distinct from old.description then 'description' end,
      case when new.status is distinct from old.status then 'status' end
    ],
    null
  );
  if cardinality(fields_changed) = 0 then
    return new;
  end if;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    previous_state,
    new_state,
    metadata
  )
  values (
    (select auth.uid()),
    case when new.status is distinct from old.status
      then 'project.closed'
      else 'project.updated'
    end,
    'project',
    new.id,
    fields_changed,
    case when new.status is distinct from old.status then old.status end,
    case when new.status is distinct from old.status then new.status end,
    '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.audit_project_change()
  from public, anon, authenticated;

create trigger projects_30_audit_change
after insert or update on public.projects
for each row execute function public.audit_project_change();

create function public.audit_project_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    previous_state,
    new_state,
    metadata
  )
  values (
    (select auth.uid()),
    case when tg_op = 'INSERT'
      then 'project_assignment.created'
      else 'project_assignment.ended'
    end,
    'project_assignment',
    new.id,
    case when tg_op = 'INSERT'
      then array['project_id', 'volunteer_id', 'started_at']
      else array['ended_at']
    end,
    case when tg_op = 'UPDATE' then 'active' end,
    case when tg_op = 'INSERT' then 'active' else 'ended' end,
    '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.audit_project_assignment_change()
  from public, anon, authenticated;

create trigger project_assignments_30_audit_change
after insert or update on public.project_volunteer_assignments
for each row execute function public.audit_project_assignment_change();

create function public.list_projects(
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
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  escaped_search text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
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
  where canonical_search = ''
    or lower(project.name) like '%' || escaped_search || '%' escape '\'
  order by
    case when project.status = 'active' then 0 else 1 end,
    lower(project.name),
    project.id
  limit requested_limit
  offset requested_offset;
end;
$$;

revoke all on function public.list_projects(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_projects(text, integer, integer)
  to authenticated;

create function public.get_project_detail(requested_project_id uuid)
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
    or not public.user_has_permission(actor_id, 'project.manage')
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

revoke all on function public.get_project_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_project_detail(uuid) to authenticated;

create function public.create_project(
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
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  insert into public.projects (name, description)
  values (canonical_name, canonical_description)
  returning
    projects.id,
    projects.name,
    projects.description,
    projects.status,
    projects.created_at,
    projects.updated_at;
end;
$$;

revoke all on function public.create_project(text, text)
  from public, anon, authenticated;
grant execute on function public.create_project(text, text) to authenticated;

create function public.update_project(
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
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
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

revoke all on function public.update_project(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_project(uuid, text, text)
  to authenticated;

create function public.close_project(requested_project_id uuid)
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
  project_status text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select project.status
  into project_status
  from public.projects as project
  where project.id = requested_project_id
  for update;

  if project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if project_status = 'closed' then
    raise exception 'project_already_closed' using errcode = '23514';
  end if;

  return query
  update public.projects as project
  set status = 'closed'
  where project.id = requested_project_id
  returning
    project.id,
    project.name,
    project.description,
    project.status,
    project.created_at,
    project.updated_at;
end;
$$;

revoke all on function public.close_project(uuid)
  from public, anon, authenticated;
grant execute on function public.close_project(uuid) to authenticated;

create function public.list_project_assignments(requested_project_id uuid)
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

revoke all on function public.list_project_assignments(uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_assignments(uuid)
  to authenticated;

create function public.search_project_volunteer_candidates(
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
    raise exception 'invalid_volunteer_query' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
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

revoke all on function public.search_project_volunteer_candidates(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_project_volunteer_candidates(uuid, text, integer)
  to authenticated;

create function public.assign_volunteer_to_project(
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
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
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

revoke all on function public.assign_volunteer_to_project(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_volunteer_to_project(uuid, uuid)
  to authenticated;

create function public.finish_project_volunteer_assignment(
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
  current_ended_at timestamptz;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'project.manage')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select assignment.ended_at
  into current_ended_at
  from public.project_volunteer_assignments as assignment
  where assignment.id = requested_assignment_id
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

revoke all on function public.finish_project_volunteer_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.finish_project_volunteer_assignment(uuid)
  to authenticated;

create function public.list_volunteer_projects(requested_volunteer_id uuid)
returns table (
  assignment_id uuid,
  project_id uuid,
  project_name text,
  project_status text,
  started_at timestamptz,
  ended_at timestamptz
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
    select 1 from public.volunteers as volunteer
    where volunteer.id = requested_volunteer_id
  ) then
    raise exception 'volunteer_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    assignment.id,
    project.id,
    project.name,
    project.status,
    assignment.started_at,
    assignment.ended_at
  from public.project_volunteer_assignments as assignment
  inner join public.projects as project on project.id = assignment.project_id
  where assignment.volunteer_id = requested_volunteer_id
  order by assignment.started_at desc, assignment.id;
end;
$$;

revoke all on function public.list_volunteer_projects(uuid)
  from public, anon, authenticated;
grant execute on function public.list_volunteer_projects(uuid)
  to authenticated;
