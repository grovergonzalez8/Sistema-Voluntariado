# Prompt 0001: Bootstrap de la fundación

- Fecha: 2026-07-23
- Objetivo: construir una base técnica segura, mantenible y verificable y demostrarla con un único vertical slice de perfil propio.
- Herramienta: Codex.
- Resultado: completado; resultado y validaciones en `docs/exec-plans/0001-project-foundation.md`.
- Commits: `5dc9178`, `fdb12db`, `bd66d9d`, `0191b69`, `7375c50`, `4d9aec9` y el cierre documental que contiene este registro.
- Decisiones: Node `22.18.0`, pnpm `11.9.0`, monolito modular, Clean Architecture por módulo, Supabase/PostgreSQL local, RBAC por permisos y RLS.
- Revisión humana: obligatoria.

El siguiente contenido conserva el prompt maestro proporcionado por el propietario. No contiene secretos ni información personal real.

---

Actúa como arquitecto principal de software, ingeniero full-stack senior, especialista en PostgreSQL/Supabase, seguridad de aplicaciones y gobernanza de repositorios.

Tu misión es construir la base técnica sólida y verificable del proyecto “Sistema-Voluntariado”.

No intentes implementar todos los CRUD ni toda la aplicación en esta tarea. Debes establecer una arquitectura mantenible, documentada, segura y comprobable, y demostrarla mediante una única funcionalidad vertical completa.

## 1. Contexto del producto

La organización recibe voluntarios nacionales y extranjeros.

Todos los voluntarios, coordinadores, encargados y administradores utilizarán el sistema mediante cuentas personales.

El sistema administrará progresivamente:

- Voluntarios.
- Grupos de voluntarios.
- Casas.
- Habitaciones individuales y compartidas.
- Familias anfitrionas.
- Tarifas de alojamiento.
- Reservas y asignaciones de alojamiento por periodos.
- Proyectos permanentes y temporales.
- Asignaciones de voluntarios a proyectos.
- Actividades de proyectos.
- Reuniones.
- Actividades extras.
- Tareas de casas y proyectos.
- Solicitudes, revisiones y confirmaciones de asignaciones.
- Notificaciones.
- Incidencias.
- Costos y pagos en una fase posterior.
- Auditoría de operaciones sensibles.

Los voluntarios podrán consultar y actualizar únicamente la información permitida de su perfil, alojamiento, proyectos, actividades y tareas.

Las asignaciones solamente podrán ser propuestas, revisadas o confirmadas por coordinadores, encargados y responsables autorizados.

Una persona puede tener varios roles simultáneamente.

Roles iniciales:

- volunteer
- coordinator
- accommodation_manager
- project_manager
- finance
- administrator

La autorización debe basarse en permisos concretos y no únicamente en comparaciones directas de nombres de roles.

Ejemplos:

- volunteer.read_self
- volunteer.update_self
- volunteer.read_basic_others
- accommodation.read_self
- accommodation.propose_assignment
- accommodation.approve_assignment
- accommodation.manage
- project.read_assigned
- project.manage
- project.propose_assignment
- project.approve_assignment
- activity.create
- activity.join
- task.assign
- task.complete
- payment.read_self
- payment.manage
- audit.read

## 2. Restricciones y principios no negociables

Aplica los siguientes principios:

- Arquitectura modular monolítica.
- Clean Architecture dentro de cada módulo.
- Diseño orientado al dominio sin introducir complejidad innecesaria.
- Separación clara entre dominio, aplicación, infraestructura y presentación.
- TypeScript estricto.
- Seguridad por defecto.
- Row Level Security activa en todas las tablas expuestas.
- Denegar acceso por defecto y habilitarlo explícitamente.
- Ninguna clave service_role en el frontend.
- Ningún secreto dentro del repositorio.
- Ningún dato personal sensible en logs.
- No usar microservicios.
- No usar patrones distribuidos que todavía no sean necesarios.
- No agregar abstracciones sin un caso de uso real.
- No crear directorios vacíos solamente para aparentar arquitectura.
- No inventar requisitos de negocio desconocidos.
- Registrar las suposiciones y preguntas pendientes.
- No ejecutar acciones destructivas.
- No reescribir historial Git.
- No hacer force push.
- No desactivar pruebas, lint o reglas de seguridad para obtener un resultado verde.
- No usar any, ts-ignore o eslint-disable sin una justificación localizada y documentada.
- No informar que algo funciona sin haber ejecutado su verificación.
- No ocultar errores o advertencias.
- No almacenar prompts que contengan secretos o información personal.

Cuando exista una ambigüedad no bloqueante, toma la decisión más conservadora y regístrala en un ADR o en `docs/product/open-questions.md`.

