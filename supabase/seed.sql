-- Datos de referencia y cuentas inequívocamente ficticias para Supabase local.
-- La contraseña compartida es un fixture público, no un secreto:
-- local-test-only-not-a-secret

insert into public.roles (code, description)
values
  ('volunteer', 'Persona voluntaria'),
  ('coordinator', 'Coordinación'),
  ('accommodation_manager', 'Gestión de alojamiento'),
  ('project_manager', 'Gestión de proyectos'),
  ('finance', 'Finanzas'),
  ('administrator', 'Administración')
on conflict (code) do update
set description = excluded.description,
    updated_at = statement_timestamp(),
    archived_at = null;

insert into public.permissions (code, description)
values
  ('volunteer.read_self', 'Consultar el perfil propio'),
  ('volunteer.update_self', 'Actualizar campos permitidos del perfil propio'),
  ('volunteer.read_basic_others', 'Consultar perfil básico aprobado de otras personas'),
  ('accommodation.read_self', 'Consultar alojamiento propio'),
  ('accommodation.propose_assignment', 'Proponer asignación de alojamiento'),
  ('accommodation.approve_assignment', 'Aprobar asignación de alojamiento'),
  ('accommodation.manage', 'Administrar alojamiento'),
  ('project.read_assigned', 'Consultar proyectos asignados'),
  ('project.manage_assigned', 'Administrar proyectos asignados'),
  ('project.manage', 'Administrar proyectos y asignaciones de voluntarios'),
  ('project.propose_assignment', 'Proponer asignación de proyecto'),
  ('project.approve_assignment', 'Aprobar asignación de proyecto'),
  ('activity.create', 'Crear actividades'),
  ('activity.join', 'Unirse a actividades'),
  ('task.assign', 'Asignar tareas'),
  ('task.complete', 'Completar tareas'),
  ('payment.read_self', 'Consultar pagos propios'),
  ('payment.manage', 'Administrar pagos'),
  ('invitation.read', 'Consultar invitaciones autorizadas'),
  ('invitation.create', 'Crear invitaciones autorizadas'),
  ('invitation.revoke', 'Revocar invitaciones'),
  ('invitation.resend', 'Reenviar o sustituir invitaciones'),
  ('account.read', 'Consultar cuentas autorizadas'),
  ('account.activate', 'Recuperar onboarding pendiente'),
  ('account.suspend', 'Suspender cuentas'),
  ('account.archive', 'Archivar cuentas'),
  ('account.reactivate', 'Reactivar cuentas'),
  ('role_assignment.read', 'Consultar asignaciones de rol'),
  ('role_assignment.manage', 'Administrar asignaciones de rol'),
  ('audit.read', 'Consultar auditoría'),
  ('volunteer_registry.read', 'Consultar el registro institucional de voluntarios'),
  ('volunteer_registry.create', 'Registrar voluntarios institucionales'),
  ('volunteer_registry.update', 'Actualizar voluntarios institucionales'),
  ('volunteer_registry.import', 'Importar voluntarios institucionales'),
  ('volunteer_registry.export', 'Exportar voluntarios institucionales')
on conflict (code) do update
set description = excluded.description,
    updated_at = statement_timestamp(),
    archived_at = null;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.code = 'volunteer'
  and p.code in ('volunteer.read_self', 'volunteer.update_self')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles as r
cross join public.permissions as p
where r.code = 'administrator'
  and p.code in (
    'volunteer.read_self',
    'volunteer.update_self',
    'volunteer.read_basic_others',
    'accommodation.read_self',
    'accommodation.propose_assignment',
    'accommodation.approve_assignment',
    'accommodation.manage',
    'project.read_assigned',
    'project.manage_assigned',
    'project.manage',
    'project.propose_assignment',
    'project.approve_assignment',
    'activity.create',
    'activity.join',
    'task.assign',
    'task.complete',
    'payment.read_self',
    'payment.manage',
    'invitation.read',
    'invitation.create',
    'invitation.revoke',
    'invitation.resend',
    'account.read',
    'account.activate',
    'account.suspend',
    'account.archive',
    'account.reactivate',
    'role_assignment.read',
    'role_assignment.manage',
    'audit.read',
    'volunteer_registry.read',
    'volunteer_registry.create',
    'volunteer_registry.update',
    'volunteer_registry.import',
    'volunteer_registry.export'
  )
on conflict do nothing;

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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'volunteer-a@example.invalid',
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'volunteer-b@example.invalid',
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'unprovisioned@example.invalid',
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'administrator@example.invalid',
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'coordinator@example.invalid',
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000007',
    'authenticated',
    'authenticated',
    'project-manager@example.invalid',
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
  )
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  extensions.gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  statement_timestamp(),
  statement_timestamp(),
  statement_timestamp()
from auth.users as u
where u.email in (
  'volunteer-a@example.invalid',
  'volunteer-b@example.invalid',
  'unprovisioned@example.invalid',
  'administrator@example.invalid',
  'coordinator@example.invalid',
  'project-manager@example.invalid'
)
on conflict (provider_id, provider) do nothing;

insert into public.user_roles (user_id, role_id)
select fixture.user_id, r.id
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'volunteer'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'volunteer'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'administrator'),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'coordinator'),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'project_manager')
) as fixture(user_id, role_code)
inner join public.roles as r on r.code = fixture.role_code
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'project_manager'
  and permission.code in ('project.read_assigned', 'project.manage_assigned')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'coordinator'
  and permission.code in (
    'volunteer.read_self',
    'volunteer.update_self',
    'invitation.read',
    'invitation.create',
    'account.read',
    'role_assignment.read'
  )
on conflict do nothing;

insert into public.accounts (auth_user_id, status)
select fixture.user_id, 'active'
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid),
    ('00000000-0000-4000-8000-000000000004'::uuid),
    ('00000000-0000-4000-8000-000000000006'::uuid)
) as fixture(user_id)
on conflict (auth_user_id) do update
set status = 'active',
    status_changed_at = statement_timestamp();

insert into public.accounts (id, auth_user_id, status)
values (
  '10000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000007',
  'active'
)
on conflict (auth_user_id) do update
set status = 'active',
    status_changed_at = statement_timestamp();

update public.profiles
set display_name = 'Project Manager Fixture'
where id = '00000000-0000-4000-8000-000000000007';

insert into public.role_grant_policies (
  actor_role_id,
  target_role_id,
  can_grant,
  can_revoke
)
select actor_role.id, target_role.id, true, true
from public.roles as actor_role
cross join public.roles as target_role
where actor_role.code = 'administrator'
on conflict (actor_role_id, target_role_id) do update
set can_grant = excluded.can_grant,
    can_revoke = excluded.can_revoke,
    is_active = true;

insert into public.role_grant_policies (
  actor_role_id,
  target_role_id,
  can_grant,
  can_revoke
)
select actor_role.id, target_role.id, true, false
from public.roles as actor_role
inner join public.roles as target_role on target_role.code = 'volunteer'
where actor_role.code = 'coordinator'
on conflict (actor_role_id, target_role_id) do update
set can_grant = excluded.can_grant,
    can_revoke = excluded.can_revoke,
    is_active = true;
