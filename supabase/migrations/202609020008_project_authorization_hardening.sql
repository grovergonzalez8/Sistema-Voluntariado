create function public.lock_project_mutation_authority(
  subject_user_id uuid,
  requested_project_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid;
begin
  if subject_user_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select account.id
  into actor_account_id
  from public.accounts as account
  where account.auth_user_id = subject_user_id
    and account.status = 'active'
  for share;

  if actor_account_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if public.user_has_permission(subject_user_id, 'project.manage') then
    return;
  end if;

  perform public.lock_project_contextual_access(
    subject_user_id,
    requested_project_id,
    'project.manage_assigned'
  );
end;
$$;

revoke all on function public.lock_project_mutation_authority(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.lock_project_activity_mutation_access(
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
  perform public.lock_project_mutation_authority(
    subject_user_id,
    requested_project_id
  );

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
  assignment_project_hint uuid;
  assignment_volunteer_id uuid;
  current_ended_at timestamptz;
begin
  if actor_id is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select assignment.project_id
  into assignment_project_hint
  from public.project_volunteer_assignments as assignment
  where assignment.id = requested_assignment_id;

  perform public.lock_project_mutation_authority(
    actor_id,
    assignment_project_hint
  );

  if assignment_project_hint is null then
    raise exception 'assignment_not_found' using errcode = 'P0002';
  end if;

  perform project.id
  from public.projects as project
  where project.id = assignment_project_hint
  for update;

  select assignment.ended_at, assignment.volunteer_id
  into current_ended_at, assignment_volunteer_id
  from public.project_volunteer_assignments as assignment
  where assignment.id = requested_assignment_id
    and assignment.project_id = assignment_project_hint
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
      and activity.project_id = assignment_project_hint
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
      and assignment.project_id = assignment_project_hint
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
