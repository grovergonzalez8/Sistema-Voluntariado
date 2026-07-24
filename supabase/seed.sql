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
  ('project.manage', 'Administrar proyectos'),
  ('project.propose_assignment', 'Proponer asignación de proyecto'),
  ('project.approve_assignment', 'Aprobar asignación de proyecto'),
  ('activity.create', 'Crear actividades'),
  ('activity.join', 'Unirse a actividades'),
  ('task.assign', 'Asignar tareas'),
  ('task.complete', 'Completar tareas'),
  ('payment.read_self', 'Consultar pagos propios'),
  ('payment.manage', 'Administrar pagos'),
  ('audit.read', 'Consultar auditoría')
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
    'project.manage',
    'project.propose_assignment',
    'project.approve_assignment',
    'activity.create',
    'activity.join',
    'task.assign',
    'task.complete',
    'payment.read_self',
    'payment.manage',
    'audit.read'
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
  'administrator@example.invalid'
)
on conflict (provider_id, provider) do nothing;

insert into public.user_roles (user_id, role_id)
select fixture.user_id, r.id
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'volunteer'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'volunteer'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'administrator')
) as fixture(user_id, role_code)
inner join public.roles as r on r.code = fixture.role_code
on conflict do nothing;
