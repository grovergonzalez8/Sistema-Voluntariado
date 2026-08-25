# Prompt 0008 — Regresión de concurrencia assign/close

- Fecha: 2026-08-24
- Objetivo: cerrar exclusivamente el bloqueante pre-merge de Projects V1 mediante una prueba determinista y corregir TD-008.
- Herramienta: Codex, agente principal con revisiones especializadas de solo lectura.
- Rama: `feat/project-volunteer-assignments-v1` desde `6d05dc2`.
- Restricciones: sin cambios productivos, dependencias, migraciones persistentes, LOW diferidos, push, merge, rebase, amend, PR, despliegue ni Supabase remoto.

## Requisitos conservados

1. Probar con dos conexiones PostgreSQL reales ambos órdenes de `assign_volunteer_to_project` frente a `close_project`.
2. Demostrar la espera mediante locks observados, no mediante delays o repetición probabilística.
3. Comprobar errores, estados finales, auditoría y la invariante global `closed + active assignment = 0`.
4. Liberar transacciones, conexiones, locks y fixtures incluso ante fallo.
5. Integrar el comando en desarrollo local y GitHub Actions sin duplicar la propiedad de Supabase.
6. Demostrar mediante una mutación temporal no versionada que retirar la serialización hace fallar la regresión; restaurar inmediatamente.
7. Mantener TD-008 abierta, aclarando que Projects V1 existe pero `project.manage` continúa global sin scopes contextuales.

## Fuera de alcance

- Cambiar RPC, tablas, RLS/RBAC, UI o contratos productivos.
- Corregir captura amplia de `unique_violation`, conteo global pgTAP, E2E de edición o barrel público.
- Añadir dependencias.

## Resultado

Completado. `98a615f` versiona la regresión determinista e integración CI. Ambas intercalaciones aprobaron cinco ejecuciones consecutivas; la mutación temporal sin ambos locks de asignación hizo fallar close-first con `SQLSTATE 00000`, la restauración volvió a aprobar y la migración quedó sin diff. `pnpm install --frozen-lockfile`, `pnpm verify` y `pnpm account-lifecycle:test` aprobaron con 21 pruebas de Functions, DB reset/lint, 263 pgTAP, concurrencia 2/2, 172 unitarias, 2 de integración, 13 de orquestación, typecheck, build y 10 E2E. Database security, QA y documentación emitieron GO de solo lectura.
