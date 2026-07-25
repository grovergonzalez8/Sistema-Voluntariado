Actúa como arquitecto principal de software, ingeniero full-stack senior, especialista en PostgreSQL, Supabase Auth, Supabase Edge Functions, seguridad de aplicaciones, Clean Architecture y pruebas automatizadas.

Estás trabajando en el segundo hito del proyecto “Sistema-Voluntariado”.

Tu misión es implementar una base segura, mantenible y verificable para:

- Invitaciones de nuevos usuarios.
- Aceptación de invitaciones.
- Activación y finalización del perfil.
- Ciclo de vida de cuentas.
- Administración de roles.
- Administración de permisos delegados.
- Suspensión de cuentas.
- Archivado de cuentas.
- Reactivación de cuentas.
- Auditoría de todas las operaciones sensibles.

No implementes todavía:

- Casas.
- Habitaciones.
- Familias anfitrionas.
- Reservas de alojamiento.
- Proyectos.
- Asignaciones de proyectos.
- Actividades.
- Reuniones.
- Tareas operativas.
- Incidencias.
- Costos.
- Pagos.
- Documentos personales.
- Información médica.
- WhatsApp.
- Aplicación móvil nativa.

==================================================

1. CONFIRMACIÓN OBLIGATORIA DEL ENTORNO
   \==================================================

Antes de modificar cualquier archivo:

1. Confirma que el directorio de trabajo sea exactamente:

   C:\Users\grove\Desktop\PROYECTOS\Sistema-VOLUNTARIADO

2. Confirma que la rama actual sea exactamente:

   feat/account-lifecycle

3. Confirma que el árbol de trabajo esté limpio.

4. Confirma el commit base de la rama con relación a main.

5. Confirma que existe el remoto origin, pero no hagas push.

6. No continúes si la rama actual es main.

7. No cambies a otra rama durante la implementación.

8. No hagas:

   - git push
   - git rebase
   - git reset --hard
   - git clean -fd
   - git commit --amend
   - force push
   - modificación de commits anteriores
   - despliegues
   - creación de tags
   - cambios en configuración remota
   - vinculación con un proyecto remoto de Supabase

9. No modifiques archivos durante esta comprobación inicial.

Después de confirmar estas condiciones, continúa autónomamente.

================================================== 2. LECTURA OBLIGATORIA DEL REPOSITORIO
==================================================

Antes de diseñar o implementar:

1. Lee todos los archivos AGENTS.md aplicables, incluyendo:

   - AGENTS.md
   - apps/web/AGENTS.md
   - supabase/AGENTS.md
   - cualquier AGENTS.md adicional encontrado

2. Lee:

   - PLANS.md
   - README.md
   - CONTRIBUTING.md
   - SECURITY.md
   - CODE_OF_CONDUCT.md
   - CHANGELOG.md

3. Lee todos los ADRs existentes en:

   docs/adr/

4. Lee como mínimo:

   - docs/exec-plans/0001-project-foundation.md
   - docs/architecture/overview.md
   - docs/architecture/context-map.md
   - docs/architecture/module-boundaries.md
   - docs/architecture/dependency-rules.md
   - docs/architecture/runtime-view.md
   - docs/product/vision.md
   - docs/product/personas.md
   - docs/product/user-journey.md
   - docs/product/roles-and-permissions.md
   - docs/product/open-questions.md
   - docs/data/initial-model.md
   - docs/data/data-dictionary.md
   - docs/security/threat-model.md
   - docs/deployment/local-development.md
   - docs/governance/definition-of-done.md
   - docs/governance/branching-and-releases.md
   - docs/governance/dependency-policy.md
   - docs/ai/README.md
   - docs/ai/agent-registry.md
   - docs/ai/prompt-policy.md
   - docs/ai/prompt-log.md
   - docs/ai/change-attribution.md

5. Inspecciona la implementación real de:

   - apps/web/src/app
   - apps/web/src/modules/identity
   - apps/web/src/modules/volunteer-profile
   - apps/web/src/shared
   - packages/shared-kernel
   - packages/ui
   - packages/eslint-config
   - packages/typescript-config
   - supabase/migrations
   - supabase/tests
   - supabase/seed.sql
   - scripts
   - .github/workflows
   - .codex/agents
   - .agents/skills

6. Identifica:

   - Cómo se crea el cliente Supabase.
   - Cómo se gestiona la sesión.
   - Cómo se limpian las consultas de TanStack Query.
   - Cómo se protegen rutas.
   - Cómo se obtienen permisos.
   - Cómo se compone la infraestructura.
   - Cómo están estructurados los casos de uso.
   - Cómo funcionan las migraciones.
   - Cómo se prueban las políticas RLS.
   - Cómo funciona audit_logs.
   - Cómo se ejecutan las pruebas E2E.
   - Qué scripts raíz existen realmente.

No describas una arquitectura imaginaria. Todas las decisiones deben basarse en la implementación real.

================================================== 3. LÍNEA BASE OBLIGATORIA
==================================================

Antes de modificar código, ejecuta la línea base existente.

Como mínimo:

- node --version
- pnpm --version
- git status
- pnpm install --frozen-lockfile
- pnpm verify
- pnpm db:start
- pnpm db:reset
- pnpm exec supabase db lint --local --level warning
- pnpm db:test
- pnpm test:e2e

Si existe un script diferente documentado por el repositorio, utiliza el script real y registra la diferencia.

Reglas:

- No uses npm install.
- No generes package-lock.json.
- No actualices pnpm.
- Mantén pnpm 11.9.0.
- No actualices dependencias sin una necesidad concreta.
- No conectes Supabase local con un proyecto remoto.
- db:reset solamente puede ejecutarse contra el entorno local.
- Registra cualquier fallo preexistente.
- No atribuyas a este hito fallos ya existentes.
- No continúes ocultando fallos de la línea base.
- Si Docker no está disponible, registra el bloqueo exacto.

