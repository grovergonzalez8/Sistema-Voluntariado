# Desarrollo local

## Requisitos

Node `22.18.0`, pnpm `11.9.0` mediante Corepack cuando sea necesario, Docker en ejecución y puertos Supabase libres.

```powershell
Copy-Item .env.example .env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
corepack pnpm exec supabase status
```

Copie únicamente la URL local y la clave anon local mostradas por `supabase status` a `.env.local`. No use ni confirme `service_role` en el frontend. La CLI inyecta las credenciales de servidor en la Edge Function local; `supabase/functions/.env.example` define `APP_ORIGIN=http://127.0.0.1:5173` y `ALLOWED_ORIGINS=http://127.0.0.1:5173`.

Mantenga dos terminales adicionales abiertas. En la segunda, sirva la Edge Function:

```powershell
corepack pnpm functions:serve
```

En la tercera, inicie Vite:

```powershell
corepack pnpm dev
```

Después de `db:reset`, estas cuentas locales usan la contraseña pública de fixture `local-test-only-not-a-secret`:

| Cuenta                          | Uso                                                 |
| ------------------------------- | --------------------------------------------------- |
| `administrator@example.invalid` | administración global del hito                      |
| `coordinator@example.invalid`   | invitaciones `volunteer` y lectura de origen propio |
| `volunteer-a@example.invalid`   | perfil propio sin administración                    |

No son credenciales de ningún entorno compartido y nunca deben reutilizarse.

## Probar invitaciones con Mailpit

1. Abra `http://127.0.0.1:5173` e inicie sesión como administrator o coordinator.
2. Visite `/app/admin/invitations` y use un destinatario nuevo con dominio `.invalid`.
3. Abra `http://127.0.0.1:54324`, seleccione ese correo y siga el enlace local.
4. Acepte, establezca la contraseña de fixture y complete nombre/idioma.

No copie cuerpos, tokens o enlaces de Mailpit al repositorio o a logs. El rate limit y TTL locales son fixtures, no configuración productiva.

## Verificaciones

```powershell
corepack pnpm verify
corepack pnpm test:functions
corepack pnpm exec supabase db lint --local --level warning
corepack pnpm db:test
corepack pnpm --filter @sistema-voluntariado/web exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm account-lifecycle:test
```

`test:e2e` falla de forma explícita si `.env.local` no contiene URL/anon locales; no omite recorridos silenciosamente. Playwright inicia Vite y `manage-account-invitation`, usa un worker serial y requiere Auth, PostgreSQL y Mailpit. Su configuración obtiene la clave `service_role` local únicamente en el proceso Node para comprobar invariantes de Auth; no la expone a Vite ni al navegador.

`verify` es el gate estático y no requiere Docker. `test:functions` prueba el handler puro; DB/E2E requieren Supabase local. `account-lifecycle:test` ejecuta funciones, reconstruye la base local, aplica lint SQL, corre pgTAP y finaliza con E2E; no depende del estado residual de una ejecución anterior.

Detenga servicios preservando volúmenes con `corepack pnpm db:stop`. `db:reset` reemplaza exclusivamente la base local con migraciones/seed y nunca debe apuntar a un proyecto remoto.
