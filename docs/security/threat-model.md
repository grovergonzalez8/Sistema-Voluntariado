# Modelo de amenazas

## Activos y fronteras

Activos: identidades Auth, cuentas, invitaciones, perfiles mínimos, padrón administrativo de voluntarios, proyectos/participaciones/Activities históricas, roles/policies/permisos, estados e historial/auditoría. Datos médicos, documentos de identidad, emergencia, geolocalización personal o estructurada y finanzas no se capturan; Activity conserva únicamente ubicación textual operativa. Fronteras: navegador no confiable, analizador/generador Excel, Edge Function, Supabase Auth/Data API y PostgreSQL protegido por RLS.

| Amenaza                            | Control inicial                                                                                   | Pendiente                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Acceso horizontal                  | `auth.uid()`, RLS, prueba con dos usuarios                                                        | Revisar cada tabla futura            |
| Escalamiento de privilegios        | permiso + policy explícita + RPC; sin grants cliente                                              | scopes organizacionales              |
| Campo protegido modificado         | grants de columna + trigger de guarda                                                             | Revisar nuevos campos                |
| Claves expuestas                   | solo anon en navegador; env ignorados                                                             | Rotación por entorno                 |
| Inyección                          | SDK parametrizado, checks y sin SQL cliente                                                       | Revisar RPC futuras                  |
| XSS                                | React escapa texto; sin HTML arbitrario                                                           | CSP al desplegar                     |
| CSRF                               | tokens Bearer; no cookies propias                                                                 | Reevaluar si cambia sesión           |
| Carga Excel abusiva                | 5 MiB/1.000 filas; ZIP estricto, 100 entradas, 20 MiB reales, límites por entry, ratio y una hoja | reevaluar límites con uso real       |
| Fórmulas/formatos destructivos     | parser no ejecuta fórmulas; preview usa valor cacheado y exporta texto; celular exige texto       | valor cacheado puede estar obsoleto  |
| Exfiltración del padrón            | permisos exclusivos, RPC proyectadas, exportación filtrada y auditoría                            | MFA/alertas productivas              |
| Logs con PII                       | auditoría solo metadatos; sin console de perfil                                                   | Retención y monitoreo                |
| RLS incorrecta                     | denegar por defecto y pgTAP real                                                                  | Revisión en cada migración           |
| Invitaciones abusivas              | signup off, permiso/policy, TTL e idempotencia                                                    | cuotas productivas y alertas         |
| Replay/doble clic                  | fingerprint, clave por actor, lease e índices                                                     | monitoreo productivo                 |
| Duplicado/carrera de proyecto      | locks comunes por proyecto/scope, índices parciales y finalización monotónica                     | capacidad futura                     |
| Carrera Activity/cierre/scope      | locks account–scope–Project–Activity, guard de cierre y harness con conexiones reales             | capacidad futura                     |
| Carrera Participation/eligibilidad | orden account–scope–Project–Assignment–Activity–Participation, rechecks e índice parcial          | attendance/RSVP futuros              |
| Token de invitación filtrado       | Auth es único custodio; no DB/UI/log/audit                                                        | plantilla/canal productivo           |
| `service_role` expuesto            | Edge env productivo; runner E2E local solo en Node; ninguna variable `VITE_`; scans               | rotación y secret manager            |
| Auth/DB divergentes                | reserva, estado de entrega y reconciliación exacta                                                | runbook y observabilidad             |
| CORS/origin abusivo                | método/content type, allowlist exacta y `.env.local` no versionado                                | dominios de preview/producción       |
| Último admin eliminado             | advisory lock común + conteo transaccional                                                        | recuperación humana de emergencia    |
| Cuenta bloqueada                   | confirmación autoritativa `suspended`/`archived`; estados transitorios separados                  | invalidación global de refresh token |
| Recuperación de contraseña         | Supabase Auth                                                                                     | Política y mensajes organizacionales |
| Auditoría manipulada               | sin insert/update/delete cliente                                                                  | Exportación y acceso `audit.read`    |

## Funciones privilegiadas

Toda función `security definer` fija `search_path = ''`, usa nombres cualificados y revoca ejecución pública. Las funciones de usuario derivan el actor con `auth.uid()`; las funciones internas de finalización solo admiten `service_role`. `has_permission` no recibe un usuario arbitrario y exige una cuenta `active`. Tablas administrativas tienen RLS, cero grants directos para `anon`/`authenticated` y solo se exponen mediante proyecciones/RPC mínimas.

El padrón sigue el mismo RBAC por permisos. La tabla `volunteers` mantiene RLS sin policies permisivas y sin grants cliente; cada RPC deriva el actor del JWT, comprueba la capacidad exacta y expone solo columnas aprobadas. Alta, edición e importación serializan la comprobación de posibles duplicados con un lock transaccional. La confirmación de coincidencia es una decisión de negocio, no evidencia de autoridad. No existen RPC de borrado.

Projects mantiene `project.manage` como autoridad global exclusiva de administrator. `project_manager` recibe `project.read_assigned` y `project.manage_assigned`, pero cada RPC contextual exige además cuenta activa, rol vigente y scope activo para el proyecto. `projects`, `project_volunteer_assignments`, `project_manager_assignments`, `project_activities` y `project_activity_participations` mantienen RLS sin policies ni grants de tabla; las RPC proyectan solo campos aprobados. Activity nace `scheduled`, terminaliza una vez y no admite DELETE. Activity Participation enlaza exclusivamente Activity y `volunteers`, exige Assignment activa del Project exacto al crear, es monotónica y no admite DELETE/reactivación. El orden account–scope–Project–Assignment–Activity–Participation serializa elegibilidad, lifecycle y revocación; un índice parcial impide duplicado activo. El guard de finish Assignment rechaza solo Participations no finalizadas en Activities programadas del mismo Project. Auditoría y read models Participation usan IDs técnicos y nombre mínimo del candidato; no copian email, teléfono, `phone_match_key`, contenido Activity ni metadata Auth.

La Edge Function valida Origin, método, Content-Type, esquema, JWT, estado, permiso y policy antes de construir el cliente Auth Admin. Responde con IDs/estado, traduce errores a códigos seguros y registra solo correlación/operación/códigos allowlist; nunca correo completo, JWT, enlace o stack.

El frontend no infiere bloqueo desde ausencia de caché, refetch, 403 de una operación o error de red. Solo una respuesta satisfactoria del contexto de cuenta con `suspended` o `archived` habilita la pantalla bloqueada. La autoridad se particiona por `user_id`; al cambiar de identidad se cancelan consultas anteriores y se elimina la caché privada, evitando que una respuesta tardía transfiera permisos entre sesiones.

## Privacidad y retención

Esta fase evita pasaportes, documentos, salud, emergencia, archivos persistidos y pagos. Antes de incorporarlos se requiere base legal, minimización, acceso por finalidad, plazo de retención, borrado/anonimización y respuesta a incidentes. No se define borrado en cascada de auditoría ni eliminación física del padrón.

## Abuso residual

Una cuenta administrativa comprometida puede actuar dentro de sus permisos, enviar invitaciones y consultar/exportar PII del padrón. Rate limiting productivo, MFA, alertas, invalidación global de sesiones y procedimiento break-glass deben definirse antes de producción. RLS no impide XSS dentro de una sesión; CSP y revisión de dependencias siguen siendo necesarias.
