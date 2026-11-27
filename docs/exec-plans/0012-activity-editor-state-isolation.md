# ExecPlan 0012 — Aislamiento del editor de actividades (AUD-001)

- Estado: corregido con verificación parcial; gates locales PASS en Node 22.20.0, repetición en Node 22.18.0 pendiente.
- Fecha: 2026-11-22.
- Rama autorizada: `main`.
- Base: `020835bf413f2af2d674bab7cdee7593f3e3175a`.
- Autorización: encargo explícito AUD-001 recibido en esta sesión; sin commit/push.

## Objetivo y estado inicial

Evitar que un borrador de Activity A se envíe al identificador de Activity B.
El working tree inicial está limpio. El siguiente número disponible es 0012.
Se leyeron AGENTS raíz/web, PLANS, ADR 0001/0004/0006/0008, reglas de
dependencias y ExecPlans 0006/0011. No hay instrucciones anidadas adicionales
en los directorios afectados.

La causa sigue presente: ProjectActivityForm captura initialInput(activity)
una vez, mientras ProjectActivitiesSection reutiliza el componente al cambiar
editing. El submit usa el activity.id nuevo junto con el borrador anterior.
Además, un onSaved anterior puede cerrar un editor posterior.

Hay cuatro pruebas de sección, sin cambio A→B. Las cifras de la auditoría y
del encargo son antecedentes; solo los comandos de esta ejecución acreditan
las validaciones del cambio.

## Alcance y fuera de alcance

Solo presentación Projects, sus pruebas, este plan y la entrada de changelog.
Sin cambios de dominio, aplicación, infraestructura, contratos, PostgreSQL,
migraciones, RLS, permisos, dependencias, lockfile o versión de Node.
Sin servicios, resets, pruebas persistentes, despliegues, commits ni pushes.
AUD-002 y AUD-004 fuera de Activities permanecen fuera de alcance.

## Diseño y alternativas

1. Dar al formulario una key por proyecto, modo e ID de Activity. El desmontaje
   reinicia valores, errores y submitting, incluyendo Crear→Editar.
2. Aislar el estado de la sección por projectId mediante un componente interno
   concreto. El consumidor actual ya usa key por proyecto; el componente
   conservará esa garantía también al recibir otro proyecto directamente.
3. El formulario conserva una guarda de montaje para descartar toda resolución
   asíncrona posterior al desmontaje y una ref síncrona para impedir dos submits
   antes del siguiente render.
4. Permitir seleccionar B durante el guardado A. La petición A no se cancela:
   conserva su ID/payload capturados, pero su respuesta no cierra, recarga ni
   muestra errores en B. La selección no promete deshacer una escritura iniciada.
5. Mantener el flujo existente Editar→Cancelar→Crear y descartar borradores al
   cancelar. No añadir controles ni confirmaciones nuevas.
6. Renderizar el editor solo con autoridad/proyecto mutables y, para edición,
   Activity vigente scheduled. Un cambio a terminal desmonta el editor.

Se descartan sincronización indiscriminada de props con efectos, estado global,
cancelación de RPC no soportada, abstracciones genéricas y cambios de contratos.
La key aísla identidades sin sobrescribir un borrador de la misma identidad en
cada refresh; la guarda de montaje cubre la carrera que una key sola no resuelve.

## Riesgos e invariantes

- Un borrador pertenece siempre al proyecto/modo/Activity visibles.
- Respuestas anteriores no afectan al nuevo editor, incluso A→B→A.
- Los guards de montaje deben funcionar con StrictMode y desmontaje real.
- La selección nueva descarta el borrador anterior, como Cancelar; una petición
  ya enviada puede persistir en su destino original.
- Project closed, falta de canManage y Activity terminal no habilitan guardado.
- Autorización definitiva, normalización, lifecycle e histórico siguen en sus
  capas actuales; no se duplican reglas de PostgreSQL.

## Fases y progreso

