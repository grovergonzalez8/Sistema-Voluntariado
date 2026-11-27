# ExecPlan 0015 — Orden de bloqueos administrativos (AUD-002)

- Fecha: 2026-11-22. Estado: implementado, gates no destructivos aprobados.
  APTO PARA COMMIT CON VERIFICACIÓN PARCIAL; concurrencia real NO EJECUTADA.
- Rama `main`, HEAD inicial `34d46e3`, Git limpio. AUD-001/003/004 registrados.
- Plan creado antes de código. Número 0015 libre. Instrucciones raíz/Supabase,
  PLANS, ADR 0003/0005/0006/0012, modelo de amenazas, diccionario y planes
  0002/0008 revisados. Skills architecture-check y database-migration-review.

## Objetivo y alcance

Eliminar la inversión entre el wrapper público de cambio de estado y la
administración de roles, manteniendo firmas, contratos, grants, RLS, último
administrador, restricciones propias, procedencia de recovery y auditoría.
Solo nueva migración forward-only, regresiones y documentación AUD-002.
Migraciones históricas, UI, dependencias y correcciones anteriores inmutables.
La verificación se limita a la administración de cuentas.

## Diagnóstico e inventario

La migración 202609070011 renombra el cambio de estado original a legacy y crea
un wrapper que toma la fila antes de invocar legacy. Solo ese wrapper invierte
el mutex administrativo `G = pg_advisory_xact_lock(20260724, 1)`.

| Función                                                                           | Orden en HEAD inicial                                              | Invariante / alcance                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| change_account_status                                                             | cuenta A → verificaciones recovery → legacy → G                    | Procedencia de activación, luego lifecycle                       |
| change_account_status_legacy                                                      | G → cuenta A → user_roles si activación → history/audit            | Transición, último admin, autoridad, trazabilidad; owner-only    |
| manage_account_role                                                               | G → permiso → cuenta A → user_roles → cuenta → audit               | Policy explícita, no auto roles, último admin; mismo G           |
| prepare_account_invitation_recovery_v1                                            | mutex de intención actor/key → request → cuenta → invitación       | Ownership e idempotencia; no solicita G                          |
| prepare/create/action V2/V3                                                       | mutex intención V3 → request/replay → V2 email → invitación/cuenta | Claves distintas; no solicita G                                  |
| accept_current_account_invitation_v3 y complete_current_account_profile_v2/legacy | cuenta/invitación/perfil/rol según operación                       | No solicitan G; wrappers de challenge no llaman cambio de estado |
| Mutaciones Projects endurecidas                                                   | cuenta actor/scope → recursos Projects                             | No solicitan G ni llaman RPC administrativas de cuentas          |

Antes del arreglo, G solo aparece en legacy de estado y manage_account_role.
Otros advisory locks
usan claves hash/bigint, distintas del espacio de dos enteros de G. Se revisará
el inventario con seguridad y arquitectura antes del cierre.

### Grafo antes

```text
status T1 posee A; espera G (legacy)
roles  T2 posee G; espera A
A → G → A: ciclo, posible 40P01
```

### Diseño elegido y grafo después

Reemplazar únicamente el wrapper con la misma definición, añadiendo G después
de auth.uid no nulo y antes del primer FOR UPDATE. Legacy conserva su adquisición
reentrante de G. Roles permanece igual. Ambos siguen G → A → cambios dependientes.
No existe A → G dentro de esos entrypoints. Esperar G no retiene A; la sesión
propietaria puede terminar y liberar G. No se quita serialización ni se añaden
reintentos. La autorización se sigue comprobando en legacy después de G.

Alternativas descartadas: mover solo el lock legacy (no arregla wrapper), quitar
el lock global (carrera último admin), retries 40P01 (oculta causa), reemplazar
legacy completo (duplica reglas), añadir locks de actor/roles o rediseñar todos
los entrypoints (amplía el alcance y puede introducir ciclos nuevos).

## Riesgos y seguridad

- Mantener SECURITY DEFINER, search_path vacío, nombres cualificados y ACL.
- No cambiar política ni permisos. Espera global ya existente, ahora anterior a A.
- No adquirir filas de actor antes de G. Actor/permiso se obtienen del JWT/DB,
  nunca de parámetros de cliente.
