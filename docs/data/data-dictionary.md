# Diccionario de datos

## `volunteers`

| Columna           | Tipo          | Regla                                                                 |
| ----------------- | ------------- | --------------------------------------------------------------------- |
| `id`              | `uuid`        | PK generada por PostgreSQL; sin relación con Auth                     |
| `full_name`       | `text`        | obligatorio; espacios normalizados; 1–100 caracteres                  |
| `email`           | `text null`   | vacío a `null`; minúsculas; 3–254; formato conservador                |
| `phone`           | `text null`   | vacío a `null`; 3–40; texto visible con al menos un dígito            |
| `phone_match_key` | `text null`   | generada con solo dígitos para advertencias; nunca expuesta como dato |
| `created_at`      | `timestamptz` | fecha de registro en el sistema, inmutable                            |
| `updated_at`      | `timestamptz` | trigger de servidor                                                   |

No existen `account_id`, `auth_user_id`, estado ni eliminación cliente. Email y teléfono no son únicos: una coincidencia exige confirmación explícita para preservar históricos legítimos.

## `projects`

| Columna       | Tipo          | Regla                                                  |
| ------------- | ------------- | ------------------------------------------------------ |
| `id`          | `uuid`        | PK de servidor; no se reutiliza como scope o identidad |
| `name`        | `text`        | obligatorio; espacios normalizados; 1–120 caracteres   |
| `description` | `text null`   | vacío a `null`; espacios normalizados; máximo 1.000    |
| `status`      | `text`        | `active` o `closed`; no existe reapertura V1           |
| `created_at`  | `timestamptz` | servidor, inmutable                                    |
| `updated_at`  | `timestamptz` | trigger de servidor                                    |

No hay ubicación, organización, región, capacidad, fechas, presupuesto, tarifas ni borrado cliente. Un proyecto cerrado permanece visible, admite correcciones descriptivas y no recibe nuevas participaciones ni nuevos scopes de manager.

## `project_volunteer_assignments`

| Columna        | Tipo               | Regla                                                               |
| -------------- | ------------------ | ------------------------------------------------------------------- |
| `id`           | `uuid`             | PK estable para distinguir ocurrencias históricas                   |
| `project_id`   | `uuid`             | FK a `projects`, `ON DELETE RESTRICT`                               |
| `volunteer_id` | `uuid`             | FK a `volunteers`, `ON DELETE RESTRICT`; nunca Auth/account/profile |
| `started_at`   | `timestamptz`      | hora de servidor al asignar, inmutable                              |
| `ended_at`     | `timestamptz null` | `null` significa activa; hora de servidor al finalizar              |
| `created_at`   | `timestamptz`      | servidor, inmutable                                                 |
| `updated_at`   | `timestamptz`      | trigger de servidor                                                 |

El índice único parcial `(project_id, volunteer_id) where ended_at is null` impide duplicados activos concurrentes. La finalización es monotónica, no borra y habilita una nueva asignación histórica futura.

## `project_manager_assignments`

| Columna              | Tipo               | Regla                                                                    |
| -------------------- | ------------------ | ------------------------------------------------------------------------ |
| `id`                 | `uuid`             | PK estable para distinguir scopes históricos                             |
| `project_id`         | `uuid`             | FK a `projects`, `ON DELETE RESTRICT`                                    |
| `manager_account_id` | `uuid`             | FK a `accounts`, `ON DELETE RESTRICT`; sujeto autorizable, no voluntario |
| `started_at`         | `timestamptz`      | hora de servidor al asignar, inmutable                                   |
| `ended_at`           | `timestamptz null` | `null` significa scope activo; finalización monotónica                   |
| `created_at`         | `timestamptz`      | servidor, inmutable                                                      |
| `updated_at`         | `timestamptz`      | trigger de servidor                                                      |

El índice único parcial `(project_id, manager_account_id) where ended_at is null` impide duplicados activos y permite reasignación histórica. La fila no concede autoridad por sí sola: cada RPC exige cuenta activa, rol `project_manager`, permiso contextual y scope activo. No existe DELETE físico ni reactivación de una ocurrencia finalizada.

