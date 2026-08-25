# Prompt 0009 — Project Manager Contextual Scope V1

- Fecha: 2026-08-25
- Objetivo: extender Projects V1 con una relación contextual durable entre cuentas `project_manager` y proyectos concretos.
- Herramienta: Codex, agente principal con revisiones especializadas de arquitectura y PostgreSQL/RBAC en solo lectura.
- Rama: `feat/project-manager-contextual-scope-v1` desde `main@3b4f778`.
- Restricciones: sin framework genérico de scopes, cambios a migraciones históricas, actividades, tareas, aprobación, dependencias, push, merge, rebase, amend, despliegue ni Supabase remoto.

## Requisitos confirmados

1. Relación muchos-a-muchos histórica entre `accounts` elegibles y `projects`; `ended_at IS NULL` significa activa.
2. Solo administrator asigna o retira managers; `project.manage` continúa global y exclusivo.
3. Project manager ve solo proyectos asignados y dentro de ellos puede editar datos descriptivos y gestionar participaciones del padrón.
4. Project manager no crea/cierra/reabre/elimina proyectos ni administra managers.
5. La autorización contextual exige cuenta activa, rol vigente, permiso y scope activo; PostgreSQL/RPC es la frontera final.
6. Suspensión, archivo, rol retirado o scope finalizado cortan acceso inmediatamente.
7. Reutilizar `project.read_assigned`, añadir `project.manage_assigned`, auditar y probar RLS, concurrencia y revocación.

## Decisión pendiente

Producto debe confirmar si una nueva asignación de manager puede crearse sobre un proyecto cerrado. El ExecPlan 0005 conserva ambas alternativas y bloquea la migración hasta recibir esa decisión.

## Resultado

Diseño propuesto en `docs/exec-plans/0005-project-manager-contextual-scope-v1.md`. No se creó migración ni código productivo.