- El orden cubre RPC administrativas en transacciones normales de entrada;
  un cliente privilegiado que tome filas manualmente antes de RPC puede violarlo.
- Inspección estática no demuestra ausencia de deadlocks: falta concurrencia real.

## Pruebas y criterios de aceptación

Harness con sesiones psql independientes y observador pg_locks/pg_stat_activity,
barrera de espera real, SQLSTATE explícitos y timeouts acotados. Cubrir orden
roles→estado (reproduce original), estado→roles, misma/distinta cuenta,
simultaneidad, último administrador, no auto roles, denegaciones, rollback,
history/audit/authority_version y ausencia de sesiones/locks residuales.
Pruebas pgTAP de contrato/ACL/guardas complementan el harness, no lo sustituyen.

Antes de ejecutar SQL: identificar destino local aislado y descartable, demostrar
ausencia de datos reales y explicar comandos/efectos; pedir autorización explícita.
No hay entorno autorizado todavía. No ejecutar migraciones, resets, pruebas DB,
Docker start/stop ni acceder a bases disponibles por inferencia.
Se implementarán pruebas ejecutables, pero quedarán NOT EXECUTED sin autorización.

## Fases y evidencia

- [x] Baseline e inspección; inversión confirmada por código actual.
- [x] Plan previo al código.
- [x] Migración nueva y pruebas sin ejecución DB.
- [x] Revisión de arquitectura, seguridad PostgreSQL y concurrencia (solo lectura).
- [x] Formato/lint/boundaries/arquitectura/TypeScript/unitarias/verify/diff-check.
- [x] Informe y limitaciones; no marcar concurrencia real verificada.

Node 22.20.0 y pnpm 11.9.0 confirmados frente al pin 22.18.0, sin cambiar
versiones ni instalar dependencias. PATH de CorepackShims y Corepack sin red.
No commits/push/deploy.

## Implementación y revisiones

- Migración nueva `202611220014_account_administration_lock_order.sql`, posterior
  a 0013. Sustituye únicamente change_account_status, con ACL explícita idéntica.
  Comparación textual normalizada ejecutada: definición/ACL original exacta al
  quitar CREATE OR REPLACE y las líneas de G/comentarios. No DML de datos reales.
- No modifica legacy ni manage_account_role. No toca tablas, RLS, índices,
  funciones de Projects, firma de RPC ni reglas de recovery.
- `0014_account_administration_lock_order.test.sql`: 8 checks pgTAP de ACL,
  legacy inaccesible, SECURITY DEFINER/search_path, retorno, RLS y denegaciones.
  NO EJECUTADO. Activación/provenance mantiene las regresiones SQL existentes,
  cuya reejecución también está pendiente; no se atribuye PASS histórico.
- Harness `scripts/account-administration-concurrency.test.mjs`: 23 subcasos con
  conexiones psql independientes; dos órdenes sobre misma/distinta cuenta (4),
  RPC simultáneas (1), rollback de cada clase (2), tres pares de reducción del
  último admin con ambos órdenes (6), permiso revocado durante espera de G (2),
  auto roles/autoridad/policy/anon/legacy/razón inválida (8).
  SQLSTATE, estado/roles/versiones, correlación history/audit y limpieza se
  comprueban. Barrera espera G por pg_locks/pg_blocking_pids; no usa pg_sleep.
  NO EJECUTADO: no se reprodujo 40P01 en servidor ni se probó su ausencia.
- Refusal tests `scripts/account-administration-harness.test.mjs`: 5 casos que
  rechazan opt-in/ID/DOCKER_HOST inválidos antes de acceder a Docker; no son mocks
  de PostgreSQL ni una prueba de concurrencia.
- Destino protegido: proyecto dedicado diferente al stack normal, ID exacto,
  contexto Docker inspeccionado y fijado con socket local (sin DOCKER_HOST),
  volúmenes propios/locales sin opciones remotas/binds y sin host networking.
  psql usa socket explícito dentro del contenedor. PostgreSQL 17 y tablas de
  negocio vacías se exigen antes del primer DML. No descubre ni crea instancias.
- Setup y cleanup usan UUID de fixtures propios. Setup dentro de try/finally;
  agregación de errores, cierre independiente con deadline y terminación de
  procesos propios. No elimina fixtures si no puede confirmar workers cerrados;
  reporta residuos no comprobados. Comprueba liberación de G y tablas vacías.
