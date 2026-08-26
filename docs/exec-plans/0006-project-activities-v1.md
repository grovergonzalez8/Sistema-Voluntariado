# ExecPlan 0006 — Project Activities V1

- Estado: diseño inicial completado; detenido para revisión humana
- Fecha: 2026-08-26
- Rama: `feat/project-activities-v1`
- Base: `main@3416aca`
- Restricción de esta fase: documentación y planificación únicamente

## Objetivo

Diseñar el siguiente slice vertical de Projects: actividades pertenecientes a un
proyecto, con agenda mínima, lifecycle terminal, consulta histórica,
autorización global/contextual y concurrencia compatible con el cierre del
proyecto y la revocación de manager scope. Esta primera fase no implementa SQL,
RPC, RLS, infraestructura, UI ni pruebas productivas; deja un diseño revisado y
se detiene antes de la migración.

## Contexto y estado inicial

- El workspace disponible corresponde al repositorio Git
  `/Users/grovergonzalez/Documents/Sistema-Voluntariado`; la ruta Windows
  `C:\Users\grove\Desktop\PROYECTOS\Sistema-VOLUNTARIADO` indicada en el
  encargo no existe en este entorno macOS. `git rev-parse --show-toplevel`
  confirmó el workspace citado.
- La rama requerida no existía local ni remotamente. Se creó
  `feat/project-activities-v1` desde `main@3416aca`; después de
  `git fetch origin --prune`, `HEAD`, `main`, `origin/main` y ambos merge-base
  coinciden en `3416aca5de7b648ada6b0e2bdeff458351f12046`.
- Projects V1 ya implementa `Project`, `ProjectVolunteerAssignment` y
  `ProjectManagerAssignment` dentro de `apps/web/src/modules/projects`.
  Dominio/aplicación no importan Identity, Volunteers, React, SQL ni Supabase;
  infraestructura y composición respetan los límites vigentes.
- `close_project(uuid)` bloquea la fila `projects FOR UPDATE` y el trigger
  `guard_project_update()` impide hoy cerrar con participaciones voluntarias
  activas mediante `project_has_active_assignments`.
- El acceso contextual exige dinámicamente cuenta `active`, rol
  `project_manager`, permiso contextual y scope activo. El helper autoritativo
  toma locks `account FOR SHARE → scope FOR SHARE`; las mutaciones continúan
  con `project FOR UPDATE → child row FOR UPDATE`.
- No existe tabla, tipo de dominio, RPC, gateway, ruta, componente o prueba de
  Project Activity.
- `activity.create` y `activity.join` existen únicamente en el seed local y en
  documentación histórica como permisos futuros. El seed los concede a
  administrator, pero ninguna migración productiva, RPC, policy, aplicación o
  UI los usa. No se reinterpretan ni eliminan en este incremento.

## Baseline inicial

Se usó un runtime temporal fuera del repositorio para cumplir exactamente Node
`22.18.0`; Corepack resolvió pnpm `11.9.0`. El shell global tenía Node
`22.21.0` y pnpm `11.19.0`, por lo que no se usó como evidencia de los gates.

