# Política de dependencias

1. Usar solo pnpm `11.9.0` con Node `22.18.0` y lockfile.
2. Agregar un paquete únicamente si existe un import, script o prueba inmediato.
3. Preferir APIs estándar y paquetes mantenidos, estables y compatibles.
4. Revisar licencia, scripts de instalación, transitivas y alertas antes de integrar.
5. No ejecutar scripts de instalación sin autorización explícita en `allowBuilds`.
6. Actualizar por cambios pequeños, ejecutar `pnpm install --frozen-lockfile` en CI y revisar el diff del lockfile.
7. Retirar dependencias sin consumidores.

No se usan Yarn, Bun, npm install ni paquetes globales para construir el proyecto.

## Registro Excel del hito 0003

- `read-excel-file` se usa únicamente en el adaptador de infraestructura para leer `.xlsx` en navegador como filas tipadas.
- `write-excel-file` se usa únicamente en ese adaptador para plantilla y exportación `.xlsx`.
- `fflate` se declara directamente para inspeccionar el directorio ZIP, contar bytes realmente descomprimidos y extraer únicamente `workbook.xml`, sus relationships y una worksheet ya acotada antes de entregar el libro al parser principal; ya era una tecnología transitiva del lector, pero el import propio exige dependencia explícita.
- Se eligieron paquetes enfocados, MIT, sin scripts de instalación y con soporte de navegador, en lugar de incorporar una suite de hojas de cálculo más amplia. El lockfile fija las versiones resueltas y `pnpm install --frozen-lockfile` verifica reproducibilidad.