Detente solamente cuando falten secretos indispensables, exista riesgo de pérdida de información o una acción destructiva requiera aprobación.

## 3. Estrategia obligatoria de ejecución

Antes de modificar código:

1. Inspecciona el repositorio, el entorno, Git, versiones instaladas y archivos existentes.
2. Conserva cualquier implementación válida que ya exista.
3. Lee todos los archivos AGENTS.md aplicables.
4. Crea un inventario del estado inicial.
5. Usa agentes especializados para análisis independientes.
6. Crea un ExecPlan vivo en `docs/exec-plans/0001-project-foundation.md`.
7. El ExecPlan debe incluir objetivo, estado inicial, alcance, fuera de alcance, decisiones, riesgos, fases, validaciones, registro de progreso, descubrimientos, decisiones tomadas durante la implementación y resultado final.
8. No comiences la implementación hasta que el ExecPlan sea coherente y verificable.
9. Después del plan, implementa las fases sin solicitar confirmación por decisiones no destructivas.
10. Mantén actualizado el ExecPlan mientras trabajas.

## 4. Uso de agentes

Configura y utiliza agentes especializados dentro de `.codex/agents/`.

Crea como mínimo:

### architect

Agente de solo lectura encargado de revisar arquitectura, detectar acoplamientos, evaluar límites de módulos, revisar dependencias, identificar sobreingeniería y proponer simplificaciones.

### domain_modeler

Agente de solo lectura encargado de revisar conceptos del voluntariado, detectar entidades, agregados y reglas, identificar términos ambiguos, revisar el mapa de contextos y verificar que el lenguaje del código coincida con el dominio.

### database_security_reviewer

Agente de solo lectura encargado de revisar migraciones, RLS, funciones SQL y permisos; detectar escalamiento de privilegios y exposición de datos personales; y verificar que service_role no llegue al navegador.

### qa_reviewer

Agente de solo lectura encargado de revisar criterios de aceptación, identificar pruebas faltantes, ejecutar o analizar pruebas, buscar casos límite y revisar tipado, lint y build.

### docs_governor

Agente de solo lectura encargado de comparar documentación con implementación, detectar comandos incorrectos, revisar ADRs, trazabilidad de prompts y decisiones, e identificar documentación desactualizada.

Usa agentes paralelos principalmente para exploración y revisión. El agente principal será el único responsable de integrar y escribir cambios finales, evitando conflictos entre agentes. Espera los resultados de todos los agentes antes de cerrar cada fase relevante.

## 5. Stack técnico

Utiliza versiones estables, compatibles entre sí y sin paquetes prerelease. Registra las versiones exactas instaladas en el lockfile y documenta las decisiones.

Stack objetivo:

- Node.js LTS.
- pnpm mediante Corepack.
- Monorepo con pnpm workspaces.
- Turborepo solamente para orquestar tareas; no debe contener reglas de dominio.
- React.
- TypeScript.
- Vite.
- React Router.
- TanStack Query.
- React Hook Form.
- Zod.
- i18next o react-i18next.
- Supabase JavaScript Client.
- PostgreSQL mediante Supabase.
- Supabase Auth.
- Supabase Storage preparado, pero sin almacenar archivos sensibles todavía.
- Vitest.
- Testing Library.
- MSW para pruebas aisladas cuando corresponda.
- Playwright para una prueba end-to-end mínima.
- ESLint.
- Prettier.
- Reglas automáticas de límites arquitectónicos.
- GitHub Actions.
- Cloudflare como destino futuro del frontend.
- Supabase como backend administrado.

No agregues una biblioteca si no tiene un uso concreto en la base implementada.

## 6. Arquitectura esperada

Crea una estructura equivalente a la siguiente, ajustándola solamente cuando exista una justificación documentada:

