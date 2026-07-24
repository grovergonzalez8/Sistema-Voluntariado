begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);
select set_config(
  'test.audit_log_baseline_at',
  clock_timestamp()::text,
  true
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000005',
  'authenticated',
  'authenticated',
  'profile-trigger@example.invalid',
  extensions.crypt('local-test-only-not-a-secret', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  statement_timestamp(),
  statement_timestamp(),
  '',
  '',
  '',
  ''
);
select is(
  (
    select count(*)
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000005'
  ),
  1::bigint,
  'creating an Auth user provisions one minimal profile'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot read profiles'
);
select throws_ok(
  $$select public.has_permission('volunteer.read_self')$$,
  '42501',
  'permission denied for function has_permission',
  'anonymous users cannot execute the permission helper'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'a provisioned user reads exactly their own profile'
);
select is(
  (
    select count(*)
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'a user cannot read another profile'
);
select ok(
  public.has_permission('volunteer.update_self'),
  'effective permissions are resolved for the current user'
);
select lives_ok(
  $$
    update public.profiles
    set display_name = 'Perfil local A'
    where id = '00000000-0000-4000-8000-000000000001'
  $$,
  'a user can update an allowed field on their own profile'
);
select is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  'Perfil local A',
  'the allowed update is persisted'
);
select lives_ok(
  $$
    update public.profiles
    set preferred_locale = 'en'
    where id = '00000000-0000-4000-8000-000000000001'
  $$,
  'a user can update their preferred locale'
);
select is(
  (
    select preferred_locale
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  'en',
  'the preferred locale update is persisted'
);
select results_eq(
  $$
    with changed as (
      update public.profiles
      set display_name = 'Intento horizontal'
      where id = '00000000-0000-4000-8000-000000000002'
      returning 1
    )
    select count(*) from changed
  $$,
  $$values (0::bigint)$$,
  'RLS prevents horizontal profile updates'
);
select throws_ok(
  $$
    update public.profiles
    set archived_at = statement_timestamp()
    where id = '00000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table profiles',
  'column privileges reject protected profile fields'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('volunteer.read_self'),
  false,
  'an unprovisioned user has no implicit permission'
);
select is(
  (select count(*) from public.profiles),
  0::bigint,
  'an unprovisioned user cannot read even their profile'
);

reset role;
update public.profiles
set archived_at = statement_timestamp()
where id = '00000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    with changed as (
      update public.profiles
      set display_name = 'Perfil archivado'
      where id = '00000000-0000-4000-8000-000000000001'
      returning 1
    )
    select count(*) from changed
  $$,
  $$values (0::bigint)$$,
  'an archived profile cannot be updated by its owner'
);

reset role;
update public.profiles
set archived_at = null
where id = '00000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$insert into public.roles (code, description) values ('forged', 'forged')$$,
  '42501',
  'permission denied for table roles',
  'a client cannot create roles'
);
select throws_ok(
  $$
    insert into public.permissions (code, description)
    values ('forged.permission', 'forged')
  $$,
  '42501',
  'permission denied for table permissions',
  'a client cannot create permissions'
);
select throws_ok(
  $$
    insert into public.role_permissions (role_id, permission_id)
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'permission denied for table role_permissions',
  'a client cannot grant a permission to a role'
);
select throws_ok(
  $$
    insert into public.user_roles (user_id, role_id)
    select
      '00000000-0000-4000-8000-000000000001',
      id
    from public.roles
    where code = 'administrator'
  $$,
  '42501',
  'permission denied for table user_roles',
  'a client cannot grant itself a role'
);
select throws_ok(
  $$
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields
    )
    values (
      '00000000-0000-4000-8000-000000000001',
      'profile.updated',
      'profile',
      '00000000-0000-4000-8000-000000000001',
      array['display_name']
    )
  $$,
  '42501',
  'permission denied for table audit_logs',
  'a client cannot forge audit records'
);
select is(
  (select count(*) from public.audit_logs),
  0::bigint,
  'audit logs are not visible without audit.read'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select cmp_ok(
  (select count(*) from public.audit_logs),
  '>',
  0::bigint,
  'audit.read grants visibility to audit metadata'
);
select is(
  (
    select changed_fields
    from public.audit_logs
    where entity_id = '00000000-0000-4000-8000-000000000001'
      and action = 'profile.updated'
      and created_at > current_setting('test.audit_log_baseline_at')::timestamptz
    order by created_at
    limit 1
  ),
  array['display_name'],
  'audit records contain field names, not profile values'
);
select ok(
  public.has_permission('audit.read'),
  'administrator permission is an explicit grant'
);
select is(
  public.has_permission('permission.that_does_not_exist'),
  false,
  'unknown permissions are denied'
);

reset role;
update public.profiles
set archived_at = statement_timestamp()
where id = '00000000-0000-4000-8000-000000000004';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('audit.read'),
  false,
  'an archived account has no effective permissions'
);
select is(
  (select count(*) from public.audit_logs),
  0::bigint,
  'an archived account cannot read audit metadata'
);

reset role;
select * from finish();
rollback;
