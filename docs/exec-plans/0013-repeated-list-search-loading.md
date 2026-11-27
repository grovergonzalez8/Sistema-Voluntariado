# ExecPlan 0013 — Búsquedas repetidas y carga de listados (AUD-003)

- Estado: corregido con verificación parcial; gates locales PASS en Node 22.20.0, validación en Node 22.18.0 pendiente. APTO PARA COMMIT con esta limitación registrada.
- Fecha: 2026-11-22.
- Rama autorizada: `main`; base `381d041` (AUD-001 integrado).
- Estado Git inicial: limpio. No se autorizaron commits/push/despliegues.

## Objetivo, alcance y causa raíz

Eliminar carga permanente al repetir búsquedas en ProjectsPage y VolunteersPage.
Ambos handlers activan loading pero, si search normalizado y offset no cambian,
el efecto no consulta y nadie finaliza esa carga. Las pruebas actuales cambian
parámetros y no detectan el caso. AUD-001 está registrado en el commit base y
ExecPlan 0012; su implementación y pruebas permanecen fuera de alcance.

Se leyeron AGENTS raíz/web, PLANS, ADR 0004, reglas de dependencias y Definition
of Done. El siguiente número disponible es 0013. El cambio es material por
afectar asincronía y recuperación de dos módulos; se documenta aquí conforme a
AGENTS, sin añadir otro documento de diseño.

Alcance: presentación de ambos listados, pruebas, mensajes i18n si hacen falta
para rechazos seguros y changelog. Sin SQL, RLS, permisos, contratos, nuevas
dependencias/lockfile, refactor de otros módulos ni cambios de AUD-001.

## Diseño y alternativas

- Añadir una revisión de búsqueda al efecto; cada submit completado o distinto
  incrementa la revisión y agrupa búsqueda normalizada/offset 0 en un render.
- Si esa misma consulta ya está pendiente, coalescer antes de invalidar generación.
  Tras éxito/error se admite otra búsqueda idéntica para refrescar/reintentar.
- Invalidar requestGeneration al aceptar search/page/sort, antes de los setters;
  así una respuesta previa no actúa en la ventana anterior al nuevo efecto.
- Mantener guards de generación y cleanup; éxito, Result failure y rechazo de
  promesa deben finalizar loading únicamente para la solicitud vigente.
- Conservar búsqueda aplicada al ordenar Volunteers y resetear su offset a 0.
  Projects no incorpora orden nuevo. Una selección de orden sin cambios es no-op.
- Mensajes de rechazo seguros y traducidos, sin exponer errores recibidos.

Alternativas descartadas: ignorar siempre consultas iguales (impide retry tras
error), llamar al servicio desde handlers y efecto (duplica caminos), hooks o
infraestructura genéricos y nuevas dependencias. No se consulta al escribir.

## Riesgos e invariantes

Una petición antigua no modifica filas, total, error ni loading actuales.
Coalescer no invalida el callback que debe resolver la carga pendiente.
Paginación/orden mantienen parámetros server-side y búsqueda reinicia página 1.
Cada intención produce una consulta; StrictMode puede repetir efectos de montaje
como ya ocurre en React, pero solo su generación vigente aplica resultados.
No se cancela la petición de red previa; se descarta su respuesta.

## Fases y criterios de aceptación

- [x] Baseline, instrucciones y causa confirmada por inspección.
- [x] Plan antes del código.
- [x] Reproducir vacío/idéntico/espacios con pruebas rojas en ambos listados.
- [x] Arreglo mínimo y regresiones de paginación/orden/errores/asincronía.
- [x] Revisiones especializadas de lectura y gates locales aplicables.
- [x] Revisar diff y registrar resultado, limitaciones y riesgos residuales.

Pruebas: vacío, idéntico, trim, cambio de término, búsqueda desde página 2,
orden Volunteers, respuestas invertidas de éxito/error/rechazo, recuperación,
coalescencia, desmontaje y acciones existentes. Spies/gateways simulados, sin
base persistente ni servicios. Comandos previstos: suites focalizadas,
`corepack pnpm lint:boundaries`, arquitectura/typecheck mediante
`corepack pnpm verify`, y `git diff --check`.

## Entorno, progreso y resultado

Node observado 22.20.0 frente a 22.18.0 exigido; pnpm 11.9.0 confirmado.
Se conserva el runtime. Los comandos anteponen %LOCALAPPDATA%\CorepackShims al
PATH y deshabilitan red Corepack; no se instala ni actualiza nada.
DB, resets, concurrencia persistente, E2E y despliegues no se ejecutarán.
Revisores de arquitectura y QA leen; solo el principal
edita y ejecuta verificaciones. La entrega no incluye commit; una eventual
secuencia futura requiere revisión humana y autorización explícita del propietario.

### Evidencia incremental

El comando focalizado es:

```text
corepack pnpm --filter @sistema-voluntariado/web test:unit src/modules/projects/presentation/projects-pages.test.tsx src/modules/volunteers/presentation/volunteers-pages.test.tsx
```

