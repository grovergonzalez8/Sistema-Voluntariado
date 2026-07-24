# Modelo de amenazas inicial

## Activos y fronteras

Activos: cuentas, perfiles mínimos, roles/permisos y auditoría. Datos médicos, documentos de identidad, emergencia, ubicación detallada y finanzas son futuros y no se capturan. Fronteras: navegador no confiable, Supabase Auth/Data API y PostgreSQL protegido por RLS.

| Amenaza                     | Control inicial                                   | Pendiente                             |
| --------------------------- | ------------------------------------------------- | ------------------------------------- |
| Acceso horizontal           | `auth.uid()`, RLS, prueba con dos usuarios        | Revisar cada tabla futura             |
| Escalamiento de privilegios | RBAC sin grants cliente; helper sin `user_id`     | Flujo administrativo y scopes         |
| Campo protegido modificado  | grants de columna + trigger de guarda             | Revisar nuevos campos                 |
| Claves expuestas            | solo anon en navegador; env ignorados             | Rotación por entorno                  |
| Inyección                   | SDK parametrizado, checks y sin SQL cliente       | Revisar RPC futuras                   |
| XSS                         | React escapa texto; sin HTML arbitrario           | CSP al desplegar                      |
| CSRF                        | tokens Bearer; no cookies propias                 | Reevaluar si cambia sesión            |
| Carga insegura              | sin buckets ni UI de carga                        | Tipo, tamaño, malware y acceso futuro |
| Logs con PII                | auditoría solo metadatos; sin console de perfil   | Retención y monitoreo                 |
| RLS incorrecta              | denegar por defecto y pgTAP real                  | Revisión en cada migración            |
| Invitaciones abusivas       | altas públicas desactivadas localmente            | Diseñar cuotas y expiración           |
| Cuenta finalizada           | `archived_at` bloquea perfil y permisos efectivos | Revocar sesiones y retención          |
| Recuperación de contraseña  | Supabase Auth                                     | Política y mensajes organizacionales  |
| Auditoría manipulada        | sin insert/update/delete cliente                  | Exportación y acceso `audit.read`     |

## Funciones privilegiadas

Toda función `security definer` fija `search_path = ''`, usa nombres cualificados y revoca ejecución pública. Las funciones que necesitan un actor lo derivan con `auth.uid()`; el trigger de alta deriva el perfil de `NEW.id`. `has_permission` no recibe un usuario a consultar y niega permisos si su perfil está archivado.

## Privacidad y retención

Esta fase evita pasaportes, documentos, salud, emergencia, archivos y pagos. Antes de incorporarlos se requiere base legal, minimización, acceso por finalidad, plazo de retención, borrado/anonimización y respuesta a incidentes. No se define borrado en cascada de auditoría.

## Abuso residual

Una cuenta comprometida puede modificar sus dos campos permitidos y generar auditoría. Rate limiting, MFA, alertas y sesión finalizada se definirán antes de producción. RLS no impide XSS dentro de la sesión del propietario; CSP y revisión de dependencias siguen siendo necesarias.
