# Prompt 0019 — Activity Attendance V1 FASE A

- Fecha: 2026-09-20
- Herramienta: Codex
- Rama: `feat/activity-attendance-v1`
- HEAD inicial: `81dec44`
- Plan aprobado: `docs/exec-plans/0011-activity-attendance-v1.md`

## Objetivo recibido

Implementar exclusivamente el backend PostgreSQL de Activity Attendance V1:
tabla 0..1 por Participation, constraints, RLS/ACL, RPC autoritativo,
autorización, auditoría sin PII, pgTAP y concurrencia versionada. Se autorizó
solo TypeScript mínimo de tipos compartidos; UI y E2E quedaron prohibidos.

## Contrato confirmado

- `project_activity_attendances.participation_id` es PK/FK restrictiva a una
  Participation concreta; no se fusionan ocurrencias históricas.
- Los únicos estados persistidos son `present|absent`; ausencia de fila significa
  no registrado. No existe DELETE físico.
- Solo Project `active` + Activity `completed` admite mutación. Participation
  finalizada sigue siendo elegible y no se exige Assignment vigente.
- Un único RPC distingue alta (`expected_status is null`) de corrección
  (`expected_status` obligatorio y comparado bajo lock); no existe overwrite
  ciego.
- Administrator reutiliza `project.manage`; project manager exige cuenta activa,
  rol vigente, `project.manage_assigned` y scope activo sobre el Project exacto.
- Orden normal manager: account → scope → Project → Activity → Participation →
  Attendance. No se añade Project Volunteer Assignment al camino.
- Auditoría: `project_activity_attendance.recorded|updated`, actor `auth.uid()`,
  IDs/estados técnicos y metadata vacía.

## Validación solicitada

pgTAP fuerte, harness con conexiones independientes para duplicados,
correcciones, close, scope removal y complete Activity en ambos órdenes; tres
mutation checks temporales; reset/lint/DB/Functions/verify/diff final y revisiones
de database security, arquitectura y QA. Sin E2E, push, merge, rebase, amend,
deploy ni Supabase remoto.

## Resultado

FASE A implementada sin UI ni E2E. La evidencia final, revisiones, suites,
commits y riesgos para FASE B se conservan en el ExecPlan 0011.
