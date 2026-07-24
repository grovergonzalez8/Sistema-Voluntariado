# Límites de módulos

| Origen            | Puede depender de                                                          |
| ----------------- | -------------------------------------------------------------------------- |
| `domain`          | dominio del mismo módulo y primitivas mínimas de shared-kernel             |
| `application`     | dominio del mismo módulo y shared-kernel                                   |
| `infrastructure`  | aplicación/dominio del mismo módulo, infraestructura compartida y Supabase |
| `presentation`    | aplicación/dominio del mismo módulo, React, UI, Query, formularios e i18n  |
| `app/composition` | APIs públicas de módulos e infraestructura compartida                      |
| `app/router`      | APIs públicas de presentación                                              |

Un módulo exporta una API explícita desde `index.ts`. Ningún consumidor importa internos de otro módulo. Los paquetes compartidos nunca importan desde `apps/web`.

`volunteer-profile/application` no depende de `identity`; recibe el usuario actual mediante un puerto. Navegación por permiso es UX, no control de seguridad.

## Evolución

No existen directorios de código para alojamiento, proyectos, grupos, actividades, tareas, finanzas o incidencias. Cada contexto futuro requiere reglas, recorrido vertical y ExecPlan propios.
