begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(51);

select has_table('public', 'projects', 'projects table exists');
select has_table(
  'public',
  'project_volunteer_assignments',
  'project volunteer assignments table exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'projects enables RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.project_volunteer_assignments'::regclass
  ),
  'project assignments enables RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.projects', 'select')
    and not has_table_privilege('authenticated', 'public.projects', 'insert')
    and not has_table_privilege('authenticated', 'public.projects', 'update')
    and not has_table_privilege('authenticated', 'public.projects', 'delete'),
  'authenticated has no direct project table privileges'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.project_volunteer_assignments',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'public.project_volunteer_assignments',
      'insert'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_volunteer_assignments',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_volunteer_assignments',
      'delete'
    ),
  'authenticated has no direct assignment table privileges'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'list_projects',
        'get_project_detail',
        'create_project',
        'update_project',
        'close_project',
        'list_project_assignments',
        'search_project_volunteer_candidates',
        'assign_volunteer_to_project',
        'finish_project_volunteer_assignment',
        'list_volunteer_projects'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  10::bigint,
  'every exposed project RPC is security definer with an empty search path'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_assignments_one_active_pair_idx'
      and indexdef like '%UNIQUE%'
      and indexdef like '%ended_at IS NULL%'
  ),
  'a partial unique index protects one active assignment per pair'
);
select is(
  (
    select count(*)
    from public.role_permissions as role_permission
    inner join public.roles as role on role.id = role_permission.role_id
    inner join public.permissions as permission
      on permission.id = role_permission.permission_id
    where permission.code = 'project.manage'
      and role.code <> 'administrator'
  ),
  0::bigint,
  'project manage is not granted to non-administrator roles'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.projects$$,
  '42501',
  'permission denied for table projects',
  'anonymous cannot read projects'
);
select throws_ok(
  $$select * from public.list_projects('', 25, 0)$$,
  '42501',
  'permission denied for function list_projects',
  'anonymous cannot execute project RPCs'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('project.manage'),
  false,
  'a volunteer has no project management permission'
);
select throws_ok(
  $$select * from public.list_projects('', 25, 0)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot list projects'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('project.manage'),
  false,
  'a coordinator has no project management permission'
);
select throws_ok(
  $$select * from public.create_project('No autorizado', null)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot create projects'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('project.manage'),
  true,
  'an active administrator has project management permission'
);
select throws_ok(
  $$select * from public.list_projects('', 0, 0)$$,
  '22023',
  'invalid_project_query',
  'project list rejects an invalid limit'
);
select throws_ok(
  $$select * from public.create_project('   ', null)$$,
  '23514',
  null,
  'project creation rejects an empty canonical name'
);
select lives_ok(
  $$
    create temporary table test_volunteer as
    select * from public.create_volunteer(
      'Participante de Proyecto',
      'participant-project@example.invalid',
      null,
      false
    )
  $$,
  'administrator creates an independent registry volunteer for the test'
);
select lives_ok(
  $$
    create temporary table test_project as
    select * from public.create_project(
      '  Proyecto   Comunitario  ',
      '  Apoyo   local  '
    )
  $$,
  'administrator creates a project'
);
select is(
  (select name from test_project),
  'Proyecto Comunitario',
  'project creation canonicalizes name whitespace'
);
select is(
  (select description from test_project),
  'Apoyo local',
  'project creation canonicalizes description whitespace'
);
select is(
  (
    select total_count
    from public.list_projects('comunitario', 25, 0)
    limit 1
  ),
  1::bigint,
  'project list searches and reports the logical total'
);
select is(
  (
    select status
    from public.get_project_detail((select id from test_project))
  ),
  'active',
  'project detail returns its active lifecycle state'
);
select lives_ok(
  $$
    select * from public.update_project(
      (select id from test_project),
      'Proyecto Comunitario Actualizado',
      null
    )
  $$,
  'administrator updates project name and description'
);
select lives_ok(
  $$
    create temporary table test_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from test_project),
      (select id from test_volunteer)
    )
  $$,
  'administrator assigns a registry volunteer directly'
);
select is(
  (select ended_at from test_assignment),
  null::timestamptz,
  'a new assignment is active by a null end timestamp'
);
select throws_ok(
  $$
    select * from public.assign_volunteer_to_project(
      (select id from test_project),
      (select id from test_volunteer)
    )
  $$,
  '23505',
  'assignment_already_active',
  'the same volunteer cannot have two active assignments to one project'
);
select throws_ok(
  $$select * from public.close_project((select id from test_project))$$,
  '23514',
  'project_has_active_assignments',
  'a project with active assignments cannot close'
);
select is(
  (
    select count(*)
    from public.search_project_volunteer_candidates(
      (select id from test_project),
      'Participante',
      20
    )
  ),
  0::bigint,
  'candidate search excludes a volunteer already active in the project'
);
select is(
  (
    select count(*)
    from public.list_project_assignments((select id from test_project))
  ),
  1::bigint,
  'project participants include the active assignment'
);
select is(
  (
    select count(*)
    from public.list_volunteer_projects((select id from test_volunteer))
  ),
  1::bigint,
  'volunteer history includes its project assignment'
);
select lives_ok(
  $$
    create temporary table test_finished_assignment as
    select * from public.finish_project_volunteer_assignment(
      (select assignment_id from test_assignment)
    )
  $$,
  'administrator finishes an active assignment'
);
select ok(
  (select ended_at is not null from test_finished_assignment),
  'finishing uses a server end timestamp'
);
select is(
  (select started_at from test_finished_assignment),
  (select started_at from test_assignment),
  'finishing preserves the historical start timestamp'
);
select throws_ok(
  $$
    select * from public.finish_project_volunteer_assignment(
      (select assignment_id from test_assignment)
    )
  $$,
  '23514',
  'assignment_already_ended',
  'a finished assignment cannot be finished twice'
);
select lives_ok(
  $$select * from public.close_project((select id from test_project))$$,
  'a project closes after every active assignment is finished'
);
select is(
  (
    select status
    from public.get_project_detail((select id from test_project))
  ),
  'closed',
  'closed projects remain visible as history'
);
select throws_ok(
  $$
    select * from public.assign_volunteer_to_project(
      (select id from test_project),
      (select id from test_volunteer)
    )
  $$,
  '23514',
  'project_closed',
  'closed projects reject new assignments'
);
select lives_ok(
  $$
    select * from public.update_project(
      (select id from test_project),
      'Proyecto Histórico Corregido',
      null
    )
  $$,
  'closed project descriptive fields remain correctable'
);
reset role;
select throws_ok(
  $$update public.projects set status = 'active' where id = (select id from test_project)$$,
  '22023',
  'project_reopen_not_allowed',
  'PostgreSQL prevents reopening a closed project'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    create temporary table second_project as
    select * from public.create_project('Proyecto Reasignable', null)
  $$,
  'a second active project is created'
);
select lives_ok(
  $$
    create temporary table second_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from second_project),
      (select id from test_volunteer)
    )
  $$,
  'the volunteer is assigned to another project simultaneously'
);
select lives_ok(
  $$
    select * from public.finish_project_volunteer_assignment(
      (select assignment_id from second_assignment)
    )
  $$,
  'the second assignment is finished'
);
select lives_ok(
  $$
    select * from public.assign_volunteer_to_project(
      (select id from second_project),
      (select id from test_volunteer)
    )
  $$,
  'a historical assignment does not prevent a future active assignment'
);

reset role;
select throws_ok(
  $$delete from public.projects where id = (select id from second_project)$$,
  '23503',
  null,
  'project history prevents physical deletion through foreign keys'
);
select throws_ok(
  $$delete from public.volunteers where id = (select id from test_volunteer)$$,
  '23503',
  null,
  'volunteer history prevents physical deletion through foreign keys'
);
select is(
  (select count(*) from auth.users),
  5::bigint,
  'project operations do not create Auth users'
);
select is(
  (select count(*) from public.accounts),
  4::bigint,
  'project operations do not create accounts'
);
select is(
  (
    select count(*)
    from public.audit_logs as audit
    where audit.action in (
      'project.created',
      'project.updated',
      'project.closed',
      'project_assignment.created',
      'project_assignment.ended'
    )
  ),
  10::bigint,
  'project and assignment lifecycle actions are audited'
);
select ok(
  not exists (
    select 1
    from public.audit_logs as audit
    where audit.action like 'project%'
      and (
        audit.target_user_id is not null
        or audit.metadata::text like '%participant-project%'
        or audit.metadata::text like '%Participante%'
      )
  ),
  'project audit metadata contains no volunteer PII or Auth target'
);

select * from finish();
rollback;
