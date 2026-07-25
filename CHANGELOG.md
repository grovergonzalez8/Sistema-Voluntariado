# Changelog

Los cambios relevantes siguen Keep a Changelog y, cuando existan releases, Semantic Versioning.

## Unreleased

### Fixed

- El refresh de sesión, la recuperación de foco y el refetch de autoridad ya no convierten estados transitorios de una cuenta activa en `/account-blocked`.
- `/account-blocked` valida `suspended` o `archived`; los errores recuperables y permisos insuficientes tienen estados independientes.
- Los errores 403 de invitaciones permanecen en el formulario y distinguen origen, permiso y rol no concedible sin cerrar la sesión.
- El servidor local de Functions usa `supabase/functions/.env.local` e iguala el origen de Vite en `http://localhost:5173`.

### Added

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
- Pruebas de Edge Function, 119 comprobaciones pgTAP y recorridos E2E reales con Mailpit local.
