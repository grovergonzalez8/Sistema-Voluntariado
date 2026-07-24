# ADR 0002: React, Vite y TypeScript

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

Se necesita una SPA accesible, tipada y desplegable estáticamente.

## Decisión

Usar React 19, Vite 8 y TypeScript 5.9 en modo estricto.

## Alternativas

Framework full-stack, plantillas servidor o JavaScript sin tipos.

## Consecuencias

Build rápido y contratos explícitos; autenticación/SEO dependen del cliente y de Supabase.

## Riesgos

Lógica en componentes. Se separan casos de uso y adaptadores.
