# ExecPlan 0001: Fundación técnica de Sistema-Voluntariado

- Estado: en ejecución
- Inicio: 2026-07-23
- Responsable: agente principal de Codex, con revisión humana obligatoria
- Rama autorizada: `chore/bootstrap-solid-foundation`

## Objetivo

Construir una base reproducible, segura y mantenible para Sistema-Voluntariado y demostrarla con un único recorrido vertical: una persona autenticada consulta y actualiza los campos permitidos de su propio perfil. El resultado debe integrar frontend, casos de uso, adaptador Supabase, PostgreSQL con RLS, pruebas, documentación y controles de calidad sin implementar módulos futuros.

## Estado inicial verificado

- Repositorio Git ubicado en `C:\Users\grove\Desktop\PROYECTOS\Sistema-VOLUNTARIADO`.
- Repositorio iniciado vacío: el único elemento era `.git`; no existían archivos de producto, dependencias, commits, remoto ni `AGENTS.md` aplicable.
- Rama actual y permitida: `chore/bootstrap-solid-foundation`.
- Árbol de trabajo limpio y sin commits.
- Node.js `22.18.0`, pnpm `11.9.0`, npm `11.5.2`, Corepack `0.33.0`, Git `2.51.0`, Docker `29.6.2`, Docker Compose `5.3.1` y `psql` `17.6` disponibles.
- Supabase CLI no estaba instalado globalmente; deberá ser dependencia de desarrollo local.
- No se configurará remoto, identidad Git global ni software global.

## Alcance

1. Gobernanza raíz, instrucciones por subárbol y trazabilidad de IA.
2. Workspace pnpm con Turborepo, TypeScript estricto, ESLint, Prettier y límites arquitectónicos automáticos.
3. Aplicación React/Vite accesible, responsive e internacionalizada en español, preparada para inglés.
4. Módulos `identity` y `volunteer-profile` con Clean Architecture y API pública explícita.
5. Supabase local para Auth, autorización por permisos, perfiles y auditoría inicial.
6. Esquema mínimo: `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions` y `audit_logs`.
7. RLS de denegación por defecto, permisos concretos, lectura propia y actualización limitada del perfil propio.
8. Pruebas unitarias, de componentes, integración, SQL/RLS y un E2E mínimo.
9. CI reproducible sin despliegue y documentación operativa/arquitectónica coherente.

## Fuera de alcance

- Casas, habitaciones, familias anfitrionas, tarifas, reservas, proyectos, asignaciones, actividades, reuniones, tareas, notificaciones, incidencias, cargos y pagos.
- Portal administrativo completo, Storage con archivos, modo offline, microservicios y patrones distribuidos.
- Conexión o migración contra Supabase remoto, datos personales reales, usuarios reales y secretos.
- Despliegue, remoto Git, push, licencia definitiva o configuración global del sistema.

## Inventario de decisiones técnicas

| Área          | Decisión                                            | Razón verificable                                                          |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Runtime       | Node.js `22.18.0` y `engines.node` exacto           | Entorno confirmado; no se cambiará a Node 20.                              |
| Gestor        | pnpm `11.9.0` fijado en `packageManager`            | Instalación única y lockfile reproducible.                                 |
| Orquestación  | pnpm workspaces + Turborepo                         | Ejecutar tareas; ninguna regla de dominio en Turbo.                        |
| Frontend      | React, Vite y TypeScript estricto                   | SPA tipada, simple y compatible con despliegue estático futuro.            |
| Arquitectura  | Monolito modular con Clean Architecture por módulo  | Límites claros sin costo operacional de microservicios.                    |
| Datos/Auth    | Supabase local/PostgreSQL/Auth                      | RLS y autenticación integradas; sin enlace remoto.                         |
| Autorización  | RBAC basado en permisos concretos                   | Una persona puede tener varios roles; el código no compara nombres de rol. |
| Seguridad     | RLS como defensa principal, denegar por defecto     | Evita confiar solamente en controles del navegador.                        |
| Idioma        | `react-i18next`, español inicial e inglés preparado | Requisito inmediato del producto.                                          |
| Validación    | Zod + React Hook Form                               | Un esquema tipado compartido en el límite de presentación.                 |
| Datos cliente | TanStack Query                                      | Estados, mutaciones y caché del perfil aislada por actor.                  |
| Pruebas       | Vitest, Testing Library, MSW, Playwright y pgTAP    | Cubrir capas aisladas, integración, navegador y RLS real.                  |
| Imports       | ESLint con reglas de límites y exports públicos     | Impedir dependencias hacia dentro o entre módulos.                         |
| Licencia      | Sin licencia hasta decisión del propietario         | No inventar una decisión legal.                                            |

