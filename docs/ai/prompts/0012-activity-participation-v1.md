# Prompt 0012 — Activity Participation V1

- Fecha: 2026-09-01
- Objetivo: diseñar Activity Participation V1 como relación histórica entre
  Project Activity y Volunteer antes de implementar migración, RPC, RLS,
  aplicación o UI.
- Herramienta: Codex, agente principal con cinco revisores especializados en
  modo de solo lectura.
- Rama: `feat/activity-participation-v1` desde `main@fdc05c1`.
- Restricciones: solo inspección, baseline, planificación, revisiones,
  documentación y commit documental; sin migración, código productivo, UI,
  pruebas productivas, push, merge, rebase, amend, despliegue, cambios en `main`
  o Supabase remoto.

## Requisitos confirmados

1. `ProjectActivityParticipation` enlaza una Activity con un registro de
   `public.volunteers`; no usa accounts, profiles ni Auth.
2. La relación es histórica, `ended_at IS NULL` significa activa, no admite
   DELETE cliente y permite una nueva ocurrencia después de finalizar la
   anterior.
3. Add exige Project active, Activity scheduled, Project Volunteer Assignment
   activa hacia exactamente el Project de la Activity y ausencia de
   Participation activa equivalente.
4. Administrator usa `project.manage`. Project manager contextual requiere
   cuenta activa, rol vigente, permisos Project vigentes y scope activo.
5. Activity completed/cancelled y Project closed conservan histórico read-only.
   No se auto-finalizan Participations al terminalizar Activity.
6. Finish Project Assignment falla si el Volunteer conserva Participation
   activa en Activity scheduled del mismo Project; Activity terminal o
   Participation finalizada no bloquean.
7. PostgreSQL/RPC es la frontera de seguridad, con RLS default-deny, grants
   mínimos, actor de `auth.uid()` y auditoría sin PII.
8. El diseño debe serializar add/finish Assignment, add/complete, add/cancel,
   add/add, finish/finish y mutación contextual/scope removal.
9. Fuera de alcance: self-join, RSVP, waiting list, attendance, check-in,
   responsables/roles Activity, guests, Participation entre Projects, Tasks,
   notificaciones, recurrencia, capacity y portal Volunteer.

## Decisiones de diseño

- Tabla futura `project_activity_participations`, FK restrictiva a Activity y
  Volunteer, timestamps de servidor e índice único parcial por par activo.
- Ownership en Projects y UI como subsección Participants de la superficie
  Activity existente.
- Orden de locks:
  `account → scope → project → project assignment → activity → participation`.
- Cuatro RPC específicas: listar, buscar candidatos, crear y finalizar.
- Migración forward-only posterior a 0006 que preserva la firma de
  `finish_project_volunteer_assignment(uuid)` y añade el guard
  `volunteer_has_scheduled_activity_participations`.
- Auditoría `project_activity_participation.created|ended` con IDs técnicos y
  metadata vacía.

## Resultado de esta fase

Baseline local aprobada con Node `22.18.0`/pnpm `11.9.0`: frozen install,
`verify`, 406 pgTAP, 24 carreras PostgreSQL, 21 Functions y 15 E2E. Supabase
local quedó detenido. El diseño, Mermaid, SQL/RPC/RLS, locks, estrategia de
pruebas y revisiones se conservan en
`docs/exec-plans/0007-activity-participation-v1.md`. No se implementó el slice;
la rama se detiene para revisión humana.
