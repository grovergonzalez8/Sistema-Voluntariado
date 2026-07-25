# Modelo de datos inicial

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : owns
  AUTH_USERS o|--o| ACCOUNTS : links
  ACCOUNTS ||--o{ INVITATIONS : receives
  INVITATIONS o|--o| INVITATIONS : supersedes
  ACCOUNTS ||--o{ ACCOUNT_STATUS_HISTORY : records
  AUTH_USERS ||--o{ USER_ROLES : receives
  ROLES ||--o{ USER_ROLES : groups
  ROLES ||--o{ ROLE_PERMISSIONS : grants
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : includes
  ROLES ||--o{ ROLE_GRANT_POLICIES : actor
  ROLES ||--o{ ROLE_GRANT_POLICIES : target
  AUTH_USERS ||--o{ AUDIT_LOGS : acts

  ACCOUNTS {
    uuid id PK
    uuid auth_user_id UK
    text status
    uuid origin_invited_by
    bigint authority_version
  }
  INVITATIONS {
    uuid id PK
    uuid account_id FK
    text normalized_email
    uuid requested_initial_role_id FK
    text status
    uuid idempotency_key
    uuid auth_user_id
  }
  PROFILES {
    uuid id PK
    text display_name
    text preferred_locale
    timestamptz created_at
    timestamptz updated_at
    timestamptz archived_at
  }
```

`profiles.id` coincide con `auth.users.id`; la cuenta no duplica correo. Una cuenta `invited` puede preceder a Auth y por eso `accounts.auth_user_id` es inicialmente anulable. La invitación conserva correo canónico y un snapshot inmutable del enlace Auth; constraints diferidos exigen consistencia bilateral al commit.

## Ciclo de vida

```mermaid
stateDiagram-v2
  [*] --> invited
  invited --> pending_profile: aceptar invitación enviada
  pending_profile --> active: completar perfil o recuperación autorizada
  active --> suspended: suspender
  suspended --> active: reactivar
  active --> archived: archivar
  suspended --> archived: archivar
  archived --> active: reactivar con permiso
```

No se admite otra transición. `authority_version` aumenta cuando cambia estado o rol para invalidar autoridad cliente. La cuenta activa puede no tener roles; en ese caso tiene cero permisos.

## Reglas

- Una cuenta tiene como máximo un perfil.
- `display_name` comienza en `null`; al actualizar, exige 1–100 caracteres tras normalizar espacios.
- `preferred_locale` es `es` o `en`.
- Cuenta suspendida o archivada: sin permisos RBAC efectivos; conserva roles e historial.
- `profiles.archived_at` queda como compatibilidad histórica, pero `accounts.status` es la autoridad del ciclo de vida.
- RBAC y auditoría no aceptan escrituras desde clientes autenticados.
- Auditoría guarda actor/target, acción, entidad, correlación, estados técnicos y nombres de campos; metadata solo admite códigos seguros.

## Invariantes de invitación

- Una sola invitación abierta por cuenta y correo canónico; una sola aceptada por cuenta.
- Estados: `pending`, `sent`, `accepted`, `revoked`, `expired`, `delivery_failed`, `superseded`.
- `accepted`, `revoked`, `expired` y `superseded` son terminales.
- Reemplazo crea una sucesora en la misma cuenta: una fila abierta pasa a `superseded`; una fila `revoked`/`expired` conserva su estado terminal y enlaza `superseded_by`. Nunca bifurca otra cuenta y falla cerrado si Auth ya confirmó la identidad.
- Idempotencia de creación por actor/clave y de resend/replace mediante `invitation_operation_requests`.
- Un lease de entrega evita doble llamada Auth; no se almacena token o digest de enlace.
- `expires_at` usa una hora local, alineada con `auth.email.otp_expiry`.

## Entidades futuras no implementadas

`volunteer_groups`, `group_members`, `houses`, `rooms`, `host_families`, `accommodation_rates`, `accommodation_assignments`, `projects`, `project_schedules`, `project_assignments`, `events`, `event_participants`, `tasks`, `task_assignments`, `assignment_requests`, `assignment_approvals`, `notifications`, `incidents`, `charges` y `payments`.

No se fijan todavía sus columnas, cardinalidades ni estados.

## Concurrencia

- Perfil: inicialmente last-write-wins; agregar precondición `updated_at` si aparecen ediciones concurrentes reales.
- Administración de roles/estados: advisory lock común y locks de fila protegen el último administrador activo.
- Invitaciones: advisory lock por correo, índices parciales, fingerprint y lease serializan duplicados/reintentos.
- Alojamiento futuro: usar rangos temporales, restricciones de exclusión y bloqueo transaccional para evitar solapamientos.
- Capacidades futuras: serializar asignación relevante y validar capacidad dentro de la misma transacción.
- Aprobaciones futuras: transiciones condicionales por versión/estado para impedir doble confirmación.
