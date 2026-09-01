begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(97);

select has_table('public', 'project_activities', 'project activities table exists');
select has_column('public', 'project_activities', 'project_id', 'activity belongs to a project');
select col_type_is('public', 'project_activities', 'starts_at', 'timestamp with time zone', 'activity start is an instant');
select col_type_is('public', 'project_activities', 'ends_at', 'timestamp with time zone', 'activity end is an optional instant');
select fk_ok(
  'public',
  'project_activities',
  'project_id',
  'public',
  'projects',
  'id',
  'activity project foreign key is present'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'project_activities_project_id_fk'
  ),
  'r',
  'activity project foreign key restricts deletion'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.project_activities'::regclass
  ),
  'project activities enables RLS'
);
select is(
  (
    select count(*)
    from pg_policy
    where polrelid = 'public.project_activities'::regclass
  ),
  0::bigint,
  'project activities has no permissive policies'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_activities', 'select')
    and not has_table_privilege('authenticated', 'public.project_activities', 'insert')
    and not has_table_privilege('authenticated', 'public.project_activities', 'update')
    and not has_table_privilege('authenticated', 'public.project_activities', 'delete'),
  'authenticated has no direct activity table privileges'
);
select ok(
  not has_table_privilege('anon', 'public.project_activities', 'select')
    and not has_table_privilege('anon', 'public.project_activities', 'insert')
    and not has_table_privilege('anon', 'public.project_activities', 'update')
    and not has_table_privilege('anon', 'public.project_activities', 'delete'),
  'anonymous has no activity table privileges'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activities_project_starts_at_id_idx'
      and indexdef like '%(project_id, starts_at, id)%'
  ),
  'stable project activity listing index exists'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_activities_scheduled_project_idx'
      and indexdef like '%WHERE (status = ''scheduled''::text)%'
  ),
  'partial scheduled activity close-guard index exists'
);
select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.project_activities'::regclass
      and conname in (
        'project_activities_name_valid',
        'project_activities_description_valid',
        'project_activities_location_text_valid',
        'project_activities_status_valid',
        'project_activities_period_valid',
        'project_activities_timestamps_valid'
      )
  ),
  6::bigint,
  'all activity value and timestamp constraints exist'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'list_project_activities',
        'get_project_activity_detail',
        'create_project_activity',
        'update_project_activity',
        'complete_project_activity',
        'cancel_project_activity'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  6::bigint,
  'every exposed activity RPC is security definer with an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.list_project_activities(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.get_project_activity_detail(uuid,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.create_project_activity(uuid,text,text,timestamptz,timestamptz,text)', 'execute')
    and has_function_privilege('authenticated', 'public.update_project_activity(uuid,uuid,text,text,timestamptz,timestamptz,text)', 'execute')
    and has_function_privilege('authenticated', 'public.complete_project_activity(uuid,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.cancel_project_activity(uuid,uuid)', 'execute'),
  'authenticated receives only exposed activity RPC execution'
);
select ok(
  not has_function_privilege('public', 'public.list_project_activities(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_project_activities(uuid)', 'execute')
    and not has_function_privilege('public', 'public.create_project_activity(uuid,text,text,timestamptz,timestamptz,text)', 'execute')
    and not has_function_privilege('anon', 'public.create_project_activity(uuid,text,text,timestamptz,timestamptz,text)', 'execute'),
  'public and anonymous cannot execute activity RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.lock_project_activity_mutation_access(uuid,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.transition_project_activity(uuid,uuid,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.guard_project_activity_change()', 'execute')
    and not has_function_privilege('authenticated', 'public.guard_project_activity_delete()', 'execute')
    and not has_function_privilege('authenticated', 'public.audit_project_activity_change()', 'execute'),
  'activity helpers and triggers are not client executable'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like '%delete%project%activity%'
  ),
  0::bigint,
  'there is no activity delete RPC'
);