================================================== 4. EXECPLAN OBLIGATORIO
==================================================

Crea antes de escribir migraciones, Edge Functions o componentes:

docs/exec-plans/0002-account-lifecycle.md

El ExecPlan debe ser un documento vivo e incluir:

- Objetivo.
- Contexto.
- Estado inicial.
- Línea base ejecutada.
- Alcance.
- Fuera de alcance.
- Decisiones de dominio.
- Decisiones de seguridad.
- Suposiciones.
- Preguntas abiertas.
- Dependencias.
- Riesgos.
- Modelo de amenazas específico.
- Estrategia de implementación.
- Estrategia de migración.
- Estrategia de rollback.
- Estrategia de consistencia entre Auth y PostgreSQL.
- Estrategia de pruebas.
- Fases.
- Criterios de aceptación.
- Registro de progreso.
- Descubrimientos.
- Decisiones tomadas durante la implementación.
- Desviaciones respecto del plan.
- Resultado final.
- Validaciones ejecutadas.
- Riesgos pendientes.

No comiences la implementación hasta que este plan sea coherente, concreto y verificable.

Mantén el ExecPlan actualizado durante todo el trabajo.

================================================== 5. PRINCIPIOS NO NEGOCIABLES
==================================================

Mantén las decisiones existentes del proyecto:

- Monolito modular.
- Clean Architecture por módulo.
- TypeScript estricto.
- React.
- Vite.
- TanStack Query.
- React Hook Form.
- Zod.
- i18next.
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security.
- pnpm workspaces.
- Turborepo.
- Vitest.
- Testing Library.
- MSW.
- Playwright.
- ESLint.
- Prettier.

Reglas obligatorias:

- Seguridad por defecto.
- Denegar por defecto.
- Las reglas críticas deben aplicarse en PostgreSQL o servidor seguro.
- React no es una frontera de seguridad.
- Ocultar botones no sustituye permisos.
- Los componentes React no consultan Supabase directamente.
- La capa presentation no depende de detalles internos de infraestructura.
- La capa domain no depende de React, Supabase, navegador ni SQL.
- La capa application define puertos y casos de uso.
- Infrastructure implementa los puertos.
- La composición ocurre en app/composition.
- Cada módulo expone una API pública explícita.
- No se permiten importaciones internas entre módulos.
- No uses microservicios.
- No agregues colas, brokers o patrones distribuidos innecesarios.
- No agregues una biblioteca sin un uso real inmediato.
- No crees carpetas vacías para aparentar arquitectura.
- No crees pantallas falsas.
- No implementes funcionalidades futuras.
- No almacenes secretos en el repositorio.
- No almacenes datos personales reales.
- No almacenes tokens de sesión.
- No almacenes contraseñas.
- No registres tokens en logs.
- No registres correos completos en logs cuando no sea necesario.
- No utilices any.
- No utilices @ts-ignore.
- No utilices eslint-disable para ocultar problemas.
- No desactives pruebas o seguridad para obtener resultados verdes.
- No afirmes que una validación pasó sin haberla ejecutado.
- No ejecutes acciones destructivas.
- No utilices service_role en React.
- Ninguna variable VITE_ puede contener una clave secreta.
- No confíes en user_metadata para autorización.
- No confíes únicamente en app_metadata recibida desde el cliente.
- No confíes en nombres de roles enviados por el navegador.

================================================== 6. OBJETIVO FUNCIONAL
==================================================

Implementa un ciclo seguro y completo:

Administrador o coordinador autorizado crea invitación
→ el sistema registra la invitación
→ Supabase Auth envía la invitación local
→ el correo aparece en Mailpit
→ el invitado abre el enlace
→ Supabase valida el enlace
→ se establece una sesión
→ la cuenta pasa a pending_profile
→ el usuario completa su perfil mínimo
→ el sistema asigna el rol inicial autorizado
→ la cuenta pasa a active
→ un administrador autorizado puede administrar roles
→ la cuenta puede suspenderse
→ una cuenta suspendida pierde acceso
→ la cuenta puede reactivarse
→ la cuenta puede archivarse
→ una cuenta archivada pierde acceso
→ la cuenta puede reactivarse únicamente mediante permiso explícito
→ todas las operaciones sensibles quedan auditadas

================================================== 7. ROLES EXISTENTES
==================================================

Mantén los roles existentes:

- volunteer
- coordinator
- accommodation_manager
- project_manager
- finance
- administrator

Una persona puede tener varios roles simultáneamente.

No elimines roles ni permisos existentes.

================================================== 8. AUTORIDAD INICIAL
==================================================

Aplica estas decisiones iniciales:

administrator:

- Puede crear invitaciones.
- Puede consultar invitaciones.
- Puede revocar invitaciones.
- Puede reenviar o sustituir invitaciones.
- Puede consultar cuentas.
- Puede consultar roles.
- Puede asignar y retirar roles.
- Puede suspender cuentas.
- Puede archivar cuentas.
- Puede reactivar cuentas.
- Puede consultar auditoría autorizada.
- Puede conceder administrator, siempre que no se viole la protección del último administrador.

coordinator:

- Puede crear invitaciones únicamente con rol inicial volunteer.
- Puede consultar las cuentas dentro del alcance definido.
- Puede consultar invitaciones dentro de su alcance.
- No puede conceder administrator.
- No puede conceder coordinator.
- No puede asignar roles administrativos o privilegiados.
- No puede suspender, archivar o reactivar administradores.
- No puede modificar políticas de concesión.

