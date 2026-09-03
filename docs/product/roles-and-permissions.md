# Roles y permisos

## Modelo

Los permisos efectivos son la unión de concesiones explícitas de todos los roles de una cuenta. No hay denegaciones ni comodines iniciales. PostgreSQL consulta las relaciones actuales; el cliente y los metadatos del usuario no son autoridad.

## Roles iniciales

- `volunteer`
- `coordinator`
- `accommodation_manager`
- `project_manager`
- `finance`
- `administrator`

Una cuenta solo obtiene permisos efectivos cuando `accounts.status = 'active'`. Suspender o archivar conserva sus asignaciones, pero PostgreSQL deja de reconocerlas hasta una reactivación autorizada.

## Catálogo

| Área                    | Permisos registrados                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfil                  | `volunteer.read_self`, `volunteer.update_self`, `volunteer.read_basic_others`                                                                 |
| Alojamiento futuro      | `accommodation.read_self`, `accommodation.propose_assignment`, `accommodation.approve_assignment`, `accommodation.manage`                     |
| Proyectos               | `project.read_assigned`, `project.manage_assigned`, `project.manage`, `project.propose_assignment`, `project.approve_assignment`              |
| Placeholders históricos | `activity.create`, `activity.join`, `task.assign`, `task.complete`                                                                            |
| Finanzas futuras        | `payment.read_self`, `payment.manage`                                                                                                         |
| Invitaciones            | `invitation.read`, `invitation.create`, `invitation.revoke`, `invitation.resend`                                                              |
| Cuentas                 | `account.read`, `account.activate`, `account.suspend`, `account.archive`, `account.reactivate`                                                |
| Roles                   | `role_assignment.read`, `role_assignment.manage`                                                                                              |
| Auditoría               | `audit.read`                                                                                                                                  |
| Padrón de voluntarios   | `volunteer_registry.read`, `volunteer_registry.create`, `volunteer_registry.update`, `volunteer_registry.import`, `volunteer_registry.export` |

## Concesiones implementadas

- `volunteer`: `volunteer.read_self` y `volunteer.update_self`.
- `coordinator`: lectura/creación de invitaciones, lectura de cuentas y roles, siempre dentro de cuentas originadas por sus propias invitaciones. Solo puede invitar con rol inicial `volunteer`.
- `project_manager`: `project.read_assigned` y `project.manage_assigned`; ambos solo son efectivos dentro de un scope activo y junto con cuenta activa y rol vigente.
- `administrator`: cada permiso del catálogo se concede explícitamente; no existe comodín. Projects usa `project.manage` como autoridad global.
- `accommodation_manager` y `finance`: no reciben administración de cuentas en este hito. Una persona puede acumular `volunteer` para usar el perfil propio.

## Política de concesión

`role_grant_policies` expresa por fila `actor_role_id`, `target_role_id`, `can_grant`, `can_revoke`, vigencia y trazabilidad. Tener `role_assignment.manage` no basta: al menos un rol activo del actor debe tener una policy activa para la operación y rol objetivo. En este hito solo `administrator` tiene policies para los seis roles.

Las RPC niegan autoasignación/autorretiro, cambios sobre cuentas no activas, escritura directa de `user_roles`, escalamiento fuera de policy y cualquier operación que elimine el último administrador activo. `role_permissions` y `role_grant_policies` no son editables desde el navegador.

`volunteer.read_basic_others` se registra pero no se expone sobre `profiles`: RLS filtra filas, no columnas. Una futura vista o RPC deberá proyectar solo campos aprobados.

Los cinco permisos `volunteer_registry.*` se conceden exclusivamente a `administrator`. Coordinator y los demás roles no reciben acceso al padrón; la autoridad se decide por capacidades efectivas, no por una comprobación de nombre de rol paralela.

Projects conserva `project.manage` exclusivamente para `administrator`: alta/cierre, consulta inversa desde Volunteers y administración de managers siguen siendo globales. `project_manager` usa `project.read_assigned` y `project.manage_assigned` solo cuando PostgreSQL confirma cuenta activa, rol vigente y scope activo para el proyecto. `project.propose_assignment` y `project.approve_assignment` permanecen registrados pero no se usan. Coordinator y voluntarios no reciben acceso.

Project Activities y Activity Participation heredan exactamente esa autoridad del Project. Administrator usa `project.manage`; un manager contextual usa `project.read_assigned` para consultar y `project.manage_assigned` para crear, editar, completar o cancelar Activities y para buscar candidatos, agregar o finalizar Participations dentro de su scope vigente. La elegibilidad del Volunteer se decide aparte mediante su Project Volunteer Assignment activa hacia el Project exacto. `activity.create` y `activity.join` siguen siendo placeholders sin uso funcional: no autorizan RPC, UI ni acceso directo y no se reinterpretan en estas V1. Tasks, attendance, RSVP y self-join continúan fuera de alcance.
