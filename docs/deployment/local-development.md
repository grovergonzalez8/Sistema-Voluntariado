# Desarrollo local

## Requisitos

Node `22.18.0`, pnpm `11.9.0` mediante Corepack cuando sea necesario, Docker en ejecución y puertos Supabase libres.

```powershell
Copy-Item .env.example .env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
corepack pnpm exec supabase status
corepack pnpm dev
```

Copie únicamente la URL local y la clave anon local mostradas por `supabase status` a `.env.local`. No use ni confirme `service_role` en el frontend.

Después de `db:reset`, la cuenta local `volunteer-a@example.invalid` usa la contraseña pública de fixture `local-test-only-not-a-secret`. No es una credencial de ningún entorno compartido y nunca debe reutilizarse.

## Verificaciones

```powershell
corepack pnpm verify
corepack pnpm db:test
corepack pnpm --filter @sistema-voluntariado/web exec playwright install chromium
corepack pnpm test:e2e
```

Detenga servicios con `corepack pnpm db:stop`. `db:reset` reemplaza la base local con migraciones/seed y nunca debe apuntar a un proyecto remoto.
