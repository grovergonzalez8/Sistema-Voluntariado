# ExecPlan 0014 — Aislamiento por identidad de recurso (AUD-004)

- Estado: corrección terminada y gates locales aprobados; validación con el pin
  Node y E2E pendiente. APTO PARA COMMIT con estas limitaciones documentadas.
- Fecha: 2026-11-22; rama autorizada `main`, base `02d0ecd`.
- Git inicial limpio. AUD-001 (`381d041`) y AUD-003 (`02d0ecd`) integrados.
- Instrucciones: AGENTS raíz/web, PLANS, ADR 0004/0012, reglas de capas y planes
  0005/0012/0013. Siguiente número libre: 0014. Cambio material de asincronía en
  tres módulos; este es su único documento de diseño y ejecución.

## Diagnóstico por pantalla y alcance

| Pantalla                      | Caso confirmado por código                                                          | Alcance                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ProjectEdit / ProjectForm     | A permanece tras cambiar ID; borrador A + target B; onSaved antiguo navega          | Aislar pantalla y operaciones del formulario                          |
| VolunteerEdit / VolunteerForm | Igual, incluidos datos personales y advertencias de duplicados                      | Aislar pantalla, borrador, confirmación y callbacks                   |
| AccountDetail                 | Cuenta/motivo/roles/mensajes A visibles con handlers B; status/role/recover tardíos | Aislar cuenta y guardas en cada await                                 |
| ProjectDetail                 | Proyecto, capacidades, candidatos e históricos A persisten; acciones usan B         | Aislar instancia, lecturas/acciones y refrescos; sin refactor general |
| VolunteerDetail               | Datos A y enlaces B durante carga; error persistente al volver                      | Misma variante de identidad, solo consulta/enlaces                    |
| VolunteerProjects             | Historial A presentado con retorno B; loading/error no reiniciados                  | Aislar consulta/historial                                             |
| InvitationDetail              | Ya liga resultado a route ID y descarta lectura desmontada                          | Excluida: no hay mezcla confirmada que requiera cambio                |
| Activities / listados         | AUD-001/AUD-003 ya protegen sus casos                                               | Sin cambios de implementación; regresión conjunta                     |

No se modifica router, API pública, contratos de servicios, capas internas, SQL,
RLS, permisos, dependencias/lockfile o planes históricos. Solo presentación,
pruebas, mensajes i18n requeridos y changelog. Sin commits/push/deploy, servicios,
resets, migraciones ni pruebas persistentes.

## Causa raíz y solución

React Router reutiliza la pantalla al cambiar params; los estados se asociaban
a la instancia, pero los handlers leían el ID nuevo. El cleanup del efecto evita
aplicar una lectura vieja, pero no retira el dato asentado ni protege mutaciones.
Los formularios inicializan una sola vez y sus callbacks permanecían vigentes.

- Wrappers concretos por ID dentro de cada pantalla: estado completo nuevo al
  navegar, conservando exports/props públicos. No hook ni framework entre módulos.
- Guardas de montaje (cleanup de layout para mutaciones), referencias síncronas
  de operación en curso, y comprobación antes de callbacks/navegación/refrescos.
- Solo habilitar acciones con snapshot válido del recurso solicitado. Contrastar
  IDs de entidades/relaciones que alimentan acciones; mismatch falla seguro.
- Tratar Result failure y rechazo de Promise; errores seguros traducidos y retry
  de carga. Un error de snapshot retira acciones, un error de operación es inline.
- Preservar reglas de dominio y PostgreSQL, incluso edición descriptiva de Project
  cerrado permitida. Sin cambios de negocio en terminales, roles o idempotencia.
- AccountDetail mantiene refresh de autoridad de una mutación propia exitosa aun
  después de cambiar recurso, solo si el actor original sigue siendo el actual.
  El callback interno de IdentityProvider captura el actor y lo contrasta con el
  actual antes de consultar, incluso después de desmontar toda AccountDetail.
  Esta excepción necesaria a los componentes de pantalla no cambia firmas ni
  contratos: evita refrescar otro actor sin perder el refresh de autosuspensión.
  Los cambios visuales de cuenta siempre requieren la instancia vigente.
- La recuperación mantiene un snapshot de clave y motivo normalizado por actor
  y cuenta en el wrapper. A→B→A conserva el request completo, nunca solo la clave
  con otro motivo (el servidor contrasta el fingerprint). Validación inválida no
  reserva una intención; el motivo queda inmutable mientras siga pendiente.
  Cambio de actor limpia las intenciones; cargar una cuenta ya no invited retira
  el snapshot y restablece el motivo para nuevas operaciones administrativas.

