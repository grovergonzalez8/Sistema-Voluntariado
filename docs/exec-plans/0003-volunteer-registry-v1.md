# ExecPlan 0003 — Registro Administrativo de Voluntarios V1

## Objetivo

Implementar un módulo administrativo `volunteers` que mantenga voluntarios actuales e históricos sin crear identidades Auth, cuentas, invitaciones ni perfiles autenticados. La V1 permitirá a administradores listar, buscar, ordenar, registrar, consultar, editar, importar y exportar Excel con autorización reproducida en aplicación y PostgreSQL.

## Estado inicial

- Rama base confirmada: `main@c6f7392`, limpia y alineada con `origin/main`.
- Rama de trabajo: `feat/volunteer-registry-v1`, creada en `c6f7392`.
- Runtime configurado confirmado mediante ruta local: Node.js `22.18.0`, pnpm `11.9.0`, Supabase CLI `2.109.1`.
- Supabase local responde; Edge Runtime, imgproxy y pooler están detenidos deliberadamente según la configuración existente.
- Baseline informada por el propietario: web `102/102`, dominio identity `25/25`, integración `2/2`, Edge Function `21/21`, orquestación `13/13`, PostgreSQL/RLS `119/119`, E2E `5/5`, concurrencia/build/DB lint/seguridad aprobados.
- No se repitió la baseline completa antes de comenzar.

## Alcance

- Nuevo módulo web `volunteers` con dominio, aplicación, infraestructura Supabase, presentación y API pública.
- Nueva migración independiente con tabla relacional, índices, RLS, grants, operaciones administrativas y auditoría.
- CRUD sin eliminación, listado paginado, búsqueda parcial y orden útil.
- Importación `.xlsx` con plantilla, preview, errores por fila, detección de duplicados y confirmación transaccional.
- Exportación `.xlsx` del conjunto lógico filtrado, no solo la página visible.
- Navegación/rutas protegidas por permisos existentes y autorización repetida en servicio/DB.
- Pruebas de dominio, aplicación, infraestructura, UI, Excel, pgTAP y E2E crítico proporcional.
- Documentación de decisiones y dependencia Excel si es necesaria.

## Fuera de alcance

- Auth, cuentas, invitaciones, onboarding o vínculo con `volunteer-profile`.
- Eliminación, archivo/retiro, documento, fecha de nacimiento, ubicación, participación o atributos dinámicos.
- Registro público, CSV, workers, colas, sincronización externa, dashboards o analítica.
- Merge, push, PR, despliegue o cambios a migraciones históricas.

## Decisiones iniciales

1. Usar `volunteers` como contexto separado porque representa el padrón institucional, no al usuario autenticado.
2. Modelar `full_name` obligatorio y `email`/`phone` opcionales. Nombre: trim, espacios colapsados y 1–100 caracteres. Correo: se almacena canónico con trim/minúsculas, 3–254 caracteres y la regla sintáctica usada por invitaciones. Teléfono: trim y espacios colapsados, 3–40 caracteres, al menos un dígito y únicamente `+`, dígitos, espacios, paréntesis, punto, guion o `/`; se conserva como texto con `+`, ceros y formato.
3. No imponer unicidad a correo o teléfono. Una coincidencia normalizada exacta de correo o teléfono será una advertencia de posible duplicado; el administrador podrá conservar registros históricos legítimos mediante confirmación explícita. Un match con ambos datos se mostrará con mayor evidencia, pero seguirá sin fusionarse automáticamente.
4. Centralizar validación/normalización y detección de coincidencias para alta, edición e importación. PostgreSQL conservará constraints defensivos equivalentes.
5. Listar con paginación y conteo server-side; búsqueda parcial case-insensitive en nombre/correo/celular y órdenes por nombre o creación.
6. Importar con flujo seleccionar → validar/preview → confirmar. Filas vacías se ignoran; filas inválidas se excluyen siempre. Posibles duplicados contra PostgreSQL o dentro del archivo quedan excluidos por defecto y requieren inclusión explícita. Al confirmar, todas las filas válidas elegidas se insertan en una sola transacción o ninguna. La RPC recalcula validación y duplicados dentro de la transacción. El resumen conserva conteos, no PII.
7. Limitar V1 a `.xlsx`, 5 MiB y 1.000 filas de datos como límites técnicos, no reglas de negocio. Antes del parser principal, inspeccionar metadatos del ZIP sin extraer entradas y rechazar más de 100 entradas, más de 20 MiB expandidos totales, más de 10 MiB por entrada, worksheet mayor a 5 MiB o ratio superior a 250:1 en entradas de al menos 64 KiB. Una segunda pasada streaming cuenta bytes realmente descomprimidos para no confiar en tamaños ZIP declarados. Después extraer únicamente `workbook.xml`, `xl/_rels/workbook.xml.rels` y la worksheet ya acotados; workbook y relationships admiten hasta 1 MiB cada uno. Estas estructuras exigen una sola hoja lógica, validan su relación y comprueban dimensiones. El archivo vive solo en memoria del navegador y no se persiste. `read-excel-file` entrega el valor cacheado de una fórmula y no su expresión: no se ejecuta contenido, el preview muestra el valor resultante y la exportación vuelve a escribirlo como texto; un texto literal iniciado por `=` se rechaza. El celular debe ser una celda de texto y la plantilla preconfigura las 1.000 celdas admitidas para conservar `+` y ceros.
8. Exportar el conjunto completo correspondiente a búsqueda/orden actuales mediante lecturas server-side de 1.000 filas; ofrecer exportación total al limpiar búsqueda.
9. Reutilizar RBAC agregando `volunteer_registry.read/create/update/import/export` y concediéndolos exclusivamente al rol administrador existente. UI, aplicación y RPC comprueban capacidades, no nombres de rol; así no se crea un segundo mecanismo de autoridad.
10. Auditar creación, modificación e importación sin replicar correo, teléfono, nombre ni contenido del archivo en metadata.

