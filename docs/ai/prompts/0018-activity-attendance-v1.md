# Prompt 0018 — Activity Attendance V1

- Fecha: 2026-09-16
- Objetivo: diseñar Activity Attendance V1 como hecho real asociado a una
  `ProjectActivityParticipation` antes de implementar migración, RPC, aplicación
  o UI.
- Herramienta: Codex, agente principal con architect,
  database_security_reviewer, qa_reviewer y docs_governor en modo de solo
  lectura.
- Rama: `feat/activity-attendance-v1` desde `main@cb554c8`.
- Restricciones: inspección, planificación, revisiones, documentación y commit
  documental; sin migración, código productivo, tests productivos, DB reset,
  push, merge, rebase, amend, deploy ni Supabase remoto.

## Requisitos confirmados

1. Attendance pertenece a una Participation existente y no constituye un
   sistema genérico.
2. Estados persistidos exactos `present | absent`; ausencia de fila significa
   `unregistered`, no `absent`.
3. Activity `scheduled`/`cancelled` no admite registro; Activity `completed` de
   Project `active` admite registro/corrección; Project `closed` es histórico
   read-only.
4. No se agregan horas, check-in/out, QR, geolocalización, notas, razones,
   autoasistencia, guests, RSVP, reports, Tasks ni notificaciones.
5. Administrator usa `project.manage`; manager contextual reutiliza
   `project.read_assigned`/`project.manage_assigned`, rol vigente y scope activo.
   PostgreSQL revalida autoridad; los placeholders Activity no autorizan.
6. RLS es default-deny, las mutaciones son RPC fail-closed y auditoría no copia
   PII.
7. Se diseñan carreras record↔record, correct↔correct, mutación↔close,
   mutación↔scope removal y complete↔record con conexiones independientes y sin
   sleeps como sincronización.
8. La UI vive dentro de Activity Participants y reutiliza los primitives
   vigentes.

## Decisiones de diseño

- Tabla propia `project_activity_attendances`, con `participation_id` como PK/FK
  restrictiva, status, `recorded_at` y `updated_at` server-side.
- Una Participation finalizada o no finalizada es elegible después de completar
  Activity; no se exige Project Assignment activa.
- Corrección `present ↔ absent` mientras Project esté activo, con estado esperado
  validado bajo lock para evitar lost updates; no existe DELETE para volver a
  `unregistered`.
- Cerrar Project no exige cobertura completa; faltantes quedan históricos como
  `unregistered` y read-only.
- Orden global
  `account → scope → project → project assignment → activity → participation → attendance`;
  Attendance omite Assignment porque no la necesita, sin invertir el orden.
- Tres RPC parent-scoped: listar, registrar y corregir.
- Auditoría `project_activity_attendance.recorded|updated` con IDs/estados
  técnicos y metadata vacía.
- Migración futura tentativa `202609160013_project_activity_attendance.sql`, sin
  backfill ni cambios a migraciones 0001–0012.

## Resultado de esta fase

El diseño autocontenido se conserva en
`docs/exec-plans/0011-activity-attendance-v1.md`. `pnpm verify` aprobó con Node
`22.18.0` y pnpm `11.9.0` después de corregir el formato detectado por la primera
ejecución; `git diff --check` aprobó. No se ejecutaron DB reset, pgTAP,
concurrencia ni E2E. Los veredictos y hallazgos de la ronda única de revisores se
registran en el ExecPlan. Attendance no fue implementado y requiere aprobación
humana antes de la fase técnica.
