begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(92);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.accounts'::regclass),
  'accounts enables RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass),
  'invitations enables RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.account_status_history'::regclass),
  'account history enables RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.role_grant_policies'::regclass),
  'role grant policies enable RLS'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.accounts$$,
  '42501',
  'permission denied for table accounts',
  'anonymous users cannot read accounts'
);
select throws_ok(
  $$select count(*) from public.invitations$$,
  '42501',
  'permission denied for table invitations',
  'anonymous users cannot read invitations'
);
select throws_ok(
  $$select * from public.get_my_account_context()$$,
  '42501',
  'permission denied for function get_my_account_context',
  'anonymous users cannot inspect account context'
);
select throws_ok(
  $$select * from public.accept_current_account_invitation()$$,
  '42501',
  'permission denied for function accept_current_account_invitation',
  'anonymous users cannot accept invitations'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select account_status from public.get_my_account_context()),
  'active',
  'an active volunteer receives an active account context'
);
select ok(
  (select 'volunteer.read_self' = any(permissions) from public.get_my_account_context()),
  'an active account context contains effective permissions'
);
select throws_ok(
  $$select count(*) from public.accounts$$,
  '42501',
  'permission denied for table accounts',
  'authenticated users have no direct accounts access'
);
select throws_ok(
  $$select count(*) from public.account_status_history$$,
  '42501',
  'permission denied for table account_status_history',
  'authenticated users have no direct history access'
);
select throws_ok(
  $$select * from public.list_accounts('', 50, 0)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot use account administration projections'
);
select throws_ok(
  $$
    select * from public.prepare_account_invitation(
      'blocked@example.invalid', null, 'es', 'volunteer',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'permission_denied',
  'a volunteer cannot create invitations'
);
select throws_ok(
  $$delete from public.user_roles where false$$,
  '42501',
  'permission denied for table user_roles',
  'authenticated clients cannot delete role assignments directly'
);
select throws_ok(
  $$update public.role_grant_policies set is_active = false$$,
  '42501',
  'permission denied for table role_grant_policies',
  'authenticated clients cannot modify role grant policies directly'
);
select throws_ok(
  $$update public.audit_logs set action = 'forged.action'$$,
  '42501',
  'permission denied for table audit_logs',
  'authenticated clients cannot update audit logs'
);
select throws_ok(
  $$delete from public.audit_logs$$,
  '42501',
  'permission denied for table audit_logs',
  'authenticated clients cannot delete audit logs'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.has_permission('invitation.create'),
  'a coordinator has the explicit invitation.create permission'
);
select is(
  public.has_permission('invitation.resend'),
  false,
  'a coordinator has no invitation.resend permission'
);
select lives_ok(
  $$
    create temporary table test_coordinator_invitation as
    select * from public.prepare_account_invitation(
      '  Coordinator.Invite+tag@Example.Invalid  ', ' Persona Invitada ',
      'es', 'volunteer', '30000000-0000-4000-8000-000000000002'
    )
  $$,
  'a coordinator can reserve a volunteer invitation'
);
select is(
  (select normalized_email from test_coordinator_invitation),
  'coordinator.invite+tag@example.invalid',
  'email normalization preserves dots and plus tags'
);
select is(
  (select invitation_status from test_coordinator_invitation),
  'pending',
  'a new invitation starts pending delivery'
);
select ok(
  (select should_deliver from test_coordinator_invitation),
  'a new reservation owns a delivery lease'
);
select is(
  (
    select invitation_id
    from public.prepare_account_invitation(
      'coordinator.invite+tag@example.invalid', 'Persona Invitada',
      'es', 'volunteer', '30000000-0000-4000-8000-000000000002'
    )
  ),
  (select invitation_id from test_coordinator_invitation),
  'same idempotency key and fingerprint returns the same invitation'
);
select is(
  (
    select should_deliver
    from public.prepare_account_invitation(
      'coordinator.invite+tag@example.invalid',
      'Persona Invitada',
      'es',
      'volunteer',
      '30000000-0000-4000-8000-000000000002'
    )
  ),
  false,
  'an idempotent replay cannot reuse an in-flight delivery lease'
);
select throws_ok(
  $$
    select * from public.prepare_account_invitation(
      'different@example.invalid', 'Persona Invitada', 'es', 'volunteer',
      '30000000-0000-4000-8000-000000000002'
    )
  $$,
  '23505',
  'idempotency_conflict',
  'same idempotency key with another payload is rejected'
);
select throws_ok(
  $$
    select * from public.prepare_account_invitation(
      'coordinator-admin@example.invalid', null, 'es', 'administrator',
      '30000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'role_grant_denied',
  'a coordinator cannot invite an administrator'
);
select is(
  (select count(*) from public.list_account_invitations()),
  1::bigint,
  'a coordinator lists only invitations they originated'
);
select is(
  (
    select jsonb_array_length(audit)
    from public.get_account_detail(
      (select account_id from test_coordinator_invitation)
    )
  ),
  0,
  'a coordinator with account.read but no audit.read receives no audit projection'
);
select is(
  (
    select jsonb_array_length(grantable_roles)
    from public.get_account_detail(
      (select account_id from test_coordinator_invitation)
    )
  ),
  0,
  'a coordinator without role_assignment.manage receives no grantable roles'
);
select throws_ok(
  format(
    'select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_invitation),
    'resend',
    '30000000-0000-4000-8000-000000000004'
  ),
  '42501',
  'permission_denied',
  'a coordinator cannot resend invitations'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.has_permission('role_assignment.manage'),
  'an administrator has role assignment authority'
);
select lives_ok(
  $$
    create temporary table test_admin_invitation as
    select * from public.prepare_account_invitation(
      'onboarding@example.invalid', 'Onboarding Local', 'en', 'volunteer',
      '30000000-0000-4000-8000-000000000005'
    )
  $$,
  'an administrator can reserve an invitation'
);
select is(
  (
    select id
    from public.get_account_invitation_detail(
      (select invitation_id from test_admin_invitation)
    )
  ),
  (select invitation_id from test_admin_invitation),
  'an administrator can consult an authorized invitation detail'
);
select cmp_ok(
  (select count(*) from public.list_account_invitations()),
  '>=',
  2::bigint,
  'an administrator lists invitations globally'
);
reset role;
update public.invitations
set status = 'sent',
    sent_at = statement_timestamp(),
    expires_at = statement_timestamp() + interval '1 hour',
    delivery_attempt_id = null,
    delivery_attempted_at = null,
    delivery_actor_user_id = null,
    delivery_correlation_id = null
where id = (select invitation_id from test_coordinator_invitation);
set local role authenticated;
select lives_ok(
  format(
    'create temporary table test_cross_actor_resend as
     select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_invitation),
    'resend',
    '30000000-0000-4000-8000-000000000026'
  ),
  'an administrator can claim a resend created by a coordinator'
);
select is(
  (select should_deliver from test_cross_actor_resend),
  true,
  'the first cross-actor resend owns the delivery lease'
);
select is(
  (
    select should_deliver
    from public.prepare_account_invitation_action(
      (select invitation_id from test_coordinator_invitation),
      'resend',
      '30000000-0000-4000-8000-000000000027',
      null
    )
  ),
  false,
  'a different idempotency key cannot overwrite an active delivery lease'
);
reset role;
select set_config(
  'test.cross_actor_invitation_id',
  (select invitation_id::text from test_cross_actor_resend),
  true
);
select set_config(
  'test.cross_actor_attempt_id',
  (select delivery_attempt_id::text from test_cross_actor_resend),
  true
);
set local role service_role;
select lives_ok(
  $$
    select * from public.finalize_account_invitation_delivery(
      current_setting('test.cross_actor_invitation_id')::uuid,
      current_setting('test.cross_actor_attempt_id')::uuid,
      null,
      false,
      'provider_unavailable'
    )
  $$,
  'service role finalizes the lease owned by the resending administrator'
);
reset role;
select is(
  (
    select actor_user_id
    from public.audit_logs
    where entity_id = current_setting('test.cross_actor_invitation_id')::uuid
      and action = 'invitation.resend_failed'
    order by created_at desc
    limit 1
  ),
  '00000000-0000-4000-8000-000000000004'::uuid,
  'resend audit records the delivery actor rather than the invitation creator'
);
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000102',
  'authenticated', 'authenticated', 'coordinator.invite+tag@example.invalid',
  extensions.crypt('local-test-only-not-a-secret', extensions.gen_salt('bf')),
  statement_timestamp(), '{"provider":"email","providers":["email"]}',
  jsonb_build_object(
    'account_invitation_id',
    (select invitation_id::text from test_coordinator_invitation)
  ),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_invitation),
    'replace',
    '30000000-0000-4000-8000-000000000028'
  ),
  '23514',
  'invitation_auth_already_confirmed',
  'replacement fails closed when Auth already confirmed the existing invitation'
);
reset role;
delete from public.profiles
where id = '00000000-0000-4000-8000-000000000102';
delete from auth.users
where id = '00000000-0000-4000-8000-000000000102';
set local role authenticated;
select lives_ok(
  format(
    'create temporary table test_coordinator_replacement as
     select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_invitation),
    'replace',
    '30000000-0000-4000-8000-000000000006'
  ),
  'an administrator can replace an open invitation'
);
reset role;
select is(
  (
    select status
    from public.invitations
    where id = (select invitation_id from test_coordinator_invitation)
  ),
  'superseded',
  'replacement closes the source invitation as superseded'
);
select is(
  (
    select superseded_by
    from public.invitations
    where id = (select invitation_id from test_coordinator_invitation)
  ),
  (select invitation_id from test_coordinator_replacement),
  'replacement links the source to its successor'
);
set local role authenticated;
select is(
  (
    select should_deliver
    from public.prepare_account_invitation_action(
      (select invitation_id from test_coordinator_invitation),
      'replace',
      '30000000-0000-4000-8000-000000000006',
      null
    )
  ),
  false,
  'replacement replay cannot reuse an active delivery lease'
);

