# Registro de agentes

| Agente                       | Propósito                            | Modo         | Uso en bootstrap               |
| ---------------------------- | ------------------------------------ | ------------ | ------------------------------ |
| `architect`                  | límites, acoplamiento, dependencias  | solo lectura | planificación y revisión final |
| `domain_modeler`             | lenguaje, reglas y ambigüedades      | solo lectura | modelo/context map             |
| `database_security_reviewer` | SQL, RLS, grants y PII               | solo lectura | diseño y revisión final        |
| `qa_reviewer`                | criterios, pruebas y gates           | solo lectura | revisión final                 |
| `docs_governor`              | coherencia documental y trazabilidad | solo lectura | revisión final                 |

El agente principal es el único escritor e integra hallazgos. Los agentes no reciben secretos ni información personal y sus conclusiones requieren evidencia y revisión humana.
