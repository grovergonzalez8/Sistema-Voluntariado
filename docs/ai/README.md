# Gobernanza de inteligencia artificial

La asistencia de IA acelera análisis, código, pruebas y documentación, pero no reemplaza aprobación humana ni responsabilidad del propietario.

## Superficies

- `AGENTS.md`: instrucciones persistentes por repositorio o subárbol.
- `.codex/agents/*.toml`: revisores especializados de solo lectura.
- `.agents/skills/*`: flujos reutilizables y enfocados.
- `prompts/`: instrucciones operativas concretas, sin secretos ni datos reales.
- `docs/adr/`: decisiones arquitectónicas durables; un prompt no sustituye un ADR.

Todo cambio asistido requiere revisar diff, ejecutar verificaciones y atribuir el resultado. No se registran tokens, claves, datos personales, salida sensible ni prompts con esa información.
