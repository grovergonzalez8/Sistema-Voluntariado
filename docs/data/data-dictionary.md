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
| `created_at`               | hora del servidor                                |

No se guardan tokens, correo, nombre, valores anteriores/nuevos ni cuerpos de solicitudes.