```text
.
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── composition/
│       │   │   ├── providers/
│       │   │   ├── router/
│       │   │   └── config/
│       │   ├── modules/
│       │   │   ├── identity/
│       │   │   └── volunteer-profile/
│       │   ├── shared/
│       │   └── main.tsx
│       ├── public/
│       └── tests/
├── packages/
│   ├── shared-kernel/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
├── supabase/
│   ├── migrations/
│   ├── tests/
│   ├── seed.sql
│   └── config.toml
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── adr/
│   ├── data/
│   ├── security/
│   ├── governance/
│   ├── deployment/
│   ├── exec-plans/
│   └── ai/
├── .agents/
│   └── skills/
├── .codex/
│   ├── config.toml
│   └── agents/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── AGENTS.md
├── PLANS.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

No crees módulos vacíos para todas las funcionalidades futuras. Documenta los módulos futuros mediante el mapa de contextos y crea código únicamente cuando exista una funcionalidad implementada.

## 7. Reglas de Clean Architecture

Dentro de cada módulo utiliza, cuando sean necesarias, estas capas: `domain/`, `application/`, `infrastructure/` y `presentation/`.

Reglas obligatorias:

- `domain` no depende de React, Supabase, navegador, SQL ni frameworks.
- `application` depende solamente de dominio y shared-kernel.
- `application` define puertos e interfaces.
- `infrastructure` implementa los puertos.
- Solamente `infrastructure` conoce el SDK de Supabase.
- `presentation` no consulta Supabase directamente.
- Los componentes React no contienen reglas de negocio.
- La composición de implementaciones ocurre en `app/composition`.
- Un módulo solamente expone una API pública explícita.
- No se permiten importaciones hacia archivos internos de otro módulo.
- Las reglas se deben verificar mediante ESLint o una herramienta de análisis de dependencias.
- Las dependencias deben apuntar hacia el dominio y nunca al contrario.

## 8. Funcionalidad vertical demostrativa

Implementa una única funcionalidad vertical completa: “Un usuario autenticado puede consultar y actualizar los campos permitidos de su propio perfil”.

Debe incluir:

- Inicio de sesión básico con Supabase Auth.
- Ruta pública de acceso.
- Shell autenticado.
- Ruta protegida `/app/profile`.
- Obtención del usuario actual.
- Consulta del perfil.
- Actualización de campos editables.
- Validación con Zod.
- Casos de uso de aplicación.
- Puerto de repositorio.
- Adaptador Supabase.
- Manejo tipado de errores.
- Estados de carga, error, vacío y éxito.
- Interfaz responsive.
- Español como idioma inicial.
- Estructura preparada para inglés.
- Accesibilidad básica.
- Pruebas unitarias.
- Pruebas de componentes.
- Prueba de integración.
- Una prueba end-to-end mínima.

No implementes todavía todos los paneles administrativos. Puedes crear una pantalla protegida mínima que demuestre que la navegación cambia según permisos, pero no simules funcionalidades inexistentes.

## 9. Base de datos fundamental

Implementa solamente la base de datos necesaria para autenticación, autorización, perfil y auditoría inicial.

Incluye como mínimo:

- profiles
- roles
- permissions
- user_roles
- role_permissions
- audit_logs

Considera la relación con `auth.users`.

Requisitos:

- UUID.
- created_at y updated_at con timestamptz.
- Restricciones de integridad.
- Índices justificados.
- Soft deletion o archivado cuando corresponda.
- Triggers mínimos y documentados.
- Función segura para verificar permisos.
- RLS activa.
- Políticas que permitan al usuario leer su perfil.
- Políticas que permitan actualizar solamente sus campos autorizados.
- Políticas administrativas basadas en permisos.
- Ninguna política basada en datos enviados por el cliente sin validación.
- Ninguna función security definer sin search_path seguro.
- Pruebas SQL para políticas críticas.
- Seed local con roles y permisos iniciales.
- Usuarios de prueba únicamente para entorno local.

Documenta, pero no implementes todavía como esquema definitivo, las entidades futuras: `volunteer_groups`, `group_members`, `houses`, `rooms`, `host_families`, `accommodation_rates`, `accommodation_assignments`, `projects`, `project_schedules`, `project_assignments`, `events`, `event_participants`, `tasks`, `task_assignments`, `assignment_requests`, `assignment_approvals`, `notifications`, `incidents`, `charges` y `payments`.

Crea un diagrama Mermaid inicial, diccionario de datos, mapa de relaciones, reglas de negocio conocidas, preguntas abiertas, riesgos de concurrencia y estrategia futura para evitar solapamientos y exceder capacidades. No conviertas estas entidades futuras en migraciones definitivas hasta que sus reglas estén maduras.

## 10. Seguridad

Crea y documenta un modelo de amenazas inicial.

Debe incluir:

- Datos personales.
- Datos médicos o de emergencia.
- Documentos de identidad.
- Datos financieros.
- Escalamiento de privilegios.
- Acceso horizontal entre voluntarios.
- Exposición de claves.
- Inyección.
- XSS.
- CSRF cuando aplique.
- Carga insegura de archivos.
- Logs con información sensible.
- Políticas RLS incorrectas.
- Abuso de invitaciones.
- Cuentas finalizadas.
- Recuperación de contraseñas.
- Auditoría.
- Retención y eliminación de información.

Crea `SECURITY.md` con un proceso responsable para reportar vulnerabilidades. No almacenes pasaportes, información médica ni archivos reales durante esta fase.

## 11. Gobernanza del repositorio

Crea:

- `AGENTS.md` raíz, corto y autoritativo.
- `AGENTS.md` específico dentro de `apps/web`.
- `AGENTS.md` específico dentro de `supabase`.
- `PLANS.md` con la definición de ExecPlans.
- `CONTRIBUTING.md`.
- `CODE_OF_CONDUCT.md`.
- `SECURITY.md`.
- `CHANGELOG.md`.
- Convención de commits.
- Estrategia de ramas.
- Definition of Ready.
- Definition of Done.
- Política de dependencias.
- Política de migraciones.
- Política de datos sensibles.
- Matriz de responsabilidades.
- Plantilla de pull request.
- Plantillas de issues.
- Archivo `CODEOWNERS.example`, sin inventar usuarios de GitHub.
- ADRs numerados.
- Registro de deuda técnica.
- Registro de riesgos.

No selecciones una licencia legal definitiva sin aprobación del propietario. Marca el proyecto como privado o sin licencia hasta que esa decisión sea tomada y documenta la decisión pendiente.

## 12. Gobernanza de inteligencia artificial

Crea:

```text
docs/ai/
├── README.md
├── agent-registry.md
├── prompt-policy.md
├── prompt-log.md
├── change-attribution.md
└── prompts/
    └── 0001-bootstrap-foundation.md