accommodation_manager:

- No administra cuentas en este hito.

project_manager:

- No administra cuentas en este hito.

finance:

- No administra cuentas en este hito.

volunteer:

- No administra cuentas.
- No consulta invitaciones administrativas.
- No consulta cuentas ajenas.
- No asigna roles.
- No cambia estados de otras cuentas.

Reglas globales:

- Nadie puede concederse roles a sí mismo.
- Nadie puede retirar sus propios roles privilegiados si esto elude controles.
- Nadie puede elevar sus privilegios.
- Nadie puede otorgar un rol fuera de su autoridad.
- Nadie puede modificar directamente role_permissions.
- Nadie puede modificar directamente las políticas de concesión desde el frontend.
- El último administrador activo no puede perder su rol administrator.
- El último administrador activo no puede suspenderse.
- El último administrador activo no puede archivarse.
- Esta protección debe ser transaccional y resistente a concurrencia.
- Todas las operaciones sensibles deben auditarse.

================================================== 9. PERMISOS
==================================================

Evalúa y agrega como mínimo:

- invitation.read
- invitation.create
- invitation.revoke
- invitation.resend
- account.read
- account.activate
- account.suspend
- account.archive
- account.reactivate
- role_assignment.read
- role_assignment.manage
- audit.read

No elimines permisos existentes.

La posesión de role_assignment.manage no significa automáticamente que el usuario pueda conceder todos los roles.

Implementa una política explícita de concesión.

Considera una tabla:

role_grant_policies

o un mecanismo equivalente.

Debe permitir representar claramente:

- Rol o autoridad del actor.
- Rol objetivo que puede conceder.
- Rol objetivo que puede retirar.
- Restricciones.
- Estado activo.
- Fecha de creación.
- Auditoría o trazabilidad.

Evita jerarquías numéricas ambiguas si una matriz explícita resulta más segura.

Documenta qué roles reciben cada permiso.

================================================== 10. ESTADOS DE CUENTA
==================================================

Implementa estos estados:

- invited
- pending_profile
- active
- suspended
- archived

Transiciones permitidas:

- invited → pending_profile
- pending_profile → active
- active → suspended
- suspended → active
- active → archived
- suspended → archived
- archived → active

Rechaza cualquier otra transición.

Definiciones:

invited:

- Existe una invitación válida.
- El usuario todavía no completó la aceptación.

pending_profile:

- Supabase Auth ya validó la invitación.
- Existe una sesión válida.
- El perfil mínimo todavía no está completo.
- El usuario solamente puede acceder al recorrido de finalización de perfil.

active:

- Cuenta operativa.
- Puede utilizar las funcionalidades permitidas por sus roles y permisos.

suspended:

- Bloqueo temporal.
- No puede realizar operaciones protegidas.
- Conserva historial.
- Puede reactivarse.

archived:

- Cuenta finalizada o archivada.
- No puede realizar operaciones protegidas.
- Conserva historial.
- Puede reactivarse únicamente mediante permiso explícito.

Reglas:

- suspended y archived deben bloquearse en PostgreSQL/RLS.
- No basta con ocultar navegación.
- Una sesión técnicamente válida no debe permitir operaciones protegidas.
- La aplicación debe detectar el estado bloqueado.
- La aplicación debe limpiar su caché.
- La aplicación debe cerrar o degradar la experiencia de sesión de forma segura.
- Las transiciones deben validarse del lado servidor.
- Cada transición debe generar historial y auditoría.

================================================== 11. INVITACIONES
==================================================

Implementa:

- Listar invitaciones autorizadas.
- Consultar una invitación.
- Crear una invitación.
- Revocar una invitación.
- Reenviar una invitación.
- Sustituir una invitación.
- Aceptar una invitación.
- Rechazar una invitación expirada.
- Rechazar una invitación revocada.
- Rechazar una invitación ya utilizada.
- Evitar duplicados por doble clic.
- Manejar reintentos seguros.
- Registrar fallos de entrega sin exponer secretos.
- Auditar las operaciones sensibles.

Modelo mínimo de invitación:

- id UUID
- normalized_email
- display_name opcional
- preferred_locale
- requested_initial_role_id
- status
- created_by
- created_at
- expires_at
- sent_at
- accepted_at
- revoked_at
- revoked_by
- revocation_reason opcional
- superseded_by opcional
- delivery_error_code opcional
- auth_user_id opcional
- idempotency_key cuando resulte adecuado
- updated_at cuando corresponda

Estados sugeridos:

- pending
- sent
- accepted
- revoked
- expired
- delivery_failed
- superseded

Reglas:

- La invitación solo puede aceptarse una vez.
- Una invitación expirada no puede aceptarse.
- Una invitación revocada no puede aceptarse.
- Una invitación superseded no puede aceptarse.
- No almacenes tokens en texto plano.
- No escribas tokens en logs.
- No escribas tokens en audit_logs.
- No devuelvas tokens desde endpoints administrativos.
- No muestres tokens en la UI.
- No confíes en un rol recibido desde el navegador.
- El rol inicial debe salir del registro protegido de invitación.
- Normaliza los correos de manera consistente.
- No reveles públicamente si un correo ya tiene cuenta.
- No implementes registro público libre.
- Bloquea el alta no autorizada.
- Los dominios de pruebas deben ser .invalid.

================================================== 12. SUPABASE AUTH
==================================================

Utiliza Supabase Auth para:

- Crear o invitar usuarios.
- Validar enlaces.
- Establecer sesiones.
- Permitir definición o actualización segura de contraseña.
- Procesar callbacks de autenticación.

No uses funciones administrativas de Supabase Auth desde React.

