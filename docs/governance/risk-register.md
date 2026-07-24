# Registro de riesgos

| ID    | Riesgo                              | Probabilidad/impacto | Mitigación                                       |
| ----- | ----------------------------------- | -------------------- | ------------------------------------------------ |
| R-001 | RLS expone perfil ajeno             | media/crítico        | pgTAP con dos actores y revisión DB              |
| R-002 | Grants permiten columnas protegidas | media/alto           | update por columna y caso negativo               |
| R-003 | Documento difiere de scripts        | media/medio          | docs governor y prueba de comandos               |
| R-004 | Dependencia comprometida            | baja/alto            | lockfile, allowBuilds y actualizaciones pequeñas |
| R-005 | PII en logs                         | media/alto           | auditoría de metadatos y búsquedas automatizadas |
| R-006 | Reglas futuras inventadas           | alta/alto            | preguntas abiertas y ADR 0011                    |
