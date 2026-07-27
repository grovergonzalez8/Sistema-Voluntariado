# Prompt 0004: orquestación E2E y Edge Function en CI

- Fecha: 2026-07-26
- Rama autorizada: `feat/account-lifecycle`
- Herramienta: agente principal de Codex

## Objetivo

Corregir el fallo reproducible de GitHub Actions donde Playwright aborta porque la ruta local de `manage-account-invitation` ya está ocupada. Debe existir un único propietario para Supabase local, Edge Functions, Vite y Playwright, con la misma lógica esencial local y en Linux CI.

## Restricciones

- No usar sleeps como solución, ni `reuseExistingServer` para ocultar duplicación.
- La readiness debe distinguir la Function real de Kong y de una ruta inexistente sin necesitar JWT ni exponer información sensible.
- Capturar PID y logs, fallar si el proceso no arranca, limpiar procesos/contenedores incluso ante error y diagnosticar propietarios inesperados.
- No cambiar tests funcionales para evitar el fallo, no usar sintaxis PowerShell en CI y no hacer push, rebase, amend, despliegue ni cambios en `main`.

## Validación requerida

Instalación congelada, `pnpm verify`, arranque/reset local, Functions, E2E, `account-lifecycle:test`, comando equivalente a Actions, diff check, scans y estado Git. La ejecución remota del PR es la confirmación definitiva de Actions.
