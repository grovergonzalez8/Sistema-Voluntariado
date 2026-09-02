create table public.project_activity_participations (
  id uuid primary key default extensions.gen_random_uuid(),
  activity_id uuid not null,
  volunteer_id uuid not null,
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_activity_participations_activity_id_fk
    foreign key (activity_id)
    references public.project_activities (id)
    on delete restrict,
  constraint project_activity_participations_volunteer_id_fk
    foreign key (volunteer_id)
    references public.volunteers (id)
    on delete restrict,
  constraint project_activity_participations_period_valid check (
    ended_at is null or ended_at >= started_at
  ),
  constraint project_activity_participations_timestamps_valid check (
    started_at >= created_at
    and updated_at >= created_at
    and updated_at >= started_at
  )
);

create unique index project_activity_participations_one_active_pair_idx
  on public.project_activity_participations (activity_id, volunteer_id)
  where ended_at is null;

create index project_activity_participations_activity_history_idx
  on public.project_activity_participations (activity_id, started_at desc, id);

create index project_activity_participations_volunteer_history_idx
  on public.project_activity_participations (volunteer_id, started_at desc, id);

create index project_activity_participations_active_volunteer_activity_idx
  on public.project_activity_participations (volunteer_id, activity_id)
  where ended_at is null;

alter table public.project_activity_participations enable row level security;

revoke all on table public.project_activity_participations
  from public, anon, authenticated;

create function public.guard_project_activity_participation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  participation_project_id uuid;
  current_project_status text;
  current_activity_status text;
  active_assignment_id uuid;
begin
  if tg_op = 'INSERT' then
    select activity.project_id
    into participation_project_id
    from public.project_activities as activity
    where activity.id = new.activity_id;

    if participation_project_id is null then
      raise exception 'project_activity_not_found' using errcode = 'P0002';
    end if;

    select project.status
    into current_project_status
    from public.projects as project
    where project.id = participation_project_id
    for update;

    if current_project_status is null then
      raise exception 'project_not_found' using errcode = 'P0002';
    end if;
    if current_project_status <> 'active' then
      raise exception 'project_closed' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.volunteers as volunteer
      where volunteer.id = new.volunteer_id
    ) then
      raise exception 'volunteer_not_found' using errcode = 'P0002';
    end if;

    select assignment.id
    into active_assignment_id
    from public.project_volunteer_assignments as assignment
    where assignment.project_id = participation_project_id
      and assignment.volunteer_id = new.volunteer_id
      and assignment.ended_at is null
    for share;

    if active_assignment_id is null then
      raise exception 'volunteer_not_assigned_to_project'
        using errcode = '23514';
    end if;

    select activity.status
    into current_activity_status
    from public.project_activities as activity
    where activity.id = new.activity_id
      and activity.project_id = participation_project_id
    for update;

    if current_activity_status is null then
      raise exception 'project_activity_not_found' using errcode = 'P0002';
    end if;
    if current_activity_status <> 'scheduled' then
      raise exception 'project_activity_not_scheduled' using errcode = '23514';
    end if;
    if new.ended_at is not null then
      raise exception 'project_activity_participation_must_start_active'
        using errcode = '22023';
    end if;

    new.started_at = statement_timestamp();
    new.created_at = statement_timestamp();
    new.updated_at = statement_timestamp();
    return new;
  end if;

  if new.id is distinct from old.id
    or new.activity_id is distinct from old.activity_id
    or new.volunteer_id is distinct from old.volunteer_id
    or new.started_at is distinct from old.started_at
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
  then
    raise exception 'project_activity_participation_immutable_fields'
      using errcode = '22023';
  end if;
  if old.ended_at is not null or new.ended_at is null then
    raise exception 'project_activity_participation_already_ended'
      using errcode = '23514';
  end if;

  select project.status, activity.status
  into current_project_status, current_activity_status
  from public.project_activities as activity
  inner join public.projects as project on project.id = activity.project_id
  where activity.id = old.activity_id;

  if current_project_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if current_project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;
  if current_activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  new.ended_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_project_activity_participation_change()
  from public, anon, authenticated;