- Arquitectura, seguridad PostgreSQL y QA: GO estático, tras incorporar sus
  hallazgos. Diagnóstico psql por stdout junto a SQLSTATE evita la carrera con
  stderr; actor audit IS DISTINCT FROM detecta NULL; promises pendientes tienen
  manejo inmediato; cierre independiente y validación de contexto/volúmenes.
  Revisores no ejecutaron Docker/DB/gestores/pruebas ni modificaron archivos.

## Evidencia no destructiva

| Comando / comprobación                                           | Resultado real                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| node --check scripts/account-administration-concurrency.test.mjs | Aprobado; solo parse JavaScript                                                                                                           |
| node --test scripts/account-administration-harness.test.mjs      | 5/5 aprobadas; no alcanzaron Docker/SQL                                                                                                   |
| ESLint focalizado de ambos scripts                               | Primer intento 9 no-undef; corregidos con imports/globalThis, segundo aprobado sin supresiones                                            |
| corepack pnpm verify                                             | Código 0; formato, lint, boundaries, arquitectura con 4 probes negativos, TypeScript, orquestación, unit/integración y build              |
| TypeScript por Turbo                                             | 3/3 tareas desde caché; funciones tsc ejecutado aparte aprobado                                                                           |
| test:ci-orchestration / test:local-smtp-orchestration            | 16/16 y 11/11 ejecutadas, dependencias simuladas; sin servicios ni resets reales                                                          |
| Unitarias / integración / build                                  | Caché Turbo válida: 446/446 en 47 archivos, 4/4 en 2 archivos y build de 486 módulos; no se presentan como nueva ejecución de Vitest/Vite |
| git diff --check                                                 | Aprobado; se repite al cerrar documentación                                                                                               |

El gate verify no incluye este harness, pgTAP ni validación SQL en servidor.
Se repiten formato y diff-check después de cerrar solo documentación, sin
repetir suites aprobadas sin nuevos cambios de código.

## Pendientes y límites

- PostgreSQL real, pgTAP (8 nuevos más existentes), aplicación de migración y
  SQL lint: NO EJECUTADOS. No hay instancia identificada como descartable y
  autorizada. No se ejecutó Docker ni SQL real.
- E2E: NO EJECUTADO; fuera de la verificación no destructiva autorizada.
- Node 22.18.0: pendiente; el entorno observado no cumple el pin exacto.
- No existe evidencia roja/verde de concurrencia real. La inversión es un
  diagnóstico estático y el fix una corrección revisada, no una prueba de ausencia
  operacional de deadlocks. No marcar AUD-002 completamente verificado.
- Fallos de transporte pueden impedir confirmar limpieza; el harness falla y
  conserva fixtures cuando no puede probar que terminaron los workers. No
  garantiza cancelar transacciones de terceros ni operaciones privilegiadas que
  tomen filas manualmente antes de invocar RPC. Serialización global conservada.

Comandos futuros y efectos están descritos en `supabase/tests/README.md`.
Las variables AUD002 no cambian el destino de la CLI Supabase: db:test necesita
un checkout/configuración dedicado aprobado, no la configuración normal actual.
Antes/después real requiere esquema hasta 0013 y luego 202611220014 en entornos
descartables autorizados; no editar históricos ni ejecutar esos pasos por defecto.
Consultar y aprobar explícitamente instancia y comandos antes de cualquier DML,
migración o prueba. El opt-in del script no sustituye autorización humana.

Referencia primaria: [PostgreSQL 17 locks](https://www.postgresql.org/docs/17/explicit-locking.html)
y [psql 17 variables](https://www.postgresql.org/docs/17/app-psql.html).

## Inventario y entrega

Dos archivos existentes modificados: `CHANGELOG.md`, `supabase/tests/README.md`.
Cinco archivos nuevos: esta planificación, la migración, pgTAP y ambos scripts.
No cambios en UI, contratos, versiones, lockfile, migraciones históricas ni planes
anteriores. Rama main/34d46e3 sin staging, commit ni push.

Secuencia recomendada: revisión humana del diff/evidencias; si se autoriza,
commit único AUD-002 con verificación parcial claramente documentada. La ejecución
DB posterior requiere autorización separada y completar evidencia antes/después.