reset role;
update public.invitations
set delivery_attempted_at = statement_timestamp() - interval '3 minutes'
where id = (select invitation_id from test_coordinator_replacement);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select should_deliver
    from public.prepare_account_invitation_action(
      (select invitation_id from test_coordinator_invitation),
      'replace',
      '30000000-0000-4000-8000-000000000006',
      null
    )
  ),
  'an expired replacement lease can be reclaimed idempotently'
);
select throws_ok(
  format(
    'select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_invitation),
    'replace',
    '30000000-0000-4000-8000-000000000007'
  ),
  '23514',
  'invitation_not_replaceable',
  'a superseded historical invitation cannot be reopened'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select exists (
      select 1
      from public.list_account_invitations()
      where id = (select invitation_id from test_coordinator_replacement)
    )
  ),
  'coordinator scope follows account origin across administrator replacement'
);
select throws_ok(
  format(
    'select * from public.get_account_invitation_detail(%L)',
    (select invitation_id from test_admin_invitation)
  ),
  'P0002',
  'invitation_not_found',
  'a coordinator cannot consult an invitation outside their origin scope'
);

reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000101',
  'authenticated', 'authenticated', 'onboarding@example.invalid',
  extensions.crypt('local-test-only-not-a-secret', extensions.gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  (
    select jsonb_build_object(
      'account_invitation_id',
      invitation_id::text
    )
    from test_admin_invitation
  ),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
);
select set_config(
  'test.invitation_id',
  (select invitation_id::text from test_admin_invitation),
  true
);
select set_config(
  'test.delivery_attempt_id',
  (select delivery_attempt_id::text from test_admin_invitation),
  true
);
select set_config(
  'test.onboarding_account_id',
  (select account_id::text from test_admin_invitation),
  true
);