create trigger project_activity_participations_10_guard_change
before insert or update on public.project_activity_participations
for each row execute function public.guard_project_activity_participation_change();

create function public.guard_project_activity_participation_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'project_activity_participation_delete_not_allowed'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_project_activity_participation_delete()
  from public, anon, authenticated;

create trigger project_activity_participations_11_guard_delete
before delete on public.project_activity_participations
for each row execute function public.guard_project_activity_participation_delete();

create trigger project_activity_participations_20_set_updated_at
before update on public.project_activity_participations
for each row execute function public.set_updated_at();

create function public.audit_project_activity_participation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      metadata
    )
    values (
      (select auth.uid()),
      'project_activity_participation.created',
      'project_activity_participation',
      new.id,
      array['activity_id', 'volunteer_id', 'started_at'],
      '{}'::jsonb
    );
    return new;
  end if;

  if new.ended_at is distinct from old.ended_at then
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      metadata
    )
    values (
      (select auth.uid()),
      'project_activity_participation.ended',
      'project_activity_participation',
      new.id,
      array['ended_at'],
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_project_activity_participation_change()
  from public, anon, authenticated;

create trigger project_activity_participations_30_audit_change
after insert or update on public.project_activity_participations
for each row execute function public.audit_project_activity_participation_change();

create function public.list_project_activity_participations(
  requested_project_id uuid,
  requested_activity_id uuid
)
returns table (
  participation_id uuid,
  activity_id uuid,
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
    select 1
    from public.projects as project
    where project.id = requested_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.project_activities as activity
    where activity.id = requested_activity_id
      and activity.project_id = requested_project_id
  ) then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    participation.id,
    participation.activity_id,
    participation.volunteer_id,
    volunteer.full_name,
    participation.started_at,
    participation.ended_at,
    participation.created_at,
    participation.updated_at
  from public.project_activity_participations as participation
  inner join public.volunteers as volunteer
    on volunteer.id = participation.volunteer_id
  where participation.activity_id = requested_activity_id
  order by participation.started_at desc, participation.id;
end;
$$;

revoke all on function public.list_project_activity_participations(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_activity_participations(uuid, uuid)
  to authenticated;

create function public.search_project_activity_volunteer_candidates(
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_query text default '',
  requested_limit integer default 20
)
returns table (volunteer_id uuid, volunteer_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_query text := lower(btrim(regexp_replace(
    coalesce(requested_query, ''), '[[:space:]]+', ' ', 'g'
  )));
  escaped_query text;
  project_status text;
  activity_status text;
begin
  if actor_id is null
    or not (
      public.user_has_permission(actor_id, 'project.manage')
      or public.has_project_contextual_access(
        actor_id,
        requested_project_id,
        'project.manage_assigned'
      )
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 50
    or char_length(canonical_query) > 100
  then
    raise exception 'invalid_project_activity_volunteer_query'
      using errcode = '22023';
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

  select activity.status
  into activity_status
  from public.project_activities as activity
  where activity.id = requested_activity_id
    and activity.project_id = requested_project_id;

  if activity_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  escaped_query := replace(
    replace(replace(canonical_query, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select volunteer.id, volunteer.full_name
  from public.project_volunteer_assignments as assignment
  inner join public.volunteers as volunteer
    on volunteer.id = assignment.volunteer_id
  where assignment.project_id = requested_project_id
    and assignment.ended_at is null
    and (
      canonical_query = ''
      or lower(volunteer.full_name)
        like '%' || escaped_query || '%' escape '\'
    )
    and not exists (
      select 1
      from public.project_activity_participations as participation
      where participation.activity_id = requested_activity_id
        and participation.volunteer_id = assignment.volunteer_id
        and participation.ended_at is null
    )
  order by lower(volunteer.full_name), volunteer.id
  limit requested_limit;
end;
$$;

revoke all on function public.search_project_activity_volunteer_candidates(
  uuid, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.search_project_activity_volunteer_candidates(
  uuid, uuid, text, integer
) to authenticated;

create function public.create_project_activity_participation(
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_volunteer_id uuid
)
returns table (
  participation_id uuid,
  activity_id uuid,
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
  active_assignment_id uuid;
  activity_status text;
  new_participation_id uuid;
begin
  perform public.lock_project_activity_mutation_access(
    actor_id,
    requested_project_id
  );

  select assignment.id
  into active_assignment_id
  from public.project_volunteer_assignments as assignment
  where assignment.project_id = requested_project_id
    and assignment.volunteer_id = requested_volunteer_id
    and assignment.ended_at is null
  for share;

  if active_assignment_id is null then
    raise exception 'volunteer_not_assigned_to_project'
      using errcode = '23514';
  end if;

  select activity.status
  into activity_status
  from public.project_activities as activity
  where activity.id = requested_activity_id
    and activity.project_id = requested_project_id
  for update;

  if activity_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  begin
    insert into public.project_activity_participations (
      activity_id,
      volunteer_id
    )
    values (requested_activity_id, requested_volunteer_id)
    returning id into new_participation_id;
  exception when unique_violation then
    raise exception 'project_activity_participation_already_active'
      using errcode = '23505';
  end;

  return query
  select
    participation.id,
    participation.activity_id,
    participation.volunteer_id,
    volunteer.full_name,
    participation.started_at,
    participation.ended_at,
    participation.created_at,
    participation.updated_at
  from public.project_activity_participations as participation
  inner join public.volunteers as volunteer
    on volunteer.id = participation.volunteer_id
  where participation.id = new_participation_id;
end;
$$;

revoke all on function public.create_project_activity_participation(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.create_project_activity_participation(
  uuid, uuid, uuid
) to authenticated;

create function public.finish_project_activity_participation(
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_participation_id uuid
)
returns table (
  participation_id uuid,
  activity_id uuid,
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
  activity_status text;
  current_ended_at timestamptz;
begin
  perform public.lock_project_activity_mutation_access(
    actor_id,
    requested_project_id
  );

  select activity.status
  into activity_status
  from public.project_activities as activity
  where activity.id = requested_activity_id
    and activity.project_id = requested_project_id
  for update;

  if activity_status is null then
    raise exception 'project_activity_participation_not_found'
      using errcode = 'P0002';
  end if;
  if activity_status <> 'scheduled' then
    raise exception 'project_activity_not_scheduled' using errcode = '23514';
  end if;

  select participation.ended_at
  into current_ended_at
  from public.project_activity_participations as participation
  where participation.id = requested_participation_id
    and participation.activity_id = requested_activity_id
  for update;

  if not found then
    raise exception 'project_activity_participation_not_found'
      using errcode = 'P0002';
  end if;
  if current_ended_at is not null then
    raise exception 'project_activity_participation_already_ended'
      using errcode = '23514';
  end if;

  return query
  with updated as (
    update public.project_activity_participations as participation
    set ended_at = statement_timestamp()
    where participation.id = requested_participation_id
      and participation.activity_id = requested_activity_id
    returning participation.*
  )
  select
    updated.id,
    updated.activity_id,
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

revoke all on function public.finish_project_activity_participation(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.finish_project_activity_participation(
  uuid, uuid, uuid
) to authenticated;

create or replace function public.guard_project_assignment_change()
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
  if exists (
    select 1
    from public.project_activity_participations as participation
    inner join public.project_activities as activity
      on activity.id = participation.activity_id
    where participation.volunteer_id = old.volunteer_id
      and participation.ended_at is null
      and activity.project_id = old.project_id
      and activity.status = 'scheduled'
  ) then
    raise exception 'volunteer_has_scheduled_activity_participations'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_assignment_change()
  from public, anon, authenticated;

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
  assignment_volunteer_id uuid;
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

  select assignment.ended_at, assignment.volunteer_id
  into current_ended_at, assignment_volunteer_id
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
  if exists (
    select 1
    from public.project_activity_participations as participation
    inner join public.project_activities as activity
      on activity.id = participation.activity_id
    where participation.volunteer_id = assignment_volunteer_id
      and participation.ended_at is null
      and activity.project_id = assignment_project_id
      and activity.status = 'scheduled'
  ) then
    raise exception 'volunteer_has_scheduled_activity_participations'
      using errcode = '23514';
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
