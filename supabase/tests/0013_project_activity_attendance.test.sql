begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table(
  'public',
  'project_activity_attendances',
  'activity attendances table exists'
);
select columns_are(
  'public',
  'project_activity_attendances',
  array['participation_id', 'status', 'created_at', 'updated_at'],
  'attendance stores only the approved technical fields'
);
select col_is_pk(
  'public',
  'project_activity_attendances',
  'participation_id',
  'participation is the attendance primary key'
);
select fk_ok(
  'public',
  'project_activity_attendances',
  'participation_id',
  'public',
  'project_activity_participations',
  'id',
  'attendance references one concrete participation'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'project_activity_attendances_participation_id_fk'
  ),
  'r',
  'participation deletion is restricted'
);
select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.project_activity_attendances'::regclass
      and conname in (
        'project_activity_attendances_status_valid',
        'project_activity_attendances_timestamps_valid'
      )
  ),
  2::bigint,
  'status and timestamp constraints exist'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_activity_attendances'
      and column_name = 'created_at'
  ),
  'statement_timestamp()',
  'created_at is generated server-side'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_activity_attendances'
      and column_name = 'updated_at'
  ),
  'statement_timestamp()',
  'updated_at is generated server-side'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.project_activity_attendances'::regclass
  ),
  'attendance enables RLS'
);
select is(
  (
    select count(*)
    from pg_policy
    where polrelid = 'public.project_activity_attendances'::regclass
  ),
  0::bigint,
  'attendance remains default deny without policies'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.project_activity_attendances',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_attendances',
      'insert'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_attendances',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_attendances',
      'delete'
    ),
  'authenticated has no direct attendance privileges'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.project_activity_attendances',
    'select'
  )
    and not has_table_privilege(
      'anon',
      'public.project_activity_attendances',
      'insert'
    )
    and not has_table_privilege(
      'anon',
      'public.project_activity_attendances',
      'update'
    )
    and not has_table_privilege(
      'anon',
      'public.project_activity_attendances',
      'delete'
    ),
  'anonymous has no direct attendance privileges'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'list_project_activity_attendances',
        'set_project_activity_attendance'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  2::bigint,
  'attendance RPCs are security definer with empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_project_activity_attendances(uuid,uuid)',
    'execute'
  )
    and has_function_privilege(
      'authenticated',
      'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)',
      'execute'
    ),
  'authenticated receives only the attendance RPC capabilities'
);
select ok(
  not has_function_privilege(
    'public',
    'public.list_project_activity_attendances(uuid,uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.list_project_activity_attendances(uuid,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)',
      'execute'
    ),
  'public and anonymous cannot execute attendance RPCs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.guard_project_activity_attendance_change()',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.guard_project_activity_attendance_delete()',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.audit_project_activity_attendance_change()',
      'execute'
    ),
  'attendance guards and audit helper are not client executable'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like '%delete%attendance%'
  ),
  0::bigint,
  'there is no attendance delete RPC'
);
select ok(
  not (
    select coalesce(proargnames, array[]::text[])
      && array[
        'email',
        'phone',
        'phone_match_key',
        'volunteer_name',
        'auth_metadata'
      ]
    from pg_proc
    where oid = 'public.list_project_activity_attendances(uuid,uuid)'::regprocedure
  ),
  'attendance list projection contains no new volunteer or Auth PII'
);
select ok(
  pg_get_functiondef(
    'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)'::regprocedure
  ) ~ $pattern$current_activity_status <> 'completed'$pattern$
    and pg_get_functiondef(
      'public.guard_project_activity_attendance_change()'::regprocedure
    ) ~ $pattern$current_activity_status <> 'completed'$pattern$,
  'RPC and guard both enforce completed activity lifecycle'
);
select ok(
  pg_get_functiondef(
    'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)'::regprocedure
  ) ~ $pattern$current_attendance_status is distinct from expected_status$pattern$,
  'correction compares the locked status with expected_status'
);
select ok(
  pg_get_functiondef(
    'public.set_project_activity_attendance(uuid,uuid,uuid,text,text)'::regprocedure
  ) ~ $pattern$lock_project_activity_mutation_access$pattern$,
  'mutation reuses the hardened project authority lock helper'
);