update auth.users
set raw_user_meta_data = jsonb_build_object(
  'account_invitation_id',
  '00000000-0000-4000-8000-000000000999'
)
where id = '00000000-0000-4000-8000-000000000101';
set local role service_role;
select throws_ok(
  $$
    select * from public.finalize_account_invitation_delivery(
      current_setting('test.invitation_id')::uuid,
      current_setting('test.delivery_attempt_id')::uuid,
      '00000000-0000-4000-8000-000000000101',
      true,
      null
    )
  $$,
  '23514',
  'auth_user_reconciliation_mismatch',
  'delivery finalization rejects mismatched invitation metadata even before confirmation'
);
reset role;
update auth.users
set raw_user_meta_data = jsonb_build_object(
  'account_invitation_id',
  current_setting('test.invitation_id')
)
where id = '00000000-0000-4000-8000-000000000101';
set local role service_role;
select lives_ok(
  $$
    select * from public.finalize_account_invitation_delivery(
      current_setting('test.invitation_id')::uuid,
      current_setting('test.delivery_attempt_id')::uuid,
      '00000000-0000-4000-8000-000000000101',
      true,
      null
    )
  $$,
  'service role can finalize an exact delivery lease'
);
select throws_ok(
  $$
    select * from public.finalize_account_invitation_delivery(
      current_setting('test.invitation_id')::uuid,
      current_setting('test.delivery_attempt_id')::uuid,
      '00000000-0000-4000-8000-000000000101',
      true,
      null
    )
  $$,
  '23514',
  'delivery_lease_mismatch',
  'a consumed delivery lease cannot be replayed'
);
select throws_ok(
  $$
    select * from public.finalize_account_invitation_delivery(
      current_setting('test.invitation_id')::uuid,
      null,
      '00000000-0000-4000-8000-000000000101',
      true,
      null
    )
  $$,
  '22023',
  'delivery_lease_required',
  'a null delivery lease is always rejected'
);

