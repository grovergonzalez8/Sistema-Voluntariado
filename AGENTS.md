# Instrucciones del repositorio

- Trabaja únicamente en la rama autorizada y conserva el historial.
- Para cambios materiales, crea o actualiza un ExecPlan conforme a `PLANS.md`.
- Usa Node.js `22.18.0`, pnpm `11.9.0` y los scripts raíz; no mezcles gestores.
- Mantén TypeScript estricto: no uses `any`, `@ts-ignore` ni desactives lint para ocultar errores.
- Respeta el monolito modular: dominio y aplicación no conocen React, navegador, SQL ni Supabase.
- Accede a Supabase solamente desde infraestructura y compón adaptadores en `apps/web/src/app/composition`.
- Niega acceso por defecto, no expongas `service_role` y no registres secretos ni datos personales.
- No implementes módulos futuros sin un ExecPlan aprobado y reglas de negocio suficientes.
- Ejecuta verificaciones incrementales y no declares éxito sin evidencia del comando.
- Usa agentes especializados para revisiones de solo lectura; el agente principal integra los cambios.
