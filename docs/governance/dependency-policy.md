# Política de dependencias

1. Usar solo pnpm `11.9.0` con Node `22.18.0` y lockfile.
2. Agregar un paquete únicamente si existe un import, script o prueba inmediato.
3. Preferir APIs estándar y paquetes mantenidos, estables y compatibles.
4. Revisar licencia, scripts de instalación, transitivas y alertas antes de integrar.
5. No ejecutar scripts de instalación sin autorización explícita en `allowBuilds`.
6. Actualizar por cambios pequeños, ejecutar `pnpm install --frozen-lockfile` en CI y revisar el diff del lockfile.
7. Retirar dependencias sin consumidores.

No se usan Yarn, Bun, npm install ni paquetes globales para construir el proyecto.