reset role;
set constraints all immediate;
select throws_ok(
  format(
    'update public.invitations set auth_user_id = null where id = %L',
    current_setting('test.invitation_id')::uuid
  ),
  '23514',
  'invitation_auth_link_cannot_be_cleared',
  'a linked invitation Auth snapshot cannot be cleared unilaterally'
);
select throws_ok(
  format(
    'update public.accounts set auth_user_id = null where id = %L',
    current_setting('test.onboarding_account_id')::uuid
  ),
  '23514',
  'account_auth_link_mismatch',
  'a linked account Auth identity cannot be cleared unilaterally'
);
set constraints all deferred;
select is(
  (
    select account.auth_user_id
    from public.accounts as account
    where account.id = (select account_id from test_admin_invitation)
  ),
  '00000000-0000-4000-8000-000000000101'::uuid,
  'delivery finalization links the reserved account to Auth'
);
select is(
  (
    select invitation.status
    from public.invitations as invitation
    where invitation.id = current_setting('test.invitation_id')::uuid
  ),
  'sent',
  'successful delivery transitions the invitation to sent'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select account_status from public.accept_current_account_invitation()),
  'pending_profile',
  'the invited identity can accept its sent invitation'
);
select is(
  (select cardinality(permissions) from public.get_my_account_context()),
  0,
  'pending_profile has no effective RBAC permissions'
);
select throws_ok(
  $$select * from public.accept_current_account_invitation()$$,
  '23514',
  'invitation_used',
  'an accepted invitation cannot be consumed twice'
);
select is(
  (
    select account_status
    from public.complete_current_account_profile('Persona Activada', 'en')
  ),
  'active',
  'profile completion activates the pending account'
);
select ok(
  public.has_permission('volunteer.read_self'),
  'activation applies the protected initial role snapshot'
);
select is(
  (
    select account_status
    from public.complete_current_account_profile('Ignorado tras activar', 'es')
  ),
  'active',
  'profile completion is idempotent after activation'
);

reset role;
update public.accounts
set status = 'invited'
where id = current_setting('test.onboarding_account_id')::uuid;
update public.invitations
set status = 'revoked'
where id = current_setting('test.invitation_id')::uuid;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.accept_current_account_invitation()$$,
  '23514',
  'invitation_revoked',
  'a revoked invitation cannot be accepted'
);

reset role;
update public.invitations
set status = 'superseded'
where id = current_setting('test.invitation_id')::uuid;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.accept_current_account_invitation()$$,
  '23514',
  'invitation_superseded',
  'a superseded invitation cannot be accepted'
);

reset role;
update public.accounts
set status = 'active'
where id = current_setting('test.onboarding_account_id')::uuid;
update public.invitations
set status = 'accepted'
where id = current_setting('test.invitation_id')::uuid;

reset role;
select set_config(
  'test.admin_account_id',
  (
    select id::text
    from public.accounts
    where auth_user_id = '00000000-0000-4000-8000-000000000004'
  ),
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.manage_account_role(
      current_setting('test.admin_account_id')::uuid,
      'volunteer',
      'grant'
    )
  $$,
  '42501',
  'self_role_change_denied',
  'administrators cannot change their own roles'
);

reset role;
update public.accounts
set status = 'pending_profile'
where id = current_setting('test.onboarding_account_id')::uuid;
delete from public.user_roles
where user_id = '00000000-0000-4000-8000-000000000101';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.onboarding_account_id')::uuid,
      'active',
      'Recuperación administrativa del perfil'
    )
  $$,
  'an administrator can recover a completed pending profile'
);
select ok(
  (
    select 'volunteer' = any(roles)
    from public.get_account_detail(
      current_setting('test.onboarding_account_id')::uuid
    )
  ),
  'administrative recovery restores the protected accepted-invitation role'
);
select lives_ok(
  $$
    select * from public.manage_account_role(
      current_setting('test.onboarding_account_id')::uuid,
      'coordinator',
      'grant'
    )
  $$,
  'an administrator can grant an allowed role to another active account'
);
select ok(
  (
    select 'coordinator' = any(roles)
    from public.get_account_detail(
      current_setting('test.onboarding_account_id')::uuid
    )
  ),
  'the granted role becomes effective immediately'
);
select lives_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.onboarding_account_id')::uuid,
      'suspended',
      'Suspensión pgTAP autorizada'
    )
  $$,
  'an administrator can suspend another active account'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select cardinality(permissions) from public.get_my_account_context()),
  0,
  'suspension removes effective permissions without deleting roles'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.manage_account_role(
      current_setting('test.onboarding_account_id')::uuid,
      'coordinator',
      'revoke'
    )
  $$,
  '23514',
  'account_roles_frozen',
  'roles are frozen while an account is suspended'
);
select lives_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.onboarding_account_id')::uuid,
      'active',
      'Reactivación pgTAP autorizada'
    )
  $$,
  'an administrator can reactivate a complete account'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select 'volunteer.read_self' = any(permissions)
    from public.get_my_account_context()
  ),
  'reactivation restores permissions from preserved roles'
);