No uses service_role en el navegador.

No expongas claves secretas mediante variables VITE_.

No almacenes contraseñas en PostgreSQL.

No dupliques información de auth.users sin una razón documentada.

No utilices user_metadata como fuente de permisos.

El rol inicial no debe depender de metadata controlable por el usuario.

================================================== 13. SUPABASE EDGE FUNCTION
==================================================

Implementa una Supabase Edge Function segura para las operaciones administrativas de invitación.

Nombre sugerido:

manage-account-invitation

Puedes dividirla solamente si existe una justificación clara y documentada.

Flujo obligatorio:

1. Recibir el JWT del usuario autenticado.
2. Validar el método HTTP.
3. Validar Content-Type.
4. Validar el input con esquema explícito.
5. Crear un cliente Supabase con el JWT del usuario.
6. Verificar la identidad.
7. Verificar el estado activo de la cuenta.
8. Verificar el permiso concreto.
9. Verificar que el actor puede conceder el rol solicitado.
10. Solamente entonces crear un cliente administrativo del lado servidor.
11. Ejecutar la operación Supabase Auth Admin.
12. Actualizar el registro de invitación.
13. Registrar auditoría sin tokens ni secretos.
14. Devolver solamente identificadores y estados seguros.

La Edge Function debe:

- Tener errores tipados.
- No filtrar stack traces.
- No filtrar claves.
- No filtrar tokens.
- No filtrar detalles internos.
- Limitar los métodos HTTP.
- Validar Content-Type.
- Validar el body.
- Manejar CORS con allowlist configurable.
- No usar wildcard de producción sin documentarlo.
- Evitar registrar correos completos cuando no sea necesario.
- Ser idempotente cuando corresponda.
- Manejar dobles clics.
- Manejar reintentos.
- Registrar fallos parciales.
- No asumir una transacción distribuida entre Auth y PostgreSQL.

Diseña consistencia eventual:

1. Reservar o crear el registro de invitación.
2. Intentar la operación de Supabase Auth.
3. Marcar sent si funciona.
4. Marcar delivery_failed si falla.
5. Permitir reintentos seguros.
6. Evitar duplicados.
7. Mantener trazabilidad.

Documenta esta decisión.

En local:

- Utiliza Supabase Auth local.
- Utiliza Mailpit.
- No configures SMTP productivo.
- No agregues proveedores externos.
- No despliegues la Edge Function.
- No configures secretos remotos.

Agrega scripts locales cuando sean necesarios, por ejemplo:

- pnpm functions:serve
- pnpm test:functions

Usa nombres coherentes con los scripts existentes.

================================================== 14. ACEPTACIÓN DE INVITACIÓN
==================================================

Implementa el recorrido completo:

1. El usuario recibe el correo en Mailpit.
2. Abre el enlace.
3. Supabase Auth valida el enlace.
4. La aplicación procesa el callback.
5. Se establece la sesión.
6. La aplicación valida que exista una invitación correspondiente.
7. La cuenta pasa de invited a pending_profile.
8. El usuario establece su contraseña cuando corresponda.
9. El usuario completa:
   - display_name
   - preferred_locale
10. El rol inicial se asigna desde la invitación protegida.
11. La cuenta pasa de pending_profile a active.
12. Se registra el historial.
13. Se registra auditoría.
14. Se invalida la invitación para impedir reutilización.

Rutas sugeridas:

- /auth/callback
- /invite/accept
- /app/complete-profile

Utiliza solamente las rutas realmente necesarias.

Reglas:

- No permitas open redirects.
- No uses destinos arbitrarios recibidos por query string.
- Usa una allowlist de rutas internas.
- No permitas que el navegador elija el rol.
- No permitas reutilización de enlaces.
- No registres tokens.
- No muestres errores internos de Supabase.
- Mantén la aplicación en español e inglés.
- No agregues todavía datos médicos, pasaportes, documentos ni contactos de emergencia.

================================================== 15. ADMINISTRACIÓN DE CUENTAS
==================================================

Implementa casos de uso para:

- Listar cuentas autorizadas.
- Consultar detalle de una cuenta.
- Consultar estado.
- Consultar roles.
- Consultar historial de estados.
- Suspender.
- Reactivar desde suspensión.
- Archivar.
- Reactivar desde archivo.
- Consultar auditoría autorizada.

No implementes eliminación física.

Cada transición debe registrar:

- actor
- usuario afectado
- estado anterior
- estado nuevo
- fecha
- motivo
- correlation_id o identificador equivalente

Reglas:

- Suspender requiere confirmación.
- Suspender debe exigir motivo.
- Archivar requiere confirmación.
- Archivar debe exigir motivo.
- Reactivar requiere confirmación.
- No se puede suspender al último administrador activo.
- No se puede archivar al último administrador activo.
- Una cuenta suspended pierde acceso.
- Una cuenta archived pierde acceso.
- La reactivación requiere account.reactivate.
- Las reglas deben comprobarse en PostgreSQL o servidor seguro.
- No confíes en el estado mostrado por React.

================================================== 16. ADMINISTRACIÓN DE ROLES
==================================================

Implementa:

- Consultar roles asignados.
- Consultar roles que el actor puede conceder.
- Asignar un rol.
- Retirar un rol.
- Auditar cambios.
- Impedir asignaciones duplicadas.
- Impedir autoasignación.
- Impedir escalamiento.
- Impedir concesión fuera de autoridad.
- Proteger el último administrador.
- Invalidar permisos y cachés después de cambios.

No permitas INSERT o DELETE directos desde el frontend sobre user_roles.

La mutación debe realizarse mediante:

- una función PostgreSQL segura

o

- un mecanismo servidor equivalente debidamente justificado.