- Antes de producción: 8 FAIL / 10 PASS, exit 1. Cada listado falló al buscar
  vacío, espacios, término idéntico y término equivalente tras trim. Se observó
  loading visible sin llamada nueva al gateway (esperadas 2/3, reales 1/2).
- Después de la corrección mínima: 18/18 PASS, exit 0.
- Matriz ampliada: 45/45 PASS, exit 0; 21 Projects y 24 Volunteers. Son 35 casos
  nuevos respecto a las 10 pruebas existentes, sin sleeps ni datos persistentes.
- Incluye las dos secuencias de respuesta (antigua primero y nueva primero) para
  éxito/error/rechazo antiguos; estos no alteran filas, total, error ni loading.
  También cubre recuperación con los mismos parámetros tras error y rechazo,
  coalescencia pendiente, desmontaje, StrictMode, paginación y orden.
- Volunteers mantiene búsqueda aplicada al ordenar y exportar, descarta una
  página anterior y trata orden idéntico como no-op. Exportación se verifica con
  spy de descarga, sin escribir archivo ni iniciar navegación real.
- Se añadieron únicamente dos mensajes loadError (es/en) para errores de carga
  no tipados. No se muestra el detalle recibido. El efecto incluye t por cierre
  correcto de la traducción; cambiar idioma puede volver a consultar, sin bucle.

### Gates y revisión final

Los comandos pnpm usaron Node 22.20.0, pnpm 11.9.0 y los shims indicados arriba.
No se cambió el runtime ni se instaló ninguna dependencia.

| Verificación                                                                                                | Resultado observado                                                                |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pruebas focalizadas (comando anterior)                                                                      | Rojo 8 FAIL / 10 PASS (exit 1); verde inicial 18/18 y ampliado 45/45 PASS (exit 0) |
| `corepack pnpm verify`                                                                                      | PASS completo, exit 0                                                              |
| `corepack pnpm format:check` y `corepack pnpm lint`, incluidos en verify                                    | PASS, sin avisos ESLint                                                            |
| `corepack pnpm lint:boundaries`, incluido en verify                                                         | PASS, exit 0                                                                       |
| `corepack pnpm lint:architecture`, incluido en verify                                                       | PASS, 4 probes negativos                                                           |
| `corepack pnpm typecheck` y `corepack pnpm typecheck:functions`, incluidos en verify                        | PASS; web ejecutado, UI/shared-kernel reutilizados de caché sin cambios            |
| `corepack pnpm test:ci-orchestration` y `corepack pnpm test:local-smtp-orchestration`, incluidos en verify  | 16 + 11 = 27/27 PASS; solo simulaciones                                            |
| `corepack pnpm test:unit`, incluido en verify                                                               | 47 archivos, 326/326 PASS, sin omitidas; web ejecutado, sin cache hit              |
| `corepack pnpm test:integration`, incluido en verify                                                        | 2 archivos, 4/4 PASS MSW; web ejecutado                                            |
| `corepack pnpm build`, incluido en verify                                                                   | PASS; TypeScript y Vite, 486 módulos, web ejecutado                                |
| `git diff --check`                                                                                          | PASS, exit 0 en revisiones de implementación; se repite al entregar                |
| `git diff --exit-code HEAD --` sobre AUD-001, dominios, aplicación, Supabase y manifiestos/lockfile         | PASS, exit 0; sin cambios en esas rutas                                            |
| Búsqueda de `any`, `@ts-ignore`, supresiones lint, TODO/FIXME y service_role en los cuatro TS/TSX cambiados | Sin coincidencias                                                                  |
| Node 22.18.0 / DB / E2E                                                                                     | NO EJECUTADOS; versión distinta y restricciones expresas del encargo               |

Las tareas de pruebas de UI/shared-kernel no contienen archivos y no incrementan
los conteos anteriores; Turbo reutilizó sus resultados anteriores. No se presenta
ese cache como ejecución nueva. Los mensajes SMTP de las pruebas son simulados:
no se arrancó Supabase ni se enviaron correos.

- Architect: PASS, sin defectos bloqueantes. Validó coalescencia antes de
  invalidación, revisión de búsqueda, guards de generación y parámetros server.
- QA: GO, sin defectos bloqueantes. Confirmó los 45 casos, incluidos orden,
  paginación, intercalaciones, retry y exportación con spies.
- Los revisores fueron de solo lectura; las ejecuciones corresponden al principal.
- Diff revisado: ProjectsPage, VolunteersPage, sus dos suites, cuatro entradas
  i18n, changelog y este plan. AUD-001 permanece íntegro en `381d041`.
- Estado Git al cierre de implementación: seis archivos rastreados modificados
  y este plan nuevo; ningún cambio preparado. Rama main y HEAD sin cambios.
- Resultado: AUD-003 corregido y verificado localmente; APTO PARA COMMIT con
  validación parcial por Node 22.20.0 frente al pin 22.18.0. No se atribuyen
  ejecuciones E2E/DB. No se realizó commit, push ni despliegue.
- Riesgos residuales: las consultas anteriores se invalidan pero no se cancelan
  en red; un cambio de idioma puede refrescar la lista en segundo plano. No se
  introducen timeouts ni otras reglas de conectividad fuera de este hallazgo.