reset role;
delete from public.user_roles
where user_id = '00000000-0000-4000-8000-000000000101';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.onboarding_account_id')::uuid,
      'suspended',
      'Suspensión de cuenta sin roles'
    )
  $$,
  'an active account without roles can be suspended'
);
select lives_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.onboarding_account_id')::uuid,
      'active',
      'Reactivación de cuenta sin roles'
    )
  $$,
  'a suspended account without roles can be reactivated'
);
select is(
  (
    select cardinality(roles)
    from public.get_account_detail(
      current_setting('test.onboarding_account_id')::uuid
    )
  ),
  0,
  'roleless reactivation preserves the empty role set'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.change_account_status(
      current_setting('test.admin_account_id')::uuid,
      'archived',
      'No debe quedar sin administración'
    )
  $$,
  '23514',
  'last_active_administrator',
  'the last active administrator cannot archive itself'
);
select is(
  (
    select count(*)
    from public.list_accounts('', 100, 0)
    where account_status = 'active'
      and 'administrator' = any(roles)
  ),
  1::bigint,
  'the last administrator invariant leaves one active administrator'
);
select ok(
  (
    select not exists (
      select 1
      from public.audit_logs as audit_log
      where jsonb_typeof(audit_log.metadata) <> 'object'
        or exists (
          select 1
          from jsonb_object_keys(audit_log.metadata) as key_name
          where key_name not in ('reason_code', 'provider_error_code')
        )
    )
  ),
  'all audit metadata satisfies the safe allowlist'
);
select is(
  (
    select count(*)
    from public.audit_logs
    where metadata::text ~* '(email|token|password|secret)'
  ),
  0::bigint,
  'audit metadata contains no email, token, password, or secret keys'
);

reset role;
select lives_ok(
  $$
    update public.invitations
    set created_at = statement_timestamp() - interval '2 hours',
        expires_at = statement_timestamp() - interval '1 hour'
    where id = (select invitation_id from test_coordinator_replacement)
  $$,
  'the test can force an open invitation past its expiry boundary'
);
select is(
  public.expire_open_invitations(
    (select account_id from test_coordinator_invitation),
    null
  ),
  1,
  'expiry materialization closes an overdue invitation exactly once'
);
select is(
  (
    select status
    from public.invitations
    where id = (select invitation_id from test_coordinator_replacement)
  ),
  'expired',
  'an overdue invitation reaches the terminal expired state'
);
select is(
  public.expire_open_invitations(
    (select account_id from test_coordinator_invitation),
    null
  ),
  0,
  'expiry materialization is idempotent'
);
select ok(
  (
    select actor_user_id is null
    from public.audit_logs
    where entity_id = (select invitation_id from test_coordinator_replacement)
      and action = 'invitation.expired'
  ),
  'automatic expiry audit is not attributed to the invitation creator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.prepare_account_invitation(
      'coordinator.invite+tag@example.invalid',
      'Otro registro',
      'es',
      'volunteer',
      '30000000-0000-4000-8000-000000000008'
    )
  $$,
  '23505',
  'email_already_invited',
  'a terminal invitation cannot fork a second account for the same email'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  format(
    'create temporary table test_terminal_replacement as
     select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_replacement),
    'replace',
    '30000000-0000-4000-8000-000000000029'
  ),
  'an administrator can create a successor for an expired invitation'
);
reset role;
select ok(
  (
    select predecessor.status = 'expired'
      and predecessor.superseded_by = successor.invitation_id
      and successor.invitation_status = 'pending'
    from public.invitations as predecessor
    cross join test_terminal_replacement as successor
    where predecessor.id = (select invitation_id from test_coordinator_replacement)
  ),
  'terminal replacement preserves history and restores one valid invitation'
);
set local role authenticated;
select throws_ok(
  format(
    'select * from public.prepare_account_invitation_action(%L, %L, %L, null)',
    (select invitation_id from test_coordinator_replacement),
    'replace',
    '30000000-0000-4000-8000-000000000030'
  ),
  '23514',
  'invitation_not_replaceable',
  'a terminal ancestor cannot overwrite its existing successor link'
);

select * from finish();
rollback;