| Gate                                                    | Resultado observado                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --version` / `pnpm --version` con runtime aislado | `v22.18.0` / `11.9.0`                                                                                                                                                 |
| `pnpm install --frozen-lockfile`                        | aprobado; 6 proyectos, lockfile al día                                                                                                                                |
| `pnpm verify`                                           | aprobado: formato, lint, boundaries, 4 probes arquitectónicos, typecheck web/Functions, 13/13 orquestación, 176/176 unitarias, 2/2 integración y build de 462 módulos |
| `pnpm db:start`                                         | aprobado; Supabase local sin Edge Runtime automático                                                                                                                  |
| `pnpm db:reset`                                         | aprobado; aplicó migraciones 0001–0005 y seed local                                                                                                                   |
| `pnpm exec supabase db lint --local --level warning`    | aprobado; cero resultados/avisos de esquema                                                                                                                           |
| `pnpm db:test`                                          | aprobado; 5 archivos y 309/309 pgTAP                                                                                                                                  |
| `pnpm projects:test:concurrency`                        | aprobado; 7/7 carreras con bloqueo PostgreSQL observado                                                                                                               |
| `pnpm test:functions`                                   | aprobado; 21/21                                                                                                                                                       |
| `pnpm test:e2e`                                         | aprobado; 11/11 con un worker serial                                                                                                                                  |
| `pnpm db:stop`                                          | aprobado; Supabase local detenido y cero contenedores activos del proyecto confirmados con Docker                                                                     |

No se observó flakiness, tests omitidos ni fallos funcionales. Avisos no
bloqueantes: Supabase CLI y Turbo informaron versiones más nuevas disponibles;
Playwright informó que `NO_COLOR` se ignoró porque `FORCE_COLOR` estaba activo.
No se actualizó ninguna dependencia.

## Alcance aprobado

- `ProjectActivity` como recurso hijo de exactamente un `Project` y propiedad
  del bounded context Projects.
- Alta, listado, detalle, edición mientras está `scheduled`, completar y
  cancelar.
- Agenda mínima con inicio obligatorio, fin y ubicación textual opcionales.
- Histórico consultable en proyecto cerrado, sin mutaciones posteriores.
- Administrator global por `project.manage` y project manager por
  `project.read_assigned`/`project.manage_assigned` más autoridad contextual.
- Persistencia PostgreSQL forward-only, RLS default-deny, RPC de mínimo
  privilegio y auditoría atómica sin PII.
- Integración autoritativa con `close_project` y regresiones reales de locks.
- UI accesible y simple dentro del detalle de Project.

## Fuera de alcance

- Activity Participation o cualquier relación Activity–Volunteer/Account.
- `activity_participants`, `activity_volunteers`, RSVP, self join, waiting
  lists, attendance o estados de asistencia.
- `responsible_user_id` u otro responsable individual de Activity.
- Tasks, notificaciones, calendarios externos, recurrencia, archivos o
  documentos.
- Capacidad, solapamientos, unicidad de nombre, auto-completion, restricciones
  contra fechas pasadas o reglas basadas en la hora actual.
- Reabrir, descompletar, descancelar o eliminar Activities desde cliente.
- Crear un módulo top-level Activities/Work o un framework genérico de scopes.
- Cambiar migraciones 0001–0005, desplegar, enlazar Supabase remoto, push,
  merge, rebase o amend.

La exclusión de Participation es deliberada. Modelarla exigiría antes acordar
eligibility, inscripción propia/administrativa, retiro, asistencia, histórico,
efecto de finalizar una participación de proyecto, cancelación y permisos del
voluntario. Ninguna de esas reglas se infiere en V1.

## Modelo de dominio y lenguaje ubicuo

`ProjectActivity` es el nombre de la entidad; `project_activities`, el nombre
propuesto de su tabla. No se usa `Event`, `Task`, `Assignment`, `Participation`
ni `active` como sinónimos.

Campos de dominio:

- `id`
- `projectId`
- `name`
- `description`
- `startsAt`
- `endsAt`
- `locationText`
- `status`
- `statusChangedAt`
- `createdAt`
- `updatedAt`

Normalización propuesta, simétrica entre TypeScript y PostgreSQL:

- `name`: trim, whitespace visible colapsado, obligatorio, 1–120 caracteres.
- `description`: trim, whitespace colapsado, vacío a `null`, máximo 1.000.
- `locationText`: trim, whitespace colapsado, vacío a `null`, máximo 200.
- `startsAt`: instante válido y obligatorio.
- `endsAt`: instante válido o `null`; cuando existe, `endsAt >= startsAt`.
- Sin columna de timezone. PostgreSQL conserva instantes y presentación aplica
  locale.

Los tests de paridad deberán incluir Unicode astral para no aceptar una
diferencia accidental entre `String.length` y `char_length`.

## Estados, lifecycle e invariantes

```mermaid
stateDiagram-v2
  [*] --> scheduled: crear en Project active
  scheduled --> scheduled: editar agenda/texto
  scheduled --> completed: completar
  scheduled --> cancelled: cancelar
  completed --> [*]
  cancelled --> [*]
