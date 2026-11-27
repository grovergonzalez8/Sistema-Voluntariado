# ExecPlan 0017 — Limpieza E2E tras arranque parcial (AUD-008)

El orquestador registra la propiedad del runtime desde el arranque mediante un marcador por ejecución, la etiqueta del proyecto y el ID completo. El teardown intenta retirar de forma independiente los procesos, el contenedor propio y sus archivos temporales. Los contenedores ajenos se dejan intactos.

## Validación

- 45/45 pruebas focales, con 33 de orquestación y 12 de arranque/SMTP.
- 10/10 escenarios con Docker aislado, incluidos fallo antes de readiness, propiedad discordante, preservación de recursos ajenos y limpieza repetida.
- Verificación real pendiente del arranque parcial con Supabase CLI y de las señales del sistema operativo.

Los resultados corresponden al ensayo en Docker aislado. El [orquestador](../../scripts/e2e-service-orchestrator.mjs) y sus [pruebas](../../scripts/e2e-service-orchestrator.test.mjs) conservan los contratos ejecutables.
