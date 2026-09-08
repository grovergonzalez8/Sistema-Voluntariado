# Prompt 0016 — Invitation Flow Hardening V1, FASE B FINAL

- Fecha: 2026-09-07
- Herramienta: Codex, GPT-5.6 Luna
- Rama: `fix/invitation-flow-hardening`
- HEAD inicial: `9d29491585a3266fd01eaf071d8d318fc4af5ba7`
- Base `main`/`origin/main`: `34c25dde52f1439639236ea2d192a53fd79739d3`
- Plan: `docs/exec-plans/0008-invitation-flow-hardening-v1.md`

## Alcance recibido

Cerrar el flujo real administrator → Invitation → correo Mailpit → link Auth →
callback → provenance challenge → accept → onboarding → Account active → logout →
login normal. Endurecer callback y actor mismatch, añadir recovery administrativo
fail-closed y cubrir replaced, revoked, expired y replay mediante E2E canónico sin
fabricar tokens ni saltar Mailpit.

## Restricciones observadas

PostgreSQL conserva autoridad; el challenge es efímero y no se registra ni
persiste. Recovery no elimina identidades, no fuerza activación, no modifica tablas
internas Auth y no salta onboarding. Solo Supabase local; sin push, PR, merge,
rebase, amend ni deploy. No se cambian Node ni tooling. Locale no debe provocar un
mailer propio o rediseño amplio.

## Evidencia de cierre requerida

Frozen install; start/reset/lint/pgTAP; contratos Auth y concurrencia; Functions;
E2E focal y completo; `pnpm verify`; mutation checks dirigidos restaurados;
`git diff --check`; teardown; cuatro revisiones finales de solo lectura y tres
commits convencionales nuevos con árbol limpio. La revisión pre-merge queda fuera
de esta ejecución.
