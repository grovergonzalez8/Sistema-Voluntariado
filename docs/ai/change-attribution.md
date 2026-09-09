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

## Activity Participation V1 0012 — fase de diseño

- Objetivo: diseñar la relación histórica Activity–Volunteer, su elegibilidad,
  autorización, lifecycle, integración con Project Assignment y concurrencia
  antes de cualquier implementación.
- Herramienta: agente principal de Codex; revisiones especializadas de solo
  lectura.
- Rama y base: `feat/activity-participation-v1` desde `main@fdc05c1`.
- Prompt: `docs/ai/prompts/0012-activity-participation-v1.md`.
- Plan: `docs/exec-plans/0007-activity-participation-v1.md`.
- Integración y escritura: exclusivamente el agente principal.
- Revisión inicial: `architect`, `domain_modeler`,
  `database_security_reviewer`, `qa_reviewer` y `docs_governor`.
- Resultado de revisión: arquitectura y dominio emitieron PASS; los NO-GO
  temporales de database security y documentación, y las condiciones de QA, se
  integraron. Sus rechecks finales emitieron GO sin contradicción material.
- Validación: runtime exacto Node 22.18.0/pnpm 11.9.0, frozen install,
  `pnpm verify`, reset/lint DB, 406 pgTAP, 24 carreras, 21 Functions y 15 E2E.
- Estado: diseño y baseline documentados; detenido para revisión humana, sin
  migración, RPC, código productivo, UI, pruebas productivas, push, merge,
  rebase, amend, despliegue, modificación de `main` ni Supabase remoto.

Decisiones materiales: ownership en Projects; sujeto exclusivo `volunteers`;
relación histórica sin DELETE; add condicionado a Assignment activa del Project
exacto; Activity terminal read-only sin auto-finalización; guard forward-only de
finish Assignment; locks
account–scope–Project–Assignment–Activity–Participation; RLS default-deny,
cuatro RPC mínimas y auditoría sin PII.

## Activity Participation V1 0013 — implementación

- Objetivo: completar el slice vertical aprobado y dejar la rama lista para
  revisión pre-merge.
- Herramienta: agente principal de Codex como único escritor; revisiones
  especializadas de solo lectura.
- Rama/base/HEAD inicial: `feat/activity-participation-v1`, `main@fdc05c1`,
  `0457cbb`.
- Prompt: `docs/ai/prompts/0013-activity-participation-v1-implementation.md`.
- Plan: `docs/exec-plans/0007-activity-participation-v1.md`.
- Cambios: migración/RPC/RLS/auditoría y guard Assignment; dominio, servicio,
  gateway, composición y Participants UI; pgTAP, harness PostgreSQL, E2E, CI y
  documentación.
- Mutation testing: degradaciones temporales de eligibility Assignment, lock de
  scope y guard de finish Assignment hicieron fallar sus regresiones dirigidas; el
  diff original se restauró exactamente antes de continuar.
- Hallazgos integrados: UI stale en transición terminal; oráculo global de
  Volunteer en create; orden Functions/DB en CI; audit pgTAP global; grants y
  candidates incompletos; guard cross-Project, timestamps owner y aserción E2E
  histórica.
- Revisión: architect, domain modeler, database security, QA y docs governor
  emitieron GO final de solo lectura.
- Validación: Node 22.18.0/pnpm 11.9.0, frozen install, formato, lint, typecheck, 13
  orquestación, 226 unitarias, 4 integración, build 472, reset/lint, 530 pgTAP, 36
  carreras, 21 Functions y 19 E2E normal/`CI=true`; cinco repeticiones del harness
  Participation aprobaron 60/60.
- Commits: `4fecd5c` (slice vertical), `a1264d4` (concurrencia/E2E/CI), `1c88cc6`
  (cierre documental) y `8162d39` (aislamiento de la aserción histórica del harness
  combinado).
- Recheck post-commit: el combinado detectó que aserciones previas de Volunteer y
  Manager Assignment contaban auditoría global durante la ejecución paralela. El
  archivo aislado aprobó 7/7; los contadores globales se retiraron y el combinado
  regresó a 36/36 sin modificar la protección autoritativa ni su cobertura pgTAP.
- Estado: completo y listo para PRE-MERGE REVIEW; sin push, merge, rebase, amend,
  despliegue, cambio en main ni operación Supabase remota.

## Invitation Flow Hardening V1 0014 — diagnóstico

- Objetivo: reproducir y diagnosticar el flujo real de invitaciones antes de
  implementar correcciones.
- Herramienta: agente principal de Codex como único escritor; revisiones
  especializadas de solo lectura.
- Rama/base/HEAD inicial: `fix/invitation-flow-hardening`, `main@34c25dd`,
  `34c25dd`.
