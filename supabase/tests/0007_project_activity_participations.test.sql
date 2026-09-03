begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(124);

select has_table(
  'public',
  'project_activity_participations',
  'activity participations table exists'
);
select columns_are(
  'public',
  'project_activity_participations',
  array[
    'id',
    'activity_id',
    'volunteer_id',
    'started_at',
    'ended_at',
    'created_at',
    'updated_at'
  ],
  'participation stores only the approved technical fields'
);
select fk_ok(
  'public',
  'project_activity_participations',
  'activity_id',
  'public',
  'project_activities',
  'id',
  'participation references an activity'
);
select fk_ok(
  'public',
  'project_activity_participations',
  'volunteer_id',
  'public',
  'volunteers',
  'id',
  'participation references the volunteer registry'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'project_activity_participations_activity_id_fk'
  ),
  'r',
  'activity deletion is restricted'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'project_activity_participations_volunteer_id_fk'
  ),
  'r',
  'volunteer deletion is restricted'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.project_activity_participations'::regclass
  ),
  'participations enables RLS'
);
select is(
  (
    select count(*)
    from pg_policy
    where polrelid = 'public.project_activity_participations'::regclass
  ),
  0::bigint,
  'participations remains default deny without policies'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.project_activity_participations',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_participations',
      'insert'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_participations',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_activity_participations',
      'delete'
    ),
  'authenticated has no direct participation privileges'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.project_activity_participations',
    'select'
  )
    and not has_table_privilege(
      'anon',
      'public.project_activity_participations',
      'insert'
    )
    and not has_table_privilege(
      'anon',
      'public.project_activity_participations',
      'update'
    )
    and not has_table_privilege(
      'anon',
      'public.project_activity_participations',
      'delete'
    ),
  'anonymous has no direct participation privileges'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activity_participations_one_active_pair_idx'
      and indexdef like '%UNIQUE%'
      and indexdef like '%ended_at IS NULL%'
  ),
  'partial unique index protects one active activity volunteer pair'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activity_participations_activity_history_idx'
  ),
  'activity history index exists'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activity_participations_volunteer_history_idx'
  ),
  'volunteer history index exists'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activity_participations_active_volunteer_activity_idx'
      and indexdef like '%ended_at IS NULL%'
  ),
  'assignment guard has a partial active participation index'
);
select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.project_activity_participations'::regclass
      and conname in (
        'project_activity_participations_period_valid',
        'project_activity_participations_timestamps_valid'
      )
  ),
  2::bigint,
  'participation period and technical timestamp constraints exist'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'list_project_activity_participations',
        'search_project_activity_volunteer_candidates',
        'create_project_activity_participation',
        'finish_project_activity_participation'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  4::bigint,
  'all exposed participation RPCs are security definer with empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_project_activity_participations(uuid,uuid)',
    'execute'
  )
    and has_function_privilege(
      'authenticated',
      'public.search_project_activity_volunteer_candidates(uuid,uuid,text,integer)',
      'execute'
    )
    and has_function_privilege(
      'authenticated',
      'public.create_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    )
    and has_function_privilege(
      'authenticated',
      'public.finish_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    ),
  'authenticated receives the four participation capabilities'
);
select ok(
  not has_function_privilege(
    'public',
    'public.list_project_activity_participations(uuid,uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.list_project_activity_participations(uuid,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'public.search_project_activity_volunteer_candidates(uuid,uuid,text,integer)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.search_project_activity_volunteer_candidates(uuid,uuid,text,integer)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'public.create_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.create_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'public',
      'public.finish_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.finish_project_activity_participation(uuid,uuid,uuid)',
      'execute'
    ),
  'public and anonymous cannot execute participation RPCs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.guard_project_activity_participation_change()',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.guard_project_activity_participation_delete()',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.audit_project_activity_participation_change()',
      'execute'
    ),
  'participation guards and audit helper are not client executable'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like '%delete%participation%'
  ),
  0::bigint,
  'there is no participation delete RPC'
);
select ok(
  not (
    select coalesce(proargnames, array[]::text[])
      && array[
        'email',
        'phone',
        'phone_match_key',
        'activity_name',
        'description',
        'location_text'
      ]
    from pg_proc
    where oid = 'public.list_project_activity_participations(uuid,uuid)'::regprocedure
  ),
  'participation list projection has no PII or activity content fields'
);
select ok(
  not (
    select coalesce(proargnames, array[]::text[])
      && array['email', 'phone', 'phone_match_key']
    from pg_proc
    where oid = 'public.search_project_activity_volunteer_candidates(uuid,uuid,text,integer)'::regprocedure
  ),
  'candidate projection has only technical id and volunteer name'
);

