# ExecPlan 0019 — Consolidación documental y cierre de estabilización (AUD-006)

## Objetivo y alcance

Consolidar el estado de la auditoría del 22 de noviembre de 2026 después de registrar por separado AUD-008 (`6f99fb5`) y AUD-005 (`de37b93`). La rama autorizada es `main`. AUD-006 abarca documentación, verificación de referencias y contraste con el código vigente. Se preservan las decisiones arquitectónicas y los registros históricos. Esta fase no incluye servicios, resets, migraciones, despliegues ni el commit documental.

## Hallazgos al cierre del 26 de noviembre de 2026

| Hallazgo | Estado y evidencia                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-001  | Corregido en `381d041`. Regresiones aprobadas para aislamiento del editor, cambios de actividad/modo y respuestas tardías. [ExecPlan 0012](0012-activity-editor-state-isolation.md).                                                                                                                                     |
| AUD-002  | Corregido en `c1cf289` y verificado en PostgreSQL 17.11. Dos deadlocks originales reproducidos (`40P01`). Después de corregir el orden de bloqueo, 23/23 escenarios de concurrencia, 8/8 pgTAP focalizadas y 122/122 aserciones Account Lifecycle aprobadas. [ExecPlan 0015](0015-account-administration-lock-order.md). |
| AUD-003  | Corregido en `02d0ecd`. Regresiones aprobadas para consultas repetidas y descarte de respuestas obsoletas. [ExecPlan 0013](0013-repeated-list-search-loading.md).                                                                                                                                                        |
| AUD-004  | Corregido en `34d46e3`. Regresiones aprobadas de aislamiento de formularios, carga, respuestas y mutaciones por recurso. [ExecPlan 0014](0014-resource-identity-state-isolation.md).                                                                                                                                     |
| AUD-005  | Verificado en `de37b93`. Playwright 5/5 y pgTAP 93/93 en Compose local. Se comprobaron plantilla, XLSX exportado, persistencia tras recarga, selección, duplicados, rollback e independencia de Identity. [ExecPlan 0018](0018-volunteer-excel-e2e-coverage.md).                                                         |
| AUD-006  | Corregido documentalmente. Se alinearon Changelog, estado de integración de Attendance, runbook Quality, modelo de amenazas y vista de ejecución. Este cambio permanece pendiente de commit por instrucción del propietario.                                                                                             |
| AUD-008  | Corregido en `6f99fb5`. 10/10 escenarios Docker aislados y 45/45 pruebas focales (33 de orquestación E2E y 12 de arranque/SMTP). Pendiente validar el contrato real de Supabase CLI con Edge Functions y las señales del SO. [ExecPlan 0017](0017-e2e-partial-startup-cleanup.md).                                       |

## Evidencia y alcance

- El árbol tiene 14 migraciones vigentes. En AUD-005 se aplicaron las 14 y el seed sintético. PostgreSQL confirmó cinco voluntarios nuevos, tres lotes y un duplicado aceptado, con el centinela y los conteos y huellas de Identity intactos. [Migraciones](../../supabase/migrations/), [pgTAP del padrón](../../supabase/tests/0003_volunteer_registry.test.sql), [spec de navegador](../../apps/web/tests/e2e/volunteer-registry.spec.ts).
- AUD-002 verificó serialización administrativa, protección del último administrador y contratos de cuenta en su alcance SQL. La corrección toma el mutex antes del lock de cuenta. [Migración correctiva](../../supabase/migrations/202611220014_account_administration_lock_order.sql), [pgTAP focalizadas](../../supabase/tests/0014_account_administration_lock_order.test.sql).
- `verify` de la primera fase de AUD-005 registró 446 unitarias y 4 integraciones MSW, sin caché de Turbo. Fue una ejecución histórica en Node 22.20.0 y pnpm 11.9.0. Quality y el repositorio exigen Node 22.18.0. Los resultados no sustituyen una ejecución integral con el pin ni un job Quality posterior a los commits. [Workflow Quality](../../.github/workflows/quality.yml), [runbook](../deployment/continuous-integration.md).
- Los ExecPlans anteriores conservan el alcance validado entonces de invitaciones/onboarding, Projects y Attendance. El cierre actual incorpora esa evidencia histórica sin atribuirle ejecución nueva. [Invitaciones](0008-invitation-flow-hardening-v1.md), [Attendance](0011-activity-attendance-v1.md).

## Continuidad, piloto y producción

El proyecto puede continuar el desarrollo en los contextos existentes. El siguiente trabajo prioritario es verificar AUD-008 con Supabase CLI real y un arranque parcial de Edge Functions. Ejecutar Quality completo con Node 22.18.0 y pnpm 11.9.0 antes de tratar la rama como candidata a un piloto. Verificar en ese gate invitaciones con Mailpit, concurrencia PostgreSQL y teardown del entorno. La cobertura Compose de AUD-005 omite Edge Functions y la suite E2E general.

Un piloto controlado requiere alcance y responsables aprobados, un entorno separado, participantes y roles mínimos, política de datos y retención, SMTP autorizado si se habilitan invitaciones, monitoreo y procedimiento probado de respaldo, restauración y respuesta a incidentes. Producción requiere además controles y evidencia en el entorno de destino, incluidos CSP, MFA y alertas administrativas, cuotas de invitación, rotación de claves, política de sesiones y contacto de seguridad. [Riesgos](../governance/risk-register.md), [deuda](../governance/technical-debt.md), [modelo de amenazas](../security/threat-model.md).

Los nuevos módulos requieren reglas de negocio suficientes y un ExecPlan aprobado. Definir propietarios, permisos, fronteras de datos, amenazas y criterios de aceptación antes de ampliar el esquema. Mantener el monolito modular y las restricciones sobre datos sensibles. [ADR 0011](../adr/0011-defer-future-schema.md), [PLANS](../../PLANS.md).

## Validación documental

El criterio de cierre es que las cinco correcciones correspondan a `main`, el runbook reproduzca la secuencia de Quality, las referencias resuelvan en el repositorio. El alcance no requiere repetir `verify` ni levantar servicios.

Se revisaron y registraron los commits de AUD-008 y AUD-005 con seis y tres rutas explícitas, respectivamente. Prettier y `git diff --check` terminaron con código 0. Se resolvieron 29 referencias Markdown locales y se contrastaron 15 pasos en orden, el teardown y los scripts raíz con Quality. AUD-006 queda documentado y sin staging.
