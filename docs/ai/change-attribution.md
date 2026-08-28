# Atribución de cambios

## Bootstrap 0001

- Generado/modificado con asistencia de IA: todos los archivos de código, SQL, pruebas, configuración y documentación creados en el repositorio inicialmente vacío.
- Revisión independiente: architect, domain_modeler y database_security_reviewer durante diseño; architect, database_security_reviewer, qa_reviewer y docs_governor antes del cierre.
- Integración: agente principal de Codex.
- Validación humana: obligatoria antes de compartir, desplegar o usar con datos reales.

Hallazgos materiales corregidos durante la revisión: aislamiento de caché entre sesiones, clasificación efectiva de límites arquitectónicos, permisos de cuentas archivadas, repetibilidad pgTAP, cobertura de estados del perfil y coherencia de dependencias/documentación.

La atribución no implica autoría legal ni aprobación. El propietario debe revisar el diff, decisiones, dependencias, migraciones y resultados de pruebas.

## Account lifecycle 0002

- Objetivo: invitaciones, onboarding, estados de cuenta, administración de roles y auditoría segura.
- Herramienta: agente principal de Codex; modelo específico no expuesto por el entorno.
- Rama: `feat/account-lifecycle`.
- Prompt íntegro: `docs/ai/prompts/0002-account-lifecycle.md`.
- Plan: `docs/exec-plans/0002-account-lifecycle.md`.
- Revisión independiente inicial y final: `architect`, `domain_modeler`, `database_security_reviewer` y `qa_reviewer` en modo de solo lectura; `docs_governor` aprobó el cierre documental.
- Integración y escritura: exclusivamente el agente principal.
- Commits técnicos: `245b09b`, `9aea410`, `7ee34c2`, `a5b912d` y `ed54f64`, más el cierre documental.
- Validación local: `pnpm verify` y `pnpm account-lifecycle:test` aprobados; 73 pruebas unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E sin omisiones.
- Estado: implementación y validaciones completadas en la rama autorizada, sin push ni despliegue.

Hallazgos materiales corregidos durante la revisión: partición y descarte de caché por actor/autoridad, refresh inmediato tras mutaciones propias, serialización del último administrador, leases de entrega correlacionados, reconciliación de ACK, historial inmutable de sustituciones, detalle autorizado de invitación y carreras E2E con fallos cerrados.

La revisión humana sigue siendo obligatoria. No se registrarán claves locales, tokens, enlaces de Mailpit, correos reales ni salida sensible.

## Corrección de autoridad 0003

- Objetivo: impedir que estados transitorios de sesión/autoridad conviertan una cuenta activa en bloqueada y corregir la configuración local de origins.
- Prompt: `docs/ai/prompts/0003-account-authority-focus-regression.md`.
- Plan: apéndice 2026-07-25 de `docs/exec-plans/0002-account-lifecycle.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión independiente: `architect`, `database_security_reviewer`, `qa_reviewer` y `docs_governor`, todos con veredicto GO final y sin modificar archivos.
- Commits técnicos: `c61ab59`, `df19362` y `dd9b6e6`, más el cierre documental.
- Validación local: `pnpm verify` y `pnpm account-lifecycle:test` aprobados; 102 pruebas unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E sin omisiones.
- Estado: corrección completada en la rama autorizada, sin push, rebase, amend ni despliegue.

Hallazgos materiales corregidos durante la revisión: epoch Auth para bootstrap/sign-in/sign-out tardíos; descarte de 401 administrativos de un actor anterior; tokens vivos de perfil; purga de caché A→B→C; bloqueo de E2E contra Supabase remoto; y eliminación de la ventana entre commit React y efectos pasivos mediante remount por identidad y `useLayoutEffect`.

## Corrección de orquestación CI 0004

- Objetivo: eliminar el doble propietario de `manage-account-invitation` y hacer reproducible la suite E2E local/Actions.
- Prompt: `docs/ai/prompts/0004-ci-edge-function-orchestration.md`.
- Plan: apéndice 2026-07-26 de `docs/exec-plans/0002-account-lifecycle.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión independiente: `architect`, `database_security_reviewer`, `qa_reviewer` y `docs_governor`, todos con veredicto GO final y sin modificar archivos.
- Commits técnicos: `bb59d3c` y `d7531c4`, más el cierre documental.
- Validación local: `pnpm verify`, `CI=true pnpm test:e2e` y `pnpm account-lifecycle:test` aprobados; 13 pruebas de orquestación, 102 unitarias web, 2 de integración, 21 de Edge Function, 119 pgTAP y 5 E2E.
- Estado: corrección completada en la rama autorizada, sin push, rebase, amend, despliegue ni modificación de `main`; confirmación remota del PR pendiente.