set local role anon;
select throws_ok(
  $$select * from public.list_project_activity_attendances(gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  'permission denied for function list_project_activity_attendances',
  'anonymous cannot execute attendance reads'
);

reset role;
insert into public.volunteers (id, full_name)
values
  ('71000000-0000-4000-8000-000000000001', 'Attendance One'),
  ('71000000-0000-4000-8000-000000000002', 'Attendance Two'),
  ('71000000-0000-4000-8000-000000000003', 'Attendance Three'),
  ('71000000-0000-4000-8000-000000000004', 'Attendance Four'),
  ('71000000-0000-4000-8000-000000000005', 'Attendance Five'),
  ('71000000-0000-4000-8000-000000000006', 'Attendance Six'),
  ('71000000-0000-4000-8000-000000000007', 'Attendance Seven'),
  ('71000000-0000-4000-8000-000000000008', 'Attendance Manager One'),
  ('71000000-0000-4000-8000-000000000009', 'Attendance Manager Two');

insert into public.projects (id, name)
values
  ('72000000-0000-4000-8000-000000000001', 'Attendance Main'),
  ('72000000-0000-4000-8000-000000000002', 'Attendance Other'),
  ('72000000-0000-4000-8000-000000000003', 'Attendance Closed'),
  ('72000000-0000-4000-8000-000000000004', 'Attendance Manager');

insert into public.project_volunteer_assignments (
  id,
  project_id,
  volunteer_id
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003'
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000004'
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000005'
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000006'
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000007'
  ),
  (
    '73000000-0000-4000-8000-000000000008',
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000008'
  ),
  (
    '73000000-0000-4000-8000-000000000009',
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000009'
  );

insert into public.project_activities (
  id,
  project_id,
  name,
  starts_at
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'Completed Attendance',
    '2026-09-20T14:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    'Scheduled Attendance',
    '2026-09-21T14:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    'Cancelled Attendance',
    '2026-09-22T14:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000002',
    'Other Attendance',
    '2026-09-23T14:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    '72000000-0000-4000-8000-000000000003',
    'Closed Attendance',
    '2026-09-24T14:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000004',
    'Manager Attendance',
    '2026-09-25T14:00:00Z'
  );

insert into public.project_activity_participations (
  id,
  activity_id,
  volunteer_id
)
values
  (
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002'
  ),
  (
    '75000000-0000-4000-8000-000000000003',
    '74000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003'
  ),
  (
    '75000000-0000-4000-8000-000000000004',
    '74000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000004'
  ),
  (
    '75000000-0000-4000-8000-000000000005',
    '74000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000005'
  ),
  (
    '75000000-0000-4000-8000-000000000006',
    '74000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000006'
  ),
  (
    '75000000-0000-4000-8000-000000000007',
    '74000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000007'
  ),
  (
    '75000000-0000-4000-8000-000000000008',
    '74000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000008'
  ),
  (
    '75000000-0000-4000-8000-000000000009',
    '74000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000009'
  );

update public.project_activity_participations
set ended_at = statement_timestamp()
where id = '75000000-0000-4000-8000-000000000003';

update public.project_activities
set status = case
  when id = '74000000-0000-4000-8000-000000000003' then 'cancelled'
  else 'completed'
end
where id in (
  '74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000005',
  '74000000-0000-4000-8000-000000000006'
);

update public.project_volunteer_assignments
set ended_at = statement_timestamp()
where id = '73000000-0000-4000-8000-000000000007';
update public.projects
set status = 'closed'
where id = '72000000-0000-4000-8000-000000000003';

insert into public.project_manager_assignments (
  id,
  project_id,
  manager_account_id
)
values (
  '76000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000007'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $query$
    create temporary table attendance_present as
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      null,
      'present'
    )
  $query$,
  'administrator records present'
);
select is(
  (select status from attendance_present),
  'present',
  'record returns present'
);
select is(
  (select created_at from attendance_present),
  (select updated_at from attendance_present),
  'record starts with equal server timestamps'
);
select lives_ok(
  $query$
    create temporary table attendance_absent as
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      null,
      'absent'
    )
  $query$,
  'administrator records absent'
);
select lives_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000003',
      null,
      'present'
    )
  $query$,
  'finalized participation remains attendance eligible'
);
select is(
  (
    select count(*)
    from public.list_project_activity_attendances(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001'
    )
  ),
  3::bigint,
  'administrator reads only persisted attendances for the exact activity'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000002',
      '75000000-0000-4000-8000-000000000004',
      null,
      'present'
    )
  $query$,
  '23514',
  'project_activity_not_completed',
  'scheduled activity rejects attendance'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000003',
      '75000000-0000-4000-8000-000000000005',
      null,
      'present'
    )
  $query$,
  '23514',
  'project_activity_not_completed',
  'cancelled activity rejects attendance'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000003',
      '74000000-0000-4000-8000-000000000005',
      '75000000-0000-4000-8000-000000000007',
      null,
      'present'
    )
  $query$,
  '23514',
  'project_closed',
  'closed project keeps unregistered attendance read-only'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000006',
      null,
      'present'
    )
  $query$,
  'P0002',
  'project_activity_participation_not_found',
  'participation from another activity is rejected'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000099',
      null,
      'present'
    )
  $query$,
  'P0002',
  'project_activity_participation_not_found',
  'unknown participation is rejected'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      null,
      'absent'
    )
  $query$,
  '23505',
  'project_activity_attendance_already_recorded',
  'record cannot overwrite existing attendance'
);
select lives_ok(
  $query$
    create temporary table attendance_present_to_absent as
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      'present',
      'absent'
    )
  $query$,
  'administrator corrects present to absent'
);
select ok(
  (select updated_at >= created_at from attendance_present_to_absent),
  'correction preserves valid timestamps'
);
select lives_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      'absent',
      'present'
    )
  $query$,
  'administrator corrects absent to present'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      'absent',
      'present'
    )
  $query$,
  '23514',
  'project_activity_attendance_status_conflict',
  'stale expected status is rejected'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      'present',
      'present'
    )
  $query$,
  '23514',
  'project_activity_attendance_status_conflict',
  'same-state correction is rejected'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',
      'present',
      'late'
    )
  $query$,
  '22023',
  'invalid_project_activity_attendance_status',
  'status allowlist rejects future states'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and entity_id = '75000000-0000-4000-8000-000000000001'
      and action = 'project_activity_attendance.recorded'
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
      and changed_fields = array['participation_id', 'status', 'created_at']
      and previous_state is null
      and new_state = 'present'
      and metadata = '{}'::jsonb
  ),
  1::bigint,
  'record audit is exact and minimal'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and entity_id = '75000000-0000-4000-8000-000000000001'
      and action = 'project_activity_attendance.updated'
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
      and changed_fields = array['status']
      and metadata = '{}'::jsonb
  ),
  2::bigint,
  'successful corrections write exactly two update audits'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and entity_id = '75000000-0000-4000-8000-000000000001'
      and action = 'project_activity_attendance.updated'
      and previous_state = 'present'
      and new_state = 'absent'
  ),
  1::bigint,
  'present to absent audit records the exact state transition once'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and entity_id = '75000000-0000-4000-8000-000000000001'
      and action = 'project_activity_attendance.updated'
      and previous_state = 'absent'
      and new_state = 'present'
  ),
  1::bigint,
  'absent to present audit records the exact state transition once'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and entity_id = '75000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'failed duplicate stale and same-state mutations write no audit'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where entity_type = 'project_activity_attendance'
      and (
        metadata::text ~* '(email|phone|name|auth)'
        or changed_fields && array[
          'email',
          'phone',
          'phone_match_key',
          'volunteer_name',
          'auth_metadata'
        ]
      )
  ),
  'attendance audit contains no PII or Auth metadata'
);

