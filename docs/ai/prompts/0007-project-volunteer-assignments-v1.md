# Prompt 0007 — Proyectos y asignaciones de voluntarios V1

- Fecha: 2026-08-24
- Objetivo: implementar el siguiente incremento autorizado del MVP para administrar proyectos mínimos y asignar registros del padrón.
- Herramienta: Codex, agente principal con revisiones especializadas de solo lectura.
- Alcance destructivo: sin push, merge, despliegue, conexión remota, edición de migraciones históricas ni eliminación física.

## Contexto confirmado

El propietario eligió la opción A después de que la inspección del repositorio determinara que los contextos futuros tenían prioridad ambigua. El sujeto asignable es exclusivamente `volunteers`, independiente de Auth, cuentas y perfiles.

## Requisitos autorizados

1. Crear únicamente el proyecto persistente mínimo: nombre, descripción opcional, estado `active|closed` y timestamps técnicos.
2. Permitir a administrator crear, listar, buscar, ver, editar nombre/descripción y cerrar proyectos; sin eliminación física.
3. Mantener acceso exclusivamente administrativo; no habilitar project_manager, coordinator, voluntarios, otros roles ni scopes.
4. Modelar `volunteer <-> project` muchos-a-muchos. Permitir asignar a proyecto activo, consultar participantes, consultar proyectos de un voluntario y finalizar asignaciones sin DELETE.
5. Una asignación conserva project, volunteer, inicio, fin nullable e histórico. Activa significa fin null; no existen estados de aprobación.
6. Impedir dos asignaciones activas del mismo voluntario/proyecto en PostgreSQL y frente a concurrencia; permitir una nueva después de finalizar la histórica.
7. Un proyecto cerrado es visible, conserva asignaciones y no admite nuevas. Cerrar falla claramente si quedan asignaciones activas; no finalizarlas automáticamente.
8. No implementar capacidad ni calendario completo. La asignación conserva sus timestamps.
9. Toda visibilidad es administrativa; no hay portal público o del voluntario.
10. Reutilizar auditoría para proyecto creado/actualizado/cerrado y voluntario asignado/asignación finalizada, sin PII innecesaria.
11. Respetar arquitectura modular, ExecPlans, ADR, migraciones nuevas, RLS/RBAC, políticas de prompts/commits y agentes del repositorio.
12. Crear la rama independiente `feat/project-volunteer-assignments-v1` desde main limpio.
13. Entregar UI mínima para proyectos, selección/búsqueda del padrón, participantes y finalización; integrar proyectos asociados desde el detalle del voluntario solo si respeta límites.
14. Excluir project_manager/coordinator/scopes/aprobación/autoasignación/cupos/tareas/actividades/horas/asistencia/alojamiento/pagos/tarifas/ubicaciones/notificaciones/Auth.
15. Resolver exactamente: administrator crea proyecto, busca voluntario, asigna, consulta participantes, finaliza y conserva histórico.

## Decisiones conservadoras no bloqueantes

- Los timestamps de inicio y finalización se fijan por el servidor al ejecutar asignar/finalizar; no se capturan fechas manuales.
- Un proyecto cerrado puede recibir correcciones de nombre/descripción, pero no reabrirse ni recibir asignaciones.
- Se reutiliza `project.manage`, ya concedido solo a administrator, sin crear capacidades adicionales.

## Validaciones exigidas

Tests incrementales de dominio, aplicación, PostgreSQL/RLS/concurrencia, infraestructura, UI y E2E; baseline oficial completa una vez al cierre; revisiones especializadas de arquitectura, base de datos, QA y documentación.

## Resultado

En progreso. El diseño y la evidencia se mantienen en `docs/exec-plans/0004-project-volunteer-assignments-v1.md`.