set local role anon;
select throws_ok(
  $$select * from public.list_project_activity_participations(gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  'permission denied for function list_project_activity_participations',
  'anonymous cannot execute participation reads'
);

reset role;
insert into public.volunteers (id, full_name)
values
  ('70000000-0000-4000-8000-000000000001', 'Ana Participation'),
  ('70000000-0000-4000-8000-000000000002', 'Bea Participation'),
  ('70000000-0000-4000-8000-000000000003', 'Carla Foreign'),
  ('70000000-0000-4000-8000-000000000004', 'Dora Guard Ended'),
  ('70000000-0000-4000-8000-000000000005', 'Eva Assignment Ended'),
  ('70000000-0000-4000-8000-000000000006', 'Fabi Completed'),
  ('70000000-0000-4000-8000-000000000007', 'Gabi Cancelled'),
  ('70000000-0000-4000-8000-000000000008', 'Hilda Closed'),
  ('70000000-0000-4000-8000-000000000009', 'Iris Manager'),
  ('70000000-0000-4000-8000-000000000010', 'Julia Manager Pending'),
  ('70000000-0000-4000-8000-000000000011', 'Karla Manager Candidate');
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$create temporary table participation_project as select * from public.create_project('Proyecto Participation', null)$$,
  'administrator creates the participation project'
);
select lives_ok(
  $$create temporary table participation_other_project as select * from public.create_project('Proyecto Participation Otro', null)$$,
  'administrator creates a foreign project'
);
select lives_ok(
  $query$
    create temporary table participation_activity as
    select * from public.create_project_activity(
      (select id from participation_project), 'Actividad Participation', null,
      '2026-09-03T14:00:00Z', null, null
    )
  $query$,
  'administrator creates the scheduled activity'
);
select lives_ok(
  $query$
    create temporary table participation_other_activity as
    select * from public.create_project_activity(
      (select id from participation_other_project), 'Actividad Ajena', null,
      '2026-09-03T15:00:00Z', null, null
    )
  $query$,
  'administrator creates a foreign scheduled activity'
);
select lives_ok(
  $query$
    create temporary table participation_completed_activity as
    select * from public.create_project_activity(
      (select id from participation_project), 'Actividad Completada', null,
      '2026-09-04T14:00:00Z', null, null
    )
  $query$,
  'administrator creates the future completed activity fixture'
);
select lives_ok(
  $$select * from public.complete_project_activity((select id from participation_project), (select id from participation_completed_activity))$$,
  'administrator completes the terminal fixture'
);
select lives_ok(
  $query$
    create temporary table participation_cancelled_activity as
    select * from public.create_project_activity(
      (select id from participation_project), 'Actividad Cancelada', null,
      '2026-09-05T14:00:00Z', null, null
    )
  $query$,
  'administrator creates the future cancelled activity fixture'
);
select lives_ok(
  $$select * from public.cancel_project_activity((select id from participation_project), (select id from participation_cancelled_activity))$$,
  'administrator cancels the terminal fixture'
);
select lives_ok(
  $query$
    create temporary table assignment_ana as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000001'
    )
  $query$,
  'administrator assigns the first volunteer to the exact project'
);
select lives_ok(
  $query$
    create temporary table assignment_bea as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000002'
    )
  $query$,
  'administrator assigns a second candidate'
);
select lives_ok(
  $query$
    select * from public.assign_volunteer_to_project(
      (select id from participation_other_project),
      '70000000-0000-4000-8000-000000000003'
    )
  $query$,
  'administrator assigns a volunteer only to another project'
);
select results_eq(
  $query$
    select volunteer_id, volunteer_name
    from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_activity),
      'Participation',
      20
    )
  $query$,
  $expected$
    values
      ('70000000-0000-4000-8000-000000000001'::uuid, 'Ana Participation'::text),
      ('70000000-0000-4000-8000-000000000002'::uuid, 'Bea Participation'::text)
  $expected$,
  'candidate search returns only active assignments to the exact project'
);
select is_empty(
  $query$
    select *
    from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_activity),
      '%_\',
      20
    )
  $query$,
  'candidate search escapes wildcard characters'
);
select throws_ok(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_activity),
      repeat('x', 101),
      20
    )
  $query$,
  '22023',
  'invalid_project_activity_volunteer_query',
  'candidate search rejects oversized queries'
);
select throws_ok(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_completed_activity),
      '',
      20
    )
  $query$,
  '23514',
  'project_activity_not_scheduled',
  'candidate search rejects a completed activity'
);
select throws_ok(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_cancelled_activity),
      '',
      20
    )
  $query$,
  '23514',
  'project_activity_not_scheduled',
  'candidate search rejects a cancelled activity'
);
select throws_ok(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_other_activity),
      '',
      20
    )
  $query$,
  'P0002',
  'project_activity_not_found',
  'candidate search jointly constrains project and activity identifiers'
);
select throws_ok(
  $query$
    select * from public.list_project_activity_participations(
      (select id from participation_project),
      (select id from participation_other_activity)
    )
  $query$,
  'P0002',
  'project_activity_not_found',
  'participation list jointly constrains project and activity identifiers'
);
select lives_ok(
  $query$
    create temporary table ana_participation as
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000001'
    )
  $query$,
  'administrator creates an eligible participation'
);
select is(
  (select ended_at from ana_participation),
  null::timestamptz,
  'new participation starts explicitly active'
);
select is(
  (
    select count(*)
    from public.list_project_activity_participations(
      (select id from participation_project),
      (select id from participation_activity)
    )
  ),
  1::bigint,
  'administrator lists the activity participation'
);
select is_empty(
  $query$
    select *
    from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_activity),
      'Ana',
      20
    )
  $query$,
  'active participant is excluded from candidates'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000001'
    )
  $query$,
  '23505',
  'project_activity_participation_already_active',
  'duplicate active participation fails with a stable error'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_participation'
      and entity_id = (select participation_id from ana_participation)
      and action = 'project_activity_participation.created'
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
      and changed_fields = array['activity_id', 'volunteer_id', 'started_at']
      and metadata = '{}'::jsonb
  ),
  1::bigint,
  'successful create writes one minimal same-transaction audit event'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_participation'
      and action = 'project_activity_participation.created'
      and entity_id = (select participation_id from ana_participation)
  ),
  1::bigint,
  'failed duplicate create does not add another audit event'
);
select lives_ok(
  $query$
    create temporary table ana_participation_ended as
    select * from public.finish_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      (select participation_id from ana_participation)
    )
  $query$,
  'administrator finishes participation once'
);
select ok(
  (select ended_at is not null from ana_participation_ended),
  'finish records a server timestamp'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_participation'
      and entity_id = (select participation_id from ana_participation)
      and action = 'project_activity_participation.ended'
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
      and changed_fields = array['ended_at']
      and metadata = '{}'::jsonb
  ),
  1::bigint,
  'successful finish writes one minimal audit event'
);
select throws_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      (select participation_id from ana_participation)
    )
  $query$,
  '23514',
  'project_activity_participation_already_ended',
  'second finish is rejected without rewriting history'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity_participation'
      and entity_id = (select participation_id from ana_participation)
      and action = 'project_activity_participation.ended'
  ),
  1::bigint,
  'failed second finish creates no additional audit event'
);
select lives_ok(
  $query$
    create temporary table ana_participation_again as
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000001'
    )
  $query$,
  'historical participation permits a future active occurrence'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_completed_activity),
      '70000000-0000-4000-8000-000000000002'
    )
  $query$,
  '23514',
  'project_activity_not_scheduled',
  'completed activity rejects a new participation'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_cancelled_activity),
      '70000000-0000-4000-8000-000000000002'
    )
  $query$,
  '23514',
  'project_activity_not_scheduled',
  'cancelled activity rejects a new participation'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000003'
    )
  $query$,
  '23514',
  'volunteer_not_assigned_to_project',
  'assignment to another project is not eligible'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000099'
    )
  $query$,
  '23514',
  'volunteer_not_assigned_to_project',
  'unknown volunteer is indistinguishable from an unassigned volunteer'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_other_activity),
      '70000000-0000-4000-8000-000000000002'
    )
  $query$,
  'P0002',
  'project_activity_not_found',
  'crossed project and activity identifiers are rejected'
);
select throws_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from participation_other_project),
      (select id from participation_other_activity),
      (select participation_id from ana_participation_again)
    )
  $query$,
  'P0002',
  'project_activity_participation_not_found',
  'finish jointly constrains project activity and participation identifiers'
);

