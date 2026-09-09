# Prompt 0017 — Invitation session cleanup fail-closed

- Fecha: 2026-09-08
- Herramienta: Codex
- Rama: `fix/invitation-flow-hardening`
- HEAD inicial: `56d993a086863d4479204109a75031ce803ab84c`
- Plan: `docs/exec-plans/0008-invitation-flow-hardening-v1.md`

## Alcance recibido

Corregir únicamente los caminos terminales de `AuthCallbackPage` e
`InvitationAcceptancePage` que limpiaban actor pero navegaban a `/login` aunque
`signOut` devolviera `Result.failure` o rechazara la Promise. Exigir éxito explícito,
permanecer fail-closed con mensaje seguro y permitir reintentar logout sin duplicar
intentos ni navegación.

## Restricciones

Sin DB, pgTAP, Edge Functions, Functions, concurrencia, push, merge, rebase, amend
ni deploy. Preservar callback/acceptance válidos, no mostrar errores internos y no
considerar limpia la sesión hasta `Result.ok`.

## Evidencia requerida

Regresiones focalizadas para failure, rejection, actor mismatch, retry y orden
signOut→navigate; mutation check que vuelva a navegar sobre failure y falle; tests
focalizados callback/acceptance/Identity; `pnpm typecheck`, `pnpm lint`,
`pnpm verify` y `git diff --check`; revisiones especializadas de solo lectura y un
commit convencional nuevo sin push.