## `project_activities`

| Columna             | Tipo               | Regla                                                                              |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `id`                | `uuid`             | PK de servidor; no se reutiliza como participación o responsable                   |
| `project_id`        | `uuid`             | FK a `projects`, `ON DELETE RESTRICT`; inmutable                                   |
| `name`              | `text`             | obligatorio; espacios normalizados; 1–120                                          |
| `description`       | `text null`        | vacío a `null`; espacios normalizados; máximo 1.000                                |
| `starts_at`         | `timestamptz`      | instante planificado obligatorio                                                   |
| `ends_at`           | `timestamptz null` | `null` o instante mayor/igual que `starts_at`                                      |
| `location_text`     | `text null`        | vacío a `null`; ubicación no estructurada; máximo 200                              |
| `status`            | `text`             | `scheduled`, `completed` o `cancelled`; servidor decide creación/transiciones      |
| `status_changed_at` | `timestamptz`      | servidor; nace con `scheduled`, estable al editar y cambia una vez al terminalizar |
| `created_at`        | `timestamptz`      | servidor, inmutable                                                                |
| `updated_at`        | `timestamptz`      | trigger de servidor en edición/transición                                          |

El índice `(project_id, starts_at, id)` ordena el listado y el índice parcial `(project_id) where status = 'scheduled'` sirve al guard de cierre. RLS está habilitada sin policies permisivas ni grants de tabla a cliente; listado, detalle, alta, edición, completar y cancelar son RPC separadas. No existen `responsible_user_id`, attendance, RSVP, recurrence ni DELETE RPC.

## `project_activity_participations`

| Columna        | Tipo               | Regla                                                                  |
| -------------- | ------------------ | ---------------------------------------------------------------------- |
| `id`           | `uuid`             | PK estable para distinguir ocurrencias históricas                      |
| `activity_id`  | `uuid`             | FK a `project_activities`, `ON DELETE RESTRICT`; inmutable             |
| `volunteer_id` | `uuid`             | FK a `volunteers`, `ON DELETE RESTRICT`; nunca Auth/account/profile    |
| `started_at`   | `timestamptz`      | hora de servidor al agregar; inmutable                                 |
| `ended_at`     | `timestamptz null` | `null` significa no finalizada explícitamente; finalización monotónica |
| `created_at`   | `timestamptz`      | servidor, inmutable                                                    |
| `updated_at`   | `timestamptz`      | trigger de servidor al finalizar                                       |

El índice único parcial `(activity_id, volunteer_id) where ended_at is null` impide duplicados activos concurrentes. El alta exige Project `active`, Activity `scheduled` y Project Volunteer Assignment activo del Volunteer hacia el Project exacto. Activity terminal o Project cerrado conserva incluso una fila con `ended_at is null` como histórico read-only; no existe auto-finalización, reactivación ni DELETE cliente. La tabla no copia `project_id`, nombre, email, teléfono, `phone_match_key`, contenido Activity ni metadata Auth.

## `profiles`

| Columna            | Tipo               | Regla                               |
| ------------------ | ------------------ | ----------------------------------- |
| `id`               | `uuid`             | PK y FK a `auth.users`; no editable |
| `display_name`     | `text null`        | `null` inicial; 1–100 al actualizar |
| `preferred_locale` | `text`             | `es` o `en`                         |
| `created_at`       | `timestamptz`      | servidor, inmutable                 |
| `updated_at`       | `timestamptz`      | trigger de servidor                 |
| `archived_at`      | `timestamptz null` | solo flujo administrativo futuro    |

`archived_at` ya no decide acceso; se conserva por compatibilidad y `accounts.status` es la autoridad.

## `accounts`