```

Requisitos:

- Guarda este prompt maestro completo en `0001-bootstrap-foundation.md`.
- Registra fecha, objetivo, herramienta, resultado, commits y decisiones.
- Nunca registres secretos.
- Nunca registres información personal real.
- Indica qué archivos fueron generados o modificados con asistencia de IA.
- Documenta que todo cambio generado requiere revisión humana.
- Incluye una política de revisión de prompts.
- Incluye un formato para futuros registros.
- Diferencia instrucciones persistentes, skills, prompts operativos y decisiones arquitectónicas.

## 13. Skills del repositorio

Crea skills pequeñas y enfocadas en `.agents/skills/`.

Como mínimo:

### architecture-check

Revisa límites de módulos, dependencias y reglas Clean Architecture.

### database-migration-review

Revisa migraciones PostgreSQL, RLS, índices, funciones y seguridad.

### release-readiness

Ejecuta y resume todas las verificaciones necesarias antes de integrar cambios.

Cada skill debe tener un único propósito, declarar cuándo utilizarse y cuándo no, definir entradas, pasos y salidas, y evitar scripts cuando las instrucciones sean suficientes.

## 14. Calidad y automatización

Configura scripts consistentes:

```text
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm db:start
pnpm db:stop
pnpm db:reset
pnpm db:test
pnpm verify
```

`pnpm verify` debe ejecutar como mínimo formato, lint, límites arquitectónicos, TypeScript, pruebas unitarias, pruebas de integración y build.

Configura GitHub Actions para instalación reproducible mediante lockfile, formato, lint, typecheck, pruebas, build, pruebas de base de datos cuando Docker esté disponible, caché segura de pnpm, cancelación de ejecuciones obsoletas y permisos mínimos del workflow.

No configures despliegue automático a producción todavía.

Documenta el futuro despliegue de frontend en Cloudflare, base/Auth/Storage en Supabase, variables, entornos local/preview/production, migraciones, rollback, backups y rotación de secretos.

## 15. Variables de entorno

Crea `.env.example` con nombres y comentarios, pero sin valores reales.

Como mínimo:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_PROJECT_ID=
```

Requisitos:

- `.env`, `.env.local` y equivalentes deben estar ignorados.
- La clave anon puede usarse en el navegador únicamente con RLS correcta.
- La clave service_role nunca debe tener prefijo VITE.
- No utilices valores ficticios que parezcan secretos reales.
- Valida variables al iniciar la aplicación.
- Falla con un mensaje claro cuando falte configuración.

## 16. Documentación arquitectónica

Crea como mínimo:

- `docs/product/vision.md`
- `docs/product/personas.md`
- `docs/product/user-journey.md`
- `docs/product/roles-and-permissions.md`
- `docs/product/open-questions.md`
- `docs/architecture/overview.md`
- `docs/architecture/context-map.md`
- `docs/architecture/module-boundaries.md`
- `docs/architecture/dependency-rules.md`
- `docs/architecture/runtime-view.md`
- `docs/data/initial-model.md`
- `docs/data/data-dictionary.md`
- `docs/security/threat-model.md`
- `docs/governance/definition-of-done.md`
- `docs/governance/branching-and-releases.md`
- `docs/governance/dependency-policy.md`
- `docs/deployment/local-development.md`
- `docs/deployment/cloudflare-supabase.md`

