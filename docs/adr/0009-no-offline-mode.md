# ADR 0009: Sin modo offline

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

No hay requisitos de conectividad ni conflictos offline definidos.

## Decisión

No implementar caché persistente, service worker ni sincronización offline.

## Alternativas

PWA offline-first o cola local.

## Consecuencias

Menos estados y riesgos; la aplicación necesita conexión.

## Riesgos

Uso en lugares con conectividad deficiente. Reconsiderar con evidencia y reglas de conflicto.
