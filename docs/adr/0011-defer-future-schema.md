# ADR 0011: Diferir el esquema completo

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

Las entidades futuras están enumeradas, pero faltan estados, cardinalidades, alcances y reglas temporales.

## Decisión

En el hito fundacional, migrar solo identidad/autorización, perfil y auditoría inicial; documentar lo restante. Cada contexto posterior exige reglas suficientes, una migración convencional y un ExecPlan propio, sin anticipar su modelo.

El hito 0003 aplicó esta regla al padrón administrativo: incorporó únicamente `volunteers` y sus operaciones V1 después de definir separación de cuentas, datos mínimos, duplicados, acceso y auditoría. Documento, participación, estado/archivo y demás contextos continúan diferidos.

El hito 0004 aplica la misma regla a Projects: incorpora solo `projects` y `project_volunteer_assignments` después de definir sujeto institucional, lifecycle mínimo, acceso exclusivo, histórico, cierre y concurrencia. Scopes, project_manager, capacidad, calendario, aprobación, actividades y demás entidades de proyecto continúan diferidos.

Los hitos 0005 y 0006 aplicaron después la misma decisión incremental: 0005 incorporó únicamente el scope histórico de project manager y 0006 únicamente `project_activities` con lifecycle terminal, agenda mínima y cierre/concurrencia definidos. Participación/asistencia por Activity, Tasks, recurrencia, calendarios, capacidad y aprobación continúan diferidos.

## Alternativas

Crear tablas vacías o anticipar reglas.

## Consecuencias

Esquema pequeño y verificable; futuras migraciones requerirán diseño adicional.

## Riesgos

Cambios posteriores en relaciones. Es preferible a consolidar supuestos falsos.