| Columna             | Tipo          | Regla                                                            |
| ------------------- | ------------- | ---------------------------------------------------------------- |
| `id`                | `uuid`        | PK de la cuenta de aplicación                                    |
| `auth_user_id`      | `uuid null`   | FK/UK a Auth; solo anulable mientras `invited`                   |
| `status`            | `text`        | `invited`, `pending_profile`, `active`, `suspended` o `archived` |
| `origin_invited_by` | `uuid null`   | actor origen para el scope conservador de coordinator            |
| `authority_version` | `bigint`      | contador positivo; cambia ante mutaciones de estado/rol          |
| `status_changed_at` | `timestamptz` | última transición                                                |
| `created_at`        | `timestamptz` | hora de servidor                                                 |
| `updated_at`        | `timestamptz` | trigger de servidor                                              |

## `invitations`

| Grupo                  | Columnas                                                                                                                                                             | Regla                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Identidad              | `id`, `account_id`, `auth_user_id`                                                                                                                                   | enlace Auth bilateral e inmutable cuando deja de ser `null`                         |
| Destino                | `normalized_email`, `display_name`, `preferred_locale`, `requested_initial_role_id`                                                                                  | correo canónico; idioma `es`/`en`; rol protegido                                    |
| Estado                 | `status`, `created_at`, `expires_at`, `sent_at`, `accepted_at`, `revoked_at`, `expired_at`, `superseded_at`                                                          | timestamps de servidor coherentes con la transición                                 |
| Revocación/sustitución | `revoked_by`, `revocation_reason`, `superseded_by`                                                                                                                   | motivo 3–500; sucesión con FK diferida                                              |
| Entrega/idempotencia   | `delivery_error_code`, `delivery_attempt_id`, `delivery_attempted_at`, `delivery_actor_user_id`, `delivery_correlation_id`, `idempotency_key`, `request_fingerprint` | códigos allowlist, lease exclusivo con actor/correlación y fingerprint; nunca token |
| Trazabilidad           | `created_by`, `correlation_id`, `updated_at`                                                                                                                         | correlación sin PII                                                                 |

## `invitation_operation_requests`

Clave primaria `(actor_user_id, operation, idempotency_key)` para `resend` y `replace`; conserva fingerprint, invitación origen/resultado y `created_at`. No contiene cuerpo ni token.

## `account_status_history`

Conserva `account_id`, actor anulable, `from_status`, `to_status`, motivo normalizado, `correlation_id` y `created_at`. Solo las RPC privilegiadas escriben; las proyecciones filtran por autoridad.

## `role_grant_policies`

| Columna                                  | Regla                                       |
| ---------------------------------------- | ------------------------------------------- |
| `actor_role_id`, `target_role_id`        | par único de rol actor/objetivo             |
| `can_grant`, `can_revoke`                | al menos una operación debe estar permitida |
| `is_active`                              | desactiva sin borrar trazabilidad           |
| `created_by`, `created_at`, `updated_at` | procedencia y tiempos de servidor           |

## `roles`

| Columna       | Tipo               | Regla                                    |
| ------------- | ------------------ | ---------------------------------------- |
| `id`          | `uuid`             | PK generada por PostgreSQL               |
| `code`        | `text`             | código único en minúsculas y guion bajo  |
| `description` | `text`             | etiqueta administrativa, no autorización |
| `created_at`  | `timestamptz`      | hora del servidor                        |
| `updated_at`  | `timestamptz`      | trigger del servidor                     |
| `archived_at` | `timestamptz null` | un rol archivado no concede permisos     |

## `permissions`

| Columna       | Tipo               | Regla                                      |
| ------------- | ------------------ | ------------------------------------------ |
| `id`          | `uuid`             | PK generada por PostgreSQL                 |
| `code`        | `text`             | capacidad única con formato `context.verb` |
| `description` | `text`             | explicación administrativa                 |
| `created_at`  | `timestamptz`      | hora del servidor                          |
| `updated_at`  | `timestamptz`      | trigger del servidor                       |
| `archived_at` | `timestamptz null` | un permiso archivado deja de ser efectivo  |

