# Mapa de contextos

```mermaid
flowchart LR
  Auth["Supabase Auth\nupstream"] -->|sesión y UserId| Identity["Identity & Authorization"]
  Identity -->|actor y permisos| Profile["Volunteer Profile"]
  Identity -->|actor| Audit["Audit"]
  Profile -->|profile.updated| Audit
  Identity -. futuro .-> Groups["Volunteer Groups"]
  Identity -. futuro .-> Accommodation["Accommodation"]
  Identity -. futuro .-> Projects["Projects"]
  Identity -. futuro .-> Work["Activities & Tasks"]
  Identity -. futuro .-> Finance["Finance"]
  Identity -. futuro .-> Incidents["Incidents"]
```

Supabase Auth es la fuente de credenciales. Identity posee roles, permisos y asignaciones. Volunteer Profile no conoce tablas internas de autorización; recibe el actor y depende de un puerto propio. Audit observa cambios sensibles y no gobierna el perfil.

## Flujo futuro de aprobación

El siguiente flujo es conceptual, no implementado ni definitivo:

```mermaid
stateDiagram-v2
  [*] --> Propuesta
  Propuesta --> EnRevision
  EnRevision --> Confirmada
  EnRevision --> Rechazada
  Propuesta --> Cancelada
```

Quedan pendientes responsables, transiciones, caducidad, concurrencia y permisos por alcance. No se crearán tablas hasta resolverlos.
