# ExecPlan 0018 — Cobertura E2E de Excel del padrón (AUD-005)

Se añadieron escenarios de importación, validación, selección, persistencia y exportación filtrada con fixtures XLSX sintéticos. Se preservó la cobertura existente de alta, edición y acceso del coordinador. [Spec del padrón](../../apps/web/tests/e2e/volunteer-registry.spec.ts).

## Evidencia de la primera fase

La ejecución local de verify con Node 22.20.0 aprobó 446 pruebas unitarias y 4 integraciones MSW sin caché de Turbo. Node 22.18.0 es el pin del repositorio. El primer intento contra Supabase se detuvo al detectar una publicación distinta de loopback, antes de pgTAP y Playwright.

## Reintento con Docker Compose y cierre (26 de noviembre de 2026)

Con Compose aislado, las 14 migraciones y el seed sintético se aplicaron tras verificar los bindings. Pasaron los cinco casos Playwright y 93/93 aserciones pgTAP, incluido rollback sin inserciones parciales.

Se verificaron por relectura la plantilla, el XLSX exportado y la fila filtrada frente a PostgreSQL. Se contabilizaron cinco voluntarios nuevos en tres lotes, con un duplicado confirmado. El centinela y las entidades de Identity conservaron sus huellas. Se retiraron los recursos propios del ensayo. Las Edge Functions quedaron fuera de este entorno.

**E2E VERIFICADO para el padrón.**