Para operaciones relacionadas con administrator:

- Usa una transacción.
- Evita condiciones de carrera.
- Considera pg_advisory_xact_lock o bloqueo explícito.
- Comprueba el número de administradores activos dentro de la transacción.
- No permitas que dos operaciones simultáneas eliminen todos los administradores.
- Documenta la estrategia.

No implementes esta protección mediante un conteo en React.

================================================== 17. MODELO DE DATOS
==================================================

Inspecciona el esquema existente y agrega solamente lo necesario.

Considera:

- invitations
- account_status_history
- role_grant_policies

Evalúa si profiles debe ampliarse con account_status o si corresponde una entidad separada.

No dupliques datos sin necesidad.

Requisitos:

- UUID.
- timestamptz.
- claves foráneas.
- restricciones de integridad.
- CHECK constraints o enums controlados.
- índices justificados.
- unicidad cuando corresponda.
- normalización de correo.
- RLS activa.
- privilegios mínimos.
- updated_at consistente.
- migraciones reproducibles.
- seed local reproducible.
- auditoría append-only.
- datos de prueba exclusivamente locales.

No crees tablas de alojamiento o proyectos.

================================================== 18. POSTGRESQL Y SEGURIDAD
==================================================

Toda tabla expuesta debe tener RLS.

Deniega por defecto.

Funciones SECURITY DEFINER solamente cuando sean necesarias.

Cada función SECURITY DEFINER debe:

- Fijar search_path seguro.
- Usar nombres de esquema explícitos.
- Validar auth.uid().
- Validar que el actor esté activo.
- Verificar el permiso concreto.
- Verificar autoridad sobre el rol objetivo.
- No confiar en parámetros de identidad del cliente.
- No confiar en metadata modificable.
- Revocar EXECUTE de public.
- Conceder EXECUTE solamente a los roles necesarios.
- Tener pruebas pgTAP específicas.

Verifica:

- anon no consulta invitaciones.
- anon no consulta cuentas.
- volunteer no consulta invitaciones.
- volunteer no consulta cuentas ajenas.
- coordinator solamente consulta lo permitido.
- coordinator no puede conceder administrator.
- coordinator no puede conceder coordinator.
- nadie puede autoasignarse roles.
- nadie puede modificar role_permissions.
- nadie puede modificar role_grant_policies directamente.
- nadie puede modificar audit_logs.
- audit_logs permanece append-only.
- una cuenta suspended no puede usar operaciones protegidas.
- una cuenta archived no puede usar operaciones protegidas.
- una cuenta pending_profile tiene acceso limitado.
- el último administrator está protegido.
- dos operaciones concurrentes no pueden eliminar todos los administradores.
- los tokens no se almacenan.
- las funciones tienen search_path seguro.
- los privilegios son mínimos.

No desactives RLS para simplificar pruebas.

================================================== 19. AUDITORÍA
==================================================

Reutiliza audit_logs cuando sea coherente.

Registra como mínimo:

- invitation_created
- invitation_revoked
- invitation_resent
- invitation_superseded
- invitation_accepted
- account_status_changed
- role_assigned
- role_removed
- account_suspended
- account_reactivated
- account_archived

Cada registro debe incluir cuando corresponda:

- actor_id
- target_user_id
- entity_type
- entity_id
- action
- occurred_at
- correlation_id
- metadata segura
- estado anterior
- estado nuevo

No registres:

- contraseñas
- tokens de sesión
- tokens de invitación
- claves Supabase
- claves S3
- datos médicos
- pasaportes
- stack traces internos
- correos completos cuando no sean necesarios

Cuando se registre correo, usa una representación minimizada o enmascarada cuando sea suficiente.

================================================== 20. ARQUITECTURA DEL CÓDIGO
==================================================

Evalúa si las nuevas responsabilidades pertenecen al módulo identity o justifican un módulo account-administration.

No crees un módulo nuevo solamente para organizar carpetas.

Si creas account-administration, debe tener límites claros.

Estructura cuando corresponda:

- domain
- application
- infrastructure
- presentation

Reglas:

- Domain independiente de frameworks.
- Application contiene casos de uso y puertos.
- Infrastructure conoce Supabase.
- Presentation conoce React.
- React no conoce implementaciones directas de Supabase.
- Composición en app/composition.
- API pública explícita.
- Sin imports internos entre módulos.
- Errores tipados.
- No uses excepciones genéricas como flujo normal.
- Agrega pruebas arquitectónicas para nuevos límites.
- No rompas las pruebas arquitectónicas existentes.

================================================== 21. INTERFAZ ADMINISTRATIVA
==================================================

Implementa un panel administrativo mínimo, funcional y seguro.

Rutas sugeridas:

- /app/admin/invitations
- /app/admin/accounts
- /app/admin/accounts/:id

Utiliza las rutas necesarias según la arquitectura real.

La navegación se muestra solamente a usuarios con permisos apropiados.

Ocultar navegación no reemplaza la autorización de servidor.

Pantalla de invitaciones:

- Lista de invitaciones.
- Estado.
- Correo.
- Nombre opcional.
- Idioma.
- Rol inicial.
- Fecha de creación.
- Expiración.
- Creador.
- Crear invitación.
- Revocar.
- Reenviar o sustituir.
- Confirmaciones.
- Estado de carga.
- Estado vacío.
- Estado de error.
- Estado de éxito.

Pantalla de cuentas:

- Lista.
- Nombre.
- Correo autorizado.
- Estado.
- Roles.
- Última actualización.
- Acciones permitidas.
- Paginación o búsqueda razonable.
- Estado vacío.
- Estado de carga.
- Estado de error.

Detalle de cuenta:

