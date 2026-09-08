# Changelog

Los cambios relevantes siguen Keep a Changelog y, cuando existan releases, Semantic Versioning.

## Unreleased

### Fixed

- El callback Auth ya no confunde una sesión existente con aceptación: procesa
  errores allowlist, limpia challenge del URL y cierra sesiones activas/mismatch
  antes de volver a login.
- La recuperación administrativa de una identidad confirmada es idempotente,
  auditada y fail-closed: rota challenge, envía correo Auth y conserva la cuenta sin
  autoridad hasta el onboarding normal; no elimina `auth.users` ni fuerza activación.
- El acceptance E2E aísla Mailpit por destinatario, exige un único correo y prueba
  logout/login posterior.

- Create/replace/resend generan y rotan un acceptance challenge por entrega;
  PostgreSQL valida hash, generación y consumo one-time además de la sesión Auth.
- Replace reanuda finalize desde un ACK durable: los reintentos reconcilian Auth
  antes de declarar `delivery_outcome_unknown` y no duplican entrega.
- Create/resend/replace/revoke distinguen `completed`, `replayed`, `in_progress` y
  `failed`; revoke es idempotente y no duplica transición ni auditoría.
- Invitaciones revoked/expired/replaced/accepted no pueden aceptar ni completar el
  onboarding de otra generación aunque exista una sesión Auth; el callback limpia
  el challenge del query string sin persistirlo.
- La carrera asignar/cerrar proyecto queda protegida por una regresión PostgreSQL determinista que comprueba ambos órdenes de locks, estados finales, auditoría e invariante histórica.
- Las RPC del padrón rechazan parámetros estructurales requeridos `NULL` y payloads incompletos; solo un booleano `true` explícito confirma duplicados durante importación.
- La lectura `.xlsx` inspecciona el ZIP antes del parser, limita expansión/dimensiones, rechaza hojas adicionales y preconfigura `Celular` como texto en la plantilla.
- GitHub Actions y la suite local asignan un único propietario explícito a Edge Functions; el runtime automático de Supabase queda deshabilitado y Playwright gestiona únicamente Vite.
- La readiness E2E valida el contrato tipado de `manage-account-invitation` y limpia PID, logs y contenedor aun cuando el arranque o Playwright fallen.
- El refresh de sesión, la recuperación de foco y el refetch de autoridad ya no convierten estados transitorios de una cuenta activa en `/account-blocked`.
- `/account-blocked` valida `suspended` o `archived`; los errores recuperables y permisos insuficientes tienen estados independientes.
- Los errores 403 de invitaciones permanecen en el formulario y distinguen origen, permiso y rol no concedible sin cerrar la sesión.
- El servidor local de Functions usa `supabase/functions/.env.local` e iguala el origen de Vite en `http://localhost:5173`.

### Added

- Diagnóstico reproducible y ExecPlan de Invitation Flow Hardening V1, con flujo
  real UI–Edge–PostgreSQL–Auth–Mailpit–onboarding, state machines, causas raíz y
  estrategia de regresión; la implementación queda deliberadamente pendiente.
- Workspace pnpm/Turborepo con calidad reproducible.
- Gobernanza, documentación arquitectónica, ADRs, agentes y skills.
- Supabase local con autorización por permisos, RLS, auditoría y pruebas pgTAP.
- Acceso básico y perfil propio con React, TypeScript e internacionalización.
- Pruebas unitarias, de componente, integración, E2E y CI sin despliegue.
- Estados de cuenta `invited`, `pending_profile`, `active`, `suspended` y `archived`, con historial y autorización efectiva condicionada por estado.
- Invitaciones administrativas idempotentes mediante Edge Function, Supabase Auth y reconciliación segura con PostgreSQL.
- Onboarding por invitación, definición de contraseña en Auth y activación atómica con rol inicial protegido.
- Panel bilingüe de invitaciones, cuentas, roles, estados e historial/auditoría autorizada.
- Matriz explícita de concesión de roles y protección concurrente del último administrador activo.
- Pruebas de Edge Function, pgTAP y recorridos E2E reales con Mailpit local.
- Padrón administrativo independiente de Auth/cuentas con alta, detalle, edición, búsqueda y orden paginados, advertencias de duplicados y auditoría sin snapshots de PII.
- Preview e importación atómica `.xlsx`, plantilla y exportación del conjunto filtrado, protegidas por permisos exclusivos de administrator y límites de 5 MiB/1.000 filas.
- Proyectos administrativos mínimos con alta, listado/búsqueda, detalle, edición y cierre histórico sin eliminación física.
- Asignaciones directas entre proyectos y el padrón `volunteers`, con consulta en ambos sentidos, finalización histórica, auditoría sin PII y protección concurrente contra duplicados activos.
- Scope contextual histórico entre cuentas `project_manager` y proyectos, con administración exclusiva, revocación dinámica de autoridad y acceso limitado a proyectos asignados.
- Regresiones PostgreSQL deterministas para alta/cierre de scopes, duplicados concurrentes y revocación concurrente frente a mutaciones contextuales.
- Project Activities V1 dentro de Projects, con agenda mínima, estados `scheduled|completed|cancelled`, histórico de solo lectura, autorización global/contextual, RLS default-deny y auditoría mínima.
- Guard forward-only que impide cerrar un proyecto con actividades programadas, más regresiones deterministas para create/close, terminal/close, complete/cancel y revocación de scope frente a mutaciones Activity.
- Activity Participation V1 como relación histórica Activity–Volunteer, con candidatos limitados a assignments activos del Project exacto, histórico terminal de solo lectura, cuatro RPC mínimas, RLS default-deny y auditoría sin PII.
- Guard forward-only que impide finalizar un Project Volunteer Assignment mientras exista una Participation no finalizada en una Activity programada del mismo Project, sin modificar participaciones automáticamente.
- Regresiones PostgreSQL deterministas para add frente a finish Assignment, complete/cancel, add duplicado, finish doble y revocación de scope frente a add/finish Participation.