Alternativas descartadas: reset parcial mediante efectos, key solo en router
(no cubre consumidores directos ni callbacks), invalidación visual sin proteger
escrituras, propagación de internals Identity a otros módulos y cancelación de
RPC no soportada. Una escritura ya enviada puede finalizar en su destino original;
la navegación no promete deshacerla ni resolver conflictos entre ediciones
independientes de la misma entidad.

## Fases y criterios de aceptación

- [x] Diagnóstico, instrucciones y baseline.
- [x] Plan antes del código.
- [x] Pruebas rojas de variantes confirmadas.
- [x] Corrección y regresiones de lectura, escritura y navegación real.
- [x] Revisiones especializadas y gates locales.
- [x] Diff, resultados exactos y limitaciones de cierre.

Pruebas con MemoryRouter, servicios reales/gateways simulados: A→B rápido/lento/
error, A→B→A y atrás/adelante, datos parcialmente editados, B sin cargar sin
acciones, ID/payload exactos B, respuesta/rechazo tardío de lectura y mutación,
doble envío, guards de recovery (operación y recarga), actor propio/distinto,
StrictMode, autorización/terminalidad y ausencia de datos/históricos anteriores.
Regresiones AUD-001/AUD-003 se ejecutan junto a las afectadas o en verify completo.

## Validación y entorno

Node 22.20.0 y pnpm 11.9.0 confirmados; pin Node 22.18.0 pendiente, sin cambiarlo.
Se usa PATH con %LOCALAPPDATA%\CorepackShims y Corepack sin red, sin instalar.
Gates: suites focalizadas, lint:boundaries, arquitectura, TypeScript mediante
`corepack pnpm verify`, formato y `git diff --check`. DB/E2E no ejecutables por
restricción de persistencia. No se atribuyen éxitos por resultados históricos.

## Progreso, decisiones y resultados

### Reproducción y descubrimientos

Antes de corregir producción, las seis transiciones A→B con B pendiente fallaron
con datos/formularios de A visibles: 6 fallidas, 50 aprobadas (56 en total).
Un primer intento tenía URLs mal construidas en helpers; se corrigió antes de
usar esa ejecución roja como evidencia. También se ajustaron selectores de texto
ambiguos/compuestos en las pruebas nuevas; no eran defectos de producción.

Los wrappers por ID eliminan borradores y estados anteriores; las guardas de
montaje impiden navegación/refrescos/errores tardíos. Refs síncronas cierran la
ventana anterior al render de submitting y evitan dobles invocaciones.

La revisión de arquitectura detectó la necesidad de conservar tanto key como
motivo y de mantener refresh de autoridad tras salir completamente de pantalla.
Se incorporaron ambos ajustes y regresiones; revisión final GO sin bloqueantes.
QA detectó además que una recuperación pendiente podía bloquear el motivo tras
activación externa: prueba roja dirigida 1 fallida / 34 omitidas confirmó el caso;
se retira ahora la intención al cargar la cuenta ya no invited. QA confirmó GO
por inspección de ese ajuste; ninguno de los revisores ejecutó suites/gestores.

### Matriz de regresión

Cuatro archivos focalizados: projects-pages, volunteers-pages,
account-detail-page e identity-provider (60 casos previos en estos archivos).
Se comprueban contenidos e ID/payload, no solo renderizado:

- Las seis pantallas: B lento/éxito/error/rechazo, retry, lectura antigua con
  éxito/fallo/rechazo después de B o de una nueva A, atrás/adelante y StrictMode.
- Edición: borrador parcial A, carga de B antes de guardar, payload exacto B,
  doble envío, mutaciones A antiguas mientras B/nueva A siguen enviando, mismatch
  en lectura/guardado, rechazo actual y recuperación. Voluntarios incluye aviso
  de duplicados y confirmación exclusiva de B con bloqueo de doble envío.
- ProjectDetail: siete operaciones (buscar/asignar voluntarios y responsables,
  finalizar ambas asignaciones y cerrar), cada una con éxito/fallo/rechazo tardío;
  sin recarga, candidatos ni mensajes antiguos. Snapshot de proyecto y relaciones
  con IDs inconsistentes falla seguro; error de recarga retira acciones.
- AccountDetail: status/roles/recovery y segundo await de recovery; doble envío,
  callbacks tardíos y A→B→A con segunda mutación; refresh propio con mismo/otro
  actor, incluso tras abandonar la pantalla; motivo inválido corregible,
  fingerprint idempotente, aislamiento por actor y activación externa.
- Restricciones previas: permisos, cierre de proyecto y edición descriptiva de
  cerrado; Activities y búsquedas AUD-001/AUD-003 sin cambios de implementación.

### Comandos y resultados

- `corepack pnpm --filter @sistema-voluntariado/web typecheck`: aprobado.
- Suite focalizada de cuatro archivos: 180/180 aprobadas (80 Projects,
  52 Volunteers, 35 AccountDetail y 13 IdentityProvider), 19,83 s.
