# ADR 0003: Supabase y PostgreSQL

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

La aplicación requiere Auth y control de acceso por fila con baja infraestructura inicial.

## Decisión

Usar Supabase Auth/Data API y PostgreSQL, desarrollados primero en entorno local.

## Alternativas

Backend propio, otro BaaS u ORM con servidor dedicado.

## Consecuencias

RLS cerca de los datos y menos backend; el esquema debe dominar políticas y grants.

## Riesgos

Acoplamiento al SDK y políticas defectuosas. Solo infraestructura conoce el SDK y pgTAP verifica RLS.
