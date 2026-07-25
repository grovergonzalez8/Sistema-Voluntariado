# Registro de prompts

| ID   | Fecha      | Objetivo                                        | Herramienta | Resultado                           | Commits                                 |
| ---- | ---------- | ----------------------------------------------- | ----------- | ----------------------------------- | --------------------------------------- |
| 0001 | 2026-07-23 | Construir fundación y un slice de perfil propio | Codex       | Completado; gates locales aprobados | `5dc9178`–`4d9aec9` y cierre documental |
| 0002 | 2026-07-24 | Implementar invitaciones y ciclo de cuentas     | Codex       | Completado; gates locales aprobados | `245b09b`–`ed54f64` y cierre documental |

Detalle: `docs/ai/prompts/0001-bootstrap-foundation.md`.

Detalle del hito: `docs/ai/prompts/0002-account-lifecycle.md`. Rama: `feat/account-lifecycle`. La línea base local aprobó `pnpm verify`, linter SQL, 27 pruebas pgTAP y 2 E2E antes de iniciar cambios materiales. El cierre aprobó `pnpm verify` y `pnpm account-lifecycle:test`, con 73 pruebas unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E sin omisiones.

No se registran claves locales generadas por Supabase ni otra salida sensible.
