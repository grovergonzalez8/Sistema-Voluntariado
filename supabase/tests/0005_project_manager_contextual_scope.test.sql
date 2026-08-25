begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

select has_table(
  'public',
  'project_manager_assignments',
  'project manager assignments table exists'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.project_manager_assignments'::regclass
  ),
  'project manager assignments enables RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.project_manager_assignments',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'public.project_manager_assignments',
      'insert'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_manager_assignments',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'public.project_manager_assignments',
      'delete'
    ),
  'authenticated has no direct manager assignment privileges'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'list_project_manager_assignments',
        'search_project_manager_candidates',
        'assign_project_manager',
        'finish_project_manager_assignment'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  4::bigint,
  'manager RPCs are security definer with empty search path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.has_project_contextual_access(uuid,uuid,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.lock_project_contextual_access(uuid,uuid,text)',
      'execute'
    ),
  'contextual helpers are not client executable'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_manager_assignments_one_active_pair_idx'
      and indexdef like '%UNIQUE%'
      and indexdef like '%ended_at IS NULL%'
  ),
  'partial unique index protects one active manager scope per pair'
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
  'project manage remains administrator-only'
);
select is(
  (
    select count(*)
    from public.role_permissions as role_permission
    inner join public.roles as role on role.id = role_permission.role_id
    inner join public.permissions as permission
      on permission.id = role_permission.permission_id
    where role.code = 'project_manager'
      and permission.code in (
        'project.read_assigned',
        'project.manage_assigned'
      )
  ),
  2::bigint,
  'project manager receives both contextual permissions'
);

set local role anon;
select throws_ok(
  $$select * from public.list_project_manager_assignments(gen_random_uuid())$$,
  '42501',
  'permission denied for function list_project_manager_assignments',
  'anonymous cannot execute manager RPCs'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$create temporary table manager_project as select * from public.create_project('Proyecto Manager Scope', null)$$,
  'administrator creates the scoped project'
);
select lives_ok(
  $$create temporary table other_project as select * from public.create_project('Proyecto Sin Scope', null)$$,
  'administrator creates an unscoped project'
);
select lives_ok(
  $$
    create temporary table manager_scope as
    select * from public.assign_project_manager(
      (select id from manager_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $$,
  'administrator assigns an eligible project manager'
);
select is(
  (select ended_at from manager_scope),
  null::timestamptz,
  'new manager assignment is active'
);
select throws_ok(
  $$
    select * from public.assign_project_manager(
      (select id from manager_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $$,
  '23505',
  'project_manager_assignment_already_active',
  'duplicate active manager assignment is rejected'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.list_projects('', 25, 0)),
  1::bigint,
  'manager lists only actively assigned projects'
);
select lives_ok(
  $$select * from public.get_project_detail((select id from manager_project))$$,
  'manager reads an assigned project'
);
select throws_ok(
  $$select * from public.get_project_detail((select id from other_project))$$,
  '42501',
  'permission_denied',
  'manager cannot read another project'
);
select lives_ok(
  $$
    select * from public.update_project(
      (select id from manager_project),
      'Proyecto Manager Actualizado',
      'Descripción contextual'
    )
  $$,
  'manager edits descriptive project fields'
);
select throws_ok(
  $$select * from public.create_project('Escalamiento', null)$$,
  '42501',
  'permission_denied',
  'manager cannot create projects'
);
select throws_ok(
  $$select * from public.close_project((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'manager cannot close projects'
);
select throws_ok(
  $$select * from public.list_project_manager_assignments((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'manager cannot administer manager assignments'
);

reset role;
update public.accounts
set status = 'suspended', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.get_project_detail((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'suspension immediately denies contextual access'
);

reset role;
update public.accounts
set status = 'archived', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $$select * from public.get_project_detail((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'archive immediately denies contextual access'
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
  $$select * from public.get_project_detail((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'role loss immediately denies contextual access'
);

reset role;
insert into public.user_roles (user_id, role_id)
select '00000000-0000-4000-8000-000000000007', role.id
from public.roles as role where role.code = 'project_manager';
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'project_manager')
  and permission_id = (
    select id from public.permissions where code = 'project.manage_assigned'
  );
set local role authenticated;
select throws_ok(
  $$
    select * from public.update_project(
      (select id from manager_project),
      'Sin permiso',
      null
    )
  $$,
  '42501',
  'permission_denied',
  'permission loss immediately denies contextual mutation'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code = 'project.manage_assigned';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.close_project((select id from manager_project))$$,
  'administrator closes a project while its manager scope remains active'
);
select is(
  (
    select count(*)
    from public.list_project_manager_assignments((select id from manager_project))
    where assignment_id = (select assignment_id from manager_scope)
      and ended_at is null
  ),
  1::bigint,
  'closing does not finish the manager scope'
);
select throws_ok(
  $$
    select * from public.assign_project_manager(
      (select id from manager_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $$,
  '23514',
  'project_closed',
  'closed project rejects manager reassignment'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.get_project_detail((select id from manager_project))$$,
  'manager retains historical read access after close'
);
select lives_ok(
  $$
    select * from public.update_project(
      (select id from manager_project),
      'Proyecto Cerrado Descriptivo',
      null
    )
  $$,
  'manager edits descriptive fields after close'
);
select throws_ok(
  $$select * from public.search_project_volunteer_candidates((select id from manager_project), '', 20)$$,
  '23514',
  'project_closed',
  'closed project rejects new volunteer candidate flow'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    create temporary table ended_manager_scope as
    select * from public.finish_project_manager_assignment(
      (select assignment_id from manager_scope)
    )
  $$,
  'administrator finishes a manager scope after project close'
);
select ok(
  (select ended_at is not null from ended_manager_scope),
  'scope finalization uses a server timestamp'
);
select throws_ok(
  $$
    select * from public.finish_project_manager_assignment(
      (select assignment_id from manager_scope)
    )
  $$,
  '23514',
  'project_manager_assignment_already_ended',
  'scope finalization is monotonic'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.get_project_detail((select id from manager_project))$$,
  '42501',
  'permission_denied',
  'ended scope immediately denies access'
);

reset role;
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_id = (select assignment_id from manager_scope)
      and action in (
        'project_manager_assignment.created',
        'project_manager_assignment.ended'
      )
  ),
  2::bigint,
  'manager assignment lifecycle is audited exactly once per transition'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where entity_id = (select assignment_id from manager_scope)
      and metadata <> '{}'::jsonb
  ),
  'manager assignment audit metadata contains no PII'
);
select throws_ok(
  $$delete from public.project_manager_assignments where id = (select assignment_id from manager_scope)$$,
  '42501',
  'project_manager_assignment_delete_not_allowed',
  'manager assignment history cannot be physically deleted'
);
select is(
  (
    select count(*)
    from public.project_manager_assignments
    where project_id = (select id from manager_project)
      and ended_at is null
  ),
  0::bigint,
  'ended manager scope remains historical and inactive'
);

select * from finish();
rollback;
