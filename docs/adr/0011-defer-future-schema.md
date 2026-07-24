# ADR 0011: Diferir el esquema completo

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

Las entidades futuras están enumeradas, pero faltan estados, cardinalidades, alcances y reglas temporales.

## Decisión

Migrar solo identidad/autorización, perfil y auditoría inicial; documentar lo restante.

## Alternativas

Crear tablas vacías o anticipar reglas.

## Consecuencias

Esquema pequeño y verificable; futuras migraciones requerirán diseño adicional.

## Riesgos

Cambios posteriores en relaciones. Es preferible a consolidar supuestos falsos.
