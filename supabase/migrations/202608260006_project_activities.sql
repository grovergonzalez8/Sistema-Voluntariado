create table public.project_activities (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  name text not null,
  description text null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  location_text text null,
  status text not null default 'scheduled',
  status_changed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_activities_project_id_fk
    foreign key (project_id)
    references public.projects (id)
    on delete restrict,
  constraint project_activities_name_valid check (
    char_length(name) between 1 and 120
    and name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))
  ),
  constraint project_activities_description_valid check (
    description is null
    or (
      char_length(description) between 1 and 1000
      and description = btrim(regexp_replace(
        description,
        '[[:space:]]+',
        ' ',
        'g'
      ))
    )
  ),
  constraint project_activities_location_text_valid check (
    location_text is null
    or (
      char_length(location_text) between 1 and 200
      and location_text = btrim(regexp_replace(
        location_text,
        '[[:space:]]+',
        ' ',
        'g'
      ))
    )
  ),
  constraint project_activities_status_valid check (
    status in ('scheduled', 'completed', 'cancelled')
  ),
  constraint project_activities_period_valid check (
    isfinite(starts_at)
    and starts_at >= '0001-01-01 00:00:00+00'::timestamptz
    and starts_at < '10000-01-01 00:00:00+00'::timestamptz
    and (
      ends_at is null
      or (
        isfinite(ends_at)
        and ends_at >= starts_at
        and ends_at >= '0001-01-01 00:00:00+00'::timestamptz
        and ends_at < '10000-01-01 00:00:00+00'::timestamptz
      )
    )
  ),
  constraint project_activities_timestamps_valid check (
    status_changed_at >= created_at
    and updated_at >= created_at
    and updated_at >= status_changed_at
  )
);

create index project_activities_project_starts_at_id_idx
  on public.project_activities (project_id, starts_at, id);

create index project_activities_scheduled_project_idx
  on public.project_activities (project_id)
  where status = 'scheduled';

alter table public.project_activities enable row level security;

revoke all on table public.project_activities
  from public, anon, authenticated;

