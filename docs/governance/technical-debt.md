# Registro de deuda técnica

| ID     | Deuda                                                 | Motivo                                                                                                                           | Condición para resolver                               |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| TD-001 | Perfil usa last-write-wins                            | Un solo formulario y baja concurrencia esperada                                                                                  | Evidencia de ediciones simultáneas                    |
| TD-003 | Roles intermedios sin permisos                        | Matriz de negocio no aprobada                                                                                                    | Decisión del propietario                              |
| TD-004 | Contacto de seguridad no publicado                    | Canal organizacional desconocido                                                                                                 | Propietario designa contacto                          |
| TD-005 | Sin CSP de producción                                 | No existe despliegue                                                                                                             | Diseñar Cloudflare headers                            |
| TD-006 | Sin invalidación global de refresh tokens al bloquear | RLS corta acceso inmediato y no existe operación productiva                                                                      | decidir política de sesión y Auth Admin               |
| TD-007 | Reconciliación Auth/DB sin panel operativo            | Hito local expone estado/auditoría pero no runbook automatizado                                                                  | observabilidad y operación productiva                 |
| TD-008 | Scope coordinator basado solo en actor origen         | Projects V1 ya tiene scope explícito para managers; `project.manage` sigue global y faltan límites contextuales para otros roles | modelar scopes adicionales solo con requisitos reales |
| TD-009 | TTL/rate limit de invitación son locales              | Falta política de entrega productiva                                                                                             | aprobar SMTP, retención, cuota y expiración           |
| TD-010 | Project Detail conserva secciones históricas extensas | Activities quedó extraída, pero participaciones/managers mantienen la página cerca de su límite de revisión                      | extraer por slice solo cuando vuelva a crecer         |

La deuda no autoriza pantallas falsas ni controles de seguridad incompletos.