Hallazgos materiales corregidos durante revisión: cleanup de Edge aun si falla `db:reset`; preservación conjunta de fallos funcionales y de teardown; cleanup independiente de Playwright/Vite y Functions ante señales; salud GoTrue obligatoria; y adquisición de un contenedor solamente con cardinalidad no ambigua.

## Volunteer Registry 0005

- Objetivo: padrón administrativo independiente con CRUD, consultas server-side e importación/exportación Excel.
- Herramienta: agente principal de Codex, GPT-5.6 Sol con reasoning medium.
- Rama: `feat/volunteer-registry-v1` desde `main@c6f7392`.
- Prompt: `docs/ai/prompts/0005-volunteer-registry-v1.md`.
- Plan: `docs/exec-plans/0003-volunteer-registry-v1.md`.
- Revisión inicial de solo lectura: `architect`, `domain_modeler` y `database_security_reviewer`; la revisión final usa `architect`, `database_security_reviewer`, `qa_reviewer` y `docs_governor`.
- Integración y escritura: exclusivamente el agente principal.
- Commits técnicos: `01c127d`, `bfaccd9` y `19df8fe`, más el cierre documental.
- Validación: `pnpm verify`, frozen lockfile, 146 unitarias web, 2 de integración, 21 Edge Function, 13 de orquestación, DB reset/lint, 212 pgTAP y 7 E2E aprobados; los correctivos pre-merge se sometieron nuevamente a revisión especializada.
- Estado: implementación y validación local completadas; sin push, PR, merge ni despliegue.

Decisiones materiales: agregado y tabla sin relación con Auth/cuentas/perfil; RBAC por cinco permisos exclusivos; tabla RLS default-deny expuesta solo mediante RPC; duplicados como advertencia confirmable bajo lock; importación seleccionada all-or-nothing; Excel efímero con límites técnicos; auditoría sin PII duplicada.

## Corrección de validación XLSX 0006

- Objetivo: cerrar exclusivamente los defectos pendientes de robustez, validación estructural y procesamiento defensivo de archivos XLSX.
- Herramienta: agente principal de Codex, GPT-5.6 Sol con reasoning medium.
- Rama: `feat/volunteer-registry-v1`; HEAD inicial `d0d2ebc`; base `main@c6f7392` intacta.
- Prompt: `docs/ai/prompts/0006-xlsx-validation-correction.md`.
- Plan: fase 8 de `docs/exec-plans/0003-volunteer-registry-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión independiente de solo lectura: `architect`, `qa_reviewer` y `docs_governor`; no se repitió revisión SQL/RLS por estar expresamente fuera del alcance.
- Commit técnico: `351ac17`, más el cierre documental.
- Validación: frozen install; 27 tests focalizados XLSX; `pnpm verify` con 158 unitarias web, 2 de integración, 21 Edge Function y 13 de orquestación; reset DB oficial, DB lint, 212 pgTAP y 7 E2E aprobados; typecheck y build aprobados.
- Estado: corrección completada en la rama autorizada, sin push, PR, merge, rebase, amend, despliegue ni modificación de `main`.

Hallazgos materiales corregidos durante la revisión: diferencia de interpretación de namespaces entre preflight y parser principal; normalización permisiva de targets no canónicos; evidencia insuficiente del contador de bytes emitidos; afirmación documental imprecisa sobre filas físicas; y trazabilidad incompleta de la iteración 0006.

## Proyectos y asignaciones 0007

- Objetivo: proyectos administrativos mínimos y participaciones históricas de registros `volunteers`.
- Herramienta: agente principal de Codex; revisiones especializadas de solo lectura.
- Rama: `feat/project-volunteer-assignments-v1` desde `main@89d4c97`.
- Prompt: `docs/ai/prompts/0007-project-volunteer-assignments-v1.md`.
- Plan: `docs/exec-plans/0004-project-volunteer-assignments-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión inicial: architect, domain_modeler y database_security_reviewer.
- Revisión final de solo lectura: architect, database_security_reviewer y qa_reviewer emitieron GO; docs_governor confirmó coherencia funcional y su observación de trazabilidad abierta quedó resuelta en el cierre.
- Commits técnicos: `625708b` y `64affd8`, más el cierre documental.
- Validación con Node 22.18.0 y pnpm 11.9.0: frozen install; `pnpm verify` con 13 pruebas de orquestación, 172 unitarias, 2 de integración, límites/probes/typecheck/build; `pnpm account-lifecycle:test` con 21 de Functions, reset/lint DB, 263 pgTAP y 10 E2E sin omisiones.
- Scans del slice: sin `any`, `@ts-ignore`, supresiones lint, TODO/FIXME ni `service_role`; `git diff --check` aprobado.
- Estado: implementación y validación local completadas; sin push, PR, merge, rebase, amend, despliegue ni modificación de `main`.

