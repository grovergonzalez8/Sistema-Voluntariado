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

`identity` conserva estas responsabilidades porque sesión, cuenta, onboarding y autoridad comparten invariantes y lenguaje; no se creó un módulo administrativo artificial. Sus adaptadores Supabase viven en `identity/infrastructure`; la Edge Function tiene un handler puro con dependencias inyectadas y un entrypoint aislado.

`volunteer-profile/application` no depende de `identity`; recibe el usuario actual mediante un puerto. `app/router` usa guards de sesión, estado y permiso para UX, pero las RPC/RLS vuelven a autorizar. El cambio de identidad o `authority_version` limpia cachés sensibles.

`volunteers` posee el agregado `RegisteredVolunteer`, sus consultas paginadas y los casos de uso de alta, edición e importación/exportación. Su capa de aplicación recibe autorización mediante un puerto propio y no importa `identity`; composición adapta el contexto de cuenta. Excel se representa como bytes y filas en un puerto, de modo que dominio y aplicación no conocen `File`, navegador ni la biblioteca XLSX. El padrón no depende de `volunteer-profile`, Auth ni `accounts`.

`projects` posee `Project`, `ProjectVolunteerAssignment` y `ProjectManagerAssignment`. Dominio y aplicación representan voluntarios y cuentas manager mediante IDs/read models mínimos; infraestructura resuelve las FK y proyecciones. El módulo no importa internos de `volunteers` ni `identity`. Composición adapta capacidades globales/contextuales mediante APIs públicas; PostgreSQL conserva la autorización definitiva. El router compone la página de historial de proyectos bajo la ruta administrativa del voluntario.

## Evolución

No existen directorios de código para alojamiento, grupos, actividades, tareas, finanzas o incidencias. Cada contexto futuro requiere reglas, recorrido vertical y ExecPlan propios. El scope explícito de project manager no constituye un framework reutilizable; coordinator, organización/región, capacidad, calendario, aprobación, actividades o portal del voluntario requieren reglas nuevas.