## Riesgos y mitigaciones

| Riesgo                                       | Mitigación                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicar o fusionar indebidamente históricos | Advertencias no bloqueantes, sin unique destructivo ni merge automático; decisión explícita y tests compartidos.                       |
| Acceso de coordinadores/no autenticados      | Guard de ruta, servicio autorizado, grants mínimos, RLS/RPC admin-only y pgTAP con actores distintos.                                  |
| Importación parcial ambigua                  | Preview informativa y RPC transaccional; éxito total del lote elegible o rollback.                                                     |
| Búsqueda lenta al crecer                     | Paginación server-side e índices apropiados a consultas reales; sin cargar toda la tabla.                                              |
| Exposición de PII en logs/auditoría          | Metadata solo con IDs/conteos/campos modificados; scans y revisión especializada.                                                      |
| Parser Excel inseguro o pesado               | Revisar dependencias existentes; añadir una biblioteca mantenida, fijada por lockfile, solo si es necesaria; límites antes de parsear. |
| Regresión de autoridad/caché                 | Reutilizar `PermissionRoute`, identidad existente y limpiar queries sensibles con el mecanismo actual.                                 |

## Fases y validaciones

| Fase                       | Resultado esperado                            | Validación incremental                       | Estado     |
| -------------------------- | --------------------------------------------- | -------------------------------------------- | ---------- |
| 0. Precheck y plan         | Rama dedicada y plan vivo                     | Git/runtime/Supabase confirmados             | completada |
| 1. Dominio y contrato      | Reglas compartidas, queries y puertos         | unitarias del módulo, typecheck              | completada |
| 2. PostgreSQL              | Migración, RLS/RBAC, RPC/auditoría y tipos    | reset local, DB lint, pgTAP                  | completada |
| 3. Repositorio/composición | Adaptador Supabase y servicio conectado       | unitarias/integración, boundaries            | completada |
| 4. UI administrativa       | listado, alta, detalle, edición y estados     | tests de presentación, typecheck             | completada |
| 5. Excel                   | plantilla, preview, importación y exportación | tests Excel/UI, lockfile reproducible        | completada |
| 6. E2E y documentación     | flujo crítico y decisiones documentadas       | E2E específico y revisión de docs            | completada |
| 7. Cierre                  | baseline ejecutada y revisiones incorporadas  | `pnpm verify`, DB, E2E, concurrencia y scans | completada |

## Criterios de aceptación

- Solo un administrador operativo puede descubrir rutas y ejecutar operaciones sobre voluntarios.
- Un registro de voluntario no produce filas ni efectos en Auth, `accounts`, invitaciones u onboarding.
- Alta, edición e importación comparten reglas de validación y duplicados.
- Listado/búsqueda/orden/exportación operan sobre el conjunto server-side solicitado.
- Importación ofrece preview comprensible, límites, errores por fila y confirmación atómica.
- Migraciones `202607230001_foundation.sql` y `202607240002_account_lifecycle.sql` permanecen byte a byte sin cambios.
- Los nuevos tests pasan y la baseline completa no presenta regresiones ocultas.

## Progreso

