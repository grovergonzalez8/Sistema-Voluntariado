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

TanStack Query usa una clave que incluye el `user.id`; así dos sesiones consecutivas no comparten datos personales en memoria. Al cambiar de usuario o cerrar sesión, `PersonalDataCacheGuard` elimina la consulta del actor anterior. La caché se actualiza con la respuesta confirmada por PostgreSQL y no contiene autorización ni reglas de perfil.
