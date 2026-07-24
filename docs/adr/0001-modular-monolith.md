# ADR 0001: Monolito modular

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

El producto tiene muchos contextos futuros pero un único recorrido actual y un equipo/operación no definidos.

## Decisión

Usar una unidad desplegable con módulos y APIs públicas explícitas.

## Alternativas

Microservicios; aplicación sin límites.

## Consecuencias

Menor costo operacional y transacciones simples; exige disciplina automatizada de imports.

## Riesgos

Acoplamiento accidental o crecimiento de un módulo central. ESLint y revisiones mitigan ambos.