## Dependencias propuestas y uso inmediato

### Producción

- `react`, `react-dom`: interfaz y renderizado.
- `react-router-dom`: acceso público, shell protegido y `/app/profile`.
- `@tanstack/react-query`: carga y mutación del perfil.
- `react-hook-form`, `@hookform/resolvers`, `zod`: formulario y validación.
- `i18next`, `react-i18next`: español inicial y catálogo inglés.
- `@supabase/supabase-js`: adaptadores de Auth y perfiles, únicamente en infraestructura/composición.

### Desarrollo

- `typescript`, `vite`, `@vitejs/plugin-react`: compilación y build.
- `turbo`: orquestación del workspace.
- `eslint`, `@eslint/js`, `typescript-eslint`, plugins de React y `eslint-plugin-boundaries`: calidad y límites.
- `prettier`: formato reproducible.
- `vitest`, `jsdom`, Testing Library y `msw`: pruebas unitarias, componentes e integración.
- `@playwright/test`: E2E mínimo.
- `supabase`: CLI local para el entorno y pruebas PostgreSQL/RLS.

No se añadirán paquetes de estado global, UI completa, ORM, generación de clientes, servidor Node, CSS framework ni utilidades sin un uso inmediato.

## Estructura objetivo exacta

```text
.
├── apps/web/                 # SPA React/Vite y sus pruebas
├── packages/
│   ├── shared-kernel/        # errores/resultado compartidos realmente usados
│   ├── ui/                   # componentes accesibles reutilizados por web
│   ├── eslint-config/        # configuración ESLint compartida
│   └── typescript-config/    # configuraciones TS compartidas
├── supabase/                 # configuración, migraciones, seed y pgTAP
├── docs/                     # producto, arquitectura, datos, seguridad y gobierno
├── .agents/skills/           # skills pequeñas del repositorio
├── .codex/agents/            # revisores Codex de solo lectura
└── .github/                  # CI, ownership de ejemplo y plantillas
```

Solo se crearán directorios que contengan archivos útiles. Los módulos de código iniciales serán `identity` y `volunteer-profile`; los restantes existirán exclusivamente en documentación futura.

## Riesgos y mitigaciones

| Riesgo                                         | Mitigación                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Política RLS permite acceso horizontal         | Pruebas pgTAP con dos identidades y revisión independiente de seguridad.           |
| Columnas no editables cambian desde el cliente | Trigger de guarda + privilegios de columna + caso negativo SQL.                    |
| `security definer` escala privilegios          | `search_path` fijo, argumentos validados, funciones mínimas y permisos explícitos. |
| Acoplamiento React/Supabase con dominio        | Puertos de aplicación, adaptadores de infraestructura y composición única.         |
| Dependencias innecesarias                      | Cada paquete debe tener import o script ejecutado en esta entrega.                 |
| Docker no iniciado                             | Comprobar estado; reportar bloqueo sin cambiar su configuración.                   |
| E2E depende del entorno local                  | Separar E2E mínimo de UI y pruebas RLS reales; documentar prerrequisitos exactos.  |
| Identidad Git ausente                          | Continuar, no inventar identidad y dejar secuencia de commits recomendada.         |
| Documentación diverge                          | Revisión `docs_governor`, comprobación de comandos y actualización final del plan. |

## Fases y validaciones

