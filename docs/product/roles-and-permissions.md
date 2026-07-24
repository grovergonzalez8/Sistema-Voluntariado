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

## Catálogo inicial

| Área                       | Permisos registrados                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Perfil                     | `volunteer.read_self`, `volunteer.update_self`, `volunteer.read_basic_others`                                             |
| Alojamiento futuro         | `accommodation.read_self`, `accommodation.propose_assignment`, `accommodation.approve_assignment`, `accommodation.manage` |
| Proyectos futuros          | `project.read_assigned`, `project.manage`, `project.propose_assignment`, `project.approve_assignment`                     |
| Actividades/tareas futuras | `activity.create`, `activity.join`, `task.assign`, `task.complete`                                                        |
| Finanzas futuras           | `payment.read_self`, `payment.manage`                                                                                     |
| Auditoría                  | `audit.read`                                                                                                              |

## Concesiones implementadas

- `volunteer`: `volunteer.read_self` y `volunteer.update_self`.
- `administrator`: cada permiso del catálogo se concede explícitamente; no existe comodín.
- Los otros roles se crean sin concesiones hasta aprobar la matriz. Una persona que necesite perfil propio puede acumular el rol `volunteer`.

`volunteer.read_basic_others` se registra pero no se expone sobre `profiles`: RLS filtra filas, no columnas. Una futura vista o RPC deberá proyectar solo campos aprobados.
