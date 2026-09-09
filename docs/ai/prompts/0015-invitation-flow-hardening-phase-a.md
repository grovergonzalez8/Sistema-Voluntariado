# Prompt 0015 — Invitation Flow Hardening V1, FASE A

- Fecha: 2026-09-04
- Herramienta: Codex, GPT-5.6 Sol (alto)
- Rama: `fix/invitation-flow-hardening`
- HEAD inicial: `181929ddd3bab469722431aa113ab4fd1890a06f`
- Plan: `docs/exec-plans/0008-invitation-flow-hardening-v1.md`

## Alcance recibido

Implementar exclusivamente backend/Auth/PostgreSQL/Edge Function, saga replace,
idempotencia/replay, estados terminales, carreras críticas, auditoría segura y
pruebas focalizadas. No implementar rediseño completo de callback, E2E canónico de
navegador destinatario, Attendance ni Tasks.

## Restricciones observadas

Solo Supabase local y APIs Auth soportadas; sin modificar tablas internas Auth en
el spike; sin push, merge, rebase, amend, deploy, link, db push ni remotos. No se
cambió Node/tooling y se registró `LOCAL NODE PARITY WITH CI: NOT CONFIRMED`.

## Decisiones

El spike A/B demostró que reinvitar invalida A y permite B conservando la identidad.
La generación autoritativa vive en `app_metadata`, no en `user_metadata`. La saga
persiste un ACK antes de finalize; los replays tienen outcomes explícitos y revoke
usa idempotency key. No se borran identidades. Locale de email queda separado para
FASE B porque el template único actual no ofrece selección dinámica versionada sin
ampliar el diseño.

## Evidencia esperada de cierre

pgTAP, tests de Function, harness Auth A/B, harness de conexiones PostgreSQL
independientes, mutation checks, `pnpm verify`, lint DB, `git diff --check`, tres
revisiones especializadas y árbol limpio con commits convencionales locales.