set local role anon;
select throws_ok(
  $$select * from public.list_project_activities(gen_random_uuid())$$,
  '42501',
  'permission denied for function list_project_activities',
  'anonymous cannot execute activity reads'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'coordinator'
  and permission.code = 'activity.create'
on conflict do nothing;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.create_project_activity(gen_random_uuid(), 'No autorizado', null, statement_timestamp(), null, null)$$,
  '42501',
  'permission_denied',
  'activity.create placeholder grants no activity authority'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activities(gen_random_uuid())$$,
  '42501',
  'permission_denied',
  'volunteer cannot read project activities'
);

reset role;
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'administrator')
  and permission_id in (
    select id from public.permissions where code in ('activity.create', 'activity.join')
  );
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$create temporary table activity_project as select * from public.create_project('Proyecto Activities', null)$$,
  'administrator creates an active project without activity placeholders'
);
select lives_ok(
  $query$
    create temporary table scheduled_activity as
    select * from public.create_project_activity(
      (select id from activity_project),
      E'\t  Jornada \n Comunitaria\t',
      E'\t  Apoyo \n local\t',
      '2026-08-27T10:00:00-04:00'::timestamptz,
      '2026-08-27T12:00:00-04:00'::timestamptz,
      E'\t  Plaza \n central\t'
    )
  $query$,
  'administrator creates a scheduled activity'
);
select is((select name from scheduled_activity), 'Jornada Comunitaria', 'create canonicalizes activity name');
select is((select description from scheduled_activity), 'Apoyo local', 'create canonicalizes activity description');
select is((select location_text from scheduled_activity), 'Plaza central', 'create canonicalizes activity location');
select is((select status from scheduled_activity), 'scheduled', 'activity always starts scheduled');
select ok(
  (select status_changed_at = created_at and updated_at = created_at from scheduled_activity),
  'creation timestamps are server-authoritative and coherent'
);
select throws_ok(
  $query$
    insert into public.project_activities (
      project_id, name, starts_at
    ) values (
      (select id from activity_project), 'DML directo', statement_timestamp()
    )
  $query$,
  '42501',
  'permission denied for table project_activities',
  'authenticated cannot insert activities directly'
);
select throws_ok(
  $$update public.project_activities set name = 'DML directo' where id = (select id from scheduled_activity)$$,
  '42501',
  'permission denied for table project_activities',
  'authenticated cannot update activities directly'
);
select throws_ok(
  $$delete from public.project_activities where id = (select id from scheduled_activity)$$,
  '42501',
  'permission denied for table project_activities',
  'authenticated cannot delete activities directly'
);
select is(
  (select count(*) from public.list_project_activities((select id from activity_project))),
  1::bigint,
  'administrator lists project activities'
);
select is(
  (
    select id
    from public.get_project_activity_detail(
      (select id from activity_project),
      (select id from scheduled_activity)
    )
  ),
  (select id from scheduled_activity),
  'administrator reads activity detail using project and activity IDs'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), '', null,
      '2026-08-27T10:00:00Z', null, null
    )
  $query$,
  '22023',
  'invalid_project_activity',
  'create rejects an empty canonical name'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), 'Fin inválido', null,
      '2026-08-27T10:00:00Z', '2026-08-27T09:00:00Z', null
    )
  $query$,
  '22023',
  'invalid_project_activity',
  'create rejects an end before start'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), 'Inicio infinito', null,
      'infinity'::timestamptz, null, null
    )
  $query$,
  '22023',
  'invalid_project_activity',
  'create rejects a non-finite start instant'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), 'Fin infinito', null,
      '2026-08-27T10:00:00Z', 'infinity'::timestamptz, null
    )
  $query$,
  '22023',
  'invalid_project_activity',
  'create rejects a non-finite end instant'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), 'Fuera de rango', null,
      '10000-01-01T00:00:00Z'::timestamptz, null, null
    )
  $query$,
  '22023',
  'invalid_project_activity',
  'create rejects an instant outside the application ISO range'
);
select lives_ok(
  $query$
    create temporary table updated_activity as
    select * from public.update_project_activity(
      (select id from activity_project),
      (select id from scheduled_activity),
      'Jornada Actualizada', '',
      '2026-08-27T11:00:00-04:00'::timestamptz,
      null,
      ''
    )
  $query$,
  'administrator edits a scheduled activity'
);
select is((select description from updated_activity), null::text, 'update normalizes blank description to null');
select is((select location_text from updated_activity), null::text, 'update normalizes blank location to null');
select is(
  (select status_changed_at from updated_activity),
  (select status_changed_at from scheduled_activity),
  'descriptive update preserves status_changed_at'
);
select throws_ok(
  $$select * from public.close_project((select id from activity_project))$$,
  '23514',
  'project_has_scheduled_activities',
  'scheduled activity prevents project close'
);
select is(
  (
    select status
    from public.get_project_detail((select id from activity_project))
  ),
  'active',
  'failed close leaves project active'
);
select lives_ok(
  $query$
    create temporary table completed_activity as
    select * from public.complete_project_activity(
      (select id from activity_project),
      (select id from scheduled_activity)
    )
  $query$,
  'administrator completes a scheduled activity'
);
select is((select status from completed_activity), 'completed', 'complete reaches terminal completed');
select ok(
  (
    select completed.status_changed_at > scheduled.status_changed_at
    from completed_activity as completed
    cross join scheduled_activity as scheduled
  ),
  'complete writes status_changed_at once at transition'
);
select throws_ok(
  $query$
    select * from public.update_project_activity(
      (select id from activity_project),
      (select id from scheduled_activity),
      'No permitido', null, '2026-08-27T11:00:00Z', null, null
    )
  $query$,
  '23514',
  'project_activity_not_scheduled',
  'completed activity is not editable'
);
select throws_ok(
  $$select * from public.cancel_project_activity((select id from activity_project), (select id from scheduled_activity))$$,
  '23514',
  'project_activity_not_scheduled',
  'completed activity cannot transition to cancelled'
);
reset role;
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from scheduled_activity)
      and action in (
        'project_activity.created',
        'project_activity.updated',
        'project_activity.completed'
      )
  ),
  3::bigint,
  'successful create update and complete each emit one audit event'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from scheduled_activity)
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
  ),
  3::bigint,
  'activity audit actor is the authenticated administrator'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from scheduled_activity)
      and (
        metadata <> '{}'::jsonb
        or target_user_id is not null
        or changed_fields && array['email', 'phone']
      )
  ),
  'activity audit metadata is minimal and contains no personal fields'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from scheduled_activity)
      and action = 'project_activity.cancelled'
  ),
  0::bigint,
  'failed terminal transition emits no successful audit event'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.close_project((select id from activity_project))$$,
  'completed activities do not prevent project close'
);
select ok(
  (
    select detail.status = completed.status
      and detail.status_changed_at = completed.status_changed_at
      and detail.updated_at = completed.updated_at
    from public.get_project_activity_detail(
      (select id from activity_project),
      (select id from scheduled_activity)
    ) as detail
    cross join completed_activity as completed
  ),
  'closing a project does not alter terminal activity state or timestamps'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from scheduled_activity)
  ),
  3::bigint,
  'closing a project emits no additional activity audit event'
);
select lives_ok(
  $$select * from public.list_project_activities((select id from activity_project))$$,
  'closed project retains historical activity reads'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from activity_project), 'Posterior', null,
      statement_timestamp(), null, null
    )
  $query$,
  '23514',
  'project_closed',
  'closed project rejects new activities'
);
select throws_ok(
  $$select * from public.complete_project_activity((select id from activity_project), (select id from scheduled_activity))$$,
  '23514',
  'project_closed',
  'closed project rejects activity mutation before checking terminal state'
);