select lives_ok(
  $query$
    create temporary table assignment_eva as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000005'
    )
  $query$,
  'administrator creates an assignment-ended fixture'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_eva))$$,
  'assignment without participation can be finished'
);
select is_empty(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from participation_project),
      (select id from participation_activity),
      'Eva',
      20
    )
  $query$,
  'candidate search excludes an ended project assignment'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000005'
    )
  $query$,
  '23514',
  'volunteer_not_assigned_to_project',
  'ended project assignment is not eligible'
);
select throws_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_ana))$$,
  '23514',
  'volunteer_has_scheduled_activity_participations',
  'active participation in a scheduled activity blocks assignment finish'
);
select lives_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from participation_project),
      (select id from participation_activity),
      (select participation_id from ana_participation_again)
    )
  $query$,
  'administrator resolves the blocking participation'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_ana))$$,
  'ended participation no longer blocks assignment finish'
);
select lives_ok(
  $query$
    create temporary table assignment_carla_main as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000003'
    )
  $query$,
  'administrator assigns the same volunteer to a second project'
);
select lives_ok(
  $query$
    create temporary table participation_carla_other as
    select * from public.create_project_activity_participation(
      (select id from participation_other_project),
      (select id from participation_other_activity),
      '70000000-0000-4000-8000-000000000003'
    )
  $query$,
  'administrator creates a scheduled participation only in the other project'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_carla_main))$$,
  'participation in another project does not block assignment finish'
);

