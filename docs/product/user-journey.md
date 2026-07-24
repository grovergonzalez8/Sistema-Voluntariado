# Recorrido inicial

```mermaid
flowchart LR
  A["Abrir acceso público"] --> B["Ingresar correo y contraseña"]
  B --> C{"Supabase Auth valida"}
  C -->|No| D["Error seguro sin revelar cuentas"]
  C -->|Sí| E["Shell autenticado"]
  E --> F["Abrir /app/profile"]
  F --> G{"RLS permite leer perfil propio"}
  G -->|No| H["Estado vacío, prohibido o error tipado"]
  G -->|Sí| I["Editar nombre visible e idioma"]
  I --> J["Validación Zod"]
  J --> K{"RLS + privilegios de columna"}
  K -->|No| L["Error seguro; no se alteran datos"]
  K -->|Sí| M["Perfil actualizado y evento auditado"]
```

## Estados observables

- Acceso: envío, credenciales inválidas y sesión creada.
- Perfil: carga, error, ausente y éxito.
- Actualización: validación, envío, confirmación y fallo recuperable.
- Cierre de sesión: limpia el estado cliente y vuelve a `/login`.

La interfaz nunca promete alta pública, administración ni módulos futuros.