```

1. Toda Activity nace `scheduled`; el cliente no envía el estado inicial.
2. `scheduled` es el único estado editable y transicionable.
3. `completed` y `cancelled` son terminales e inmutables.
4. No existe reapertura, transición cruzada terminal ni DELETE cliente.
5. `project_id`, `id` y `created_at` son inmutables; no se mueve una Activity
   entre proyectos.
6. Crear o mutar exige Project `active`. Project `closed` solo permite lectura
   histórica.
7. `closed + scheduled Activity` es una combinación prohibida.
8. Cerrar no toca filas Activity, no cambia timestamps, no completa/cancela y
   no genera auditoría Activity.
9. `status_changed_at` se fija por servidor al crear la Activity para marcar el
   comienzo de `scheduled`, permanece estable en ediciones y se reemplaza por
   hora de servidor al completar o cancelar.
10. `updated_at` cambia en edición y transición; `created_at` nunca cambia.
11. `ends_at` es el fin planificado, no un indicador de estado; no provoca
    transición automática.
12. No hay unicidad de nombre, límites de cantidad, regla de solapamiento,
    duración máxima/mínima ni requisito de fecha futura.

## Autorización

### Administrator

Una cuenta activa con `project.manage` puede listar/detallar Activities en
cualquier Project y crear/editar/completar/cancelar cuando Project y Activity
cumplan el lifecycle.

### Project manager contextual

Cada RPC revalida en PostgreSQL:

- actor de `auth.uid()` enlazado a `accounts`;
- `accounts.status = 'active'`;
- rol vigente `project_manager`;
- `project.read_assigned` para lectura o `project.manage_assigned` para mutar;
- `project_manager_assignments.ended_at IS NULL` para el Project target.

El manager puede leer histórico de un Project cerrado mientras el scope siga
vigente, pero no crear ni mutar Activities allí. No puede cerrar Project ni
administrar managers.

### Permisos históricos

Activities V1 no usa `activity.create` ni `activity.join`. Conservar esos
placeholders evita un cambio silencioso de significado; en pruebas se retirarán
temporalmente del administrator y se concederá `activity.create` a un actor no
autorizado para demostrar que no influyen. No se añade
`activity.manage_assigned`: Activity hereda la autoridad de su Project.

La UI usa capacidades solo para UX. Para operaciones compartidas debe considerar
`project.manage || project.manage_assigned`, pero el scope de una fila nunca se
decide en React.

## Modelo SQL propuesto — no implementado

### Tabla `public.project_activities`

| Columna             | Tipo               | Regla propuesta                                    |
| ------------------- | ------------------ | -------------------------------------------------- |
| `id`                | `uuid`             | PK, `extensions.gen_random_uuid()`                 |
| `project_id`        | `uuid`             | NOT NULL, FK `projects(id) ON DELETE RESTRICT`     |
| `name`              | `text`             | NOT NULL, normalizado, 1–120                       |
| `description`       | `text null`        | normalizado, 1–1.000 cuando existe                 |
| `starts_at`         | `timestamptz`      | NOT NULL, dato de agenda                           |
| `ends_at`           | `timestamptz null` | `null` o `>= starts_at`                            |
| `location_text`     | `text null`        | normalizado, 1–200 cuando existe                   |
| `status`            | `text`             | NOT NULL DEFAULT `scheduled`, allowlist exacta     |
| `status_changed_at` | `timestamptz`      | NOT NULL DEFAULT `statement_timestamp()`; servidor |
| `created_at`        | `timestamptz`      | NOT NULL DEFAULT `statement_timestamp()`; servidor |
| `updated_at`        | `timestamptz`      | NOT NULL DEFAULT `statement_timestamp()`; trigger  |

Constraints propuestos:

- nombre/descripción/ubicación normalizados y dentro de límites;
- `status IN ('scheduled', 'completed', 'cancelled')`;
- `ends_at IS NULL OR ends_at >= starts_at`;
- `status_changed_at >= created_at`;
- `updated_at >= created_at AND updated_at >= status_changed_at`.

No hay FK a `volunteers`, `accounts`, `profiles` o Auth; tampoco columnas de
responsable/participación ni unicidad por nombre.

Índices mínimos:

- `project_activities_project_starts_at_id_idx` en
  `(project_id, starts_at, id)` para un orden estable de listado;
- `project_activities_scheduled_project_idx` parcial en `(project_id) WHERE
status = 'scheduled'` para el guard de cierre;
- la PK cubre acceso por `id` y todas las búsquedas de detalle combinan además
  `project_id`.

### Triggers internos

- guard de insert/update: estado inicial, transiciones, terminalidad, campos
  inmutables, Project active y timestamps server-side;
- guard de DELETE: `42501/project_activity_delete_not_allowed`;
- `set_updated_at` existente;
- auditoría after insert/update.

Los guards tampoco serán ejecutables por roles cliente. Las RPC prebloquean en
el orden canónico; los triggers conservan defensa para cualquier futura ruta
privilegiada interna.

## RPC propuestas — no implementadas

Todas serán `SECURITY DEFINER`, `search_path = ''`, nombres cualificados, actor
derivado de `auth.uid()`, parámetros validados y `EXECUTE` exclusivo para
`authenticated`:

- `list_project_activities(requested_project_id uuid)`
- `get_project_activity_detail(requested_project_id uuid,
requested_activity_id uuid)`
- `create_project_activity(requested_project_id uuid, requested_name text,
requested_description text, requested_starts_at timestamptz,
requested_ends_at timestamptz, requested_location_text text)`
- `update_project_activity(requested_project_id uuid,
requested_activity_id uuid, requested_name text,
requested_description text, requested_starts_at timestamptz,
requested_ends_at timestamptz, requested_location_text text)`
- `complete_project_activity(requested_project_id uuid,
requested_activity_id uuid)`
- `cancel_project_activity(requested_project_id uuid,
requested_activity_id uuid)`

No habrá RPC pública genérica que reciba el estado objetivo. Ninguna firma
acepta `status`, `status_changed_at`, `created_at` o `updated_at`.

Detalle/update/complete/cancel reciben Project y Activity para autorizar primero
el Project y después buscar `activity.id = requested_activity_id AND
activity.project_id = requested_project_id`. Así un manager no puede usar un
UUID de Activity como oráculo de existencia fuera de su scope.

Errores estables propuestos:

| SQLSTATE | Código                                  |
| -------- | --------------------------------------- |
| `42501`  | `permission_denied`                     |
| `P0002`  | `project_not_found`                     |
| `P0002`  | `project_activity_not_found`            |
| `23514`  | `project_closed`                        |
| `23514`  | `project_activity_not_scheduled`        |
| `23514`  | `project_has_scheduled_activities`      |
| `22023`  | `project_activity_immutable_fields`     |
| `22023`  | `project_activity_must_start_scheduled` |
| `42501`  | `project_activity_delete_not_allowed`   |

`project_activity_not_scheduled` es el error único para editar o intentar una
segunda transición terminal; permite que el perdedor de complete/cancel tenga
un contrato estable sin revelar una transición diferente.

## RLS y grants

- Habilitar RLS en `project_activities`.
- Cero policies permisivas.
- `REVOKE ALL` de tabla a `public`, `anon` y `authenticated`.
- Sin SELECT/DML directo del navegador; toda proyección sale por RPC mínima.
- Revocar helpers/triggers a cliente.
- Revocar cada RPC a `public`/`anon`; conceder solo a `authenticated`.
- No conceder nada nuevo a `service_role`.
- Probar catálogo, grants por firma y que DML directo falla incluso para un
  actor que podría ejecutar la RPC equivalente.

## Auditoría

Eventos propuestos, consistentes con Projects:

- `project_activity.created`
- `project_activity.updated`
- `project_activity.completed`
- `project_activity.cancelled`

`entity_type = 'project_activity'`, `entity_id = activity.id`, actor desde
`auth.uid()` y escritura en la misma transacción. `changed_fields` contiene
solo nombres de campos; `previous_state/new_state` solo contienen códigos de
estado para transiciones; `metadata = '{}'`; no se usa `target_user_id`.

No se copian nombre, descripción, ubicación, fechas de agenda, valores previos,
PII ni cuerpos de solicitud. Una operación fallida revierte cualquier evento.

## Integración forward-only con cierre de Projects

La futura migración propuesta `202608260006_project_activities.sql`, posterior a
0005, debe:

1. crear tabla, constraints, índices, guards, auditoría y RPC nuevas;
2. reemplazar mediante `CREATE OR REPLACE FUNCTION`
   `public.guard_project_update()`;
3. conservar primero el chequeo y error histórico
   `project_has_active_assignments`;
4. añadir después `EXISTS` de `project_activities` scheduled y lanzar
   `23514/project_has_scheduled_activities`;
5. conservar el trigger existente y la firma/cuerpo/grant de
   `close_project(uuid)`.

No se modifica 0004. El guard central protege tanto la RPC como una futura ruta
interna que actualice `projects.status`. Duplicar el chequeo solo en
`close_project` dejaría una defensa incompleta.

La tabla nueva comienza vacía: proyectos activos/cerrados existentes siguen
válidos, no hay backfill, no se inventan Activities ni timestamps, y ninguna
fila histórica se reescribe. La migración es aditiva salvo el reemplazo
compatible del guard.

## Orden de locks

| Operación                            | Orden autoritativo                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Create administrator                 | `project FOR UPDATE → insert activity`                                                         |
| Create manager                       | `actor account FOR SHARE → active scope FOR SHARE → project FOR UPDATE → insert activity`      |
| Update/complete/cancel administrator | `project FOR UPDATE → activity FOR UPDATE`                                                     |
| Update/complete/cancel manager       | `actor account FOR SHARE → active scope FOR SHARE → project FOR UPDATE → activity FOR UPDATE`  |
| Close                                | `project FOR UPDATE → comprobar assignments → comprobar scheduled activities → update project` |
| Scope removal                        | `scope FOR UPDATE`                                                                             |

Nunca se bloquea Activity antes de Project ni scope después de Project. Las
operaciones de manager llaman primero a `lock_project_contextual_access`; si la
revocación ganó, el helper espera, relee `ended_at` y niega. Si la mutación ganó,
el finalizador de scope espera el lock compartido y termina después.

## Concurrencia

### Create Activity ↔ close Project

```mermaid
sequenceDiagram
  participant C as Create Activity
  participant P as Project row
  participant X as close_project
  alt Create gana
    C->>P: FOR UPDATE, releer active
    C->>C: INSERT scheduled + audit
    X->>P: espera
    C-->>P: COMMIT
    X->>P: lock + guard ve scheduled
    X-->>X: project_has_scheduled_activities
  else Close gana
    X->>P: FOR UPDATE + UPDATE closed
    C->>P: espera
    X-->>P: COMMIT
    C->>P: releer closed
    C-->>C: project_closed, sin fila/audit
  end
