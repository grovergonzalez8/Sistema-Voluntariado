# Registro de prompts

| ID   | Fecha      | Objetivo                                         | Herramienta | Resultado                           | Commits                                                                              |
| ---- | ---------- | ------------------------------------------------ | ----------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 0001 | 2026-07-23 | Construir fundación y un slice de perfil propio  | Codex       | Completado; gates locales aprobados | `5dc9178`–`4d9aec9` y cierre documental                                              |
| 0002 | 2026-07-24 | Implementar invitaciones y ciclo de cuentas      | Codex       | Completado; gates locales aprobados | `245b09b`–`ed54f64` y cierre documental                                              |
| 0003 | 2026-07-25 | Corregir autoridad al recuperar foco             | Codex       | Completado; gates locales aprobados | `c61ab59`, `df19362`, `dd9b6e6` y cierre documental                                  |
| 0004 | 2026-07-26 | Corregir propiedad de procesos E2E/CI            | Codex       | Completado; gates locales aprobados | `bb59d3c`, `d7531c4` y cierre documental                                             |
| 0005 | 2026-08-16 | Implementar padrón administrativo de voluntarios | Codex       | Completado; gates locales aprobados | `01c127d`, `bfaccd9`, `19df8fe` y cierre documental                                  |
| 0006 | 2026-08-20 | Endurecer validación estructural XLSX            | Codex       | Completado; gates locales aprobados | `351ac17` y cierre documental                                                        |
| 0007 | 2026-08-24 | Implementar proyectos y asignaciones V1          | Codex       | Completado; gates locales aprobados | `625708b`, `64affd8` y cierre documental                                             |
| 0008 | 2026-08-24 | Probar concurrencia assign/close                 | Codex       | Completado; gates locales aprobados | `98a615f` y cierre documental                                                        |
| 0009 | 2026-08-25 | Scope contextual de project manager V1           | Codex       | Completado; gates locales aprobados | `daeedd1`, `749da5e`, `3b4c282`, `0a9fe2f`, `fd2706c`, `0a10b65` y cierre documental |
| 0010 | 2026-08-26 | Diseñar Project Activities V1                    | Codex       | Diseño inicial; baseline aprobada   | `d13e73c`                                                                            |
| 0011 | 2026-08-26 | Implementar Project Activities V1                | Codex       | Completado; gates locales aprobados | `21db0cd`, `bb1a16a` y cierre documental                                             |
| 0012 | 2026-09-01 | Diseñar Activity Participation V1                | Codex       | Diseño inicial; baseline aprobada   | `0457cbb`                                                                            |
| 0013 | 2026-09-02 | Implementar Activity Participation V1            | Codex       | Completado; gates locales aprobados | `4fecd5c`, `a1264d4`, `1c88cc6`, `8162d39` y cierre de trazabilidad                  |

Detalle: `docs/ai/prompts/0001-bootstrap-foundation.md`.

Detalle del hito: `docs/ai/prompts/0002-account-lifecycle.md`. Rama: `feat/account-lifecycle`. La línea base local aprobó `pnpm verify`, linter SQL, 27 pruebas pgTAP y 2 E2E antes de iniciar cambios materiales. El cierre aprobó `pnpm verify` y `pnpm account-lifecycle:test`, con 73 pruebas unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E sin omisiones.

Corrección de regresión: `docs/ai/prompts/0003-account-authority-focus-regression.md`. La causa raíz y el plan se registran en el apéndice 2026-07-25 del ExecPlan 0002 antes de modificar código.

El cierre 0003 aprobó `pnpm verify` y `pnpm account-lifecycle:test`, con 102 pruebas unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E. Architect, database_security_reviewer, qa_reviewer y docs_governor emitieron GO tras integrar sus hallazgos.

Corrección de CI 0004: `docs/ai/prompts/0004-ci-edge-function-orchestration.md`. La reproducción, causa raíz y estrategia A se registraron en el apéndice 2026-07-26 del ExecPlan 0002 antes de modificar scripts o configuración.

El cierre 0004 aprobó `pnpm verify`, `CI=true pnpm test:e2e` y `pnpm account-lifecycle:test`: 13 pruebas de orquestación, 102 unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E. Architect, database_security_reviewer, qa_reviewer y docs_governor emitieron GO tras integrar sus hallazgos. La ejecución remota del PR queda pendiente como confirmación definitiva de GitHub Actions.

No se registran claves locales generadas por Supabase ni otra salida sensible.

Registro de voluntarios 0005: `docs/ai/prompts/0005-volunteer-registry-v1.md`. El diseño, decisiones, validaciones incrementales y evidencia final se conservan en `docs/exec-plans/0003-volunteer-registry-v1.md`.

El cierre correctivo 0005 aprobó `pnpm verify`, 146 pruebas unitarias web, 2 de integración, 21 de Edge Function, 13 de orquestación, DB reset/lint, 212 pgTAP y 7 E2E. Los correctivos pre-merge se sometieron nuevamente a revisión especializada. El audit externo registró tres avisos altos en versiones preexistentes de `react-router`/`brace-expansion`; no se ocultaron ni se mezcló su actualización con este hito.

