# ADR 0012: Cuenta de aplicación y consistencia con Supabase Auth

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

Supabase Auth posee identidades, credenciales, sesiones y enlaces; el dominio necesita estados de cuenta, invitaciones, autoridad, historial y reglas transaccionales que no pertenecen a metadata Auth. Invitar requiere una llamada Auth Admin externa a la transacción PostgreSQL.

## Decisión

Crear `accounts` como fuente del ciclo de vida y enlazarla opcionalmente con `auth.users` mediante `auth_user_id`. La Edge Function reserva primero cuenta/invitación en PostgreSQL, usa una clave idempotente y un lease antes de llamar Auth, y finaliza como `sent` o `delivery_failed`. Constraints diferidos mantienen coherencia entre el enlace de cuenta y el snapshot de invitación. Los reintentos buscan una coincidencia exacta de correo y metadata de invitación emitida por el servidor antes de volver a llamar Auth; cualquier ambigüedad falla de forma segura.

Una invitación terminal conserva la reserva de correo de su cuenta. `revoked` o `expired` puede recibir una sucesora `pending` en esa misma cuenta sin reabrir ni reetiquetar la fila histórica; no se crea una segunda cuenta. PostgreSQL niega el reemplazo si Auth ya confirmó la identidad: el spike local devolvió HTTP 422 al intentar reinvitar un usuario confirmado, por lo que esa excepción requiere revisión humana y nunca supersede primero para fallar después.

## Alternativas

- Usar `user_metadata`/`app_metadata` como estado y autoridad.
- Crear Auth primero sin reserva ni idempotencia.
- Exponer Auth Admin al navegador.
- Intentar compensación destructiva eliminando identidades ante cada fallo.

## Consecuencias

PostgreSQL puede aplicar transiciones, RLS, auditoría y protección concurrente; Auth conserva credenciales sin duplicación. La operación no es atómica entre sistemas y requiere estados de entrega, correlación, retry y runbook. En runtime productivo, `service_role` queda exclusivamente en el entorno de Edge Function. El runner E2E local obtiene la clave local en su proceso Node para verificar invariantes de Auth; nunca la entrega a Vite ni al navegador.

## Riesgos

Un ACK perdido puede dejar Auth adelantado respecto de PostgreSQL. Se mitiga con lease, identificador almacenado, reconciliación exacta, fallo seguro ante ambigüedad y auditoría sin correo, token ni secreto.

## Apéndice 2026-07-25: consistencia de sesión en el frontend

Los eventos Auth conservan su tipo. `TOKEN_REFRESHED`, `USER_UPDATED` y `SIGNED_IN` repetido para el mismo `user_id` actualizan la sesión e invalidan el contexto sin borrar su dato válido. Un cambio real de `user_id` cancela y elimina la clave de autoridad anterior antes de consultar la nueva identidad; `SIGNED_OUT` limpia los datos privados.

El estado de acceso es una unión discriminada: inicialización, no autenticado, autoridad en carga, activo, invitado, perfil pendiente, suspendido, archivado, prohibido y error recuperable. TanStack Query usa una clave que incluye `user_id`, conserva datos durante un refetch del mismo usuario y mantiene `refetchOnWindowFocus` para actualizar autoridad. Solo una consulta satisfactoria que confirme `suspended` o `archived` permite `/account-blocked`; un 403 de una mutación nunca cambia por sí mismo el ciclo de vida de cuenta.

## Apéndice 2026-09-04: generación Auth y saga durable

El spike local confirmó que reinvitar una identidad no confirmada invalida el link
anterior y conserva el mismo `auth_user_id`. Replace vuelve a invitar, actualiza por
API Admin `app_metadata.account_invitation_id`, registra un ACK durable y solo
después finaliza PostgreSQL. Un finalize perdido se reanuda con el mismo ACK sin
otro correo. Un lease activo responde `in_progress`; éxito previo responde
`replayed`.

La autorización de aceptación no usa “última invitación” ni `user_metadata`:
PostgreSQL exige el ID exacto de `app_metadata` firmado y el vínculo bilateral
Invitation/Auth. El mismo contexto se exige para completar perfil. Links terminales
pueden autenticar mientras Auth aún los considere válidos, pero no conceden
autoridad de aplicación. No se eliminan identidades automáticamente; una identidad
confirmada por link revocado/expirado requiere reconciliación administrativa.

## Apéndice 2026-09-05: procedencia por entrega y recuperación

Cada entrega genera un acceptance challenge aleatorio. El RAW solo se transporta
en `redirectTo` y en el callback efímero; PostgreSQL conserva únicamente su hash,
generación y consumo. Create, replace y resend rotan la generación; revoke,
expiry y cualquier terminalización la invalidan. `accept_current_account_invitation_v3`
exige sesión/Auth user, metadata técnica, generación vigente y challenge no
consumido, y consume la autorización una sola vez bajo lock.

La Edge Function serializa la reserva por actor y clave idempotente. Ante un lease
ambiguo o un ACK perdido reconcilia primero Auth mediante Admin API y metadata
técnica; solo si la evidencia es insuficiente marca `delivery_outcome_unknown` y
`recovery_required`. Auth aceptando una operación no demuestra entrega física en la
bandeja humana.
