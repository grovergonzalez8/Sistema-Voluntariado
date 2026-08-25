# Desarrollo local

## Requisitos

Node `22.18.0`, pnpm `11.9.0` mediante Corepack cuando sea necesario, Docker en ejecución y puertos Supabase libres.

```powershell
Copy-Item .env.example .env.local
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm db:reset
corepack pnpm exec supabase status
```

Copie únicamente la URL local y la clave anon local mostradas por `supabase status` a `.env.local`. No use ni confirme `service_role` en el frontend. La CLI inyecta las credenciales de servidor en la Edge Function local. `supabase/functions/.env.example` es únicamente la plantilla versionada; `supabase/functions/.env.local` es la configuración ejecutable ignorada por Git y debe definir `APP_ORIGIN=http://localhost:5173` y `ALLOWED_ORIGINS=http://localhost:5173`. `functions:serve` falla con un mensaje accionable si falta el archivo o una variable. No use `*`.

`db:start` excluye Edge Runtime y `db:reset` elimina defensivamente cualquier contenedor Edge que la CLI reinicie. Así, en desarrollo manual, `functions:serve` es el único propietario de la Function.

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

1. Abra `http://localhost:5173` e inicie sesión como administrator o coordinator.
2. Visite `/app/admin/invitations` y use un destinatario nuevo con dominio `.invalid`.
3. Abra `http://127.0.0.1:54324`, seleccione ese correo y siga el enlace local.
4. Acepte, establezca la contraseña de fixture y complete nombre/idioma.

No copie cuerpos, tokens o enlaces de Mailpit al repositorio o a logs. El rate limit y TTL locales son fixtures, no configuración productiva.

## Verificar recuperación de sesión y autoridad

1. Inicie sesión como `administrator@example.invalid` y abra `/app/admin/invitations`.
2. Cambie repetidamente a otra pestaña y vuelva a la aplicación.
3. Compruebe en la red que `get_my_account_context` responde con estado `active` y que la URL permanece en el panel.
4. Abra `/account-blocked` directamente: una cuenta activa debe volver a una ruta operacional sin mostrar “Acceso no disponible”.
5. Un fallo temporal del contexto debe mostrar reintento; un permiso ausente debe mostrar acceso denegado para la función. Ninguno debe cerrar la sesión ni representar la cuenta como suspendida o archivada.

El listener distingue refresh de token o `SIGNED_IN` repetido para el mismo `user_id` de un cambio real de identidad. Los refetch conservan el último dato de TanStack Query para ese usuario; las claves de autoridad incluyen `user_id`, y el cambio real cancela y elimina la caché privada anterior.

## Verificaciones

```powershell
corepack pnpm verify
corepack pnpm test:functions
corepack pnpm exec supabase db lint --local --level warning
corepack pnpm db:test
corepack pnpm projects:test:concurrency
corepack pnpm --filter @sistema-voluntariado/web exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm account-lifecycle:test
```

`test:e2e` falla de forma explícita si `.env.local` no contiene URL/anon locales; no omite recorridos silenciosamente. El orquestador Node comprueba que no exista otro Edge Runtime, inicia exactamente un `functions:serve`, captura PID y log temporal, espera el contrato tipado `401/unauthenticated` y siempre detiene proceso y contenedor. Playwright inicia únicamente Vite bajo el nombre `Frontend`, usa un worker serial y requiere Auth, PostgreSQL y Mailpit. Su configuración obtiene la clave `service_role` local únicamente en el proceso Node para comprobar invariantes de Auth; no la expone a Vite ni al navegador.

No se usa `OPTIONS` como readiness porque Kong devuelve 200 incluso para rutas inexistentes. La comprobación envía un `POST` sin JWT con origen permitido y exige la respuesta JSON propia del handler. Un 502/503 firmado por Kong solo significa que el gateway está disponible y la Function aún no; una respuesta inesperada o un contenedor previo aborta con diagnóstico. Si aparece ese diagnóstico, ejecute `corepack pnpm db:stop`, luego `db:start` y `db:reset`; no active `reuseExistingServer` para ocultarlo.

`verify` es el gate estático y no requiere Docker. `test:functions` prueba el handler puro; DB, concurrencia y E2E requieren Supabase local. `projects:test:concurrency` se ejecuta después de `db:reset`, controla dos conexiones PostgreSQL mediante `pg_blocking_pids`, valida ambos órdenes assign/close y elimina sus fixtures, sesiones y locks. `account-lifecycle:test` ejecuta funciones, reconstruye la base local, aplica lint SQL, corre pgTAP, prueba la concurrencia de Projects y finaliza con E2E; no depende del estado residual de una ejecución anterior.

La URL del navegador, `site_url`, los redirects de Auth y la allowlist de Functions usan el mismo origen exacto `http://localhost:5173`. No mezcle `localhost` con `127.0.0.1`: para CORS y redirects son orígenes distintos.

Detenga servicios preservando volúmenes con `corepack pnpm db:stop`. `db:reset` reemplaza exclusivamente la base local con migraciones/seed, retira el runtime Edge automático y nunca debe apuntar a un proyecto remoto. Para reproducir Actions en Linux consulte `continuous-integration.md`.