```

Resultados únicos: `active + nueva scheduled` si create gana, o `closed + cero
nuevas` si close gana. Nunca `closed + newly-created scheduled`.

### Complete/cancel last scheduled ↔ close

```mermaid
sequenceDiagram
  participant T as Complete/Cancel
  participant P as Project row
  participant A as Activity row
  participant X as close_project
  alt Transición gana
    T->>P: FOR UPDATE
    T->>A: FOR UPDATE, releer scheduled
    T->>A: terminal + status_changed_at + audit
    X->>P: espera
    T-->>P: COMMIT
    X->>P: lock + guard sin scheduled
    X-->>X: Project closed
  else Close observa scheduled
    X->>P: FOR UPDATE
    X->>X: guard rechaza cierre
    X-->>P: rollback y libera lock
    T->>P: obtiene lock
    T->>A: transición terminal
    T-->>T: Project queda active
  end
```

Complete y cancel entre sí toman Project y luego la misma Activity. Solo el
primero cambia `scheduled`; el perdedor relee terminal y falla
`project_activity_not_scheduled`. Debe existir exactamente un evento terminal.

### Manager mutation ↔ scope removal

```mermaid
sequenceDiagram
  participant M as Manager mutation
  participant A as Actor account
  participant S as Active scope
  participant P as Project
  participant R as Scope removal
  alt Mutación gana
    M->>A: FOR SHARE + revalidar autoridad
    M->>S: FOR SHARE + revalidar scope
    M->>P: FOR UPDATE
    R->>S: FOR UPDATE, espera
    M-->>M: mutación + audit + COMMIT
    R->>S: ended_at server-side + COMMIT
  else Removal gana
    R->>S: FOR UPDATE + ended_at
    M->>A: FOR SHARE
    M->>S: FOR SHARE, espera
    R-->>S: COMMIT
    M->>S: relee sin scope activo
    M-->>M: permission_denied, sin cambio/audit
  end
