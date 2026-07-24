# Reglas de dependencias

1. Las dependencias apuntan hacia el dominio.
2. Solo `infrastructure` importa `@supabase/supabase-js`.
3. Dominio y aplicación no importan React, navegador, SQL ni variables Vite.
4. React no instancia adaptadores ni consulta Supabase directamente.
5. La composición conecta puertos y adaptadores.
6. Los módulos se consumen por `index.ts`.
7. `packages/*` no importa `apps/*`.

ESLint aplica clasificación de capas con `eslint-plugin-boundaries`, reglas de imports restringidos y `pnpm lint:boundaries`. `pnpm lint:architecture` ejecuta cuatro casos negativos sobre archivos reales para probar que se rechazan frameworks en dominio, Supabase en aplicación, imports internos entre módulos y dependencias inversas. El typecheck estricto agrega `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y `useUnknownInCatchVariables`.

Una violación deliberada debe hacer fallar lint; no se silencian reglas para integrar un cambio.
