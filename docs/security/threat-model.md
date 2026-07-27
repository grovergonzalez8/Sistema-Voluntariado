# Modelo de amenazas

## Activos y fronteras

Activos: identidades Auth, cuentas, invitaciones, perfiles mínimos, roles/policies/permisos, estados e historial/auditoría. Datos médicos, documentos de identidad, emergencia, ubicación detallada y finanzas no se capturan. Fronteras: navegador no confiable, Edge Function, Supabase Auth/Data API y PostgreSQL protegido por RLS.

| Amenaza                      | Control inicial                                                                     | Pendiente                             |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| Acceso horizontal            | `auth.uid()`, RLS, prueba con dos usuarios                                          | Revisar cada tabla futura             |
| Escalamiento de privilegios  | permiso + policy explícita + RPC; sin grants cliente                                | scopes organizacionales               |
| Campo protegido modificado   | grants de columna + trigger de guarda                                               | Revisar nuevos campos                 |
| Claves expuestas             | solo anon en navegador; env ignorados                                               | Rotación por entorno                  |
| Inyección                    | SDK parametrizado, checks y sin SQL cliente                                         | Revisar RPC futuras                   |
| XSS                          | React escapa texto; sin HTML arbitrario                                             | CSP al desplegar                      |
| CSRF                         | tokens Bearer; no cookies propias                                                   | Reevaluar si cambia sesión            |
| Carga insegura               | sin buckets ni UI de carga                                                          | Tipo, tamaño, malware y acceso futuro |
| Logs con PII                 | auditoría solo metadatos; sin console de perfil                                     | Retención y monitoreo                 |
| RLS incorrecta               | denegar por defecto y pgTAP real                                                    | Revisión en cada migración            |
| Invitaciones abusivas        | signup off, permiso/policy, TTL e idempotencia                                      | cuotas productivas y alertas          |
| Replay/doble clic            | fingerprint, clave por actor, lease e índices                                       | monitoreo productivo                  |
| Token de invitación filtrado | Auth es único custodio; no DB/UI/log/audit                                          | plantilla/canal productivo            |
| `service_role` expuesto      | Edge env productivo; runner E2E local solo en Node; ninguna variable `VITE_`; scans | rotación y secret manager             |
| Auth/DB divergentes          | reserva, estado de entrega y reconciliación exacta                                  | runbook y observabilidad              |
| CORS/origin abusivo          | método/content type, allowlist exacta y `.env.local` no versionado                  | dominios de preview/producción        |
| Último admin eliminado       | advisory lock común + conteo transaccional                                          | recuperación humana de emergencia     |
| Cuenta bloqueada             | confirmación autoritativa `suspended`/`archived`; estados transitorios separados    | invalidación global de refresh token  |
| Recuperación de contraseña   | Supabase Auth                                                                       | Política y mensajes organizacionales  |
| Auditoría manipulada         | sin insert/update/delete cliente                                                    | Exportación y acceso `audit.read`     |

## Funciones privilegiadas

Toda función `security definer` fija `search_path = ''`, usa nombres cualificados y revoca ejecución pública. Las funciones de usuario derivan el actor con `auth.uid()`; las funciones internas de finalización solo admiten `service_role`. `has_permission` no recibe un usuario arbitrario y exige una cuenta `active`. Tablas administrativas tienen RLS, cero grants directos para `anon`/`authenticated` y solo se exponen mediante proyecciones/RPC mínimas.

La Edge Function valida Origin, método, Content-Type, esquema, JWT, estado, permiso y policy antes de construir el cliente Auth Admin. Responde con IDs/estado, traduce errores a códigos seguros y registra solo correlación/operación/códigos allowlist; nunca correo completo, JWT, enlace o stack.

El frontend no infiere bloqueo desde ausencia de caché, refetch, 403 de una operación o error de red. Solo una respuesta satisfactoria del contexto de cuenta con `suspended` o `archived` habilita la pantalla bloqueada. La autoridad se particiona por `user_id`; al cambiar de identidad se cancelan consultas anteriores y se elimina la caché privada, evitando que una respuesta tardía transfiera permisos entre sesiones.

## Privacidad y retención

Esta fase evita pasaportes, documentos, salud, emergencia, archivos y pagos. Antes de incorporarlos se requiere base legal, minimización, acceso por finalidad, plazo de retención, borrado/anonimización y respuesta a incidentes. No se define borrado en cascada de auditoría.

## Abuso residual

Una cuenta administrativa comprometida puede actuar dentro de sus policies y enviar invitaciones. Rate limiting productivo, MFA, alertas, invalidación global de sesiones y procedimiento break-glass deben definirse antes de producción. RLS no impide XSS dentro de una sesión; CSP y revisión de dependencias siguen siendo necesarias.