1. **Planificación**: inventario, alcance, decisiones, riesgos y criterios en este ExecPlan. Validar contenido y estado Git.
2. **Gobernanza mínima**: crear archivos raíz y `AGENTS.md` anidados. Validar coherencia y formato básico.
3. **Workspace**: manifests, paquetes usados, herramientas y lockfile. Ejecutar instalación reproducible, formato, lint y typecheck aplicables.
4. **Supabase local**: CLI local, config, migración, seed y pruebas. Comprobar Docker y ejecutar `db:start`, reset y pgTAP cuando esté disponible.
5. **Arquitectura/documentación**: context map, modelo, seguridad, ADRs, riesgos, deuda y preguntas. Revisar contra implementación planificada.
6. **Vertical slice**: Auth, perfil propio y UI. Ejecutar unitarias, componentes, integración, E2E y build incrementalmente.
7. **Automatización/gobierno final**: CI, agentes, skills y trazabilidad. Validar skills y comandos documentados.
8. **Cierre**: `pnpm verify`, SQL/RLS, E2E, revisión de diff, secretos y patrones prohibidos; revisiones especializadas; correcciones; resultado final y commits si Git lo permite.

## Criterios de aceptación

- Un clon limpio puede instalarse con pnpm bajo Node `22.18.0` y lockfile congelado.
- La aplicación inicia y construye; la configuración ausente falla con mensaje claro.
- Supabase local inicia sin enlace remoto y contiene roles/permisos iniciales.
- Una persona autenticada lee y modifica solamente campos permitidos de su perfil.
- RLS impide leer o modificar perfiles ajenos y se verifica contra PostgreSQL local, no mediante mocks.
- Dominio/aplicación no dependen de React, navegador, SQL o Supabase; los imports inválidos fallan en lint.
- TypeScript estricto, formato, lint, unitarias, integración y build pasan realmente.
- E2E mínimo y pruebas de base se ejecutan o se documenta con precisión el bloqueo ambiental.
- No hay secretos, `service_role` en frontend, `any`, `@ts-ignore` ni desactivaciones de lint para ocultar problemas.
- Documentación, CI, scripts, agentes, skills y registro de IA coinciden con lo implementado.

## Registro de progreso

| Fecha      | Fase               | Estado     | Evidencia                                                                                                                                     |
| ---------- | ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-23 | Inspección inicial | completada | Repositorio vacío, rama y herramientas verificadas con comandos de solo lectura.                                                              |
| 2026-07-23 | Planificación      | completada | ExecPlan creado antes de componentes, migraciones o instalaciones; revisado por `architect`, `domain_modeler` y `database_security_reviewer`. |
| 2026-07-23 | Gobernanza mínima  | completada | Nueve archivos raíz y dos `AGENTS.md` específicos creados; `git diff --check` sin errores.                                                    |
| 2026-07-23 | Workspace          | completada | pnpm `11.9.0` ejecutado mediante Corepack con Node `22.18.0`; lockfile, Supabase CLI local, formato, lint, límites y typecheck verificados.   |
| 2026-07-23 | Supabase local     | completada | CLI/config, migración, seed, reset, linter SQL y 27 pruebas pgTAP reales completados localmente.                                              |
| 2026-07-23 | Arquitectura/docs  | completada | Context map, límites, modelo, roles/permisos, amenazas, riesgos, deuda, despliegue y once ADRs documentados antes del vertical slice.         |
| 2026-07-24 | Vertical slice     | completada | Acceso, sesión, perfil propio, RLS, UI e i18n implementados; unitarias, integración, E2E autenticado y build ejecutados.                      |
| 2026-07-24 | Gobierno/CI        | en curso   | Agentes, skills, trazabilidad IA, plantillas y workflow añadidos; hallazgos finales corregidos y nueva validación en curso.                   |

## Descubrimientos

