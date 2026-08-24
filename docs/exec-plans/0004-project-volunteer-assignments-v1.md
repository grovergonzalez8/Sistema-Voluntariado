# ExecPlan 0004 — Proyectos y asignaciones de voluntarios V1

- Estado: completado
- Fecha: 2026-08-24
- Rama: `feat/project-volunteer-assignments-v1`
- Base: `main@89d4c97`

## Objetivo

Implementar el recorrido administrativo mínimo: administrator crea un proyecto, busca una persona del padrón `volunteers`, la asigna directamente, consulta participantes, finaliza la participación y conserva el histórico. El proyecto no representa una cuenta ni una identidad y la V1 no incorpora aprobación, scopes, capacidad, calendario, actividades ni eliminación física.

## Estado inicial

- `main`, `origin/main` y `HEAD` coincidían en `89d4c97c8202921658c089ea694207cbf092d27b`; el árbol estaba limpio después de `git fetch origin`.
- Rama `feat/project-volunteer-assignments-v1` creada desde esa base y confirmada limpia.
- Hitos 0001, 0002 y 0003 cerrados: fundación/perfil, lifecycle de cuentas y padrón administrativo con XLSX.
- Solo existen los módulos `identity`, `volunteer-profile` y `volunteers`; no existe código ni esquema persistente de proyectos.
- Node `22.18.0`, pnpm `11.9.0` y `pnpm install --frozen-lockfile` confirmados sobre la base.
- Baseline web fresca sobre la misma base: `pnpm verify` aprobó formato, lint, límites, typecheck, 13 pruebas de orquestación, 158 unitarias, 2 de integración y build. La baseline PostgreSQL/E2E completa se reserva para el cierre conforme a la estrategia de eficiencia.

## Alcance

- Nuevo módulo web `projects` con dominio, aplicación, infraestructura Supabase, presentación y API pública.
- Proyecto V1 con nombre, descripción opcional, estado `active|closed` y timestamps técnicos.
- Listado con búsqueda y paginación prudente, alta, detalle, edición y cierre sin borrado ni reapertura.
- Relación muchos-a-muchos histórica entre `projects` y el padrón `volunteers`.
- Asignar directamente a un proyecto activo, listar participantes históricos, finalizar una asignación activa y listar proyectos históricos desde el voluntario.
- Nueva migración, RLS default-deny, RPC con privilegio mínimo, auditoría sin PII y pgTAP.
- Navegación/rutas administrativas, estados de carga/error/vacío/éxito e i18n español/inglés.
- E2E del recorrido crítico y documentación/trazabilidad afectada.

## Fuera de alcance

- `project_manager`, coordinator, otros roles o scopes de organización/proyecto/región.
- Propuestas, aprobación, rechazo, cancelación, confirmación, autoasignación o inscripción pública.
- Capacidad/cupos, calendario complejo, responsables, ubicación, región, presupuesto, tarifas, custom fields.
- Actividades, tareas, horas, asistencia, alojamiento, pagos o notificaciones.
- Vínculo automático con Auth, `accounts` o `volunteer-profile`.
- Eliminación física, reapertura de proyectos o edición manual de timestamps.
- Push, PR, merge, despliegue o edición de migraciones históricas.

## Decisiones