Utiliza diagramas Mermaid cuando ayuden a explicar contexto, contenedores, componentes, dependencias, flujo de autenticación, flujo futuro de aprobación de asignaciones y modelo de datos inicial.

La documentación debe describir la implementación real y no una arquitectura imaginaria.

## 17. ADRs iniciales

Crea ADRs para justificar al menos:

- Modular monolith en lugar de microservicios.
- React, Vite y TypeScript.
- Supabase y PostgreSQL.
- Clean Architecture por módulo.
- RBAC basado en permisos.
- Row Level Security como defensa principal del acceso a datos.
- pnpm workspaces y Turborepo.
- Internacionalización desde el inicio.
- No implementar modo offline todavía.
- No definir aún una licencia definitiva.
- No crear todavía el esquema completo de todos los módulos.

Cada ADR debe contener estado, contexto, decisión, alternativas consideradas, consecuencias, riesgos y fecha.

## 18. Commits

Cuando Git esté disponible y sea seguro:

1. Trabaja únicamente en la rama actual.
2. Realiza commits pequeños y coherentes.
3. Usa Conventional Commits.
4. No mezcles infraestructura, funcionalidad y documentación sin necesidad.
5. No hagas push.
6. No modifiques configuración remota.

Secuencia sugerida:

- chore: initialize workspace and tooling
- docs: add architecture and governance foundation
- feat(auth): add identity and permission foundation
- feat(profile): add self-service profile vertical slice
- test: add database and application verification
- ci: add repository quality gates
- docs: finalize bootstrap records and runbooks

## 19. Validaciones obligatorias

Antes de finalizar:

- Instala dependencias.
- Verifica el lockfile.
- Ejecuta formato.
- Ejecuta lint.
- Ejecuta reglas arquitectónicas.
- Ejecuta TypeScript.
- Ejecuta pruebas unitarias.
- Ejecuta pruebas de integración.
- Ejecuta pruebas SQL/RLS.
- Ejecuta la prueba end-to-end.
- Ejecuta build de producción.
- Revisa el diff completo.
- Busca secretos.
- Busca TODO, FIXME, any, ts-ignore y eslint-disable.
- Comprueba que README puede seguirse desde un clon limpio.
- Comprueba que todos los comandos documentados existen.
- Solicita una revisión final a architect.
- Solicita una revisión final a database_security_reviewer.
- Solicita una revisión final a qa_reviewer.
- Solicita una revisión final a docs_governor.
- Corrige los hallazgos importantes.
- Repite `pnpm verify`.

No marques una validación como aprobada cuando no haya sido ejecutada.

Cuando una validación no pueda ejecutarse por limitaciones reales del entorno, indica exactamente cuál, explica por qué, proporciona el comando exacto para ejecutarla y no la presentes como exitosa.

## 20. Criterios de aceptación

El trabajo se considera terminado solamente cuando:

- El proyecto se instala desde cero con instrucciones claras.
- La aplicación inicia localmente.
- Supabase local puede inicializarse.
- Existe autenticación básica.
- Un usuario puede consultar su perfil.
- Un usuario puede modificar solamente los campos permitidos de su perfil.
- RLS bloquea acceso horizontal a perfiles ajenos.
- Los roles y permisos están sembrados localmente.
- La arquitectura impide imports inválidos.
- El código compila en modo estricto.
- Las pruebas relevantes pasan.
- El build pasa.
- La CI refleja los mismos comandos locales.
- No existen secretos.
- No existen claves service_role en frontend.
- La documentación coincide con la implementación.
- Existe trazabilidad de decisiones, agentes y prompts.
- Las funcionalidades todavía no implementadas están claramente marcadas como futuras.
- No existen implementaciones falsas ni pantallas que aparenten funcionar.
- El ExecPlan contiene el resultado y estado final.

## 21. Informe final

Al terminar, responde con:

1. Resumen ejecutivo.
2. Árbol principal del repositorio.
3. Arquitectura implementada.
4. Funcionalidad vertical implementada.
5. Modelo de seguridad.
6. Archivos de gobernanza creados.
7. Agentes y skills creados.
8. ADRs creados.
9. Comandos ejecutados.
10. Resultado real de cada validación.
11. Commits realizados.
12. Riesgos pendientes.
13. Preguntas de negocio pendientes.
14. Próxima funcionalidad recomendada.
15. Instrucciones exactas para ejecutar el proyecto localmente.

Comienza inspeccionando el repositorio y creando el ExecPlan. No empieces escribiendo componentes o migraciones antes de completar esa inspección.
