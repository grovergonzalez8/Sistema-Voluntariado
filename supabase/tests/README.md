# Pruebas de base de datos

Los archivos `*.sql` usan pgTAP contra Supabase local. Deben cubrir acceso anónimo, propiedad de fila, permisos concretos, columnas protegidas, acceso horizontal y escalamiento de privilegios. Los mocks no sustituyen estas pruebas.

## AUD-002: concurrencia administrativa

`0014_account_administration_lock_order.test.sql` añade 8 comprobaciones de
contrato/ACL. El harness real es `scripts/account-administration-concurrency.test.mjs`;
no forma parte de `verify`, no migra ni resetea, y no utiliza credenciales HTTP.
Las cinco pruebas de rechazo de `scripts/account-administration-harness.test.mjs`
son seguras sin Docker y **no prueban ausencia de deadlocks**:

```powershell
node --check scripts/account-administration-concurrency.test.mjs
node --test scripts/account-administration-harness.test.mjs
```

Antes de ejecutar SQL, el operador debe identificar y autorizar explícitamente
una instancia PostgreSQL 17 local, aislada y descartable, sin datos reales.
No usar el stack habitual, staging ni producción. Se requiere un stack dedicado
con proyecto/label `sistema-voluntariado-aud002` y contenedor
`supabase_db_sistema-voluntariado-aud002`, sin bind mounts ni red host. Los volúmenes
deben pertenecer al proyecto dedicado, usar driver local y no tener opciones
remotas. `DOCKER_HOST` debe estar vacío; el endpoint del contexto Docker resuelto
debe ser un socket Unix o named pipe local y se fija en todas las llamadas.
psql conecta exclusivamente al socket dentro del contenedor. Debe tener las
migraciones aplicadas y las tablas de negocio vacías, **sin seed**. Las tablas
de catálogo de roles/permisos pueden contener las entradas de las migraciones.
No se incluye aprovisionamiento automático: crear/aplicar migraciones también
requiere autorización previa y revisión de sus comandos/efectos.

Solo después de confirmar esa instancia y obtener autorización:

```powershell
# ID completo previamente inspeccionado y aprobado; nunca buscar uno automáticamente.
$env:AUD002_DISPOSABLE_CONTAINER = '<ID hexadecimal de 64 caracteres aprobado>'
$env:AUD002_ALLOW_DISPOSABLE_DB = 'I_AUTHORIZE_AUD002_FIXTURES'
node --test scripts/account-administration-concurrency.test.mjs
Remove-Item Env:AUD002_DISPOSABLE_CONTAINER, Env:AUD002_ALLOW_DISPOSABLE_DB
```

Efectos: crea usuarios/cuentas ficticios `@example.invalid`, roles y permisos
necesarios para fixtures, invoca las RPC reales en sesiones independientes y
comprueba estado, roles, versión, historial y auditoría. Termina únicamente
sesiones propias con nombres aleatorios y elimina únicamente fixtures por UUID;
comprueba después tablas vacías. No afecta Auth externo, no envía correos ni
modifica funciones. El opt-in es una guarda adicional, no sustituye la autorización
humana ni demuestra por sí solo que el contenedor sea descartable.

Los 23 casos usan `pg_locks`/`pg_blocking_pids` como barrera, SQLSTATE explícito,
deadlines y rollback. La espera legítima precede a la liberación del propietario;
`40P01`, `57014` y `55P03` son fallos, no conflictos de negocio aceptados.
Con migraciones hasta 0013, el caso roles→estado sobre la misma cuenta permite
reproducir el ciclo y debe fallar. Con 202611220014 aplicada, debe aprobar.
Ambas ejecuciones deben realizarse exclusivamente sobre entornos autorizados;
no editar migraciones históricas para preparar la reproducción.

La suite pgTAP completa, incluida la procedencia de activación de
`0002_account_lifecycle.test.sql`, se ejecuta por separado con
`corepack pnpm db:test` solo desde un contexto Supabase local descartable aprobado.
El harness exige tablas vacías y no es compatible con un seed persistido.
Las variables `AUD002_*` solo seleccionan el destino del harness: **no cambian el
destino de la CLI Supabase**. La configuración actual de este repositorio apunta
al proyecto habitual `sistema-voluntariado`; no ejecutar allí `db:test` para esta
tarea. La ejecución SQL requiere un checkout/configuración dedicado aprobado,
cuyos comandos y destino se deben concretar antes de pedir autorización.