1. `projects` posee `Project` y `ProjectVolunteerAssignment`; no se crea un módulo de asignaciones separado. La FK a `volunteers` integra ambos contextos sin convertir el padrón en cuenta/perfil.
2. `project.manage` es la única capacidad V1. Ya existe, hoy solo administrator la recibe y no se crearán permisos paralelos ni comprobaciones por nombre de rol.
3. Nombre se normaliza con trim/espacios colapsados y exige 1–120 caracteres. Descripción se normaliza igual, es nullable y admite hasta 1.000 caracteres. No hay unicidad de nombre porque producto no la definió.
4. Un proyecto nace `active`; cerrar es la única transición de estado. No hay reapertura. Nombre/descripción pueden corregirse en histórico porque el cierre solo prohíbe nuevas asignaciones.
5. La asignación tiene id estable, project/volunteer, `started_at`, `ended_at`, `created_at` y `updated_at`. PostgreSQL fija inicio y fin con hora del servidor; la UI no captura fechas manuales.
6. Activa significa exclusivamente `ended_at IS NULL`. Un índice único parcial `(project_id, volunteer_id) WHERE ended_at IS NULL` impide duplicado activo concurrente y permite reasignar tras finalizar.
7. Asignar y cerrar bloquean la misma fila de proyecto. Cerrar falla con `project_has_active_assignments`; asignar falla si el proyecto no está activo. Finalizar una asignación ya finalizada falla sin reescribir su historia.
8. Las tablas tienen RLS habilitada sin policies permisivas ni DML directo para `authenticated`; las operaciones expuestas son RPC `security definer`, `search_path = ''`, nombres cualificados, actor de `auth.uid()` y permiso efectivo server-side.
9. Los read models de participantes/candidatos pertenecen a Projects y proyectan solo IDs, nombre y fechas necesarios. No exponen correo/teléfono ni permiten editar el padrón.
10. Auditoría usa acciones `project.created`, `project.updated`, `project.closed`, `project_assignment.created` y `project_assignment.ended`; no usa `target_user_id` ni copia nombre, correo, teléfono o payloads a metadata.
11. La consulta inversa se expone desde una página pública del módulo Projects en `/app/admin/volunteers/:id/projects`; Volunteers solo enlaza a esa ruta y no importa internos de Projects.

## Riesgos y mitigaciones

| Riesgo                                 | Mitigación                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Duplicado activo bajo concurrencia     | índice único parcial y error estable probado en PostgreSQL real                                |
| Carrera asignar vs. cerrar             | lock compartido y regresión versionada con ambos órdenes, estado/auditoría e invariante global |
| Acceso de roles futuros ya registrados | autorización exclusiva por `project.manage`, matriz negativa de RLS/RPC y grants explícitos    |
| Confundir padrón con identidad         | FK exclusiva a `volunteers`; tests prueban ausencia de efectos Auth/accounts/profiles          |
| Pérdida de histórico                   | sin DELETE, FKs `ON DELETE RESTRICT`, finalización monotónica y consultas activas/finalizadas  |
| Exposición de PII                      | proyecciones mínimas y auditoría con IDs/campos técnicos sin snapshots                         |
| Acoplamiento entre módulos             | read models propios, APIs públicas y composición en `app/composition`/router                   |

## Fases y validaciones

| Fase                    | Resultado                                     | Validación incremental                         | Estado     |
| ----------------------- | --------------------------------------------- | ---------------------------------------------- | ---------- |
| 0. Precheck/plan        | rama, prompt y plan revisados                 | Git/runtime/baseline/revisiones iniciales      | completada |
| 1. Dominio/aplicación   | invariantes, puertos y casos de uso           | 7 pruebas focalizadas, typecheck               | completada |
| 2. PostgreSQL           | tablas, índices, guards, RPC, auditoría y RLS | reset, DB lint, 51 pgTAP nuevos                | completada |
| 3. Infra/composición    | gateway tipado y servicio conectado           | 3 pruebas de gateway, boundaries, typecheck    | completada |
| 4. UI                   | CRUD/cierre/asignar/finalizar/histórico       | 4 pruebas de componentes                       | completada |
| 5. E2E/docs             | recorrido crítico y trazabilidad coherente    | 3 E2E nuevos y revisión documental             | completada |
| 6. Cierre               | baseline completa y revisiones resueltas      | release-readiness y scans                      | completada |
| 7. Correctivo pre-merge | regresión determinista assign/close y TD-008  | mutación temporal, 5 repeticiones y revisiones | completada |

## Criterios de aceptación

- Solo administrator descubre y ejecuta la V1; project_manager, coordinator, volunteer, anon y cuentas no activas fallan cerrados.
- Crear/listar/buscar/ver/editar/cerrar proyectos funciona sin eliminación ni reapertura.
- Un proyecto con asignaciones activas no puede cerrarse; uno cerrado conserva historia y no admite nuevas asignaciones.
- La misma persona no tiene dos asignaciones activas al mismo proyecto, incluso bajo concurrencia; tras finalizar puede reasignarse.
- Listas por proyecto y voluntario incluyen activas y finalizadas.
- Ninguna operación crea o enlaza Auth, cuentas o perfiles.
- Auditoría registra los cinco eventos sin PII duplicada.
- Migraciones históricas permanecen intactas; gates aplicables y revisiones especializadas quedan verdes.

## Progreso