Decisiones materiales: ownership de la relación en Projects; sujeto exclusivo del padrón sin Auth/cuentas/perfiles; `project.manage` solo administrator; timestamps server-side; sin aprobación/capacidad/scopes; índice único parcial y lock de proyecto para concurrencia; RLS default-deny y auditoría sin PII.

## Correctivo de concurrencia Projects 0008

- Objetivo: versionar una regresión determinista de assign/close y corregir la justificación obsoleta de TD-008.
- Herramienta: agente principal de Codex; revisiones de database security, QA y documentación en modo de solo lectura.
- Rama y base: `feat/project-volunteer-assignments-v1@6d05dc2`, con `main@89d4c97` intacta.
- Prompt: `docs/ai/prompts/0008-project-concurrency-regression.md`.
- Plan: fase 7 de `docs/exec-plans/0004-project-volunteer-assignments-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Commit técnico: `98a615f`, más el cierre documental.
- Validación: `pnpm install --frozen-lockfile`, `pnpm verify` y `pnpm account-lifecycle:test` aprobados; cinco repeticiones de concurrencia 2/2; mutación temporal FAIL y restauración PASS; 21 pruebas de Functions, DB reset/lint, 263 pgTAP, 172 unitarias, 2 de integración, 13 de orquestación, typecheck, build y 10 E2E.
- Revisión independiente: `database_security_reviewer`, `qa_reviewer` y `docs_governor`, todos con veredicto GO final y sin modificar archivos.
- Estado: correctivo completado en la rama autorizada, sin cambios productivos, push, PR, merge, rebase, amend, despliegue, acceso Supabase remoto ni modificación de `main`.

Decisiones materiales: dos sesiones `psql` dentro del contenedor Supabase local, espera demostrada con `pg_blocking_pids`, fixtures autocontenidos y cleanup en `finally`; sin nuevas dependencias ni cambios productivos.

## Project Manager Contextual Scope V1 0009

- Objetivo: implementar el scope contextual explícito entre cuentas `project_manager` y Projects V1, con histórico, revocación dinámica y concurrencia protegida.
- Herramienta: agente principal de Codex; revisiones iniciales y finales especializadas en solo lectura.
- Rama y base: `feat/project-manager-contextual-scope-v1` desde `main@3b4f778`.
- Prompt: `docs/ai/prompts/0009-project-manager-contextual-scope-v1.md`.
- Plan: `docs/exec-plans/0005-project-manager-contextual-scope-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Commits técnicos: `daeedd1`, `749da5e`, `3b4c282`, `0a9fe2f`, `fd2706c` y `0a10b65`, más el cierre documental.
- Validación final con Node 22.18.0/pnpm 11.9.0: frozen install, `pnpm verify`, reset/lint DB, 309 pgTAP, 21 Functions, 176 unitarias, 2 integración, 13 orquestación, cinco repeticiones de concurrencia 7/7 y 11 E2E tanto local como con `CI=true`.
- Revisión independiente: architect, database security, QA y docs governance emitieron GO final; sus hallazgos de cancelación React y cobertura nominal PostgreSQL quedaron integrados antes del cierre.
- Estado: incremento completado y validado localmente. Sin push, PR, merge, rebase, amend, despliegue ni modificación de `main`.

