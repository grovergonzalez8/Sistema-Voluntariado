# Instrucciones de Supabase

- Aplica además el `AGENTS.md` raíz.
- Todos los comandos y pruebas apuntan únicamente al Supabase local; no enlaces ni modifiques proyectos remotos.
- Activa RLS en toda tabla expuesta y niega por defecto.
- Usa permisos concretos, `auth.uid()` y privilegios de columna; nunca confíes en roles o identificadores enviados por el cliente.
- Toda función `security definer` debe fijar `search_path = ''`, usar nombres cualificados y tener ejecución mínima.
- No registres valores personales en auditoría ni copies `raw_user_meta_data` a perfiles.
- No alteres migraciones ya integradas; crea una nueva. Prueba RLS con identidades distintas y PostgreSQL real.
- Seeds y usuarios de prueba son exclusivamente locales y usan datos inequívocamente ficticios.