- Perfil básico.
- Estado.
- Historial de estado.
- Roles.
- Roles que el actor puede conceder.
- Asignar rol.
- Retirar rol.
- Suspender.
- Archivar.
- Reactivar.
- Auditoría permitida.

Requisitos:

- Responsive.
- Accesible.
- Español.
- Inglés.
- Textos traducibles.
- Confirmación para operaciones sensibles.
- Errores comprensibles.
- Sin tokens.
- Sin secretos.
- Sin stack traces.
- Sin pantallas falsas.
- Sin componentes gigantes.
- No agregues una nueva biblioteca de UI salvo necesidad real documentada.

================================================== 22. EXPERIENCIA DEL INVITADO
==================================================

Implementa:

- Pantalla de aceptación.
- Estado de enlace válido.
- Estado de enlace expirado.
- Estado de enlace revocado.
- Estado de enlace utilizado.
- Estado de error seguro.
- Definición de contraseña cuando corresponda.
- Formulario para completar perfil.
- Validación Zod.
- Persistencia del idioma.
- Redirección segura al finalizar.
- Acceso limitado mientras pending_profile.

No muestres información administrativa.

No permitas navegar a módulos protegidos antes de pasar a active.

================================================== 23. SESIÓN, CACHÉ Y CAMBIO DE PERMISOS
==================================================

Mantén el aislamiento actual de TanStack Query.

Prueba y maneja:

- Inicio de sesión.
- Cierre de sesión.
- Cambio de usuario.
- Cuenta suspendida durante una sesión.
- Cuenta archivada durante una sesión.
- Expiración de sesión.
- Cambio de roles.
- Retiro de permisos.
- Intento de abrir una ruta administrativa después de perder un rol.
- Navegación hacia atrás después de cerrar sesión.
- Datos en caché del usuario anterior.

Cuando cambie identidad, estado o autoridad:

- Invalida consultas relevantes.
- Limpia datos del usuario anterior.
- Vuelve a resolver permisos.
- No muestres información administrativa obsoleta.
- Bloquea operaciones pendientes cuando corresponda.
- Redirige de forma segura.

================================================== 24. PRUEBAS DE DOMINIO
==================================================

Agrega pruebas para:

- Estados válidos.
- Transiciones válidas.
- Transiciones inválidas.
- Invitación expirada.
- Invitación revocada.
- Invitación utilizada.
- Invitación superseded.
- Política de concesión.
- Autoasignación.
- Escalamiento de privilegios.
- Protección del último administrador.
- Reglas de suspensión.
- Reglas de archivado.
- Reactivación.
- Normalización de correo.
- Idempotencia cuando corresponda.

================================================== 25. PRUEBAS DE APLICACIÓN
==================================================

Agrega pruebas para:

- Listar invitaciones.
- Crear invitación.
- Revocar invitación.
- Reenviar invitación.
- Sustituir invitación.
- Aceptar invitación.
- Completar perfil.
- Activar cuenta.
- Listar cuentas.
- Consultar detalle.
- Asignar rol.
- Retirar rol.
- Suspender.
- Archivar.
- Reactivar.
- Autoridad insuficiente.
- Autoasignación.
- Protección del último administrador.
- Fallos del proveedor Auth.
- Reintentos.
- Doble clic.
- Limpieza de caché.

================================================== 26. PRUEBAS DE EDGE FUNCTION
==================================================

Prueba:

- Método HTTP inválido.
- Content-Type inválido.
- Body inválido.
- Usuario no autenticado.
- Cuenta suspendida.
- Cuenta archivada.
- Permiso insuficiente.
- Rol solicitado no concedible.
- Correo inválido.
- Invitación duplicada.
- Idempotencia.
- Operación exitosa.
- Fallo de Supabase Auth.
- Registro delivery_failed.
- Reintento seguro.
- CORS.
- Respuesta sin secretos.
- Logs sin tokens.

================================================== 27. PRUEBAS POSTGRESQL Y RLS
==================================================

Agrega pruebas pgTAP contra PostgreSQL real.

Como mínimo:

- anon no accede a invitations.
- anon no accede a cuentas.
- volunteer no accede a invitations.
- volunteer no accede a perfiles ajenos.
- coordinator accede solamente a lo permitido.
- coordinator puede invitar volunteer.
- coordinator no puede invitar administrator.
- coordinator no puede conceder coordinator.
- administrator puede realizar operaciones autorizadas.
- nadie puede autoasignarse roles.
- nadie puede elevar privilegios.
- no hay INSERT directo inseguro en user_roles.
- no hay DELETE directo inseguro en user_roles.
- no se puede modificar role_permissions.
- no se puede modificar role_grant_policies.
- no se puede modificar audit_logs.
- audit_logs es append-only.
- estado inválido rechazado.
- transición inválida rechazada.
- cuenta suspended bloqueada.
- cuenta archived bloqueada.
- pending_profile limitado.
- último administrador protegido.
- dos operaciones concurrentes no eliminan todos los administradores.
- invitación expirada rechazada.
- invitación revocada rechazada.
- invitación usada rechazada.
- token en texto plano no almacenado.
- auditoría generada.
- search_path seguro.
- privilegios mínimos.

No sustituyas pruebas RLS por mocks.

================================================== 28. PRUEBAS DE UI E INTEGRACIÓN
==================================================

Prueba:

- Formulario de invitación.
- Validación de correo.
- Selección de idioma.
- Selección de rol permitido.
- Estado de carga.
- Estado vacío.
- Error seguro.
- Confirmación de revocación.
- Reenvío.
- Lista de cuentas.
- Detalle de cuenta.
- Asignación de roles.
- Retiro de roles.
- Suspensión.
- Archivado.
- Reactivación.
- Acceso denegado.
- Traducciones.
- Limpieza de caché.
- Pérdida de permisos.
- Cuenta bloqueada durante sesión.

