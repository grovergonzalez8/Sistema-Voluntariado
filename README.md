# Sistema-Voluntariado

Fundación técnica para gestionar progresivamente la operación de voluntariado. Esta entrega implementa solamente autenticación básica y consulta/actualización segura del perfil propio.

## Estado

Proyecto privado y sin licencia definitiva. No se permite redistribución hasta que el propietario tome una decisión legal.

## Requisitos

- Node.js `22.18.0`
- pnpm `11.9.0`
- Docker y Docker Compose para Supabase local

## Inicio local

```powershell
Copy-Item .env.example .env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
corepack pnpm exec supabase status
corepack pnpm dev
```

Después de iniciar Supabase, complete `.env.local` con los valores locales mostrados por la CLI. No confirme ese archivo.

El seed local crea `volunteer-a@example.invalid` con la contraseña pública de fixture `local-test-only-not-a-secret`. Esta cuenta solo existe en la base local y sirve para verificar el recorrido; nunca reutilice esa contraseña.

## Verificación

```powershell
corepack pnpm verify
corepack pnpm db:test
corepack pnpm --filter @sistema-voluntariado/web exec playwright install chromium
corepack pnpm test:e2e
```

Consulte `docs/deployment/local-development.md` para el recorrido completo. Los módulos de alojamiento, proyectos, asignaciones, actividades y finanzas son evolución futura, no funcionalidades existentes.