Corrección XLSX 0006: `docs/ai/prompts/0006-xlsx-validation-correction.md`. El correctivo sustituyó la interpretación ZIP binaria propia por `@zip.js/zip.js`, mantuvo `fflate` únicamente para fixtures unitarios seguros y adoptó XML estructurado con resolución por namespace URI y local name. El cierre aprobó los 27 tests focalizados XLSX, `pnpm verify`, 158 unitarias web, 2 de integración, 21 de Edge Function, 13 de orquestación, DB reset/lint, 212 pgTAP y 7 E2E. Las revisiones de arquitectura, QA y documentación fueron de solo lectura; no se reabrió SQL/RLS.

Proyectos y asignaciones 0007: `docs/ai/prompts/0007-project-volunteer-assignments-v1.md`. El alcance autorizado, decisiones, progreso y evidencia se mantienen en `docs/exec-plans/0004-project-volunteer-assignments-v1.md`.

Correctivo pre-merge 0008: `docs/ai/prompts/0008-project-concurrency-regression.md`. La regresión determinista, mutación temporal, integración CI y evidencia final se mantienen en la fase 7 de `docs/exec-plans/0004-project-volunteer-assignments-v1.md`.

El cierre 0008 aprobó `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm account-lifecycle:test`, cinco repeticiones de ambas intercalaciones, la mutación temporal FAIL y la restauración PASS: 21 pruebas de Functions, 263 pgTAP, 172 unitarias, 2 de integración, 13 de orquestación, 10 E2E, typecheck y build. Database security, QA y documentación emitieron GO de solo lectura.

Project Manager Contextual Scope V1 0009: `docs/ai/prompts/0009-project-manager-contextual-scope-v1.md`. El diseño, riesgos y matriz de autorización se conservan en `docs/exec-plans/0005-project-manager-contextual-scope-v1.md`. Producto confirmó altas solo en proyectos activos y scopes previos independientes del cierre; las revisiones especializadas emitieron GO antes de iniciar la migración.

El cierre 0009 aprobó frozen install, `pnpm verify`, DB reset/lint, 309 pgTAP, 21 Functions, 176 unitarias, 2 integración, 13 orquestación, cinco repeticiones 7/7 de concurrencia y 11 E2E tanto local como con `CI=true`. La mutación temporal de ambos locks de alta hizo fallar close-first y la restauración devolvió PASS. Arquitectura, database security, QA y documentación emitieron GO final de solo lectura.

Project Activities V1 0010: `docs/ai/prompts/0010-project-activities-v1.md`. La
primera fase se limitó a inspección, baseline, diseño SQL/RLS/concurrencia,
ExecPlan y revisiones de solo lectura. El resultado se conserva en
`docs/exec-plans/0006-project-activities-v1.md`; no se creó migración, RPC,
código productivo, UI ni pruebas productivas.

Implementación Project Activities V1 0011:
`docs/ai/prompts/0011-project-activities-v1-implementation.md`. Ejecuta el
diseño aprobado sin reinterpretar permisos placeholders ni introducir
Participation/Tasks. El resultado técnico, las carreras, mutation checks,
revisiones y gates finales se conservan en el ExecPlan 0006.

El cierre 0011 aprobó frozen install y `pnpm verify` con Node 22.18.0/pnpm
11.9.0, 202 unitarias, 2 integración, 13 orquestación, 21 Functions, reset/lint,
406 pgTAP, 24 carreras combinadas, cinco repeticiones Activity 85/85 y 15 E2E
tanto normal como con `CI=true`. Los tres mutation checks fallaron bajo la
degradación dirigida y la restauración recuperó el hash revisado. Arquitectura,
dominio, database security, QA y documentación emitieron GO final de solo
lectura. GitHub Actions remoto queda pendiente de la revisión pre-merge.

Activity Participation V1 0012:
`docs/ai/prompts/0012-activity-participation-v1.md`. La primera fase se limita a
inspección, baseline, diseño SQL/RLS/concurrencia, ExecPlan, gobernanza IA y
revisiones de solo lectura. El resultado se conserva en
`docs/exec-plans/0007-activity-participation-v1.md`; no se creó migración, RPC,
código productivo, UI, pgTAP, harness ni E2E nuevo.

Implementación Activity Participation V1 0013:
`docs/ai/prompts/0013-activity-participation-v1-implementation.md`. Ejecuta el
diseño aprobado sin reinterpretar permisos placeholder ni introducir attendance,
RSVP o Tasks. La evidencia técnica, carreras, mutation checks, revisiones y gates se
conserva en el ExecPlan 0007.

El cierre 0013 aprobó frozen install, formato, lint, typecheck, 226 unitarias, 4
integración, 13 orquestación, build de 472 módulos, reset/lint DB, 530 pgTAP, 36
carreras combinadas, 21 Functions y 19 E2E tanto normal como con `CI=true`. El
harness Participation aprobó cinco repeticiones (60/60). Los tres mutation checks
dirigidos fallaron y la restauración recuperó el diff original. Los cinco revisores
emitieron GO. GitHub Actions remoto queda pendiente de PRE-MERGE REVIEW.

El recheck limpio detectó aserciones históricas no aisladas: el harness Assignment
contaba auditoría global de Volunteer y Manager Assignment mientras los tres archivos
corrían en paralelo. El archivo aislado aprobó 7/7 y, tras limitar las aserciones al
estado y auditoría del Project propio, la suite combinada regresó a 36/36 sin cambios
SQL.
