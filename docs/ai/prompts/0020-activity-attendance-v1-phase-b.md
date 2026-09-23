# Prompt 0020 — Activity Attendance V1 FASE B

- Fecha: 2026-09-22
- Herramienta: Codex
- Rama: `feat/activity-attendance-v1`
- HEAD inicial: `8175c31`
- Plan aprobado: `docs/exec-plans/0011-activity-attendance-v1.md`

## Objetivo recibido

Completar exclusivamente FASE B desde las RPC PostgreSQL ya validadas hasta
application, gateway, composición, Activity Participants UI y un E2E canónico.
FASE A —schema, migraciones, RLS, RPC y concurrencia— no puede modificarse salvo
un defecto contractual demostrado, caso en el que se debe detener el trabajo.

## Contrato confirmado

- Los estados son `present|absent`; una lista exitosa sin fila se muestra como
  `Sin registrar`. Un error o shape inesperado nunca se transforma en empty.
- Solo Project active + Activity completed ofrece registro/corrección. Scheduled,
  cancelled y Project closed son read-only; Participation finalizada sigue siendo
  elegible.
- El alta envía `expected_status = null`; la corrección envía el estado conocido.
  Un conflicto stale llega explícitamente a UI, no se reintenta y provoca una
  relectura autoritativa.
- Respuestas antiguas no pueden sobrescribir lecturas o mutaciones más recientes.
- Attendance vive en la tabla actual de Participants, reutilizando primitivas UI,
  semántica accesible, loading/error explícitos y scroll interno responsive.
- El E2E único cubre completed → unregistered → present → absent → reload.

## Alcance y exclusiones

Se autorizan tipos/puertos/servicio mínimos, gateway Supabase, composición, UI,
i18n, unitarias/integración, E2E, capturas locales y documentación. Se excluyen
pantallas nuevas, permisos/guards nuevos, borrado/reset, bulk, horas, razones,
notas, UI genérica y ampliaciones de FASE A. No se permiten push, merge, rebase,
amend, deploy ni operaciones Supabase remotas; la fase se detiene antes de
pre-merge.

## Validación y revisión solicitadas

El cierre exige typecheck, lint, boundaries, unitarias, integración, build,
`verify`, `git diff --check`, E2E focal y una única suite E2E completa. El harness
Attendance puede ejecutarse una vez si no cambió backend. Architect y QA revisan
la fase; database security no se requiere sin cambios PostgreSQL y docs governance
se usa solo ante cambio documental material. El detalle verificable se conserva
en el ExecPlan 0011.
