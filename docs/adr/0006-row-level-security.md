# ADR 0006: RLS como defensa principal

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

El navegador no es confiable y accede a Data API con clave pública.

## Decisión

Activar RLS y denegar por defecto; combinarla con permisos de columna y helpers mínimos.

## Alternativas

Confiar en UI, API intermedia o solo grants de tabla.

## Consecuencias

Acceso horizontal bloqueado en datos; mayor rigor SQL y pruebas locales obligatorias.

## Riesgos

RLS no proyecta columnas. Se revoca update general y se conceden campos permitidos.