================================================== 29. PRUEBAS E2E
==================================================

Implementa como mínimo dos recorridos reales.

E2E 1: ciclo completo de administrador

1. Administrador local inicia sesión.
2. Abre el panel de invitaciones.
3. Crea una invitación para un correo .invalid.
4. El correo aparece en Mailpit.
5. Se abre el enlace.
6. El invitado establece credenciales.
7. Completa display_name.
8. Selecciona o confirma preferred_locale.
9. La cuenta pasa a active.
10. El administrador consulta la cuenta.
11. Asigna un rol permitido.
12. Se confirma la persistencia.
13. Suspende la cuenta.
14. La cuenta pierde acceso.
15. Reactiva la cuenta.
16. La cuenta recupera acceso.
17. Archiva la cuenta.
18. La cuenta pierde acceso.
19. Se confirma auditoría.

E2E 2: límites del coordinador

1. Coordinador inicia sesión.
2. Puede crear una invitación volunteer.
3. No puede seleccionar administrator.
4. Intenta conceder administrator.
5. La UI bloquea la opción.
6. El servidor también rechaza una solicitud manipulada.
7. Se confirma que no hubo escalamiento.
8. Se confirma auditoría del intento cuando corresponda.

Usa dominios .invalid.

No uses correos reales.

No dependas de servicios externos.

================================================== 30. DATOS LOCALES
==================================================

Mantén fixtures exclusivamente locales.

Puedes utilizar:

- administrator@example.invalid
- coordinator@example.invalid
- volunteer-a@example.invalid
- invited-volunteer@example.invalid

Las contraseñas deben marcarse claramente como:

local-test-only

No incluyas datos personales reales.

No incluyas tokens reales.

No guardes correos de Mailpit en Git.

No guardes enlaces de invitación en Git.

No guardes secretos productivos.

================================================== 31. SCRIPTS
==================================================

Mantén los scripts existentes y agrega únicamente los necesarios.

Considera:

- pnpm functions:serve
- pnpm test:functions
- pnpm account-lifecycle:test

No agregues scripts redundantes.

Actualiza pnpm verify solamente cuando sea coherente y no convierta verificaciones que requieren Docker en un obstáculo para tareas puramente estáticas sin documentarlo.

Documenta claramente qué comandos requieren:

- Docker.
- Supabase local.
- Edge Functions.
- Playwright.
- Mailpit.

================================================== 32. DOCUMENTACIÓN
==================================================

Actualiza como mínimo:

- README.md
- CHANGELOG.md
- docs/product/roles-and-permissions.md
- docs/product/user-journey.md
- docs/product/open-questions.md
- docs/architecture/overview.md
- docs/architecture/context-map.md
- docs/architecture/module-boundaries.md
- docs/architecture/runtime-view.md
- docs/data/initial-model.md
- docs/data/data-dictionary.md
- docs/security/threat-model.md
- docs/deployment/local-development.md
- docs/deployment/cloudflare-supabase.md cuando corresponda
- docs/governance/risk-register o equivalente existente
- docs/governance/technical-debt o equivalente existente
- docs/ai/prompt-log.md
- docs/ai/change-attribution.md
- docs/exec-plans/0002-account-lifecycle.md

Crea diagramas Mermaid para:

- Flujo de invitación.
- Estados de cuenta.
- Autorización de Edge Function.
- Asignación de roles.
- Protección del último administrador.
- Consistencia entre Auth y PostgreSQL.

Crea un ADR solamente cuando exista una decisión arquitectónica realmente nueva.

No modifiques ADRs históricos para aparentar que una decisión anterior ya contemplaba este hito.

================================================== 33. GOBERNANZA DE IA
==================================================

Guarda este prompt completo en:

docs/ai/prompts/0002-account-lifecycle.md

Actualiza:

- docs/ai/prompt-log.md
- docs/ai/change-attribution.md
- docs/ai/agent-registry.md cuando corresponda

Registra:

- Fecha.
- Objetivo.
- Herramienta.
- Modelo cuando esté disponible.
- Rama.
- Resultado.
- Archivos principales.
- Commits.
- Decisiones.
- Revisiones realizadas.

No registres:

- secretos
- tokens
- correos reales
- información personal real
- contenido completo de logs sensibles

================================================== 34. AGENTES
==================================================

Utiliza los agentes existentes como revisores.

El agente principal será el único integrador de cambios.

Solicita análisis independientes a:

architect:

- Revisar límites.
- Acoplamientos.
- Complejidad.
- Dependencias.
- API pública de módulos.
- Sobreingeniería.

domain_modeler:

- Revisar estados.
- Transiciones.
- Invitaciones.
- Autoridad.
- Lenguaje ubicuo.
- Reglas ambiguas.

database_security_reviewer:

- Revisar migraciones.
- RLS.
- SECURITY DEFINER.
- search_path.
- Privilegios.
- Escalamiento.
- Último administrador.
- Concurrencia.
- Auditoría.
- Exposición de datos.

qa_reviewer:

- Revisar criterios de aceptación.
- Casos límite.
- Cobertura.
- Pruebas superficiales.
- E2E.
- Integración.
- Regresiones.

docs_governor:

- Comparar documentación con implementación.
- Revisar comandos.
- Revisar diagramas.
- Revisar ADRs.
- Revisar ExecPlan.
- Revisar trazabilidad de IA.

Usa subagentes para lectura y revisión.

Evita que varios agentes editen simultáneamente la misma migración, Edge Function o componente.

Espera sus resultados antes de cerrar el hito.

