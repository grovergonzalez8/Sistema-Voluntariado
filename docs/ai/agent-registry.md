# Registro de agentes

| Agente                       | Propósito                            | Modo         | Uso en 0001 y 0002                         |
| ---------------------------- | ------------------------------------ | ------------ | ------------------------------------------ |
| `architect`                  | límites, acoplamiento, dependencias  | solo lectura | planificación y revisión final             |
| `domain_modeler`             | lenguaje, reglas y ambigüedades      | solo lectura | estados, transiciones y autoridad          |
| `database_security_reviewer` | SQL, RLS, grants y PII               | solo lectura | diseño y revisión de migración/pgTAP       |
| `qa_reviewer`                | criterios, pruebas y gates           | solo lectura | línea base, cobertura y revisión final     |
| `docs_governor`              | coherencia documental y trazabilidad | solo lectura | revisión final de comandos, diagramas y IA |

El agente principal es el único escritor e integra hallazgos. Los agentes no reciben secretos ni información personal y sus conclusiones requieren evidencia y revisión humana.