select lives_ok(
  $$create temporary table cancelled_project as select * from public.create_project('Proyecto Cancelado', null)$$,
  'administrator creates a project for cancellation'
);
select lives_ok(
  $query$
    create temporary table cancelled_activity as
    select created.* from public.create_project_activity(
      (select id from cancelled_project), 'Actividad Cancelable', null,
      statement_timestamp(), null, null
    ) as created
  $query$,
  'administrator creates an activity to cancel'
);
select lives_ok(
  $query$
    create temporary table terminal_cancelled_activity as
    select * from public.cancel_project_activity(
      (select id from cancelled_project),
      (select id from cancelled_activity)
    )
  $query$,
  'administrator cancels a scheduled activity'
);
select is(
  (select status from terminal_cancelled_activity),
  'cancelled',
  'cancel reaches terminal cancelled'
);
reset role;
select is(
  (
    select count(*)
    from public.audit_logs
    where entity_type = 'project_activity'
      and entity_id = (select id from cancelled_activity)
      and action = 'project_activity.cancelled'
      and actor_user_id = '00000000-0000-4000-8000-000000000004'
      and metadata = '{}'::jsonb
  ),
  1::bigint,
  'successful cancel emits exactly one minimal audit event for auth uid'
);
set local role authenticated;
select throws_ok(
  $$select * from public.complete_project_activity((select id from cancelled_project), (select id from cancelled_activity))$$,
  '23514',
  'project_activity_not_scheduled',
  'cancelled activity cannot transition to completed'
);
select lives_ok(
  $$select * from public.close_project((select id from cancelled_project))$$,
  'cancelled activities do not prevent project close'
);

