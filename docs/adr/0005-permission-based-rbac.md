# ADR 0005: RBAC basado en permisos

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

Una persona puede acumular roles y los nombres no expresan todas las capacidades.

## Decisión

Autorizar por códigos de permiso explícitos derivados de roles aditivos.

## Alternativas

Comparar nombres de rol, claims amplios o ACL por usuario.

## Consecuencias

Matriz auditable y extensible; necesita catálogo y asignación gobernados.

## Riesgos

Comodines o concesiones excesivas. Incluso administrador recibe permisos enumerados.