- [x] Inspección, causa raíz y baseline Git.
- [x] Crear plan antes del código.
- [x] Añadir regresiones y demostrar fallo en código original.
- [x] Aplicar corrección mínima y ejecutar pruebas focalizadas.
- [x] Revisiones especializadas de lectura, gates locales y revisión de diff.
- [x] Documentar resultados exactos, restricciones y estado final.

## Validaciones y criterios de aceptación

Pruebas de comportamiento con servicio real y gateway simulado:

- A→B muestra todos los campos B y envía exactamente ID/payload B.
- Crear→B descarta borrador/errores de creación.
- Editar→Cancelar→Crear inicia vacío y usa create, no update.
- Errores de validación/servidor y submitting no se heredan.
- Respuestas anteriores exitosas/fallidas no cierran ni alteran B.
- Cancelar/reabrir restaura valores persistidos.
- Cambio de proyecto y restricciones terminales/closed conservan aislamiento.
- No hay submits duplicados en una misma instancia.

Comandos previstos: prueba focalizada vía script web test:unit, lint,
lint:boundaries, lint:architecture, typecheck, corepack pnpm verify y
git diff --check. E2E/DB no se ejecutan por prohibición de pruebas persistentes.

## Entorno y descubrimientos

Node del shell: 22.20.0; exigido: 22.18.0. No se cambia automáticamente.
pnpm 11.9.0 confirmado con Corepack y COREPACK_ENABLE_NETWORK=0.
PATH de cada gate antepone %LOCALAPPDATA%\CorepackShims para que Turbo encuentre
el mismo pnpm; no se cambia configuración global ni se instalan dependencias.
Las dependencias locales ahora existen. No se asume un resultado por antecedente.

## Decisiones durante ejecución y resultado final

La primera invocación del script web con `--` separador ejecutó todas las
unitarias: 47 archivos y 273 casos PASS, exit 0. Para focalizar, pnpm debe recibir
la ruta directamente después de `test:unit`, sin ese separador.

Antes de tocar producción se añadieron 14 regresiones: 18 casos en total,
12 FAIL y 6 PASS sobre el código original (exit 1). Entre los fallos observados:
borrador A visible en B, dos llamadas por doble submit síncrono, editor anterior
al cambiar proyecto y formulario aún editable tras cierre/terminalización.
Un error de sintaxis inicial del helper de pruebas se corrigió antes de esta
ejecución roja; ese intento no ejecutó casos y no cuenta como reproducción.

Tras el arreglo, el mismo comando focalizado pasó 18/18, exit 0. Se añadieron
además regresiones de validación en edición, A→B→A con éxito/error antiguo y
StrictMode: la ejecución focalizada siguiente pasó 22/22, exit 0. El caso ABA
se reforzó después: A1 pendiente→B→A2 pendiente; resolver A1 no cambia el
borrador ni submitting de A2, y solo la respuesta propia de A2 genera éxito.
La ejecución completa final verificó esos 22 casos y el resto de la aplicación.

El guard usa useLayoutEffect para invalidar callbacks durante el commit de
desmontaje y no dejar una ventana hasta los efectos pasivos. Restablece la ref en
setup, compatible con la repetición de efectos de StrictMode. La autoridad y
terminalidad visibles desmontan el editor; las RPC conservan la decisión final.

## Resultado de validaciones (2026-11-22)

Todos los comandos pnpm usaron Node 22.20.0 y pnpm 11.9.0, PATH con CorepackShims
y COREPACK_ENABLE_NETWORK=0 / COREPACK_ENABLE_DOWNLOAD_PROMPT=0. No se ejecutó
install ni se modificó la configuración global. La diferencia del engine produce
un aviso visible; no se presenta esta ejecución como realizada en Node 22.18.0.

