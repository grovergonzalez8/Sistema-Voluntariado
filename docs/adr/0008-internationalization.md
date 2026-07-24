# ADR 0008: Internacionalización desde el inicio

- Estado: aceptado
- Fecha: 2026-07-23

## Contexto

Hay personas nacionales y extranjeras; español es inicial e inglés será necesario.

## Decisión

Usar i18next/react-i18next con catálogos `es` y `en` desde el primer slice.

## Alternativas

Textos embebidos o migración posterior.

## Consecuencias

Claves estables y cambio de idioma preparado; disciplina al escribir UI.

## Riesgos

Traducciones incompletas. Las pruebas validan comportamiento, no frases accidentales.
