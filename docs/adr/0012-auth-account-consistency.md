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