================================================== 35. COMMITS
==================================================

No modifiques los commits existentes.

Realiza commits nuevos y convencionales.

Secuencia sugerida:

- docs: plan account lifecycle milestone
- feat(identity): add account lifecycle domain model
- feat(auth): add secure account invitation workflow
- feat(admin): add account and role administration
- test: verify account lifecycle security and flows
- docs: document account lifecycle operations

Puedes ajustar la secuencia para mantener commits coherentes.

Reglas:

- Commits pequeños.
- Conventional Commits.
- Sin push.
- Sin tags.
- Sin rebase.
- Sin amend.
- Sin reescribir historial.
- Sin modificar origin.

================================================== 36. VALIDACIÓN INCREMENTAL
==================================================

Después de cada fase, ejecuta las verificaciones aplicables.

No esperes al final para descubrir todos los errores.

Antes de finalizar ejecuta como mínimo:

- pnpm install --frozen-lockfile
- pnpm format
- pnpm format:check
- pnpm lint
- pruebas de límites arquitectónicos
- pnpm typecheck
- pnpm test
- pruebas de Edge Functions
- pnpm build
- pnpm db:start
- pnpm db:reset
- pnpm exec supabase db lint --local --level warning
- pnpm db:test
- pnpm test:e2e
- validación de skills
- git diff --check
- escaneo de secretos
- búsqueda de service_role en frontend
- búsqueda de sb_secret en archivos versionados
- búsqueda de any
- búsqueda de @ts-ignore
- búsqueda de eslint-disable
- búsqueda de TODO y FIXME no documentados
- revisión completa del diff
- git status
- git log --oneline --decorate

No declares aprobada una validación que no ejecutaste.

Cuando una validación no pueda ejecutarse:

- Indica exactamente cuál.
- Explica el motivo.
- Proporciona el comando exacto.
- No la marques como aprobada.

Detén Supabase local ordenadamente al terminar, conservando los volúmenes, salvo que sea necesario dejarlo activo para una validación manual explícitamente documentada.

================================================== 37. CRITERIOS DE ACEPTACIÓN
==================================================

El hito se considera terminado solamente cuando:

- La línea base anterior continúa aprobada.
- El registro público libre está bloqueado.
- Un administrador puede crear una invitación.
- Un coordinador puede invitar solamente con rol volunteer.
- El correo local aparece en Mailpit.
- La invitación puede aceptarse una sola vez.
- Una invitación expirada es rechazada.
- Una invitación revocada es rechazada.
- Una invitación sustituida es rechazada.
- No se almacenan tokens en texto plano.
- No se exponen claves secretas al frontend.
- El usuario puede completar su perfil.
- La cuenta pasa a active.
- El rol inicial se obtiene del registro protegido de invitación.
- Los roles se asignan mediante autoridad explícita.
- Nadie puede autoasignarse roles.
- Nadie puede elevar sus privilegios.
- Un coordinador no puede conceder administrator.
- Un coordinador no puede conceder coordinator.
- El último administrador activo está protegido.
- La protección del último administrador es transaccional.
- Una cuenta suspended pierde acceso.
- Una cuenta archived pierde acceso.
- Una cuenta puede reactivarse con permiso.
- Los cambios de estado se auditan.
- Los cambios de roles se auditan.
- audit_logs continúa append-only.
- RLS se prueba contra PostgreSQL real.
- La Edge Function no filtra secretos.
- La UI funciona en español e inglés.
- La caché se limpia al cambiar identidad o permisos.
- Las pruebas unitarias pasan.
- Las pruebas de integración pasan.
- Las pruebas de Edge Functions pasan.
- Las pruebas SQL/RLS pasan.
- Las pruebas E2E pasan.
- El build pasa.
- El lint pasa sin warnings.
- TypeScript estricto pasa.
- La documentación coincide con la implementación.
- El ExecPlan está cerrado con resultados reales.
- Los agentes revisores no encuentran bloqueantes.
- El árbol Git termina limpio.
- Los commits son nuevos y convencionales.
- No hubo push.
- No hubo despliegue.
- No se modificó main.

================================================== 38. INFORME FINAL
==================================================

Al terminar entrega:

1. Resumen ejecutivo.
2. Directorio y rama confirmados.
3. Estado inicial.
4. Línea base ejecutada.
5. Arquitectura implementada.
6. Decisiones de dominio.
7. Estados y transiciones.
8. Migraciones agregadas.
9. Tablas agregadas o modificadas.
10. Funciones PostgreSQL agregadas.
11. Políticas RLS.
12. Edge Functions agregadas.
13. Flujo de invitación.
14. Flujo de aceptación.
15. Flujo de activación.
16. Administración de cuentas.
17. Administración de roles.
18. Protección del último administrador.
19. Estrategia de concurrencia.
20. Auditoría.
21. Interfaz implementada.
22. Internacionalización.
23. Pruebas ejecutadas.
24. Resultado real de cada validación.
25. Agentes utilizados.
26. Hallazgos de los agentes.
27. Correcciones aplicadas.
28. Archivos principales modificados.
29. Commits realizados.
30. Riesgos pendientes.
31. Deuda técnica.
32. Preguntas de negocio pendientes.
33. Instrucciones exactas para ejecutar localmente.
34. Credenciales de fixtures locales, sin secretos reales.
35. Instrucciones para probar Mailpit.
36. Instrucciones para ejecutar Edge Functions localmente.
37. Comandos de verificación.
38. Recomendación del siguiente hito.

Comienza ahora confirmando el repositorio, leyendo la gobernanza, ejecutando la línea base y creando el ExecPlan.

No empieces escribiendo migraciones, Edge Functions ni componentes antes de completar la inspección y planificación.