| Comando / comprobación                                                                                                                | Resultado observado                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm --version`                                                                                                             | 11.9.0, exit 0                                                                                                                                                                                                                        |
| `corepack pnpm --filter @sistema-voluntariado/web test:unit -- src/modules/projects/presentation/project-activities-section.test.tsx` | Baseline anterior al cambio: el separador hizo ejecutar 47 archivos / 273 pruebas, PASS, exit 0                                                                                                                                       |
| `corepack pnpm --filter @sistema-voluntariado/web test:unit src/modules/projects/presentation/project-activities-section.test.tsx`    | Rojo original: 12 FAIL / 6 PASS; después 18/18 PASS y ampliación 22/22 PASS                                                                                                                                                           |
| `corepack pnpm exec prettier --write` con los cinco archivos del alcance                                                              | PASS; solo formato de archivos autorizados                                                                                                                                                                                            |
| Primer `corepack pnpm verify`                                                                                                         | Detenido por 25 errores lint en pruebas nuevas, exit 1; sin suppressions                                                                                                                                                              |
| `corepack pnpm exec eslint apps/web/src/modules/projects/presentation/project-activities-section.test.tsx --fix`                      | Corrigió estilo y casts; quedaron 5 callbacks async sin await, exit 1; luego se corrigieron esperando la promesa diferida                                                                                                             |
| Segundo `corepack pnpm verify`                                                                                                        | Formato/lint/boundaries/probes PASS; typecheck encontró opciones `exact` no admitidas y tipos DOM de pruebas, exit 2                                                                                                                  |
| `corepack pnpm --filter @sistema-voluntariado/web typecheck` tras corrección                                                          | PASS, exit 0; queries DOM tipadas con genéricos, sin casts ni `any`                                                                                                                                                                   |
| `corepack pnpm verify` final                                                                                                          | PASS, exit 0: formato, lint, boundaries, 4 probes negativos, typecheck web/paquetes/Functions, 16 pruebas de orquestación y 11 SMTP simuladas, 47 archivos / 291 unitarias, 2 archivos / 4 integración MSW, build Vite de 486 módulos |
| `git diff --check`                                                                                                                    | PASS en revisión del cambio; se repite tras cerrar el documento                                                                                                                                                                       |
| DB, concurrencia real, Functions runtime y Playwright E2E                                                                             | NO EJECUTADOS: fuera del cambio de presentación y prohibición explícita de pruebas persistentes/servicios                                                                                                                             |
| Node 22.18.0                                                                                                                          | NO EJECUTADO: versión exigida distinta del runtime autorizado disponible; no se cambió automáticamente                                                                                                                                |

Las tareas web typecheck, unitarias, integración y build finales fueron cache
miss y se ejecutaron. Turbo reutilizó tareas sin cambios de UI/shared-kernel;
sus scripts de pruebas no contienen archivos de test y no añaden casos al conteo.
No se atribuye al cache una nueva ejecución. No hubo casos omitidos o fallidos
en las suites finales ejecutadas. Los mensajes de arranque SMTP pertenecen a mocks:
no hubo Docker, SMTP real ni peticiones a bases compartidas.

## Revisiones y resultado

- Architect: PASS, sin hallazgos bloqueantes; imports y cambios limitados a
  presentación, identidad de formulario, guarda de montaje y lifecycle.
- QA: GO, sin hallazgos bloqueantes; recomendó StrictMode, ABA con dos envíos y
  restauración de mocks. Los tres puntos se incorporaron y pasaron en verify.
- Revisores de solo lectura: no editaron archivos ni ejecutaron gestores/tests;
  la evidencia de ejecución anterior corresponde al agente principal.
- Diff revisado: dos componentes, su suite, CHANGELOG y este nuevo ExecPlan.
  Sin cambios de dependencias/lockfile, SQL, permisos, contratos o rama.
- Resultado funcional: no se observan mezclas de campos/ID entre Activities
  en los escenarios reproducidos; callbacks anteriores no alteran otro editor.
- Estado AUD-001: corregido con verificación parcial por la diferencia de Node.
  Gates y regresiones locales PASS. Repetir con Node 22.18.0 antes de certificar
  el runtime fijado; E2E/DB no se presentan como ejecutados.
- Riesgo residual operativo: cambiar editor no cancela una escritura ya enviada,
  que puede completarse en su Activity original. No se amplía la semántica de
  concurrencia/last-write-wins de ediciones independientes sobre la misma Activity.

No se autorizó ningún commit. Secuencia de entrega: revisión de diff y pruebas,
revisión humana y eventual commit solo cuando el propietario lo solicite.
