# Prompt 0003: Corrección de sesión y autoridad al recuperar foco

- Fecha: 2026-07-25
- Rama autorizada: `feat/account-lifecycle`
- Alcance: corrección del hito account lifecycle; sin push, despliegue, rebase, amend ni cambios en `main`.

## Problema confirmado

Una cuenta administrator activa y con sesión Auth válida puede navegar a `/account-blocked` al ocultar/mostrar la pestaña, recuperar foco, renovar la sesión o refetchear `get_my_account_context`. La RPC responde HTTP 200 con estado `active`, permisos administrativos y la versión de autoridad vigente. La pantalla puede mostrar simultáneamente `Access unavailable` y `Your account is active`.

Existe un problema separado de configuración local: el navegador usa `http://localhost:5173`, mientras la Edge Function se sirve con una allowlist basada en `http://127.0.0.1:5173`, por lo que crear una invitación devuelve `origin_denied`.

## Requisitos de la corrección

- Estado de acceso explícito y exhaustivo: inicialización, sin sesión, carga/refetch de autoridad, active, invited, pending profile, suspended, archived, forbidden y error recuperable.
- `/account-blocked` exclusivamente para suspended/archived confirmados por una consulta exitosa.
- Conservar el último contexto válido durante refetch del mismo usuario; nunca conservarlo al cambiar `user_id`.
- Diferenciar `TOKEN_REFRESHED`, `SIGNED_IN`, `SIGNED_OUT` y `USER_UPDATED`; eventos repetidos del mismo usuario no son cambio de identidad.
- Query de autoridad particionada por `user_id`, sin sobrescrituras tardías entre actores y con refetch al foco manejado sin estados bloqueados intermedios.
- Forbidden por permiso de ruta y errores 403 de invitación no cierran sesión ni vacían autoridad.
- Error temporal de autoridad muestra reintento y conserva sesión.
- `supabase/functions/.env.local` ignorado es la configuración local ejecutable; `.env.example` queda como plantilla para `http://localhost:5173`, sin wildcard ni secretos.
- Pruebas unitarias/componentes/E2E para pestaña, refresh, respuestas tardías, estados de cuenta, 403 y CORS.
- Actualizar ExecPlan, operación, seguridad y trazabilidad IA; obtener revisión independiente de arquitectura, base de datos, QA y documentación.

El agente principal es el único escritor y debe ejecutar todos los gates locales antes de crear commits convencionales nuevos.