select lives_ok(
  $query$
    create temporary table assignment_fabi as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000006'
    )
  $query$,
  'administrator creates the completed-activity guard fixture'
);
select lives_ok(
  $query$
    create temporary table activity_fabi as
    select * from public.create_project_activity(
      (select id from participation_project), 'Fabi Scheduled', null,
      '2026-09-06T14:00:00Z', null, null
    )
  $query$,
  'administrator creates Fabi activity'
);
select lives_ok(
  $query$
    create temporary table participation_fabi as
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from activity_fabi),
      '70000000-0000-4000-8000-000000000006'
    )
  $query$,
  'administrator creates Fabi participation'
);
select lives_ok(
  $$select * from public.complete_project_activity((select id from participation_project), (select id from activity_fabi))$$,
  'activity with an active participation can complete without auto-finish'
);
select is(
  (
    select ended_at
    from public.list_project_activity_participations(
      (select id from participation_project),
      (select id from activity_fabi)
    )
    where participation_id = (select participation_id from participation_fabi)
  ),
  null::timestamptz,
  'completion preserves an explicitly unended historical participation'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_fabi))$$,
  'participation in a completed activity does not block assignment finish'
);

select lives_ok(
  $query$
    create temporary table assignment_gabi as
    select * from public.assign_volunteer_to_project(
      (select id from participation_project),
      '70000000-0000-4000-8000-000000000007'
    )
  $query$,
  'administrator creates the cancelled-activity guard fixture'
);
select lives_ok(
  $query$
    create temporary table activity_gabi as
    select * from public.create_project_activity(
      (select id from participation_project), 'Gabi Scheduled', null,
      '2026-09-07T14:00:00Z', null, null
    )
  $query$,
  'administrator creates Gabi activity'
);
select lives_ok(
  $query$
    create temporary table participation_gabi as
    select * from public.create_project_activity_participation(
      (select id from participation_project),
      (select id from activity_gabi),
      '70000000-0000-4000-8000-000000000007'
    )
  $query$,
  'administrator creates Gabi participation'
);
select lives_ok(
  $$select * from public.cancel_project_activity((select id from participation_project), (select id from activity_gabi))$$,
  'activity with an active participation can cancel without auto-finish'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_gabi))$$,
  'participation in a cancelled activity does not block assignment finish'
);

