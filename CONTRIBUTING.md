# Contribuir

## Flujo

1. Trabajar desde una rama breve basada en la rama acordada; no reescribir historial compartido.
2. Crear o actualizar un ExecPlan para cambios materiales.
3. Instalar exclusivamente con pnpm y lockfile.
4. Mantener cambios pequeños, pruebas cercanas y documentación coherente.
5. Ejecutar `pnpm verify`; para cambios SQL ejecutar también `pnpm db:test` contra Supabase local.
6. Abrir una revisión humana usando la plantilla de pull request.

## Convenciones

- Commits: Conventional Commits, por ejemplo `feat(profile): validate editable fields`.
- TypeScript estricto y APIs públicas explícitas por módulo.
- Migraciones inmutables una vez integradas; una corrección posterior se expresa en una migración nueva.
- Dependencias nuevas requieren uso inmediato, justificación y revisión del lockfile.
- Nunca incluir secretos, datos personales reales, tokens, exportaciones de producción ni claves `service_role` en frontend.

## Calidad

Todo cambio debe mantener formato, lint, límites arquitectónicos, typecheck, pruebas y build. No se omiten controles para obtener una ejecución verde. Las contribuciones asistidas por IA requieren la misma revisión humana y trazabilidad que cualquier otro cambio.