- Prompt: `docs/ai/prompts/0014-invitation-flow-hardening-v1.md`.
- Plan: `docs/exec-plans/0008-invitation-flow-hardening-v1.md`.
- Cambios: documentación de baseline, arquitectura real, reproducciones A–J,
  estados, seguridad, email/redirect, concurrencia, causas raíz, estrategia y
  criterios de aceptación futuros.
- Validación: frozen install, `pnpm verify`, reset/lint DB, 553 pgTAP, 21 Functions
  y 19 E2E; reproducción manual local desde UI y Mailpit hasta logout/login, con
  evidencia sanitizada. Estos gates fueron PASS local bajo Node `22.21.0`; la
  paridad con el `22.18.0` fijado es NOT EXECUTED porque el runtime no está
  disponible y no se actualizó.
- Revisión: architect, database security, QA y docs governor emitieron GO para el
  commit documental tras integrar sus hallazgos; todos mantuvieron NO-GO para
  implementación y docs governor también para release.
- Estado: diagnóstico completado; implementación no iniciada. Sin cambios
  productivos, push, merge, rebase, amend, despliegue, modificación de `main` ni
  operación Supabase remota.

Hallazgos materiales: replace envía una sucesora no reconciliable; revoke/expiry no
invalidan el artefacto Auth; callback infiere éxito por sesión; replays en progreso
parecen éxito terminal; revoke carece de idempotencia; locale no controla el correo;
y el E2E existente no prueba logout/login final ni las fronteras distribuidas.

## Invitation Flow Hardening V1 — FASE A.1 (2026-09-05)

- Objetivo: cerrar exclusivamente provenance por delivery, recuperación tras ACK
  incierto, conflicto idempotente concurrente y harness accept↔replace.
- Herramienta: Codex GPT-5.6 Sol como escritor; revisiones finales solicitadas a
  database security, QA y architect en modo solo lectura.
- Cambios: migración forward-only con hash/generación/consumo de challenge y RPC
  v3; callback efímero; reconciliación Auth Admin antes de unknown; advisory lock
  por clave; regresiones Auth/pgTAP/Functions/concurrencia; documentación alineada.
- Privacidad: ningún challenge RAW, token, JWT, correo o dato personal se añadió a
  logs, auditoría o documentación.
- Validación: pruebas focales verdes; gates de cierre se ejecutarán una sola vez
  tras integrar revisiones. Node 22.18.0 no está disponible localmente y no se
  actualiza en esta rama.

## Invitation Flow Hardening V1 — FASE B FINAL (2026-09-07)

- Objetivo: cerrar callback seguro, mismatch de actor, recovery administrativo y
  acceptance E2E real con Mailpit.
- Herramienta: Codex GPT-5.6 Luna; integración y
  escritura exclusivamente del agente principal.
- Cambios: parser callback allowlist y estado efímero; recovery `recover` con
  challenge Auth, ownership bilateral, idempotencia y auditoría; guard de activación
  administrativa; logout/login y conteo aislado de correo en E2E; documentación.
- Privacidad: no se imprimen ni persisten tokens, challenges RAW, JWT, contraseñas,
  cuerpos de correo ni PII en auditoría.
- Locale: se conserva `preferred_locale`; el template local Supabase no permite
  selección dinámica limpia y queda como follow-up no bloqueante.
- Validación: callback 7/7, Functions 33/33, pgTAP focalizado 122/122,
  pgTAP completo 583/583, Auth contract 1/1, concurrencia 8/8, Playwright 20/20 y
  `pnpm verify` completo PASS sin overrides (236/236 unitarias, 4 integraciones,
  13 de orquestación y build). Architect, database security, QA y docs governor
  emitieron GO; el detalle se conserva en el ExecPlan 0008.
- Estado: lista para PRE-MERGE REVIEW, sin ejecutar esa revisión ni realizar push,
  PR, merge, rebase, amend, deploy u operaciones Supabase remotas.

## Invitation Flow Hardening — cleanup de sesión fail-closed (2026-09-08)

- Objetivo: corregir exclusivamente la navegación posterior a cleanup fallido en
  callback y acceptance terminales.
- Herramienta: agente principal de Codex como único escritor; revisiones de
  arquitectura, QA y documentación en modo de solo lectura.
- Rama/HEAD inicial: `fix/invitation-flow-hardening@56d993a`.
- Prompt: `docs/ai/prompts/0017-invitation-session-cleanup-fail-closed.md`.
- Plan: correctivo 2026-09-08 de
  `docs/exec-plans/0008-invitation-flow-hardening-v1.md`.
- Cambios: contrato común que exige `Result.ok`, pantalla segura sin detalle
  interno, retry serializado y bloqueo de redirects a login/perfil mientras la
  sesión siga viva; regresiones focalizadas y mutation check restaurado.
- Fuera de alcance: DB, pgTAP, Edge Functions, concurrencia, dependencias y cambios
  al happy path válido.
