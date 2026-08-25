# Integración continua y E2E local

El job `Quality` usa los mismos scripts raíz que el desarrollo local. La diferencia de CI es que instala Chromium y exporta URL/clave anon locales para Vite; no cambia la propiedad de procesos.

## Propiedad y orden

| Servicio                                | Propietario                                                         | Momento                                | Puerto/URL                      | Teardown                                                            |
| --------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| Supabase DB, Auth, Kong, REST y Mailpit | workflow mediante `pnpm db:start`                                   | una vez antes de reset/DB/E2E          | 54321, 54322 y 54324            | paso `if: always()` con `pnpm db:stop`                              |
| Concurrencia Projects                   | `scripts/project-volunteer-assignments-concurrency.test.mjs`        | después de pgTAP y antes de E2E        | dos sesiones `psql` en DB local | rollback, cierre de sesiones y eliminación de fixtures en `finally` |
| `manage-account-invitation`             | `scripts/e2e-service-orchestrator.mjs` invocado por `pnpm test:e2e` | después de reset y antes de Playwright | ruta Functions sobre Kong 54321 | PID/grupo y solo el contenedor adquirido, en `finally`/señales      |
| Vite                                    | Playwright, servidor `Frontend`                                     | después de readiness de Functions      | localhost:5173                  | Playwright                                                          |
| Playwright                              | workflow mediante `pnpm test:e2e`                                   | último gate funcional                  | proceso Node                    | propio                                                              |

`supabase/config.toml` mantiene Edge Runtime automático deshabilitado. `db:start` lo excluye y `db:reset` elimina cualquier contenedor que la versión local de Supabase CLI intente recrear durante su fase `Restarting containers`. Playwright no declara Functions como `webServer` y no usa `reuseExistingServer` para ella. Vite conserva `reuseExistingServer: !CI` para permitir un servidor local deliberado; en CI cualquier ocupante previo de 5173 falla.

## Readiness y diagnóstico

El orquestador redirige stdout/stderr de Functions a un directorio temporal, conserva el PID, vigila salida prematura y consulta exclusivamente `manage-account-invitation`. La señal válida es HTTP 401, JSON `code = unauthenticated`, `Content-Type` JSON y cabeceras de métodos propias del handler. No necesita JWT y no revela datos.

- `OPTIONS 200` genérico no es válido: puede provenir solo de Kong.
- 404 `Function not found` y 502/503 de Kong significan “aún no disponible” solo si Auth confirma el gateway real.
- Auth `/auth/v1/health` debe responder el contrato tipado GoTrue y distingue un gateway Supabase sano de un puerto caído o un imitador.
- Otra respuesta, una Function ya activa o un contenedor Edge previo abortan sin reutilización.
- Si readiness, tests o teardown fallan, se conservan todos los errores y se imprime el log con patrones de tokens redactados. El teardown intenta de forma independiente detener Playwright/Vite, el grupo/PID de Functions y solo el contenedor adquirido; un runtime concurrente se informa y queda intacto.

## Equivalente Linux del job

Desde un clon limpio, con Docker disponible:

```bash
set -euo pipefail
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm test:functions
cp supabase/functions/.env.example supabase/functions/.env.local
pnpm db:start
trap 'pnpm db:stop || true' EXIT
pnpm db:reset
pnpm exec supabase db lint --local --level warning
pnpm db:test
pnpm projects:test:concurrency
pnpm --filter @sistema-voluntariado/web exec playwright install --with-deps chromium
status="$(pnpm exec supabase status -o env)"
export VITE_SUPABASE_URL="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<< "$status")"
export VITE_SUPABASE_ANON_KEY="$(sed -n 's/^ANON_KEY="\(.*\)"$/\1/p' <<< "$status")"
test -n "$VITE_SUPABASE_URL"
test -n "$VITE_SUPABASE_ANON_KEY"
CI=true pnpm test:e2e
```

Los servicios opcionales `imgproxy` y `pooler` pueden figurar detenidos. No son dependencias de la suite. La aprobación local no sustituye la nueva ejecución remota del Pull Request.