## `user_roles`

| Columna      | Tipo          | Regla                                  |
| ------------ | ------------- | -------------------------------------- |
| `user_id`    | `uuid`        | FK a `auth.users`; parte de la PK      |
| `role_id`    | `uuid`        | FK a `roles`; parte de la PK           |
| `granted_at` | `timestamptz` | hora del servidor                      |
| `granted_by` | `uuid null`   | FK opcional al actor que otorgó el rol |

## `role_permissions`

| Columna         | Tipo          | Regla                              |
| --------------- | ------------- | ---------------------------------- |
| `role_id`       | `uuid`        | FK a `roles`; parte de la PK       |
| `permission_id` | `uuid`        | FK a `permissions`; parte de la PK |
| `granted_at`    | `timestamptz` | hora del servidor                  |

Las concesiones son relaciones inmutables: se insertan o revocan, no se editan; por eso usan `granted_at` en lugar de `created_at`/`updated_at`. La auditoría es append-only y usa únicamente `created_at`.

## `audit_logs`

| Columna                    | Regla                                            |
| -------------------------- | ------------------------------------------------ |
| `id`                       | UUID generado por PostgreSQL                     |
| `actor_user_id`            | actor autenticado; anulable por retención futura |
| `action`                   | código técnico estable                           |
| `entity_type`, `entity_id` | objetivo sin snapshot                            |
| `changed_fields`           | nombres de columnas, nunca valores               |
| `target_user_id`           | identidad objetivo; anulable por retención       |
| `correlation_id`           | correlación técnica entre pasos                  |
| `previous_state`           | estado técnico anterior, sin snapshot de PII     |
| `new_state`                | estado técnico nuevo, sin snapshot de PII        |
| `metadata`                 | códigos seguros o conteos de lote allowlist      |
| `created_at`               | hora del servidor                                |

No se guardan tokens, correo, teléfono, nombre, contraseña, valores personales anteriores/nuevos ni cuerpos de solicitudes. Además de `reason_code` y `provider_error_code`, `metadata` admite únicamente `requested_count`, `inserted_count` y `duplicate_count` como enteros entre 0 y 1.000 para `volunteer.imported`.

## API PostgreSQL del hito

- Contexto/onboarding: `get_my_account_context`, `accept_current_account_invitation`, `complete_current_account_profile`.
- Invitaciones: `list_account_invitations`, `prepare_account_invitation`, `prepare_account_invitation_action`, `finalize_account_invitation_delivery`, `expire_open_invitations`.
- Administración: `list_accounts`, `get_account_detail`, `change_account_status`, `manage_account_role`.
- Padrón: `list_volunteers`, `get_volunteer_detail`, `find_volunteer_duplicates`, `create_volunteer`, `update_volunteer`, `preview_volunteer_import_duplicates`, `import_volunteers`, `export_volunteers`.
- Proyectos: `list_projects`, `get_project_detail`, `create_project`, `update_project`, `close_project`, `list_project_assignments`, `search_project_volunteer_candidates`, `assign_volunteer_to_project`, `finish_project_volunteer_assignment`, `list_volunteer_projects`, `list_project_manager_assignments`, `search_project_manager_candidates`, `assign_project_manager`, `finish_project_manager_assignment`, `list_project_activities`, `get_project_activity_detail`, `create_project_activity`, `update_project_activity`, `complete_project_activity`, `cancel_project_activity`, `list_project_activity_participations`, `search_project_activity_volunteer_candidates`, `create_project_activity_participation`, `finish_project_activity_participation`.
- Reglas internas: `user_has_permission`, `user_has_active_role`, `can_user_grant_role`, `is_account_transition_allowed`, helpers contextuales específicos de Projects y guards de consistencia/auditoría.

Las funciones expuestas a `authenticated` derivan el actor del JWT. `finalize_account_invitation_delivery` es la única de este grupo concedida a `service_role`; las tablas nuevas no conceden acceso directo a `anon` o `authenticated`.