- 2026-08-16: precheck mínimo completado. El `PATH` interactivo apuntaba a Node `22.21.0` y no exponía la CLI global; se usó el runtime local fijado, confirmando Node `22.18.0`, pnpm `11.9.0` y Supabase CLI `2.109.1` con servicios respondiendo.
- 2026-08-16: rama `feat/volunteer-registry-v1` creada desde `c6f7392`, limpia.
- 2026-08-16: iniciadas revisiones especializadas de solo lectura de arquitectura, PostgreSQL/RLS y lenguaje de dominio.
- 2026-08-16: revisiones preliminares convergen en módulo separado, autorización por capacidades, tabla sin FK a identidad, RPCs sin grants directos, preview informativa y recálculo transaccional de duplicados.
- 2026-08-16: dominio, servicio y adaptadores implementados con validación compartida, coincidencias exactas, paginación y errores tipados; tests específicos aprobados durante el desarrollo.
- 2026-08-16: migración `202608160003_volunteer_registry.sql` aplicada desde cero; la primera versión aprobó 170/170 comprobaciones (51 nuevas). Tras la revisión de seguridad, el cierre amplió cobertura para confirmación `NULL`, proyecciones, configuración privilegiada, actor y búsqueda telefónica: 176/176, 57 nuevas.
- 2026-08-16: CRUD administrativo, navegación, rutas, estados de UI, preview/confirmación Excel, plantilla y exportación conectados. `lint:boundaries`, typecheck y suites específicas fueron aprobados incrementalmente.
- 2026-08-16: se añadieron `read-excel-file` (resuelta 9.3.10) y `write-excel-file` (4.1.1), ambos como adaptadores de infraestructura y sin scripts de instalación.
- 2026-08-19: el correctivo pre-merge añadió `fflate` (0.8.3) como dependencia directa, sin scripts de instalación, para inspeccionar tamaños/ratio/hojas del ZIP y contar expansión real antes del parser; añadió validación SQL fail-closed y elevó pgTAP a 212 comprobaciones (93 del padrón).
- 2026-08-16: documentación de arquitectura, datos, producto, seguridad, dependencias y atribución actualizada; E2E crítico agregado y pendiente de ejecución en el cierre.
- 2026-08-16: revisión final detectó y corrigió un bypass por booleano `NULL`, exposición de `phone_match_key`, búsqueda telefónica no alineada y afirmaciones imprecisas sobre fórmulas. Las cuatro revisiones especializadas emitieron GO después de los fixes.
- 2026-08-19: cierre del correctivo aprobado: `pnpm verify`; 146 unitarias web, 2 integración, 21 Edge Function, 13 orquestación y build; DB reset limpio/lint y 212 pgTAP; 7 E2E incluyendo concurrencia; lockfile congelado y scans de patrones prohibidos.
- 2026-08-19: `pnpm audit --prod --audit-level high` reportó tres avisos actuales en `react-router@7.18.1` y `brace-expansion@5.0.7`. Ambas versiones ya existen idénticas en `main@c6f7392`; las dependencias Excel no aparecen en las rutas. No se actualizaron por la prohibición de mezclar deuda no relacionada.

## Descubrimientos

- El shell de Codex no selecciona automáticamente el runtime Node fijado; todos los comandos se ejecutarán con `/Users/grovergonzalez/.local/share/nodejs/node-v22.18.0-darwin-x64/bin` al inicio de `PATH`.
- `supabase status` escribe telemetría bajo el directorio personal, por lo que requiere el permiso local ya concedido aunque solo consulte el stack.
- `created_at` representa fecha de registro digital, no fecha de incorporación histórica.
- La documentación vigente aún presenta la entidad institucional como pregunta abierta; este slice debe actualizar mapa de contextos, modelo/diccionario y catálogo de permisos sin dibujar un vínculo con Auth.

## Decisiones durante la ejecución

- 2026-08-16: se eligió autorización solo por permisos efectivos. Aunque una revisión sugirió comprobar además `administrator`, el RBAC existente define permisos como autoridad; el doble chequeo por nombre de rol sería un mecanismo paralelo y dificultaría evolución. La exclusividad se garantiza concediendo las cinco capacidades solo a `administrator` y probándolo en PostgreSQL.
- 2026-08-16: la clave de coincidencia telefónica elimina caracteres no numéricos solo para comparar; el valor almacenado nunca se reescribe con esa clave.
- 2026-08-16: las filas inválidas nunca llaman a la previsualización PostgreSQL; cuando no queda ninguna fila canónica, el resumen local se devuelve sin enviar un lote vacío a la RPC.
- 2026-08-16: la auditoría por fila registra solo nombres de campos en alta/edición; la importación suprime esos eventos y registra un único `volunteer.imported` con conteos enteros allowlist, sin PII.

## Resultado final

La V1 quedó implementada en `feat/volunteer-registry-v1` sin tocar las migraciones históricas, sin merge ni push. Commits técnicos: `01c127d`, `bfaccd9` y `19df8fe`; el cierre documental se registra en un commit posterior.

Todos los gates funcionales, de arquitectura, PostgreSQL/RLS, build, E2E, concurrencia y scans de secretos/patrones prohibidos están verdes. La comparación no detecta regresiones introducidas por esta rama. El estado global se clasifica AMARILLO únicamente por los tres avisos de dependencia descubiertos al consultar el audit actual: son reproducibles desde las versiones ya fijadas en `main`, no provienen de Excel ni de este diff. Actualizarlos requiere un slice separado con su propia validación.
