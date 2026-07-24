# ADR 0004: Clean Architecture por módulo

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

UI y proveedor de datos cambiarán con más probabilidad que las reglas.

## Decisión

Separar dominio, aplicación, infraestructura y presentación cuando cada capa tenga comportamiento real.

## Alternativas

Organización solo por tipo técnico o abstracción completa desde el inicio.

## Consecuencias

Casos de uso probables y adaptadores reemplazables; más archivos en recorridos pequeños.

## Riesgos

Sobreingeniería. No se crean capas/directorios vacíos ni repositorios genéricos.
