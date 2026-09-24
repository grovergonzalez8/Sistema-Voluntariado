create table public.project_activity_attendances (
  participation_id uuid primary key,
  status text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_activity_attendances_participation_id_fk
    foreign key (participation_id)
    references public.project_activity_participations (id)
    on delete restrict,
  constraint project_activity_attendances_status_valid check (
    status in ('present', 'absent')
  ),
  constraint project_activity_attendances_timestamps_valid check (
    updated_at >= created_at
  )
);

alter table public.project_activity_attendances enable row level security;

revoke all on table public.project_activity_attendances
  from public, anon, authenticated;

create function public.guard_project_activity_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project_status text;
  current_activity_status text;
begin
  if tg_op = 'UPDATE' then
    if new.participation_id is distinct from old.participation_id
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
    then
      raise exception 'project_activity_attendance_immutable_fields'
        using errcode = '22023';
    end if;
    if new.status is not distinct from old.status then
      raise exception 'project_activity_attendance_status_conflict'
        using errcode = '23514';
    end if;
  end if;

  select project.status, activity.status
  into current_project_status, current_activity_status
  from public.project_activity_participations as participation
  inner join public.project_activities as activity
    on activity.id = participation.activity_id
  inner join public.projects as project
    on project.id = activity.project_id
  where participation.id = new.participation_id;

  if current_project_status is null then
    raise exception 'project_activity_participation_not_found'
      using errcode = 'P0002';
  end if;
  if current_project_status <> 'active' then
    raise exception 'project_closed' using errcode = '23514';
  end if;
  if current_activity_status <> 'completed' then
    raise exception 'project_activity_not_completed' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.created_at = statement_timestamp();
    new.updated_at = statement_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_activity_attendance_change()
  from public, anon, authenticated;

create trigger project_activity_attendances_10_guard_change
before insert or update on public.project_activity_attendances
for each row execute function public.guard_project_activity_attendance_change();

create function public.guard_project_activity_attendance_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'project_activity_attendance_delete_not_allowed'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_project_activity_attendance_delete()
  from public, anon, authenticated;

create trigger project_activity_attendances_11_guard_delete
before delete on public.project_activity_attendances
for each row execute function public.guard_project_activity_attendance_delete();

create trigger project_activity_attendances_20_set_updated_at
before update on public.project_activity_attendances
for each row execute function public.set_updated_at();

create function public.audit_project_activity_attendance_change()
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
      new_state,
      metadata
    )
    values (
      (select auth.uid()),
      'project_activity_attendance.recorded',
      'project_activity_attendance',
      new.participation_id,
      array['participation_id', 'status', 'created_at'],
      new.status,
      '{}'::jsonb
    );
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
    'project_activity_attendance.updated',
    'project_activity_attendance',
    new.participation_id,
    array['status'],
    old.status,
    new.status,
    '{}'::jsonb
  );
  return new;
end;
$$;

revoke all on function public.audit_project_activity_attendance_change()
  from public, anon, authenticated;

create trigger project_activity_attendances_30_audit_change
after insert or update on public.project_activity_attendances
for each row execute function public.audit_project_activity_attendance_change();

create function public.list_project_activity_attendances(
  requested_project_id uuid,
  requested_activity_id uuid
)
returns table (
  participation_id uuid,
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
    attendance.participation_id,
    attendance.status,
    attendance.created_at,
    attendance.updated_at
  from public.project_activity_attendances as attendance
  inner join public.project_activity_participations as participation
    on participation.id = attendance.participation_id
  where participation.activity_id = requested_activity_id
  order by attendance.created_at, attendance.participation_id;
end;
$$;

revoke all on function public.list_project_activity_attendances(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_project_activity_attendances(uuid, uuid)
  to authenticated;

create function public.set_project_activity_attendance(
  requested_project_id uuid,
  requested_activity_id uuid,
  requested_participation_id uuid,
  expected_status text,
  requested_status text
)
returns table (
  participation_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_activity_status text;
  current_attendance_status text;
begin
  if requested_status is null
    or requested_status not in ('present', 'absent')
    or (
      expected_status is not null
      and expected_status not in ('present', 'absent')
    )
  then
    raise exception 'invalid_project_activity_attendance_status'
      using errcode = '22023';
  end if;

  perform public.lock_project_activity_mutation_access(
    actor_id,
    requested_project_id
  );

  select activity.status
  into current_activity_status
  from public.project_activities as activity
  where activity.id = requested_activity_id
    and activity.project_id = requested_project_id
  for update;

  if current_activity_status is null then
    raise exception 'project_activity_not_found' using errcode = 'P0002';
  end if;
  if current_activity_status <> 'completed' then
    raise exception 'project_activity_not_completed' using errcode = '23514';
  end if;

  perform participation.id
  from public.project_activity_participations as participation
  where participation.id = requested_participation_id
    and participation.activity_id = requested_activity_id
  for update;

  if not found then
    raise exception 'project_activity_participation_not_found'
      using errcode = 'P0002';
  end if;

  select attendance.status
  into current_attendance_status
  from public.project_activity_attendances as attendance
  where attendance.participation_id = requested_participation_id
  for update;

  if not found then
    if expected_status is not null then
      raise exception 'project_activity_attendance_status_conflict'
        using errcode = '23514';
    end if;

    return query
    insert into public.project_activity_attendances (
      participation_id,
      status
    )
    values (
      requested_participation_id,
      requested_status
    )
    returning
      project_activity_attendances.participation_id,
      project_activity_attendances.status,
      project_activity_attendances.created_at,
      project_activity_attendances.updated_at;
    return;
  end if;

  if expected_status is null then
    raise exception 'project_activity_attendance_already_recorded'
      using errcode = '23505';
  end if;
  if current_attendance_status is distinct from expected_status
    or requested_status is not distinct from current_attendance_status
  then
    raise exception 'project_activity_attendance_status_conflict'
      using errcode = '23514';
  end if;

  return query
  update public.project_activity_attendances as attendance
  set status = requested_status
  where attendance.participation_id = requested_participation_id
  returning
    attendance.participation_id,
    attendance.status,
    attendance.created_at,
    attendance.updated_at;
end;
$$;

revoke all on function public.set_project_activity_attendance(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.set_project_activity_attendance(
  uuid, uuid, uuid, text, text
) to authenticated;
