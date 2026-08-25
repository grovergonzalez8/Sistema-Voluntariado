# ExecPlan 0005 — Project Manager Contextual Scope V1

- Estado: diseño aprobado; implementación en curso
- Fecha: 2026-08-25
- Rama: `feat/project-manager-contextual-scope-v1`
- Base: `main@3b4f778`

## Objetivo

Permitir que administrator asigne cuentas con rol `project_manager` a proyectos concretos y que esas cuentas operen únicamente dentro de sus asignaciones activas. El slice reutiliza Projects V1, conserva histórico y aplica autorización contextual en PostgreSQL sin introducir un framework genérico de scopes.

## Estado inicial

- `main`, `origin/main` y `HEAD` coincidían en `3b4f778a28667dd2b12573d84ab1e713c3835820`; el árbol estaba limpio después de `git fetch origin` y `git pull --ff-only origin main`.
- Projects V1 está integrado con proyectos, participaciones históricas del padrón, `project.manage` exclusivo de administrator, RLS default-deny, auditoría y concurrencia assign/close.
- `project_manager` y `project.read_assigned` ya existen. No existe `project.manage_assigned`, relación persistente manager–project ni autorización por proyecto.
- `accounts.id` es la identidad durable de cuenta; `accounts.auth_user_id` enlaza la sesión y `user_has_active_role`/`user_has_permission` ya niegan autoridad a cuentas no activas.
- Node `22.18.0`, pnpm `11.9.0` y `pnpm install --frozen-lockfile` aprobados. La baseline inicial `pnpm verify` aprobó formato, lint, límites, probes, typecheck, 13 pruebas de orquestación, 172 unitarias, 2 de integración y build.
- Las revisiones iniciales read-only de arquitectura y PostgreSQL/RBAC no encontraron contradicciones con el modelo existente.

## Alcance

- Relación histórica muchos-a-muchos entre `projects` y `accounts` para managers asignados.
- Administración exclusiva: buscar cuentas elegibles, asignar, listar histórico y finalizar una asignación de manager.
- Listado y detalle de proyectos filtrados por scope para `project_manager`.
- Edición descriptiva, consulta de participantes, búsqueda/asignación de voluntarios y finalización de participaciones dentro de proyectos asignados.
- Nuevo permiso `project.manage_assigned`; reutilización de `project.read_assigned`.
- Migración aditiva 0005, RPC seguras, RLS default-deny, auditoría sin PII, tipos Supabase, aplicación, infraestructura, composición, rutas, UI e i18n.
- Pruebas de dominio/aplicación, gateway, componentes, pgTAP/RLS, concurrencia real y E2E del recorrido principal y revocación.
- Documentación de producto, arquitectura, datos, seguridad y trazabilidad afectada.

## Fuera de alcance

- Framework genérico de scopes, organizaciones, casas, regiones o periodos.
- Coordinator, voluntarios u otros roles con acceso a Projects.
- Crear, cerrar, reabrir o eliminar proyectos como `project_manager`.
- Asignar o retirar managers como `project_manager`.
- Actividades, tareas, calendarios, capacidad, autoinscripción o aprobación.
- Finalización automática del scope al suspender, archivar o retirar el rol.
- Cambios de `accounts.authority_version` desde Projects.
- Cambios a migraciones 0001–0004, dependencias, push, PR, merge o despliegue.

## Diseño propuesto

### Dominio y ownership

1. Projects continúa siendo propietario del proyecto, las participaciones y la nueva relación `ProjectManagerAssignment`; no se crea un módulo `scopes` ni Identity conoce internals de Projects.
2. El sujeto persistente es `accounts.id`, no `volunteers`, `profiles` ni un identificador enviado como actor por el cliente. La sesión se deriva de `auth.uid()` y se enlaza server-side con `accounts.auth_user_id`.
3. La relación contiene `id`, `project_id`, `manager_account_id`, `started_at`, `ended_at`, `created_at` y `updated_at`. `ended_at IS NULL` significa activa; finalizar es monotónico y nunca borra o reactiva la fila.
4. Una cuenta puede gestionar muchos proyectos y un proyecto puede tener muchos managers. Un índice único parcial impide dos relaciones activas del mismo par y permite una nueva ocurrencia después de finalizar.

### Permisos y autorización

5. `project.manage` permanece global y exclusivo de administrator. `project.read_assigned` habilita listado/detalle contextual y `project.manage_assigned` habilita edición descriptiva y gestión de participaciones dentro del scope.
6. `project_manager` recibe `project.read_assigned` y `project.manage_assigned`. Administrator conserva el catálogo explícito, pero sus operaciones pasan por `project.manage`; poseer un permiso contextual no sustituye el rol ni crea scope.
7. La rama contextual exige en cada llamada: cuenta `active`, `auth_user_id = auth.uid()`, rol vigente `project_manager`, permiso vigente requerido y asignación manager–project activa. La rama administrativa exige `project.manage` y no depende de scope.
8. Suspensión, archivo, retirada del rol o finalización del scope cortan acceso en PostgreSQL sin esperar a la UI. Suspender o retirar el rol no altera `ended_at`; si la cuenta vuelve a estar activa y recupera el rol, un scope todavía activo vuelve a ser efectivo porque se restablece toda la conjunción aprobada.

