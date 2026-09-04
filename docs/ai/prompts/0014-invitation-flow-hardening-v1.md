# Prompt 0014 — Invitation Flow Hardening V1

- Fecha: 2026-09-03
- Herramienta: Codex
- Rama: `fix/invitation-flow-hardening`
- Base: `main@34c25dd`
- Plan: `docs/exec-plans/0008-invitation-flow-hardening-v1.md`

## Objetivo recibido

Reproducir y diagnosticar el flujo real de invitaciones de cuentas antes de
implementar correcciones. La investigación debe recorrer localmente UI
administrativa, servicio de aplicación, Edge Function, PostgreSQL, Supabase Auth,
Mailpit, callback, onboarding, estado final y login posterior; además debe auditar
estados, seguridad, redirects, correo, idempotencia, concurrencia y cobertura E2E.

## Restricciones

- Primera fase exclusivamente documental: no modificar código productivo, UI,
  Edge Functions, migraciones, dependencias ni versiones de herramientas.
- Usar solamente Supabase local y los scripts oficiales del repositorio.
- No hacer push, merge, rebase, amend, deploy, `supabase link`, `db push` ni
  operaciones Supabase remotas.
- No persistir tokens completos, secretos, contraseñas, JWT, cuerpos completos de
  correo ni datos personales.
- Priorizar este incremento sobre Attendance, Tasks y cualquier funcionalidad
  nueva.
- Detenerse tras baseline, reproducción, causas raíz, ExecPlan, estrategia de
  corrección, revisiones especializadas, commit documental y árbol limpio.

## Validación solicitada

Instalación congelada y `pnpm verify`; reset, lint y pgTAP locales; pruebas de Edge
Function y E2E existentes; reproducción desde la UI con Mailpit; casos focales A–J;
revisión de arquitectura, database security, QA y documentación en modo de solo
lectura.

## Resultado

Diagnóstico completado; implementación no iniciada. Se reprodujeron el happy path
completo hasta logout/login y los casos soportados, se documentaron causas raíz y se
diseñó una corrección por fases con regresiones distribuidas. La evidencia
sanitizada y el criterio E2E final se conservan en el ExecPlan 0008. Los gates
locales pasaron bajo Node `22.21.0`; la paridad con el `22.18.0` fijado queda
pendiente porque el runtime no está disponible y esta fase prohíbe actualizarlo.
