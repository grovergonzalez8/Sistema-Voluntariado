begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select has_function(
  'public',
  'lock_project_mutation_authority',
  array['uuid', 'uuid'],
  'project mutation authority helper exists'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.lock_project_mutation_authority(uuid,uuid)'::regprocedure
  ),
  'project mutation authority helper is a hardened security definer'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.lock_project_mutation_authority(uuid,uuid)',
    'execute'
  ),
  'authenticated cannot execute the authority lock helper directly'
);

insert into public.volunteers (id, full_name)
values
  ('80000000-0000-4000-8000-000000000001', 'Authority Assignment One'),
  ('80000000-0000-4000-8000-000000000002', 'Authority Guard Two'),
  ('80000000-0000-4000-8000-000000000003', 'Authority Foreign Three');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$create temporary table authority_project as select * from public.create_project('Authority Project', null)$$,
  'administrator creates the authorized project'
);
select lives_ok(
  $$create temporary table authority_foreign_project as select * from public.create_project('Authority Foreign Project', null)$$,
  'administrator creates the foreign project'
);
select lives_ok(
  $query$
    create temporary table authority_activity as
    select * from public.create_project_activity(
      (select id from authority_project),
      'Authority Activity',
      null,
      statement_timestamp(),
      null,
      null
    )
  $query$,
  'administrator activity mutation still uses the hardened helper'
);
select lives_ok(
  $query$
    create temporary table authority_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from authority_project),
      '80000000-0000-4000-8000-000000000001'
    )
  $query$,
  'administrator creates the manager finish fixture'
);
select lives_ok(
  $query$
    create temporary table authority_guard_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from authority_project),
      '80000000-0000-4000-8000-000000000002'
    )
  $query$,
  'administrator creates the participation guard fixture'
);
select lives_ok(
  $query$
    create temporary table authority_foreign_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from authority_foreign_project),
      '80000000-0000-4000-8000-000000000003'
    )
  $query$,
  'administrator creates an assignment outside manager scope'
);
select lives_ok(
  $query$
    create temporary table authority_guard_participation as
    select * from public.create_project_activity_participation(
      (select id from authority_project),
      (select id from authority_activity),
      '80000000-0000-4000-8000-000000000002'
    )
  $query$,
  'administrator participation mutation still uses the hardened helper'
);
select lives_ok(
  $query$
    create temporary table authority_manager_scope as
    select * from public.assign_project_manager(
      (select id from authority_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $query$,
  'administrator grants the manager contextual scope'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.finish_project_volunteer_assignment('80000000-0000-4000-8000-000000000099')$$,
  '42501',
  'permission_denied',
  'manager receives the public denial for an unknown assignment UUID'
);
select throws_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from authority_foreign_assignment))$$,
  '42501',
  'permission_denied',
  'manager receives the same public denial for a real out-of-scope assignment UUID'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from authority_assignment))$$,
  'scoped manager can finish an authorized assignment'
);
select ok(
  (
    select ended_at is not null
    from public.list_project_assignments((select id from authority_project))
    where assignment_id = (select assignment_id from authority_assignment)
  ),
  'authorized manager finish persists the terminal assignment state'
);
select throws_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from authority_guard_assignment))$$,
  '23514',
  'volunteer_has_scheduled_activity_participations',
  'scheduled active participation still blocks assignment finish'
);
select is(
  (
    select ended_at
    from public.list_project_assignments((select id from authority_project))
    where assignment_id = (select assignment_id from authority_guard_assignment)
  ),
  null::timestamptz,
  'guard failure leaves the assignment active'
);
select lives_ok(
  $query$
    select * from public.finish_project_activity_participation(
      (select id from authority_project),
      (select id from authority_activity),
      (select participation_id from authority_guard_participation)
    )
  $query$,
  'scoped manager resolves the active participation'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from authority_guard_assignment))$$,
  'ended participation no longer blocks the authorized manager'
);
select lives_ok(
  $query$
    select * from public.create_project_activity(
      (select id from authority_project),
      'Contextual Authority Activity',
      null,
      statement_timestamp(),
      null,
      null
    )
  $query$,
  'contextual manager activity mutation still uses account scope project order'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.finish_project_volunteer_assignment('80000000-0000-4000-8000-000000000099')$$,
  'P0002',
  'assignment_not_found',
  'global administrator retains the legitimate assignment-not-found result'
);
select lives_ok(
  $$select * from public.finish_project_volunteer_assignment((select assignment_id from authority_foreign_assignment))$$,
  'global administrator can finish an assignment in any project'
);
select ok(
  (
    select ended_at is not null
    from public.list_project_assignments(
      (select id from authority_foreign_project)
    )
    where assignment_id = (select assignment_id from authority_foreign_assignment)
  ),
  'administrator finish persists the terminal assignment state'
);

select * from finish();
rollback;