- 2026-08-24: precheck Git limpio, `main` alineado con `origin/main` y rama creada desde `89d4c97`.
- 2026-08-24: baseline web/frozen install aprobada sobre la base.
- 2026-08-24: revisiones iniciales de arquitectura, dominio y PostgreSQL/RLS emitieron GO sin bloqueos; se adoptaron ownership en Projects, timestamps server-side, `project.manage`, RLS default-deny, índice parcial y serialización por fila de proyecto.
- 2026-08-24: se implementó el vertical completo en dominio, aplicación, infraestructura, composición, UI y PostgreSQL; las validaciones focalizadas aprobaron 14 pruebas Projects, 51 pgTAP nuevas y 3 E2E nuevos.
- 2026-08-24: architecture-check y database-migration-review emitieron GO. QA emitió GO sin bloqueantes y documentation governance confirmó coherencia funcional; su observación de trazabilidad abierta se resolvió en este cierre.
- 2026-08-24: la baseline oficial con Node 22.18.0 y pnpm 11.9.0 aprobó frozen install, `pnpm verify` y `pnpm account-lifecycle:test`: 13 pruebas de orquestación, 172 unitarias, 2 de integración, 21 de Functions, DB reset/lint, 263 pgTAP, build y 10 E2E sin omisiones.
- 2026-08-24: scans del slice no encontraron `any`, `@ts-ignore`, supresiones lint, TODO/FIXME ni `service_role`; `git diff --check` aprobó.
- 2026-08-24: la revisión pre-merge confirmó la implementación de locks, pero detectó que la suite versionada solo cubría assign/assign; se abrió un correctivo acotado sin cambios productivos.
- 2026-08-24: se añadió una regresión con dos sesiones PostgreSQL reales que demuestra mediante `pg_blocking_pids` los órdenes assign-first y close-first, comprueba SQLSTATE/errores, estado final, auditoría e invariante global, y limpia fixtures/sesiones/locks.
- 2026-08-24: cinco ejecuciones consecutivas aprobaron. Al retirar temporalmente ambos locks del camino de asignación, close-first devolvió éxito (`SQLSTATE 00000`) y la prueba falló; tras restaurar la migración sin diff, volvió a aprobar.
- 2026-08-24: el correctivo técnico quedó versionado en `98a615f`; `pnpm install --frozen-lockfile`, `pnpm verify` y `pnpm account-lifecycle:test` aprobaron con 21 pruebas de Functions, DB reset/lint, 263 pgTAP, concurrencia 2/2, 172 unitarias, 2 de integración, 13 de orquestación, typecheck, build y 10 E2E.
- 2026-08-24: database security, QA y documentation governance revisaron el correctivo en modo de solo lectura y emitieron GO; no quedaron sesiones, locks ni fixtures del harness.

## Descubrimientos

- Los cuatro permisos `project.*` ya están registrados, pero únicamente `project.manage` es necesario para esta administración directa V1 y solo administrator lo recibe.
- El padrón `volunteers` ya ofrece identidad institucional independiente adecuada como sujeto de asignación; no necesita nuevas columnas ni vínculo con Auth.
- Las proyecciones RPC no son idénticas a las filas de tabla: `list_projects` devuelve `project_id`, que el adaptador traduce explícitamente a `id`. Un E2E real detectó y permitió corregir esa frontera.

## Decisiones durante la ejecución

- 2026-08-24: se descartó crear nuevos permisos CRUD/asignación. La capacidad existente `project.manage` expresa el alcance autorizado y evita ampliar RBAC sin necesidad.
- 2026-08-24: la hora de inicio/finalización será `statement_timestamp()` del servidor al ejecutar la acción, coherente con el flujo directo y sin introducir calendario editable.

## Resultado final

Incremento completado en `feat/project-volunteer-assignments-v1` desde `main@89d4c97`, sin merge, push ni despliegue. Commits iniciales: `625708b` (plan/prompt), `64affd8` (implementación vertical) y `6d05dc2` (cierre documental); el correctivo técnico pre-merge quedó en `98a615f`. El administrador puede crear y mantener proyectos, asignar registros del padrón, finalizar participaciones, consultar el histórico en ambos sentidos y cerrar proyectos solo después de finalizar sus asignaciones activas. La concurrencia assign/close queda protegida por una regresión automatizada y versionada sobre PostgreSQL real; autorización, RLS, auditoría y ausencia de efectos sobre Auth/cuentas/perfiles conservan su cobertura.