### PostgreSQL

9. `project_manager_assignments` tendrá FK `ON DELETE RESTRICT` a `projects` y `accounts`, checks temporales, índices históricos por proyecto/cuenta, RLS habilitada, cero policies permisivas y cero DML directo para `anon`/`authenticated`.
10. Helpers internos específicos de Projects comprobarán acceso de lectura y bloquearán acceso de mutación. No serán ejecutables por cliente; las RPC pasarán permisos constantes, nunca un permiso controlado por request.
11. Las RPC existentes se reemplazarán solo mediante la nueva migración:
    - global o `project.read_assigned`: `list_projects`, `get_project_detail`, `list_project_assignments`;
    - global o `project.manage_assigned`: `update_project`, `search_project_volunteer_candidates`, `assign_volunteer_to_project`, `finish_project_volunteer_assignment`;
    - solo global: `create_project`, `close_project`, `list_volunteer_projects` y las cuatro operaciones de managers.
12. Las RPC nuevas serán `list_project_manager_assignments`, `search_project_manager_candidates`, `assign_project_manager` y `finish_project_manager_assignment`. Proyectarán solo IDs, display name y timestamps necesarios; no devolverán email, teléfono ni metadata Auth.
13. `SECURITY DEFINER` se limitará a fronteras necesarias, siempre con `search_path = ''`, referencias calificadas, `auth.uid()`, revokes totales y grant execute explícito solo a `authenticated`.

### Concurrencia e integridad

14. Alta de manager bloquea primero la cuenta objetivo y después valida `active`, Auth enlazado y rol/permiso vigentes. Comparte la fila de `accounts` con suspensión/archivo y `manage_account_role`, evitando TOCTOU de elegibilidad.
15. Las mutaciones contextuales bloquean en orden `actor account → scope activo → project → volunteer assignment`. Finalizar scope toma lock exclusivo sobre la misma fila de scope; la operación que gana completa y la perdedora vuelve a comprobar y falla cerrada.
16. Doble alta se protege con lock/índice único parcial y error estable. Doble finalización falla sin reescribir `ended_at`. Una fila histórica no bloquea una asignación futura válida.
17. Lecturas usan una única sentencia/snapshot y vuelven a comprobar cuenta, rol, permiso y scope. PostgreSQL sigue siendo la autoridad aunque React muestre controles según capacidades conocidas.

### Lifecycle de proyecto y concurrencia assign-manager/close

18. Una asignación nueva o una reasignación histórica solo puede crearse si el proyecto está `active`. El alta bloquea `target account → project FOR UPDATE` y relee bajo lock la elegibilidad de la cuenta, los permisos y el estado del proyecto.
19. Cerrar un proyecto no finaliza ni modifica asignaciones de project managers. `closed + manager assignment activa` es válido cuando el scope fue concedido antes del cierre; `closed + volunteer assignment activa` continúa prohibido por la invariante independiente de participaciones.
20. Si `close_project` gana el lock, el alta espera, relee `closed` y falla `23514/project_closed` sin fila ni auditoría. Si `assign_project_manager` gana, crea y confirma el scope; el cierre continúa y conserva el scope activo.
21. Un manager con scope activo sobre un proyecto cerrado conserva lectura, histórico y edición de nombre/descripción mientras mantenga cuenta, rol y permisos. No puede crear participaciones nuevas ni ejecutar lifecycle o administración de managers.

### Auditoría

22. Los eventos serán `project_manager_assignment.created` y `project_manager_assignment.ended`, con actor de sesión, entity type/ID técnicos, target derivado server-side si corresponde y metadata vacía. No se duplican display name, email, teléfono ni datos Auth.

### Aplicación y UI

23. El puerto de autorización de Projects evoluciona de una única capacidad global a una allowlist de `project.manage`, `project.read_assigned`, `project.manage_assigned` y la capacidad de padrón necesaria únicamente para decidir si se muestra un enlace; el project ID nunca se autoriza en cliente.
24. El gateway agrega contratos tipados para managers y mantiene Supabase exclusivamente en infraestructura. Composición adapta el contexto de cuenta mediante APIs públicas; Projects no importa Identity.
25. `/app/admin/projects` se reutiliza para ambos roles. Listado/detalle aceptan lectura contextual; edición acepta mutación contextual; alta, cierre, historial inverso del voluntario y gestión de managers permanecen administrativos.
26. La UI oculta alta/cierre/gestión de managers y enlaces al padrón sin capacidad global; muestra edición y gestión de participaciones con capacidad contextual. La URL directa sigue protegida y PostgreSQL vuelve a autorizar cada RPC.
27. El detalle administrativo incorpora managers activos e históricos, búsqueda por display name, asignación directa y finalización confirmada. No se expone email ni se reutiliza el gateway interno de administración de cuentas.