reset role;
update public.accounts
set status = 'suspended', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      'absent',
      'present'
    )
  $query$,
  '42501',
  'permission_denied',
  'suspended administrator cannot correct attendance'
);
reset role;
update public.accounts
set status = 'active', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000004';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000008',
      null,
      'present'
    )
  $query$,
  'scoped project manager records attendance'
);
select is(
  (
    select count(*)
    from public.list_project_activity_attendances(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006'
    )
  ),
  1::bigint,
  'scoped project manager reads attendance'
);
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      'absent',
      'present'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager outside project scope cannot correct attendance'
);
select throws_ok(
  $query$
    select * from public.list_project_activity_attendances(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager outside project scope cannot read attendance'
);

reset role;
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'project_manager')
  and permission_id = (
    select id from public.permissions where code = 'project.manage_assigned'
  );
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000009',
      null,
      'absent'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager without project manage assigned permission is denied'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code = 'project.manage_assigned';
delete from public.user_roles
where user_id = '00000000-0000-4000-8000-000000000007'
  and role_id = (select id from public.roles where code = 'project_manager');
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000009',
      null,
      'absent'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager without current role is denied'
);

reset role;
insert into public.user_roles (user_id, role_id)
select '00000000-0000-4000-8000-000000000007', role.id
from public.roles as role
where role.code = 'project_manager';
update public.accounts
set status = 'suspended', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000009',
      null,
      'absent'
    )
  $query$,
  '42501',
  'permission_denied',
  'suspended manager is denied'
);

reset role;
update public.accounts
set status = 'archived', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000009',
      null,
      'absent'
    )
  $query$,
  '42501',
  'permission_denied',
  'archived manager is denied'
);

reset role;
update public.accounts
set status = 'active', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
update public.project_manager_assignments
set ended_at = statement_timestamp()
where id = '76000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000004',
      '74000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000009',
      null,
      'absent'
    )
  $query$,
  '42501',
  'permission_denied',
  'ended manager scope is denied'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $query$
    select * from public.set_project_activity_attendance(
      '72000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      'absent',
      'present'
    )
  $query$,
  '42501',
  'permission_denied',
  'unauthorized coordinator is denied'
);

reset role;
select throws_ok(
  $$delete from public.project_activity_attendances where participation_id = '75000000-0000-4000-8000-000000000001'$$,
  '42501',
  'project_activity_attendance_delete_not_allowed',
  'even table owner cannot delete attendance history'
);

select * from finish();
rollback;