select lives_ok(
  $$create temporary table closed_participation_project as select * from public.create_project('Proyecto Participation Closed', null)$$,
  'administrator creates the closed-project fixture'
);
select lives_ok(
  $query$
    create temporary table assignment_hilda as
    select * from public.assign_volunteer_to_project(
      (select id from closed_participation_project),
      '70000000-0000-4000-8000-000000000008'
    )
  $query$,
  'administrator assigns the closed-project volunteer'
);
select lives_ok(
  $query$
    create temporary table activity_hilda as
    select * from public.create_project_activity(
      (select id from closed_participation_project), 'Hilda Activity', null,
      '2026-09-08T14:00:00Z', null, null
    )
  $query$,
  'administrator creates the closed-project activity'
);
select lives_ok(
  $query$
    create temporary table participation_hilda as
    select * from public.create_project_activity_participation(
      (select id from closed_participation_project),
      (select id from activity_hilda),
      '70000000-0000-4000-8000-000000000008'
    )
  $query$,
  'administrator creates the closed-project participation'
);
select lives_ok(
  $$select * from public.complete_project_activity((select id from closed_participation_project), (select id from activity_hilda))$$,
  'administrator terminalizes the closed-project activity'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from assignment_hilda))$$,
  'completed participation does not block closed-project assignment finish'
);
select lives_ok(
  $$select * from public.close_project((select id from closed_participation_project))$$,
  'administrator closes the fixture project'
);
select throws_ok(
  $query$
    select * from public.search_project_activity_volunteer_candidates(
      (select id from closed_participation_project),
      (select id from activity_hilda),
      '',
      20
    )
  $query$,
  '23514',
  'project_closed',
  'candidate search rejects a closed project'
);
select is(
  (
    select count(*)
    from public.list_project_activity_participations(
      (select id from closed_participation_project),
      (select id from activity_hilda)
    )
  ),
  1::bigint,
  'closed project participation history remains readable'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from closed_participation_project),
      (select id from activity_hilda),
      '70000000-0000-4000-8000-000000000008'
    )
  $query$,
  '23514',
  'project_closed',
  'closed project rejects new participation'
);
select throws_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from closed_participation_project),
      (select id from activity_hilda),
      (select participation_id from participation_hilda)
    )
  $query$,
  '23514',
  'project_closed',
  'closed project participation is read-only'
);

reset role;
select throws_ok(
  $query$
    insert into public.project_activity_participations (
      activity_id,
      volunteer_id,
      ended_at
    ) values (
      (select id from participation_activity),
      '70000000-0000-4000-8000-000000000002',
      statement_timestamp()
    )
  $query$,
  '22023',
  'project_activity_participation_must_start_active',
  'even table owner cannot create a participation already ended'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set id = '40000000-0000-4000-8000-000000000099'
    where id = (select participation_id from participation_fabi)
  $query$,
  '22023',
  'project_activity_participation_immutable_fields',
  'participation identifier is immutable'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set activity_id = (select id from participation_completed_activity)
    where id = (select participation_id from participation_fabi)
  $query$,
  '22023',
  'project_activity_participation_immutable_fields',
  'participation activity is immutable'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set volunteer_id = '70000000-0000-4000-8000-000000000002'
    where id = (select participation_id from participation_fabi)
  $query$,
  '22023',
  'project_activity_participation_immutable_fields',
  'participation identity is immutable'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set
      started_at = started_at - interval '1 second',
      created_at = created_at - interval '1 second'
    where id = (select participation_id from participation_fabi)
  $query$,
  '22023',
  'project_activity_participation_immutable_fields',
  'participation start and creation timestamps are immutable'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set updated_at = statement_timestamp()
    where id = (select participation_id from participation_fabi)
  $query$,
  '22023',
  'project_activity_participation_immutable_fields',
  'client cannot forge technical updated timestamp'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set ended_at = null
    where id = (select participation_id from ana_participation)
  $query$,
  '23514',
  'project_activity_participation_already_ended',
  'ended participation cannot reactivate'
);
select throws_ok(
  $query$
    update public.project_activity_participations
    set ended_at = ended_at + interval '1 second'
    where id = (select participation_id from ana_participation)
  $query$,
  '23514',
  'project_activity_participation_already_ended',
  'ended participation timestamp cannot be rewritten'
);
select throws_ok(
  $query$
    delete from public.project_activity_participations
    where id = (select participation_id from participation_fabi)
  $query$,
  '42501',
  'project_activity_participation_delete_not_allowed',
  'even table owner cannot delete participation history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$create temporary table manager_participation_project as select * from public.create_project('Proyecto Manager Participation', null)$$,
  'administrator creates manager participation project'
);
select lives_ok(
  $query$
    create temporary table manager_participation_activity as
    select * from public.create_project_activity(
      (select id from manager_participation_project), 'Manager Activity', null,
      '2026-09-09T14:00:00Z', null, null
    )
  $query$,
  'administrator creates manager participation activity'
);
select lives_ok(
  $query$
    select * from public.assign_volunteer_to_project(
      (select id from manager_participation_project),
      '70000000-0000-4000-8000-000000000009'
    )
  $query$,
  'administrator assigns the manager mutation volunteer'
);
select lives_ok(
  $query$
    select * from public.assign_volunteer_to_project(
      (select id from manager_participation_project),
      '70000000-0000-4000-8000-000000000010'
    )
  $query$,
  'administrator assigns the manager pending volunteer'
);
select lives_ok(
  $query$
    select * from public.assign_volunteer_to_project(
      (select id from manager_participation_project),
      '70000000-0000-4000-8000-000000000011'
    )
  $query$,
  'administrator assigns the manager candidate'
);
select lives_ok(
  $query$
    create temporary table participation_manager_scope as
    select * from public.assign_project_manager(
      (select id from manager_participation_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $query$,
  'administrator grants manager scope'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.list_project_activity_participations((select id from manager_participation_project), (select id from manager_participation_activity))$$,
  'scoped manager reads activity participations'
);
select is(
  (
    select count(*)
    from public.search_project_activity_volunteer_candidates(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '',
      20
    )
  ),
  3::bigint,
  'scoped manager searches only eligible project assignments'
);
select lives_ok(
  $query$
    create temporary table manager_participation as
    select * from public.create_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '70000000-0000-4000-8000-000000000009'
    )
  $query$,
  'scoped manager adds a participant'
);
select lives_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      (select participation_id from manager_participation)
    )
  $query$,
  'scoped manager finishes participation'
);
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from participation_other_project), (select id from participation_other_activity))$$,
  '42501',
  'permission_denied',
  'manager cannot read participation in an unassigned project'
);
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from participation_other_project),
      (select id from participation_other_activity),
      '70000000-0000-4000-8000-000000000003'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager cannot mutate participation in an unassigned project'
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
    select * from public.create_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '70000000-0000-4000-8000-000000000010'
    )
  $query$,
  '42501',
  'permission_denied',
  'manager without contextual manage permission cannot mutate'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code = 'project.manage_assigned';
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'project_manager')
  and permission_id = (
    select id from public.permissions where code = 'project.read_assigned'
  );
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from manager_participation_project), (select id from manager_participation_activity))$$,
  '42501',
  'permission_denied',
  'manager without contextual read permission cannot list'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code = 'project.read_assigned';
