# Prompt 0013 — Implementación Activity Participation V1

- Fecha: 2026-09-02
- Herramienta: Codex
- Rama: `feat/activity-participation-v1`
- Base: `main@fdc05c1`
- HEAD inicial: `0457cbb`
- Plan aprobado: `docs/exec-plans/0007-activity-participation-v1.md`

## Objetivo recibido

Implementar el diseño aprobado de Activity Participation V1 como slice vertical de
Projects: dominio/aplicación, migración forward-only 0007, cuatro RPC, RLS
default-deny, auditoría mínima, guard de Project Volunteer Assignment,
gateway/composición, sección Participants dentro de Activities, pgTAP, concurrencia
PostgreSQL, E2E, CI y documentación.

## Restricciones y decisiones confirmadas

- La relación histórica enlaza `project_activities` con `volunteers`; no usa
  cuentas/Auth ni copia PII.
- Add exige Project activo, Activity programada y Project Volunteer Assignment
  activa del Volunteer hacia exactamente ese Project.
- `ended_at is null` significa que no hubo finalización explícita. Activity terminal
  o Project cerrado conserva la fila como histórico read-only sin auto-finalizarla.
- Finish Project Assignment falla solo por Participation no finalizada en Activity
  programada del mismo Project.
- Administrator usa `project.manage`; manager contextual usa
  `project.read_assigned`/`project.manage_assigned` junto con cuenta, rol, permiso y
  scope vigentes. `activity.create`/`activity.join` permanecen placeholders.
- Orden de locks: account → scope → Project → Project Assignment → Activity →
  Participation.
- Fuera de alcance: attendance, RSVP, self-join, waiting list, capacity, roles,
  responsables, invitados, Tasks, notificaciones y recurrencia.
- Prohibidos push, merge, rebase, amend, despliegue, cambios en main y operaciones
  Supabase remotas.

## Validación solicitada

Pruebas unitarias/integración/componentes, pgTAP de esquema/RBAC/eligibility/
lifecycle/audit, 12 intercalaciones PostgreSQL reales sin sleeps, tres mutation
checks temporales, E2E administrator/guard/manager/terminal, gates locales completos
con Node 22.18.0 y pnpm 11.9.0, scans de arquitectura/seguridad/release y cinco
revisiones especializadas de solo lectura.

## Resultado

Implementación completada y lista para PRE-MERGE REVIEW. El cierre local aprobó 226
unitarias, 4 integración, 13 orquestación, 21 Functions, 530 pgTAP, 36 carreras y
19 E2E tanto normal como con `CI=true`; el harness Participation pasó además cinco
repeticiones completas. Los tres mutation checks fallaron bajo degradación dirigida
y se restauraron antes de continuar. Architect, domain modeler, database security,
QA y docs governor emitieron GO tras integrar hallazgos. Evidencia, commits e higiene
se conservan en el ExecPlan 0007 y en `docs/ai/change-attribution.md`.

La validación limpia posterior corrigió además una aserción histórica global del
harness Assignment que interfería con la ejecución paralela de los tres archivos;
el archivo aislado aprobó 7/7 y el combinado restaurado aprobó 36/36 sin cambios SQL.
