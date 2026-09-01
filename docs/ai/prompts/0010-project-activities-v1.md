# Prompt 0010 — Project Activities V1

- Fecha: 2026-08-26
- Objetivo: diseñar Activities V1 como recurso hijo de Projects antes de
  implementar migración, RPC, RLS, aplicación o UI.
- Herramienta: Codex, agente principal con cinco revisores especializados en
  modo de solo lectura.
- Rama: `feat/project-activities-v1` desde `main@3416aca`.
- Restricciones: solo inspección, baseline, planificación, revisiones y
  documentación; sin migración, código productivo, pruebas productivas, push,
  merge, rebase, amend, despliegue o Supabase remoto.

## Requisitos confirmados

1. `ProjectActivity` pertenece exactamente a un Project y al bounded context
   Projects.
2. Campos mínimos: ID, Project, nombre, descripción opcional, inicio, fin
   opcional, ubicación textual opcional, estado y timestamps técnicos.
3. Estados exactos `scheduled`, `completed`, `cancelled`; solo scheduled muta y
   los otros dos son terminales.
4. Crear/mutar exige Project active. Project closed conserva histórico y no
   admite ninguna mutación Activity.
5. Cerrar Project falla mientras exista cualquier Activity scheduled y nunca
   altera las Activities.
6. Administrator usa `project.manage`; project manager usa rol, cuenta activa,
   `project.read_assigned`/`project.manage_assigned` y scope activo.
7. PostgreSQL/RPC es la frontera final. React solo adapta la experiencia.
8. `activity.create`/`activity.join` se inspeccionan pero no se reutilizan por
   nombre ni se eliminan.
9. Sin responsible user, Participation, attendance, RSVP, Tasks,
   notificaciones, calendarios externos, recurrencia o archivos.
10. El diseño debe serializar create/close, terminal/close, complete/cancel y
    mutación contextual/scope removal.

## Decisiones de diseño

- Tabla futura `project_activities`, FK restrictiva y RLS default-deny.
- `status_changed_at` no nulo, de servidor, inicializado al crear scheduled y
  actualizado solo al completar/cancelar.
- RPC separadas para complete/cancel; ninguna acepta estado o timestamps de
  auditoría del cliente.
- Firmas de detalle/mutación reciben Project + Activity para autorizar antes de
  buscar la fila hija.
- Orden de locks: `actor account → active scope → project → activity`.
- Migración forward-only posterior a 0005 reemplaza `guard_project_update()` y
  añade `project_has_scheduled_activities`; conserva `close_project(uuid)` y el
  error histórico de asignaciones activas con precedencia.
- Auditoría `project_activity.created|updated|completed|cancelled`, sin valores
  de nombre, descripción, ubicación o agenda.

## Resultado de esta fase

Baseline local aprobada con Node `22.18.0`/pnpm `11.9.0`: `verify`, 309 pgTAP,
7 carreras PostgreSQL, 21 Functions y 11 E2E. El diseño, riesgos, Mermaid,
estrategia SQL/RLS/QA y observaciones de revisores se conservan en
`docs/exec-plans/0006-project-activities-v1.md`. No se implementó el slice; la
rama se detiene para revisión humana.
