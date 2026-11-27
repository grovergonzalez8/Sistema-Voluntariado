# ExecPlan 0020 — Validación de Quality en runner hospedado

## Objetivo y alcance

Validar la estabilización con el workflow Quality, su Supabase CLI y sus pruebas existentes en un runner hospedado desechable. La rama de validación reconstruye los siete cambios con documentación publicable y metadatos de correo no personal. No cambia código funcional, permisos, SQL ni `main`.

## Decisión de aislamiento

Antes del arranque se instala una barrera de entrada IPv4/IPv6 en la VM efímera y se crea la red bridge del proyecto con publicación predeterminada en `127.0.0.1`. Una sonda Docker sin datos ensaya el mismo tipo de asignación que usa Supabase CLI. La ejecución se detiene si la red o la publicación efectiva no coinciden. La barrera bloquea conexiones TCP nuevas a direcciones del runner desde interfaces ajenas a loopback antes del DNAT de Docker.

El primer arranque de Supabase usa el seed deshabilitado. Se inspeccionan las publicaciones de todos los contenedores del proyecto antes del reset que carga datos sintéticos, y después de cada reset. Se mantiene Mailpit y el orquestador real. Los resultados del arranque parcial simulado y en Docker aislado conservan su alcance histórico.

## Validación y cierre

- Comparar cada commit reconstruido con su equivalente local para comprobar que los cambios de contenido se limitan a Markdown.
- Probar el verificador de bindings con casos IPv4, IPv6, comodines, puertos ausentes o inesperados y contenedores fuera de la red.
- Publicar solo la rama sanitizada cuando las precondiciones estén verificadas. Registrar el SHA de rama y el SHA evaluado por Quality.
- Confirmar gates y teardown normal. La reproducción dirigida de un arranque parcial real queda fuera de esta ejecución.
