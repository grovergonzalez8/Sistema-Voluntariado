# Vista de ejecución

## Autenticación

```mermaid
sequenceDiagram
  participant U as Usuario
  participant UI as React
  participant I as Identity use case
  participant A as Supabase Auth adapter
  U->>UI: correo y contraseña
  UI->>I: signIn(credentials)
  I->>A: signIn(credentials)
  A->>A: Supabase Auth
  A-->>I: sesión o error tipado
  I-->>UI: Result
```

## Perfil propio

```mermaid
sequenceDiagram
  participant UI as ProfilePage
  participant UC as Use case
  participant Repo as SupabaseProfileRepository
  participant DB as PostgreSQL/RLS
  UI->>UC: get/update own profile
  UC->>Repo: operación sin userId del formulario
  Repo->>DB: consulta o update con sesión JWT
  DB->>DB: auth.uid + has_permission + grants
  DB-->>Repo: fila permitida o denegación
  Repo-->>UC: Result tipado
  UC-->>UI: estado seguro
```

TanStack Query usa una clave que incluye `user.id` y `authorityVersion`; así dos sesiones o versiones de autoridad consecutivas no comparten datos personales en memoria. Al cambiar usuario/autoridad o cerrar sesión, `PersonalDataCacheGuard` cancela consultas, elimina toda caché sensible y las mutaciones descartan respuestas de una versión anterior.

El guard ahora limpia toda caché sensible si cambia el actor o la tupla `accountId:authorityVersion:status`. `IdentityProvider` vuelve a obtener contexto en cambios Auth, al recuperar foco/visibilidad y cada 30 segundos mientras hay sesión; RLS niega de inmediato aunque la UI aún no haya refrescado.

## Autorización de la Edge Function

```mermaid
flowchart TD
  R["POST + Origin permitido + JSON"] --> J{"JWT válido"}
  J -->|No| X["Error seguro"]
  J -->|Sí| C{"Cuenta active"}
  C -->|No| X
  C -->|Sí| P{"Permiso + policy + scope"}
  P -->|No| X
  P -->|Sí| B["Reservar operación idempotente con JWT"]
  B --> L{"Lease de entrega"}
  L -->|No| O["Devolver estado existente"]
  L -->|Sí| S["Crear cliente Auth Admin"]
  S --> A["Invitar o reconciliar identidad"]
  A --> F["Finalizar sent o delivery_failed"]
```

El gateway local usa `--no-verify-jwt` solo para que el handler controle la respuesta de desarrollo; el propio handler siempre valida el JWT con Auth. En despliegue se conserva además la verificación del gateway.

## Asignación de roles

```mermaid
sequenceDiagram
  participant UI as AccountDetailPage
  participant UC as AccountAdministrationService
  participant DB as manage_account_role
  UI->>UC: grant/revoke(account, role)
  UC->>DB: RPC con JWT
  DB->>DB: lock global de administración
  DB->>DB: actor active + permission + policy
  DB->>DB: target active + no self-service
  DB->>DB: proteger último administrator
  DB->>DB: mutar user_roles + authority_version + audit
  DB-->>UC: detalle autorizado actualizado
```

## Protección del último administrador

```mermaid
flowchart LR
  A["Suspender, archivar o retirar administrator"] --> L["pg_advisory_xact_lock compartido"]
  L --> T["Bloquear target"]
  T --> C["Contar administrator activos dentro de la transacción"]
  C -->|Quedaría cero| D["Rechazar last_active_administrator"]
  C -->|Queda al menos uno| M["Mutar + auditar + commit"]
```

Todas las rutas relevantes toman la misma clave antes del lock de fila, lo que evita carreras `revoke/revoke`, `suspend/suspend` y combinadas. El E2E ejecuta `suspend/suspend`, `revoke/revoke` y `revoke/archive` desde sesiones distintas; exige exactamente un éxito y un rechazo seguro, nunca 500.

## Consistencia entre Auth y PostgreSQL

```mermaid
sequenceDiagram
  participant UI as Navegador
  participant EF as Edge Function
  participant DB as PostgreSQL
  participant AU as Supabase Auth
  UI->>EF: operación + JWT + idempotency key
  EF->>DB: reservar cuenta/invitación y lease
  DB-->>EF: IDs + should_deliver
  alt Debe entregar
    EF->>AU: inviteUserByEmail
    alt Auth confirma
      AU-->>EF: auth_user_id
      EF->>DB: enlace bilateral + sent
    else Auth falla
      AU-->>EF: error proveedor
      EF->>DB: delivery_failed con código seguro
    end
  else Replay o lease vigente
    EF-->>UI: estado ya reservado
  end
```

No existe transacción distribuida. La idempotencia, el lease exclusivo con actor/correlación por intento, el snapshot bilateral de `auth_user_id`, constraints diferidos y la reconciliación por correo exacto + identificador de invitación en metadata emitida por el servidor limitan divergencias. Los casos ambiguos o una identidad ya confirmada quedan fallidos para intervención; nunca se enlazan ni eliminan usuarios automáticamente.

## Padrón administrativo de voluntarios

```mermaid
sequenceDiagram
  participant A as Administrator
  participant UI as Volunteer Registry UI
  participant UC as VolunteerRegistryService
  participant DB as PostgreSQL RPC
  A->>UI: buscar, crear o editar
  UI->>UC: operación validada
  UC->>UC: permiso efectivo mediante puerto
  UC->>DB: RPC con JWT y sin actor recibido del formulario
  DB->>DB: cuenta activa + permiso + lock de duplicados
  DB->>DB: mutación y auditoría atómicas
  DB-->>UI: proyección mínima o error seguro
```

Listado, búsqueda, orden y exportación se ejecutan paginados en PostgreSQL. En importación, el navegador analiza un `.xlsx` de hasta 5 MiB y 1.000 filas, muestra errores y coincidencias, y envía solo las filas elegidas. La RPC vuelve a validar estructura, datos y duplicados bajo un advisory lock; todo el lote se confirma o revierte. El archivo no se persiste y ninguna operación toca Supabase Auth, `accounts`, invitaciones o perfiles.
