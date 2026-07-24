# ADR 0007: pnpm workspaces y Turborepo

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

La aplicación y configuraciones compartidas requieren instalación y tareas reproducibles.

## Decisión

Usar pnpm `11.9.0` y Turbo únicamente para orquestar build, typecheck y pruebas.

## Alternativas

npm, Yarn, scripts manuales o herramientas de monorepo más amplias.

## Consecuencias

Lockfile único y tareas coherentes; otro nivel de configuración.

## Riesgos

Reglas de negocio en Turbo o paquetes prematuros. Se prohíben ambos.
