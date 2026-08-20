# Registro de riesgos

| ID    | Riesgo                                  | Probabilidad/impacto | Mitigación                                                                                    |
| ----- | --------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| R-001 | RLS expone perfil ajeno                 | media/crítico        | pgTAP con dos actores y revisión DB                                                           |
| R-002 | Grants permiten columnas protegidas     | media/alto           | update por columna y caso negativo                                                            |
| R-003 | Documento difiere de scripts            | media/medio          | docs governor y prueba de comandos                                                            |
| R-004 | Dependencia comprometida                | baja/alto            | lockfile, allowBuilds y actualizaciones pequeñas                                              |
| R-005 | PII en logs                             | media/alto           | auditoría de metadatos y búsquedas automatizadas                                              |
| R-006 | Reglas futuras inventadas               | alta/alto            | preguntas abiertas y ADR 0011                                                                 |
| R-007 | Auth y PostgreSQL divergen              | media/alto           | reserva, lease, idempotencia, reconciliación y ADR 0012                                       |
| R-008 | Carrera elimina último administrador    | baja/crítico         | lock común, conteo transaccional, pgTAP y E2E concurrente                                     |
| R-009 | Invitaciones abusivas/replay            | media/alto           | signup off, permisos/policies, TTL, fingerprint e índices                                     |
| R-010 | Cuenta bloqueada conserva JWT           | media/alto           | estado en RLS/RPC y limpieza de caché; evaluar revocación global                              |
| R-011 | Configuración local llega a producción  | baja/crítico         | allowlist/secrets por entorno y gateway JWT productivo                                        |
| R-012 | PII del padrón se exporta indebidamente | media/crítico        | permisos exclusivos, RPC proyectada, auditoría, MFA futuro                                    |
| R-013 | Excel no confiable agota o altera datos | media/alto           | 5 MiB/1.000 filas, ZIP estricto, límites reales/ratio/dimensiones, una hoja y archivo efímero |
| R-014 | Históricos se duplican o fusionan mal   | media/alto           | advertencia confirmable, sin unique/merge y lock transaccional                                |