- pnpm está disponible mediante el runtime local de Codex; el proyecto fijará la versión para no depender de resolución implícita.
- El repositorio comenzó completamente vacío, por lo que no existe implementación previa que preservar.
- La configuración actual de Java es inconsistente, pero Java está fuera del stack y no se tocará.
- El formato vigente de agentes Codex usa archivos TOML independientes en `.codex/agents/` con `name`, `description`, `developer_instructions` y `sandbox_mode = "read-only"`; el proyecto seguirá ese esquema.
- La primera descarga de Supabase dejó un proceso hijo de `supabase start` después de interrumpir la shell; se identificaron y terminaron solo esos procesos y `supabase stop` respaldó datos locales antes de retirar los contenedores.
- Una prueba pgTAP basada en el primer registro histórico fallaba al repetirla; ahora marca el instante basal de la transacción y se verifica dos veces consecutivas.
- Al retirar dependencias duplicadas de la raíz se hizo explícito que los matchers DOM dependían de una resolución transitiva no declarada; las pruebas usan aserciones estándar y se eliminó el paquete innecesario.

## Decisiones durante la implementación

- 2026-07-23: conservar exactamente Node `22.18.0` y pnpm `11.9.0` por decisión del propietario.
- 2026-07-23: mantener a los agentes especializados en solo lectura; el agente principal será el único escritor.
- 2026-07-23: usar dos módulos reales (`identity` y `volunteer-profile`) y documentar los demás para evitar arquitectura vacía.
- 2026-07-23: modelar `profiles` como perfil universal mínimo con `display_name` y `preferred_locale`; no duplicar correo ni credenciales de Auth.
- 2026-07-23: considerar el slice autorizado solo para cuentas autenticadas y provisionadas; una cuenta sin rol/permisos permanece denegada.
- 2026-07-23: combinar RLS de fila, privilegios de columna y una guarda de campos; RLS por sí sola no limita columnas.
- 2026-07-23: consultar permisos RBAC en tablas actuales mediante `auth.uid()`; no usar roles enviados por cliente ni claims JWT como autoridad inicial.
- 2026-07-23: no exponer `volunteer.read_basic_others` sobre la tabla completa; una futura vista/RPC proyectará únicamente campos aprobados.
- 2026-07-23: fijar TypeScript `5.9.3` porque `typescript-eslint 8.65.0` requiere TypeScript menor que 6.1; no adoptar TypeScript 7 todavía.
- 2026-07-23: ejecutar pnpm mediante Corepack para asegurar Node `22.18.0`; el shim de pnpm del runtime de Codex usaba Node 24 internamente.
- 2026-07-23: usar `allowBuilds.msw = true` de pnpm 11; no se autorizaron scripts de instalación indiscriminadamente.
- 2026-07-24: habilitar el proveedor de correo local pero mantener el alta global desactivada; la CLI 2.109.1 deshabilita también el login si `[auth.email].enable_signup` es falso.
- 2026-07-24: usar code splitting explícito para React y Supabase; el build final queda bajo el umbral de advertencia sin ocultarlo.
- 2026-07-24: incluir `user.id` en la clave de caché del perfil y eliminar la consulta del actor anterior al cambiar o cerrar sesión.
- 2026-07-24: generalizar límites entre módulos mediante capturas y prohibir imports de frameworks, Supabase y globals del navegador desde dominio/aplicación.
- 2026-07-24: colocar descriptores específicos antes del fallback `entry` y ejecutar cuatro probes negativos en `pnpm verify` para evitar un lint arquitectónico vacío.
- 2026-07-24: una cuenta archivada no conserva permisos efectivos; `has_permission` exige un perfil activo y pgTAP cubre el caso.
- 2026-07-24: usar UUID para auditoría, registrar cambios de archivado y enumerar cada permiso del administrador en el seed.
- 2026-07-24: conservar `updated_at` en tablas de referencia mutables; relaciones de concesión usan `granted_at` y auditoría append-only usa `created_at`.
- 2026-07-24: retirar dependencias duplicadas de la raíz; cada herramienta queda en el paquete que la ejecuta y Playwright se invoca con filtro de workspace.

## Resultado final

Pendiente. Se completará con archivos, comandos, validaciones reales, bloqueos, revisiones y commits al cerrar la ejecución.