update public.accounts
set status = 'suspended', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from manager_participation_project), (select id from manager_participation_activity))$$,
  '42501',
  'permission_denied',
  'suspended manager cannot read participation'
);

reset role;
update public.accounts
set status = 'archived', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '70000000-0000-4000-8000-000000000010'
    )
  $query$,
  '42501',
  'permission_denied',
  'archived manager cannot mutate participation'
);

reset role;
update public.accounts
set status = 'active', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
delete from public.user_roles
where user_id = '00000000-0000-4000-8000-000000000007'
  and role_id = (select id from public.roles where code = 'project_manager');
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from manager_participation_project), (select id from manager_participation_activity))$$,
  '42501',
  'permission_denied',
  'manager without current role cannot read participation'
);

reset role;
insert into public.user_roles (user_id, role_id)
select '00000000-0000-4000-8000-000000000007', role.id
from public.roles as role
where role.code = 'project_manager';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $query$
    create temporary table manager_pending_participation as
    select * from public.create_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '70000000-0000-4000-8000-000000000010'
    )
  $query$,
  'manager creates the scope-removal finish fixture'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.finish_project_manager_assignment((select assignment_id from participation_manager_scope))$$,
  'administrator removes manager scope'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $query$
    select * from public.create_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      '70000000-0000-4000-8000-000000000011'
    )
  $query$,
  '42501',
  'permission_denied',
  'ended scope denies participation add'
);
select throws_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from manager_participation_project),
      (select id from manager_participation_activity),
      (select participation_id from manager_pending_participation)
    )
  $query$,
  '42501',
  'permission_denied',
  'ended scope denies participation finish'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from participation_project), (select id from participation_activity))$$,
  '42501',
  'permission_denied',
  'coordinator cannot read participation'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activity_participations((select id from participation_project), (select id from participation_activity))$$,
  '42501',
  'permission_denied',
  'volunteer account cannot read participation administration'
);

select * from finish();
rollback;
