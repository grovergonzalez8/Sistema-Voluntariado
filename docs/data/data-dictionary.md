# Diccionario de datos

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

| Columna                    | Regla                                              |
| -------------------------- | -------------------------------------------------- |
| `id`                       | UUID generado por PostgreSQL                       |
| `actor_user_id`            | actor autenticado; anulable por retención futura   |
| `action`                   | código técnico estable                             |
| `entity_type`, `entity_id` | objetivo sin snapshot                              |
| `changed_fields`           | nombres de columnas, nunca valores                 |
| `target_user_id`           | identidad objetivo; anulable por retención         |
| `correlation_id`           | correlación técnica entre pasos                    |
| `previous_state`           | estado técnico anterior, sin snapshot de PII       |
| `new_state`                | estado técnico nuevo, sin snapshot de PII          |
| `metadata`                 | solo `reason_code`/`provider_error_code` allowlist |
| `created_at`               | hora del servidor                                  |

No se guardan tokens, correo, nombre, contraseña, valores personales anteriores/nuevos ni cuerpos de solicitudes.

## API PostgreSQL del hito

- Contexto/onboarding: `get_my_account_context`, `accept_current_account_invitation`, `complete_current_account_profile`.
- Invitaciones: `list_account_invitations`, `prepare_account_invitation`, `prepare_account_invitation_action`, `finalize_account_invitation_delivery`, `expire_open_invitations`.
- Administración: `list_accounts`, `get_account_detail`, `change_account_status`, `manage_account_role`.
- Reglas internas: `user_has_permission`, `user_has_active_role`, `can_user_grant_role`, `is_account_transition_allowed` y guards de consistencia/auditoría.

Las funciones expuestas a `authenticated` derivan el actor del JWT. `finalize_account_invitation_delivery` es la única de este grupo concedida a `service_role`; las tablas nuevas no conceden acceso directo a `anon` o `authenticated`.
