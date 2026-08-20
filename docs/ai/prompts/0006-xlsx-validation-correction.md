# Prompt 0006 — Corrección defensiva de validación XLSX

- Fecha: 2026-08-20
- Herramienta: Codex, GPT-5.6 Sol, reasoning medium
- Rama solicitada: `feat/volunteer-registry-v1`
- HEAD inicial confirmado: `d0d2ebcef0f5f2f6953113d6343775e4070d64af`
- Base preservada: `main@c6f7392`

## Objetivo y alcance recibido

Corregir exclusivamente los defectos pendientes del preflight XLSX del registro
de voluntarios. Las entries críticas deben identificarse sin ambigüedad, la
estructura ZIP debe fallar de forma controlada, los límites deben aplicarse a
bytes realmente procesados y la semántica XML debe resolverse con parser
estructurado y namespaces, no mediante prefijos o expresiones regulares.

La V1 admite exactamente una hoja lógica, una relationship interna de tipo
worksheet y una worksheet correspondiente. Deben rechazarse hojas ocultas
adicionales, relationships worksheet adicionales, targets externos o fuera del
paquete, entries críticas duplicadas y estructuras ZIP inconsistentes o
truncadas.

Se conservan los límites de 5 MiB para el archivo, 100 entries, 20 MiB de
expansión total, 10 MiB por entry genérica, 5 MiB para la worksheet, 1 MiB para
workbook/relationships, 1.000 filas de datos y 16 columnas. Los tests de límites
deben usar configuración reducida y fixtures pequeños, sin archivos ofensivos ni
consumo deliberadamente peligroso.

La plantilla propia, el celular textual con `+` o cero inicial y la exportación
de textos que empiezan por `=`, `+`, `-` o `@` deben seguir funcionando sin
fórmulas ejecutables.

## Exclusiones explícitas

No revisar ni modificar SQL, RPC, RLS, RBAC, tipos de base de datos, Auth, UI,
cuentas, exportación masiva, archivado, campos del producto ni deuda de
dependencias no relacionada. No crear rama, merge, push o PR; no modificar
`main`; no generar ZIP bombs, payloads ofensivos ni técnicas de evasión.

## Validación y entrega solicitadas

Ejecutar primero tests de preflight/gateway/importación, typecheck y build. Solo
con esos gates verdes, ejecutar reset local limpio, migraciones/seed, DB lint,
pgTAP, unitarias, integración, Edge Function, E2E, concurrencia y `pnpm verify`.
Crear únicamente commits nuevos y entregar evidencia Git, estrategia, límites,
contrato multi-sheet, XML/relationships, tests, dependencias, regresiones,
documentación y estado final.

Este registro resume el encargo sin secretos, URLs privadas ni datos personales.
El detalle operacional permanece en la conversación de trabajo.
