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