## Riesgos y mitigaciones

| Riesgo                                                  | Mitigación                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Acceso horizontal a proyecto no asignado                | conjunción server-side y pgTAP con dos managers/proyectos                     |
| Acceso tras suspensión, rol retirado o scope finalizado | comprobación dinámica en cada RPC y pruebas de revocación                     |
| TOCTOU entre operación y revocación                     | locks compartidos/exclusivos sobre cuenta y scope con orden fijo              |
| Duplicado activo concurrente                            | índice único parcial y prueba PostgreSQL real                                 |
| Exposición de cuentas/PII                               | proyecciones mínimas por display name; sin email/Auth metadata                |
| Escalamiento de manager a administración global         | `project.manage` intacto, rutas separadas y RPC create/close/scope admin-only |
| Acoplamiento Projects–Identity                          | FK/consulta PostgreSQL y puertos propios; composición por APIs públicas       |

## Fases y validaciones

| Fase                  | Resultado esperado                                    | Validación incremental                   | Estado     |
| --------------------- | ----------------------------------------------------- | ---------------------------------------- | ---------- |
| 0. Precheck/diseño    | rama, prompt, plan y decisión cerrada                 | Git, baseline y revisiones iniciales     | completada |
| 1. Dominio/aplicación | tipos, capacidades y casos de uso                     | tests focalizados y typecheck            | pendiente  |
| 2. PostgreSQL         | migración 0005, permisos, tabla, RPC, RLS y auditoría | reset, DB lint, pgTAP y concurrencia     | pendiente  |
| 3. Infra/composición  | gateway y tipos conectados                            | tests de gateway, boundaries y typecheck | pendiente  |
| 4. UI/rutas           | experiencia admin/manager y revocación visible        | componentes y acceso directo             | pendiente  |
| 5. E2E/docs           | recorrido crítico y trazabilidad                      | E2E y revisión documental                | pendiente  |
| 6. Cierre             | baseline completa y revisiones GO                     | release-readiness y scans                | pendiente  |

## Criterios de aceptación

- Administrator asigna y finaliza managers elegibles, consulta activos/históricos y conserva auditoría sin PII.
- Project manager lista únicamente proyectos con scope activo y no enumera proyectos ajenos mediante RPC o URL directa.
- Dentro del scope puede ver/editar descripción, consultar participantes, buscar/asignar voluntarios en proyecto activo y finalizar participaciones.
- Project manager no crea, cierra, reabre, elimina ni administra managers.
- Cuenta no activa, rol retirado, permiso ausente o scope finalizado pierde acceso inmediatamente en PostgreSQL.
- Dos altas activas iguales son imposibles bajo concurrencia; una histórica permite alta futura.
- Ambas intercalaciones assign-manager/close están versionadas: close-first rechaza el alta y assign-first conserva legítimamente el scope activo tras el cierre.
- RLS permanece default-deny y no hay DML directo ni acceso anon.
- Migraciones 0001–0004 permanecen intactas; no se añaden dependencias ni módulos futuros.
- Tests focalizados y baseline oficial terminan verdes; revisores de arquitectura, PostgreSQL/RLS, QA y documentación emiten GO.

## Progreso

- 2026-08-25: `main`/`origin/main` alineados en `3b4f778`; árbol limpio y rama `feat/project-manager-contextual-scope-v1` creada desde esa base.
- 2026-08-25: frozen install y baseline `pnpm verify` aprobaron con Node 22.18.0/pnpm 11.9.0.
- 2026-08-25: revisiones iniciales de arquitectura y PostgreSQL/RBAC confirmaron que `accounts.id`, RBAC vigente y ownership de Projects admiten el slice sin framework genérico.
- 2026-08-25: se detectó una única decisión pendiente sobre altas nuevas de managers en proyectos cerrados; no se creó migración.
- 2026-08-25: producto eligió limitar altas y reasignaciones a proyectos `active`; el cierre conserva scopes previos. Architect, database security, domain modeler y QA emitieron GO al diseño actualizado.

## Descubrimientos

- `project.read_assigned` existe en seed, pero todavía no concede acceso a `project_manager` ni es usado por las RPC.
- El modelo actual conserva roles al suspender y los elimina al revocar. La autorización dinámica permite cortar acceso sin alterar el histórico del scope.
- `list_volunteer_projects` cruza hacia el padrón y debe permanecer global para no permitir enumeración indirecta de proyectos.

## Decisiones durante la ejecución

- Las altas y reasignaciones de managers exigen proyecto `active` bajo el mismo lock que usa `close_project`.
- Cerrar un proyecto no finaliza scopes. Un scope activo previo conserva acceso histórico y edición descriptiva mientras toda la autoridad dinámica siga vigente.
- El guard de cierre continúa aplicando exclusivamente la invariante de participaciones voluntarias; no considera asignaciones de managers.

## Resultado final

Pendiente de implementación y validación. La decisión de producto quedó cerrada y habilita la migración forward-only 0005.
