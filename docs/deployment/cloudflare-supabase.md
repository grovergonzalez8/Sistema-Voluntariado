# Despliegue futuro: Cloudflare y Supabase

No existe despliegue automático en esta fase.

## Objetivo

- Frontend estático Vite en Cloudflare.
- Base, Auth y Storage en Supabase administrado.
- Entornos separados: local, preview y production, cada uno con proyecto/variables propios.

## Variables

Cloudflare recibirá `VITE_SUPABASE_URL` y la clave anon del entorno. `service_role`, credenciales de base y tokens de administración solo vivirán en secretos de CI/backend autorizados, nunca con prefijo `VITE_`.

La Edge Function `manage-account-invitation` se desplegaría en Supabase, no en Cloudflare. Requiere secretos de servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, un `APP_ORIGIN` canónico para redirects y una `ALLOWED_ORIGINS` exacta para CORS. Producción debe conservar la verificación JWT del gateway además de la validación del handler; `--no-verify-jwt` es exclusivamente un ajuste del servidor local.

## Migraciones y rollback

Aplicar migraciones verificadas de forma progresiva, con backup previo y aprobación. El rollback preferido es una migración correctiva hacia delante; una restauración requiere procedimiento operativo y evaluación de pérdida de datos.

## Pendientes antes de producción

- Dominios, redirect URLs y CSP/headers.
- SMTP/remitente, plantillas, TTL y rate limits de invitación aprobados.
- Runbook de reconciliación Auth/PostgreSQL y alertas de `delivery_failed`.
- MFA y procedimiento break-glass para administradores.
- Invalidación global de sesiones al suspender/archivar, si negocio la exige.
- Proceso de preview y promoción.
- Backups, pruebas de restauración y retención.
- Rotación de secretos y respuesta a exposición.
- Observabilidad sin PII.
- Ventanas, responsables y runbook de migración.