- Primer `corepack pnpm verify`: formato aprobado; se detuvo en ESLint por
  16 infracciones (tipos import(), expresión void, optional chain y narrowing
  de refs tras await). Se corrigieron sin supresiones: imports type explícitos
  y lectura de montaje mediante callback local estable, reevaluada tras await.
- Segundo `corepack pnpm verify`: código 0. Formato, ESLint, lint:boundaries,
  arquitectura (4 probes negativos), TypeScript (web y funciones), orquestación
  16+11, 446/446 unitarias en 47 archivos, 4/4 integración en 2 archivos y build
  de producción (486 módulos) aprobados. Web unitarias/integración/build sin
  cache; paquetes UI/shared-kernel y su typecheck reutilizaron cache de Turbo
  cuando correspondía (sus suites no tienen archivos). Unitarias: 23,02 s.
  No se ejecutó test:functions; sí su TypeScript. Las pruebas de orquestación
  usan dependencias simuladas: no ejecutan sus resets/arranques mencionados.
- Regresiones AUD-001: 22/22 de project-activities-section aprobadas dentro de
  verify. AUD-003: casos previos de búsqueda/paginación incluidos en las suites
  projects-pages y volunteers-pages; aprobaron sin cambiar sus implementaciones.
- Escaneo de líneas añadidas: 0 any, ts-ignore/nocheck, supresiones lint,
  TODO/FIXME, service_role o patrones de claves/tokens. No es auditoría exhaustiva
  de secretos ni validación de credenciales.
- `git diff --check`: aprobado, incluida revisión de alcance; tras cerrar este
  documento se repiten formato y diff-check, sin repetir suites por solo prosa.

Comando focalizado ejecutado desde la raíz (sin el separador `--` de pnpm):

```powershell
corepack pnpm --filter @sistema-voluntariado/web test:unit src/modules/projects/presentation/projects-pages.test.tsx src/modules/volunteers/presentation/volunteers-pages.test.tsx src/modules/identity/presentation/account-detail-page.test.tsx src/modules/identity/presentation/identity-provider.test.tsx
```

Se agregaron 120 casos de regresión: los cuatro archivos tenían 60, ahora 180;
el total unitario pasó de 326 a 446. El último ajuste de lectura de refs/imports
posterior al focalizado está cubierto por el verify completo aprobado.

### Inventario de archivos

- Projects/presentation: `project-edit-page.tsx`, `project-form.tsx`,
  `project-detail-page.tsx`, `volunteer-projects-page.tsx`,
  `projects-pages.test.tsx`.
- Volunteers/presentation: `volunteer-edit-page.tsx`, `volunteer-form.tsx`,
  `volunteer-detail-page.tsx`, `volunteers-pages.test.tsx`.
- Identity/presentation: `account-detail-page.tsx`, `identity-provider.tsx`,
  `account-detail-page.test.tsx`, `identity-provider.test.tsx`.
- `apps/web/src/app/providers/i18n.ts`, `CHANGELOG.md` y este ExecPlan.

Son 15 archivos rastreados modificados y este plan nuevo. Domain, Application,
Infrastructure, SQL, migraciones, permisos, manifiestos y lockfile sin cambios.
No se modificaron router ni implementaciones AUD-001/AUD-003.

### Resultado y límites

Arquitectura y QA: GO, sin defectos bloqueantes pendientes tras integrar sus
hallazgos. Ninguna variante confirmada del hallazgo queda sin prueba local.
Git permanece en main/02d0ecd, 15 modificados y un nuevo ExecPlan, sin staging,
commit ni push. No se alteraron registros históricos.

AUD-004 corregido y verificado localmente con Node 22.20.0/pnpm 11.9.0; validación
completa del entorno exigido pendiente de Node 22.18.0, no sustituido. E2E y
pruebas de base persistente no ejecutadas por restricción del usuario; tampoco
servicios, migraciones, resets ni despliegues. Integración de verify usa fixtures
simuladas y no datos persistentes. Reejecutar verify con Node 22.18.0 cuando esté
disponible; E2E/DB requieren un alcance posterior autorizado.

Riesgos residuales: una RPC ya enviada puede finalizar en A después de navegar,
pero no cambia B ni su UI. No se resuelve edición concurrente de la misma entidad
desde otras pestañas/clientes. StrictMode puede iniciar lecturas adicionales de
desarrollo; sus efectos obsoletos se descartan y no inicia escrituras por sí solo.
El snapshot idempotente sobrevive cambios de ID, no recargas completas del
navegador; no se añadió persistencia ni se promete cancelación remota.

Revisores actúan en solo lectura; el principal integra código. Entrega sin commit;
secuencia recomendada: revisar estas evidencias y diff, autorizar explícitamente
un único commit AUD-004. No se creó commit ni se modificó historial.