```

La regresión debe parametrizar create, update, complete y cancel en ambos
órdenes; una sola operación representativa no demuestra que todas las RPC
llaman el helper.

## Arquitectura de aplicación y UI

Activities permanece en `apps/web/src/modules/projects`. Para no seguir
acumulando responsabilidades en archivos ya grandes, la implementación futura
se separará dentro del mismo módulo, por ejemplo:

- `domain/project-activity.ts`
- puerto/servicio de aplicación específico de Activity
- gateway Supabase específico o sub-adaptador explícito dentro de Projects
- `presentation/project-activities-section.tsx`

No se crea un módulo top-level, CRUD genérico, base repository, aggregate
framework ni framework de scope. La composición conecta el nuevo servicio
mediante la API pública de Projects; dominio/aplicación no conocen Supabase ni
Identity.

Project detail incorporará una sección Activities con:

- nombre, fecha/hora, estado y ubicación opcional;
- empty/loading/error/success accesibles;
- Create/Edit/Complete/Cancel solo como UX para actor capaz, Project active y
  Activity scheduled;
- confirmación de complete/cancel;
- terminales y Project closed estrictamente read-only;
- `toLocaleString`/i18n, sin calendario complejo, drag/drop o timeline.

## Estrategia de pruebas futura

### Dominio y aplicación

- trim, colapso de whitespace y vacíos a `null`;
- límites 120/1.000/200, borde y `+1`, incluido Unicode astral;
- instantes inválidos, offsets equivalentes, fechas pasadas permitidas,
  `ends_at = starts_at` y fin anterior rechazado;
- creación solo scheduled, ambas transiciones y terminalidad;
- Project closed, UUID inválido y validación antes de gateway;
- ninguna llamada a infraestructura ante entrada/autoridad local inválida;
- capacidades `manage || manageAssigned` sin pretender decidir scope.

### Gateway y presentación

- mapping completo snake_case/camelCase y argumentos RPC sin estado/timestamps
  técnicos;
- traducción de todos los errores propuestos;
- listado vacío, carga, error, éxito y refresh después de mutación;
- formularios etiquetados, errores asociados, ubicación opcional y fechas;
- acciones solo scheduled y Project active; terminal/closed read-only.

### pgTAP/RLS

- tabla, tipos, FK restrictiva, constraints, índices, triggers y ausencia de
  DELETE RPC;
- RLS activa, cero policies, cero grants de tabla y DML directo denegado;
- `SECURITY DEFINER`, `search_path = ''`, nombres cualificados y grants exactos;
- administrator activo; manager con scope; proyecto ajeno; scope terminado;
  manager sin rol/permiso, suspended y archived; coordinator, volunteer y anon;
- create/read/update/complete/cancel y todas las transiciones inválidas;
- Project closed lee histórico y rechaza mutación;
- `close_project` y UPDATE interno fallan con scheduled; preservar precedencia
  `project_has_active_assignments` cuando ambas invariantes fallan;
- cierre posterior a todas las terminales y asignaciones finalizadas;
- cierre no cambia ninguna fila/timestamp/auditoría Activity;
- cuatro eventos exactos, actor correcto, payload mínimo y fallos sin evento;
- retirar `activity.create/join` del admin y conceder `activity.create` a
  coordinator para probar que no autorizan.

### Concurrencia y mutation testing

- create-first/close-first;
- complete-first/close y close observa scheduled;
- cancel-first/close y close observa scheduled;
- complete-first/cancel-first;
- create/update/complete/cancel ↔ scope removal, ambos órdenes;
- `pg_blocking_pids`, SQLSTATE/mensaje, estado final, auditoría y cleanup en
  cada caso, sin sleeps arbitrarios;
- mutaciones temporales dirigidas: retirar locks/guards/precondición
  scheduled/helper contextual y demostrar FAIL; restaurar y confirmar PASS sin
  diff.

El harness nuevo debe incorporarse a `projects:test:concurrency`, conservar la
prueba de paridad con CI y medir si el timeout actual de dos minutos sigue
siendo suficiente. Repetir la suite cinco veces antes del cierre.

### E2E

- Administrator: crear Project; crear dos Activities; editar; comprobar que el
  cierre falla; completar una y cancelar otra; cerrar; ver ambas históricas sin
  acciones.
- Project manager scoped: abrir asignado; crear; editar; completar/cancelar al
  menos una Activity y verificar la otra transición en el recorrido o pgTAP.
- Manager no asignado: no enumera y URL directa se deniega.
- Project closed: administrator y manager con scope ven histórico read-only.
- Los negativos autoritativos permanecen en PostgreSQL; ausencia de botones no
  sustituye RLS/RPC.

Descubrimiento QA: la suite actual de 0005 no prueba nominalmente que un manager
mute un recurso hijo; sus pgTAP/E2E/harness usan principalmente `update_project`.
Activities V1 debe cerrar ese hueco y no citar la cobertura previa como prueba.

## Riesgos y mitigaciones

| Riesgo                                                 | Mitigación                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `closed + scheduled` por TOCTOU                        | lock común de Project, guard central e intercalaciones reales                |
| complete/cancel dobles                                 | Project → Activity locks, precondición scheduled y error estable             |
| mutación tras revocar scope                            | account → scope → project → activity y carreras por cada RPC                 |
| acceso horizontal por UUID Activity                    | firmas con Project + Activity, autorización previa y predicado compuesto     |
| permisos placeholders adquieren semántica accidental   | no usarlos y probar su irrelevancia                                          |
| timestamps manipulados                                 | firmas sin campos técnicos, defaults/triggers server-side y cero DML cliente |
| PII/agenda sensible en auditoría                       | solo IDs, nombres de campos, estados técnicos y metadata vacía               |
| UI Projects monolítica                                 | slice/section Activity separado dentro del mismo bounded context             |
| harness excede timeout CI                              | medir duración, mantener gate raíz y ajustar timeout con evidencia           |
| documentación describe implementación antes de existir | mantener docs de producto como futuro hasta la fase técnica                  |

## Preguntas abiertas reales

No hay preguntas de producto bloqueantes para iniciar una futura fase técnica.
Quedan como decisiones técnicas no bloqueantes ya resueltas en este plan:

- `status_changed_at` es no nulo y comienza en la creación scheduled;
- ubicación máxima 200 y normalización igual a Projects;
- precedencia de cierre conserva primero `project_has_active_assignments`;
- el perdedor terminal usa `project_activity_not_scheduled`;
- listado tendrá orden estable por `(starts_at, id)`.

Cualquier propuesta posterior de preservar saltos de línea, solapamientos,
fechas futuras, razones de cancelación o participación reabre producto y no se
implementa por inferencia.

## Fases y validaciones

| Fase                     | Resultado                                                   | Validación                                                     | Estado                           |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| 0. Precheck/baseline     | rama, gobernanza, estado real y suite base                  | Git, frozen install, verify, DB, concurrencia, Functions y E2E | completada                       |
| 1. Diseño y revisión     | ExecPlan, SQL previo, locks, QA y trazabilidad IA           | cinco revisores read-only y revisión humana                    | completada salvo revisión humana |
| 2. Dominio/aplicación    | tipos, normalización, lifecycle, puertos/casos de uso       | tests focalizados, typecheck, boundaries                       | pendiente                        |
| 3. PostgreSQL            | migración 0006, tabla, guards, RPC, RLS, auditoría y cierre | reset, lint, pgTAP, catálogo y mutation tests                  | pendiente                        |
| 4. Infra/composición     | adaptador tipado y servicio conectado                       | gateway tests, boundaries, typecheck                           | pendiente                        |
| 5. UI                    | sección Project Activities accesible y read-only histórica  | component tests, i18n y accesibilidad                          | pendiente                        |
| 6. Concurrencia/E2E/docs | harness integrado, recorridos y documentación vigente       | cinco repeticiones, E2E local/CI y docs review                 | pendiente                        |
| 7. Cierre                | baseline completa y revisiones finales                      | release-readiness, scans y revisión humana                     | pendiente                        |

No se inicia la fase 2 hasta aprobación humana de este diseño. Antes de escribir
la migración se integrarán todos los bloqueantes de revisión de diseño.

## Criterios de aceptación del incremento futuro

- Activities pertenece a Projects y no introduce Participation, Tasks ni un
  framework genérico.
- Estados exactos y terminalidad quedan protegidos en dominio y PostgreSQL.
- Administrator y manager contextual autorizado completan el flujo; todos los
  sujetos/estados negativos fallan cerrados.
- Project closed conserva histórico y no admite alta/mutación Activity.
- Nunca existe `closed + scheduled`, ni siquiera bajo concurrencia.
- Una sola transición terminal gana y el perdedor recibe error estable.
- Scope removal y cada mutación Activity serializan en ambos órdenes.
- RLS/grants niegan DML directo; RPC privilegiadas son mínimas y seguras.
- Auditoría atómica contiene solo metadata técnica mínima.
- Migraciones 0001–0005 permanecen byte-for-byte intactas.
- Gates, mutation tests, cinco repeticiones, revisiones y documentación quedan
  verdes antes de declarar el incremento completado.

## Revisiones iniciales

- Architect: PASS con observaciones. Confirmó ownership en Projects, ausencia
  de framework genérico, orden de locks y necesidad de extraer el slice UI.
- Database security: GO condicionado a este diseño. Exigió guard de cierre
  forward-only, firmas Project + Activity, estados server-authoritative y RLS
  default-deny.
- Domain modeler: PASS con observaciones. Confirmó lifecycle, terminalidad,
  lenguaje ubicuo y exclusión explícita de Participation.
- QA: GO para el diseño con criterios obligatorios. Señaló el hueco existente de
  mutación contextual de recurso hijo y exigió carreras por cada RPC.
- Docs governor: NO-GO inicial por omitir la evidencia de `db:stop` y mantener
  un estado contradictorio de la propia revisión. Ambos puntos se corrigieron;
  el recheck final emitió GO documental.

Todos los revisores operan en solo lectura; el agente principal es el único
escritor. Sus observaciones no sustituyen revisión humana.

## Progreso

- 2026-08-26: ruta Git, rama, limpieza, HEAD/base/merge-base y alineación fresca
  con `origin/main` confirmadas.
- 2026-08-26: lectura completa de gobernanza, documentación requerida,
  ExecPlans 0004/0005 y trazabilidad IA; inspección de dominio, aplicación,
  adaptadores, composición, router, UI, migraciones, RLS/RPC, audit, pgTAP,
  harness, E2E y CI.
- 2026-08-26: baseline completa aprobada con runtime exacto; no hubo fallos ni
  flakiness observada.
- 2026-08-26: `pnpm db:stop` aprobó al finalizar la inspección y una consulta
  posterior de Docker confirmó cero contenedores activos del proyecto.
- 2026-08-26: revisiones iniciales de arquitectura, base de datos, dominio y QA
  integradas sin preguntas de producto bloqueantes.
- 2026-08-26: ExecPlan y prompt 0010 redactados; no se creó migración, RPC,
  código productivo, UI ni prueba productiva.
- 2026-08-26: el NO-GO documental inicial señaló dos defectos de trazabilidad;
  se integraron la evidencia de apagado y un estado de revisión coherente; el
  recheck emitió GO.

## Descubrimientos

- Los permisos Activity históricos son fixtures/documentación, no una API
  funcional, y no expresan el scope del recurso hijo.
- El guard de cierre, no solo `close_project`, es la frontera que debe evolucionar
  para proteger también rutas internas privilegiadas.
- Las firmas actuales de finalización de participaciones preleen la relación por
  ID antes de autorizar scope; Activities evitará repetir ese oráculo menor.
- La cobertura contextual existente prueba Project pero no una mutación nominal
  de recurso hijo por manager.
- La documentación vigente que llama Activities/Tasks un contexto futuro sigue
  describiendo el código actual; se actualizará solo junto con la implementación.

## Decisiones durante esta fase

- Reutilizar permisos Project y helpers específicos de Projects.
- Mantener `close_project(uuid)` y reemplazar únicamente su guard central en la
  migración futura.
- Usar Project como raíz de consistencia y el orden de locks de 0005.
- No copiar el prelookup por child ID de la participación existente.
- Separar Activities en archivos propios dentro de Projects para limitar
  acoplamiento sin inventar otro módulo.

## Resultado de esta fase

Diseño inicial documentado y revisado, con baseline verde y sin cambios de
implementación. La rama queda detenida para revisión humana. La migración 0006,
RPC, RLS, código, UI y pruebas siguen expresamente pendientes.
