# Sistema-Voluntariado

Monolito modular para gestionar progresivamente la operación de voluntariado. El alcance actual incluye autenticación, perfil propio, invitaciones, onboarding, ciclo de vida de cuentas, administración segura de roles, un padrón administrativo independiente con importación/exportación Excel y proyectos con participación histórica, alcance contextual de project managers y Activities con lifecycle terminal.

## Estado

Proyecto privado y sin licencia definitiva. No se permite redistribución hasta que el propietario tome una decisión legal.

## Requisitos

- Node.js `22.18.0`
- pnpm `11.9.0`
- Docker y Docker Compose para Supabase local

## Inicio local

```powershell
Copy-Item .env.example .env.local
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
corepack pnpm exec supabase status
```

Después de iniciar Supabase, complete `.env.local` con la URL y la clave `anon` locales mostradas por la CLI. No copie `service_role` al frontend ni confirme archivos de entorno. `supabase/functions/.env.example` es solo una plantilla versionada: `functions:serve` exige la copia ignorada `supabase/functions/.env.local`, valida `APP_ORIGIN` y `ALLOWED_ORIGINS`, y no admite comodines como solución local. La configuración predeterminada autoriza exactamente `http://localhost:5173`.

Los scripts raíz deshabilitan el Edge Runtime automático: en desarrollo manual, la terminal que ejecuta `functions:serve` es su único propietario. No mantenga esa terminal activa al ejecutar `test:e2e`; el orquestador de pruebas inicia su propia Function, valida una respuesta tipada y la detiene al terminar.

Mantenga dos terminales adicionales abiertas. En la segunda, sirva la Edge Function:

```powershell
corepack pnpm functions:serve
```

En la tercera, inicie Vite:

```powershell
corepack pnpm dev
```

El seed local crea, entre otras identidades de prueba, `administrator@example.invalid`, `coordinator@example.invalid`, `project-manager@example.invalid` y `volunteer-a@example.invalid` con la contraseña pública de fixture `local-test-only-not-a-secret`. Son identidades ficticias exclusivamente locales; nunca reutilice esa contraseña.

Mailpit está disponible en `http://127.0.0.1:54324`. Use solamente destinatarios `.invalid`; no guarde enlaces ni cuerpos de invitación en Git.

Mailpit es siempre el transporte predeterminado. Los comandos de arranque rechazan
un stack ya activo para no conservar silenciosamente el transporte anterior. Para
una prueba manual opt-in con Gmail SMTP, copie `supabase/.env.real-email.example` a
`supabase/.env.real-email.local`, complete las tres variables con una cuenta y una
contraseña de aplicación de Google, detenga cualquier stack local activo y ejecute:

```powershell
corepack pnpm db:stop
corepack pnpm db:start:real-email
```

El modo real usa `smtp.gmail.com:587` con STARTTLS. Nunca se activa desde tests ni
CI. Para volver a Mailpit, detenga el stack y use el comando normal:

```powershell
corepack pnpm db:stop
corepack pnpm db:start
```

## Verificación

```powershell
corepack pnpm verify
corepack pnpm test:functions
corepack pnpm db:test
corepack pnpm projects:test:concurrency
corepack pnpm --filter @sistema-voluntariado/web exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm account-lifecycle:test
```

`verify` y `test:functions` no exigen Docker; PostgreSQL, concurrencia, Auth, Mailpit y E2E sí requieren Supabase local. `projects:test:concurrency` presupone `db:start` y `db:reset`, usa conexiones PostgreSQL reales y limpia sus fixtures. Cubre Project Volunteer Assignments, scopes de project managers, Project Activities, Activity Participation y el backend de Activity Attendance, incluidos cierre, transiciones terminales, elegibilidad, corrección optimista y revocación contextual. Consulte `docs/deployment/local-development.md` para el recorrido completo. La UI/E2E de Attendance, alojamiento, RSVP, tareas, finanzas y los demás contextos operativos siguen fuera de alcance de FASE A. El alcance de project manager es una relación explícita por proyecto, no un framework genérico de scopes.

La propiedad de procesos y el comando Linux equivalente al job `Quality` se documentan en `docs/deployment/continuous-integration.md`.