create function public.lock_project_activity_mutation_access(
  subject_user_id uuid,
  requested_project_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  project_status text;
begin
  if subject_user_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.user_has_permission(subject_user_id, 'project.manage') then
    perform public.lock_project_contextual_access(
      subject_user_id,
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

  return project_status;
end;
$$;

revoke all on function public.lock_project_activity_mutation_access(uuid, uuid)
  from public, anon, authenticated;

create function public.guard_project_activity_change()
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
    if new.status <> 'scheduled' then
      raise exception 'project_activity_must_start_scheduled'
        using errcode = '22023';
    end if;

    new.status_changed_at = statement_timestamp();
    new.created_at = statement_timestamp();
    new.updated_at = statement_timestamp();
    return new;
  end if;

  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
  then
    raise exception 'project_activity_immutable_fields'
      using errcode = '22023';
  end if;

  select project.status
  into current_project_status
  from public.projects as project
  where project.id = old.project_id;

  if current_project_status is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if current_project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;
  if old.status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  if new.status = 'scheduled' then
    if new.status_changed_at is distinct from old.status_changed_at then
      raise exception 'project_activity_immutable_fields'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status not in ('completed', 'cancelled') then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;
  if new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.location_text is distinct from old.location_text
    or new.status_changed_at is distinct from old.status_changed_at
  then
    raise exception 'project_activity_immutable_fields'
      using errcode = '22023';
  end if;

  new.status_changed_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_project_activity_change()
  from public, anon, authenticated;

create trigger project_activities_10_guard_change
before insert or update on public.project_activities
for each row execute function public.guard_project_activity_change();

create function public.guard_project_activity_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'project_activity_delete_not_allowed'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_project_activity_delete()
  from public, anon, authenticated;

create trigger project_activities_11_guard_delete
before delete on public.project_activities
for each row execute function public.guard_project_activity_delete();

create trigger project_activities_20_set_updated_at
before update on public.project_activities
for each row execute function public.set_updated_at();

create function public.audit_project_activity_change()
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
      'project_activity.created',
      'project_activity',
      new.id,
      array[
        'project_id',
        'name',
        'description',
        'starts_at',
        'ends_at',
        'location_text',
        'status'
      ],
      'scheduled',
      '{}'::jsonb
    );
    return new;
  end if;

  fields_changed := array_remove(
    array[
      case when new.name is distinct from old.name then 'name' end,
      case when new.description is distinct from old.description
        then 'description' end,
      case when new.starts_at is distinct from old.starts_at
        then 'starts_at' end,
      case when new.ends_at is distinct from old.ends_at then 'ends_at' end,
      case when new.location_text is distinct from old.location_text
        then 'location_text' end,
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
    case
      when new.status = 'completed' then 'project_activity.completed'
      when new.status = 'cancelled' then 'project_activity.cancelled'
      else 'project_activity.updated'
    end,
    'project_activity',
    new.id,
    fields_changed,
    case when new.status is distinct from old.status then old.status end,
    case when new.status is distinct from old.status then new.status end,
    '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.audit_project_activity_change()
  from public, anon, authenticated;

create trigger project_activities_30_audit_change
after insert or update on public.project_activities
for each row execute function public.audit_project_activity_change();

create or replace function public.guard_project_update()
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

  if old.status = 'active' and new.status = 'closed' and exists (
    select 1
    from public.project_activities as activity
    where activity.project_id = old.id
      and activity.status = 'scheduled'
  ) then
    raise exception 'project_has_scheduled_activities' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_update()
  from public, anon, authenticated;

create function public.list_project_activities(requested_project_id uuid)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
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
    select 1
    from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    activity.id,
    activity.project_id,
    activity.name,
    activity.description,
    activity.starts_at,
    activity.ends_at,
    activity.location_text,
    activity.status,
    activity.status_changed_at,
    activity.created_at,
    activity.updated_at
  from public.project_activities as activity
  where activity.project_id = requested_project_id
  order by activity.starts_at, activity.id;
end;
$$;

revoke all on function public.list_project_activities(uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_activities(uuid)
  to authenticated;

create function public.get_project_activity_detail(
  requested_project_id uuid,
  requested_activity_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
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
    select 1
    from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    activity.id,
    activity.project_id,
    activity.name,
    activity.description,
    activity.starts_at,
    activity.ends_at,
    activity.location_text,
    activity.status,
    activity.status_changed_at,
    activity.created_at,
    activity.updated_at
  from public.project_activities as activity
  where activity.project_id = requested_project_id
    and activity.id = requested_activity_id;

  if not found then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_project_activity_detail(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_project_activity_detail(uuid, uuid)
  to authenticated;

create function public.create_project_activity(
  requested_project_id uuid,
  requested_name text,
  requested_description text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_location_text text
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_name text := btrim(regexp_replace(
    coalesce(requested_name, ''), '[[:space:]]+', ' ', 'g'
  ));
  canonical_description text := nullif(
    btrim(regexp_replace(
      coalesce(requested_description, ''), '[[:space:]]+', ' ', 'g'
    )),
    ''
  );
  canonical_location_text text := nullif(
    btrim(regexp_replace(
      coalesce(requested_location_text, ''), '[[:space:]]+', ' ', 'g'
    )),
    ''
  );
begin
  if char_length(canonical_name) not between 1 and 120
    or (
      canonical_description is not null
      and char_length(canonical_description) > 1000
    )
    or (
      canonical_location_text is not null
      and char_length(canonical_location_text) > 200
    )
    or requested_starts_at is null
    or not isfinite(requested_starts_at)
    or requested_starts_at < '0001-01-01 00:00:00+00'::timestamptz
    or requested_starts_at >= '10000-01-01 00:00:00+00'::timestamptz
    or (
      requested_ends_at is not null
      and (
        not isfinite(requested_ends_at)
        or requested_ends_at < requested_starts_at
        or requested_ends_at < '0001-01-01 00:00:00+00'::timestamptz
        or requested_ends_at >= '10000-01-01 00:00:00+00'::timestamptz
      )
    )
  then
    raise exception 'invalid_project_activity' using errcode = '22023';
  end if;

  perform public.lock_project_activity_mutation_access(
    actor_id,
    requested_project_id
  );

  return query
  insert into public.project_activities (
    project_id,
    name,
    description,
    starts_at,
    ends_at,
    location_text
  )
  values (
    requested_project_id,
    canonical_name,
    canonical_description,
    requested_starts_at,
    requested_ends_at,
    canonical_location_text
  )
  returning
    project_activities.id,
    project_activities.project_id,
    project_activities.name,
    project_activities.description,
    project_activities.starts_at,
    project_activities.ends_at,
    project_activities.location_text,
    project_activities.status,
    project_activities.status_changed_at,
    project_activities.created_at,
    project_activities.updated_at;
end;
$$;

revoke all on function public.create_project_activity(
  uuid, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_project_activity(
  uuid, text, text, timestamptz, timestamptz, text
) to authenticated;

create function public.update_project_activity(
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_name text,
  requested_description text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_location_text text
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_activity_status text;
  canonical_name text := btrim(regexp_replace(
    coalesce(requested_name, ''), '[[:space:]]+', ' ', 'g'
  ));
  canonical_description text := nullif(
    btrim(regexp_replace(
      coalesce(requested_description, ''), '[[:space:]]+', ' ', 'g'
    )),
    ''
  );
  canonical_location_text text := nullif(
    btrim(regexp_replace(
      coalesce(requested_location_text, ''), '[[:space:]]+', ' ', 'g'
    )),
    ''
  );
begin
  if char_length(canonical_name) not between 1 and 120
    or (
      canonical_description is not null
      and char_length(canonical_description) > 1000
    )
    or (
      canonical_location_text is not null
      and char_length(canonical_location_text) > 200
    )
    or requested_starts_at is null
    or not isfinite(requested_starts_at)
    or requested_starts_at < '0001-01-01 00:00:00+00'::timestamptz
    or requested_starts_at >= '10000-01-01 00:00:00+00'::timestamptz
    or (
      requested_ends_at is not null
      and (
        not isfinite(requested_ends_at)
        or requested_ends_at < requested_starts_at
        or requested_ends_at < '0001-01-01 00:00:00+00'::timestamptz
        or requested_ends_at >= '10000-01-01 00:00:00+00'::timestamptz
      )
    )
  then
    raise exception 'invalid_project_activity' using errcode = '22023';
  end if;

  perform public.lock_project_activity_mutation_access(
    actor_id,
    requested_project_id
  );

  select activity.status
  into current_activity_status
  from public.project_activities as activity
  where activity.project_id = requested_project_id
    and activity.id = requested_activity_id
  for update;

  if current_activity_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if current_activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  return query
  update public.project_activities as activity
  set name = canonical_name,
      description = canonical_description,
      starts_at = requested_starts_at,
      ends_at = requested_ends_at,
      location_text = canonical_location_text
  where activity.project_id = requested_project_id
    and activity.id = requested_activity_id
  returning
    activity.id,
    activity.project_id,
    activity.name,
    activity.description,
    activity.starts_at,
    activity.ends_at,
    activity.location_text,
    activity.status,
    activity.status_changed_at,
    activity.created_at,
    activity.updated_at;
end;
$$;

revoke all on function public.update_project_activity(
  uuid, uuid, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.update_project_activity(
  uuid, uuid, text, text, timestamptz, timestamptz, text
) to authenticated;

create function public.transition_project_activity(
  subject_user_id uuid,
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_status text
)
returns setof public.project_activities
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_activity_status text;
begin
  if requested_status not in ('completed', 'cancelled') then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  perform public.lock_project_activity_mutation_access(
    subject_user_id,
    requested_project_id
  );

  select activity.status
  into current_activity_status
  from public.project_activities as activity
  where activity.project_id = requested_project_id
    and activity.id = requested_activity_id
  for update;

  if current_activity_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if current_activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  return query
  update public.project_activities as activity
  set status = requested_status
  where activity.project_id = requested_project_id
    and activity.id = requested_activity_id
  returning activity.*;
end;
$$;

revoke all on function public.transition_project_activity(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

create function public.complete_project_activity(
  requested_project_id uuid,
  requested_activity_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    activity.id,
    activity.project_id,
    activity.name,
    activity.description,
    activity.starts_at,
    activity.ends_at,
    activity.location_text,
    activity.status,
    activity.status_changed_at,
    activity.created_at,
    activity.updated_at
  from public.transition_project_activity(
    (select auth.uid()),
    requested_project_id,
    requested_activity_id,
    'completed'
  ) as activity;
end;
$$;

revoke all on function public.complete_project_activity(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_project_activity(uuid, uuid)
  to authenticated;

create function public.cancel_project_activity(
  requested_project_id uuid,
  requested_activity_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  name text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  status text,
  status_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    activity.id,
    activity.project_id,
    activity.name,
    activity.description,
    activity.starts_at,
    activity.ends_at,
    activity.location_text,
    activity.status,
    activity.status_changed_at,
    activity.created_at,
    activity.updated_at
  from public.transition_project_activity(
    (select auth.uid()),
    requested_project_id,
    requested_activity_id,
    'cancelled'
  ) as activity;
end;
$$;

revoke all on function public.cancel_project_activity(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_project_activity(uuid, uuid)
  to authenticated;
