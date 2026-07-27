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

| Área                       | Permisos registrados                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Perfil                     | `volunteer.read_self`, `volunteer.update_self`, `volunteer.read_basic_others`                                             |
| Alojamiento futuro         | `accommodation.read_self`, `accommodation.propose_assignment`, `accommodation.approve_assignment`, `accommodation.manage` |
| Proyectos futuros          | `project.read_assigned`, `project.manage`, `project.propose_assignment`, `project.approve_assignment`                     |
| Actividades/tareas futuras | `activity.create`, `activity.join`, `task.assign`, `task.complete`                                                        |
| Finanzas futuras           | `payment.read_self`, `payment.manage`                                                                                     |
| Invitaciones               | `invitation.read`, `invitation.create`, `invitation.revoke`, `invitation.resend`                                          |
| Cuentas                    | `account.read`, `account.activate`, `account.suspend`, `account.archive`, `account.reactivate`                            |
| Roles                      | `role_assignment.read`, `role_assignment.manage`                                                                          |
| Auditoría                  | `audit.read`                                                                                                              |

## Concesiones implementadas

- `volunteer`: `volunteer.read_self` y `volunteer.update_self`.
- `coordinator`: lectura/creación de invitaciones, lectura de cuentas y roles, siempre dentro de cuentas originadas por sus propias invitaciones. Solo puede invitar con rol inicial `volunteer`.
- `administrator`: cada permiso del catálogo se concede explícitamente; no existe comodín.
- `accommodation_manager`, `project_manager` y `finance`: no reciben administración de cuentas en este hito. Una persona puede acumular `volunteer` para usar el perfil propio.

## Política de concesión

`role_grant_policies` expresa por fila `actor_role_id`, `target_role_id`, `can_grant`, `can_revoke`, vigencia y trazabilidad. Tener `role_assignment.manage` no basta: al menos un rol activo del actor debe tener una policy activa para la operación y rol objetivo. En este hito solo `administrator` tiene policies para los seis roles.

Las RPC niegan autoasignación/autorretiro, cambios sobre cuentas no activas, escritura directa de `user_roles`, escalamiento fuera de policy y cualquier operación que elimine el último administrador activo. `role_permissions` y `role_grant_policies` no son editables desde el navegador.

`volunteer.read_basic_others` se registra pero no se expone sobre `profiles`: RLS filtra filas, no columnas. Una futura vista o RPC deberá proyectar solo campos aprobados.
