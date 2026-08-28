# Prompt 0011 — Implementación Project Activities V1

- Fecha: 2026-08-26
- Herramienta: Codex
- Rama: `feat/project-activities-v1`
- Base: `main@3416aca`
- Plan aprobado: `docs/exec-plans/0006-project-activities-v1.md`

## Objetivo recibido

Implementar el diseño aprobado de Project Activities V1 como slice vertical de
Projects: dominio/aplicación, migración forward-only 0006, seis RPC, RLS
default-deny, auditoría mínima, gateway/composición, sección accesible en Project
Detail, pgTAP, concurrencia con conexiones PostgreSQL reales, E2E, CI y
documentación.

## Restricciones y decisiones confirmadas

- Estados exactos `scheduled`, `completed`, `cancelled`; solo `scheduled` es
  mutable y las dos transiciones terminales son irreversibles.
- Crear/mutar exige Project `active`; una Activity programada impide cerrar el
  Project, sin terminalización automática ni cambios históricos.
- Administrator usa `project.manage`; manager contextual usa
  `project.read_assigned`/`project.manage_assigned` más cuenta, rol y scope
  vigentes. `activity.create` y `activity.join` permanecen placeholders sin uso.
- Orden de locks manager: account SHARE → scope SHARE → Project UPDATE →
  Activity UPDATE. Administrator comienza en Project.
- Cero DML directo cliente, actor de `auth.uid()`, `SECURITY DEFINER` con
  `search_path = ''`, grants mínimos y audit sin contenido Activity/PII.
- Fuera de alcance: Activity Participation, attendance, RSVP, self-join,
  responsables individuales, Tasks, recurrencia, calendarios y notificaciones.
- Prohibidos push, merge, rebase, amend, despliegue, main y Supabase remoto.

## Validación solicitada

Pruebas focalizadas y completas de TypeScript, pgTAP/RLS/grants/audit,
intercalaciones create/close, terminal/close, complete/cancel y las cuatro
mutaciones contextuales frente a revocación; tres mutation checks temporales;
E2E administrator/manager/closed; gates locales completos con Node 22.18.0 y
pnpm 11.9.0; revisiones especializadas de solo lectura.

## Resultado

Implementación completada y lista para revisión pre-merge. El cierre aprobó 202
unitarias, 2 de integración, 13 de orquestación, 21 Functions, 406 pgTAP, 24
carreras combinadas, cinco repeticiones Activity 85/85 y 15 E2E tanto normal
como con `CI=true`. Los cinco revisores emitieron GO. La evidencia, mutations,
commits y confirmación de ausencia de operaciones remotas se registran en el
ExecPlan 0006 y en `docs/ai/change-attribution.md`.
