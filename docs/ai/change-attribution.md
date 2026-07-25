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