Decisiones materiales: ownership en Projects, sujeto `accounts.id`, relación histórica, permisos contextuales explícitos, autorización dinámica y locks cuenta–scope–proyecto; altas solo en proyectos activos y conservación de scopes previos al cierre; sin framework genérico ni PII adicional.

## Project Activities V1 0010 — fase de diseño

- Objetivo: diseñar Project Activities V1 y su integración segura con Projects
  antes de cualquier implementación.
- Herramienta: agente principal de Codex; revisiones especializadas de solo
  lectura.
- Rama y base: `feat/project-activities-v1` desde `main@3416aca`.
- Prompt: `docs/ai/prompts/0010-project-activities-v1.md`.
- Plan: `docs/exec-plans/0006-project-activities-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión inicial: `architect`, `database_security_reviewer`,
  `domain_modeler`, `qa_reviewer` y `docs_governor`.
- Validación: runtime exacto Node 22.18.0/pnpm 11.9.0, frozen install,
  `pnpm verify`, reset/lint DB, 309 pgTAP, 7 carreras, 21 Functions y 11 E2E.
- Estado: diseño y baseline documentados; detenido para revisión humana, sin
  migración, código productivo, UI, pruebas productivas, push, merge, rebase,
  amend, despliegue ni acceso Supabase remoto.

Decisiones materiales: ownership de Activity en Projects; lifecycle scheduled
a terminal; permisos Project existentes; firmas Project + Activity; locks
cuenta–scope–proyecto–Activity; guard de cierre forward-only; RLS default-deny;
auditoría mínima y exclusión explícita de Participation/Tasks.

## Project Activities V1 0011 — implementación

- Objetivo: implementar el slice aprobado de Activity dentro de Projects y
  dejarlo listo para revisión pre-merge local.
- Herramienta: agente principal de Codex; revisiones especializadas de solo
  lectura.
- Rama y base: `feat/project-activities-v1` desde `main@3416aca`; HEAD técnico
  inicial `d13e73c`.
- Prompt: `docs/ai/prompts/0011-project-activities-v1-implementation.md`.
- Plan: `docs/exec-plans/0006-project-activities-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Validación final: 26 pruebas focalizadas; frozen install y `verify` con Node
  22.18.0/pnpm 11.9.0; 202 unitarias, 2 integración, 13 orquestación, 21
  Functions, reset/lint, 406 pgTAP, 24 carreras combinadas, cinco repeticiones
  Activity 85/85 y 15 E2E normal más 15 con `CI=true`.
- Revisiones de solo lectura: architect, domain_modeler,
  database_security_reviewer, qa_reviewer y docs_governor emitieron GO final.
- Commits: `21db0cd`, `bb1a16a` y cierre documental.
- Estado: incremento completado y listo para revisión pre-merge; cero sesiones,
  locks o procesos propios y Supabase local detenido conservando volúmenes. Sin
  push, merge, rebase, amend, despliegue, modificación de main ni Supabase
  remoto.

Hallazgos materiales integrados: normalización SQL colapsa whitespace antes de
`btrim`; timestamps exigen offset, calendario, finitud y rango UTC 0001–9999;
el harness captura el mensaje PostgreSQL de forma ordenada y prueba las cuatro
mutaciones frente a scope removal; pgTAP ejecuta DML denegado y valida actor de
auditoría; E2E espera terminalización antes de cerrar. El polling de locks usa
una sesión `psql` persistente después de detectar un timeout de `docker exec`
en una repetición extendida.