select lives_ok(
  $query$
    create temporary table precedence_volunteer as
    select * from public.create_volunteer(
      'Participante Precedencia',
      'activity-precedence@example.invalid',
      null,
      false
    )
  $query$,
  'administrator creates a volunteer for close-guard precedence'
);
select lives_ok(
  $$create temporary table precedence_project as select * from public.create_project('Proyecto Precedencia', null)$$,
  'administrator creates a project for close-guard precedence'
);
select lives_ok(
  $query$
    create temporary table precedence_assignment as
    select * from public.assign_volunteer_to_project(
      (select id from precedence_project),
      (select id from precedence_volunteer)
    )
  $query$,
  'administrator creates an active project participation for precedence'
);
select lives_ok(
  $query$
    create temporary table precedence_activity as
    select * from public.create_project_activity(
      (select id from precedence_project), 'Actividad Precedencia', null,
      statement_timestamp(), null, null
    )
  $query$,
  'administrator creates a scheduled activity for precedence'
);
select throws_ok(
  $$select * from public.close_project((select id from precedence_project))$$,
  '23514',
  'project_has_active_assignments',
  'active participation error keeps precedence over scheduled activities'
);
select lives_ok(
  $query$
    select * from public.finish_project_volunteer_assignment(
      (select assignment_id from precedence_assignment)
    )
  $query$,
  'administrator terminalizes the active participation'
);
select throws_ok(
  $$select * from public.close_project((select id from precedence_project))$$,
  '23514',
  'project_has_scheduled_activities',
  'scheduled activity guard applies after active participation is terminal'
);

