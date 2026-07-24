# Instrucciones de la aplicación web

- Aplica además el `AGENTS.md` raíz.
- Mantén módulos con `domain`, `application`, `infrastructure` y `presentation` solo cuando tengan archivos reales.
- `domain` no importa frameworks; `application` depende de dominio y shared-kernel; solo `infrastructure` importa Supabase.
- Los componentes no contienen reglas de negocio ni consultan repositorios directamente.
- Compón puertos y adaptadores en `src/app/composition`; consume otros módulos únicamente por su `index.ts` público.
- Valida entradas externas, trata estados de carga/error/vacío/éxito y preserva accesibilidad e internacionalización.
- Coloca pruebas junto al comportamiento o en `tests` según su alcance.