select lives_ok(
  $$create temporary table guarded_project as select * from public.create_project('Proyecto Guard', null)$$,
  'administrator creates a project for trigger defenses'
);
select lives_ok(
  $query$
    create temporary table guarded_activity as
    select * from public.create_project_activity(
      (select id from guarded_project), 'Actividad Guard', null,
      statement_timestamp(), null, null
    )
  $query$,
  'administrator creates a scheduled activity for trigger defenses'
);
reset role;
select throws_ok(
  $$update public.projects set status = 'closed' where id = (select id from guarded_project)$$,
  '23514',
  'project_has_scheduled_activities',
  'central project update guard also prevents closed plus scheduled'
);
select throws_ok(
  $$update public.project_activities set created_at = created_at - interval '1 day' where id = (select id from guarded_activity)$$,
  '22023',
  'project_activity_immutable_fields',
  'technical activity timestamps cannot be overwritten'
);
select throws_ok(
  $$delete from public.project_activities where id = (select id from guarded_activity)$$,
  '42501',
  'project_activity_delete_not_allowed',
  'even privileged direct delete is rejected by the guard'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$create temporary table scoped_project as select * from public.create_project('Proyecto Scoped Activities', null)$$,
  'administrator creates a project for contextual manager activity flow'
);
select lives_ok(
  $$create temporary table foreign_project as select * from public.create_project('Proyecto Ajeno Activities', null)$$,
  'administrator creates a project outside manager scope'
);
select lives_ok(
  $query$
    create temporary table manager_scope as
    select * from public.assign_project_manager(
      (select id from scoped_project),
      '10000000-0000-4000-8000-000000000007'
    )
  $query$,
  'administrator grants active contextual scope'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $query$
    create temporary table manager_activity as
    select * from public.create_project_activity(
      (select id from scoped_project), 'Actividad Manager', null,
      '2026-08-28T14:00:00Z', null, null
    )
  $query$,
  'scoped project manager creates an activity'
);
select lives_ok(
  $query$
    select * from public.update_project_activity(
      (select id from scoped_project), (select id from manager_activity),
      'Actividad Manager Editada', null,
      '2026-08-28T15:00:00Z', null, 'Sede'
    )
  $query$,
  'scoped project manager edits its scheduled activity'
);
select lives_ok(
  $$select * from public.complete_project_activity((select id from scoped_project), (select id from manager_activity))$$,
  'scoped project manager completes its activity'
);
select lives_ok(
  $query$
    create temporary table manager_cancel_activity as
    select * from public.create_project_activity(
      (select id from scoped_project), 'Actividad Manager Cancelable', null,
      '2026-08-29T14:00:00Z', null, null
    )
  $query$,
  'scoped project manager creates another activity for cancellation'
);
select lives_ok(
  $$select * from public.cancel_project_activity((select id from scoped_project), (select id from manager_cancel_activity))$$,
  'scoped project manager cancels its scheduled activity'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from foreign_project), 'Fuera de scope', null,
      statement_timestamp(), null, null
    )
  $query$,
  '42501',
  'permission_denied',
  'manager cannot create activity in another project'
);
select throws_ok(
  $$select * from public.list_project_activities((select id from foreign_project))$$,
  '42501',
  'permission_denied',
  'manager cannot read activities in another project'
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
    select * from public.create_project_activity(
      (select id from scoped_project), 'Sin permiso', null,
      statement_timestamp(), null, null
    )
  $query$,
  '42501',
  'permission_denied',
  'manager without contextual mutation permission is denied'
);

reset role;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code = 'project.manage_assigned';
update public.accounts
set status = 'suspended', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activities((select id from scoped_project))$$,
  '42501',
  'permission_denied',
  'suspended manager cannot read project activities'
);

reset role;
update public.accounts
set status = 'archived', status_changed_at = statement_timestamp()
where auth_user_id = '00000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activities((select id from scoped_project))$$,
  '42501',
  'permission_denied',
  'archived manager cannot read project activities'
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
  $$select * from public.list_project_activities((select id from scoped_project))$$,
  '42501',
  'permission_denied',
  'manager without active role cannot read project activities'
);

reset role;
insert into public.user_roles (user_id, role_id)
select '00000000-0000-4000-8000-000000000007', role.id
from public.roles as role
where role.code = 'project_manager';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.close_project((select id from scoped_project))$$,
  'administrator closes project after manager terminalizes all activities'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.list_project_activities((select id from scoped_project))$$,
  'manager with retained scope reads closed project activity history'
);
select throws_ok(
  $query$
    select * from public.create_project_activity(
      (select id from scoped_project), 'Cerrada', null,
      statement_timestamp(), null, null
    )
  $query$,
  '23514',
  'project_closed',
  'manager retained scope cannot mutate a closed project'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.finish_project_manager_assignment((select assignment_id from manager_scope))$$,
  'administrator ends manager scope without changing historical activities'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_project_activities((select id from scoped_project))$$,
  '42501',
  'permission_denied',
  'ended scope immediately denies historical activity reads'
);

reset role;
select * from finish();
rollback;
