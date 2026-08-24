# Preguntas de negocio pendientes

## Resueltas en el hito 0002

- El alta es exclusivamente por invitación; el rol inicial sale del registro protegido y se aplica al completar el perfil.
- `accounts` posee el ciclo de vida; `profiles` conserva el perfil universal mínimo.
- Una identidad Auth sin cuenta aprovisionada se deniega por defecto. Una cuenta activa puede existir sin roles y, por tanto, sin permisos.
- Suspensión y archivo conservan historial/roles pero bloquean permisos; reactivación es administrativa y explícita.
- Una invitación revocada o vencida puede recibir una sucesora en la misma cuenta; nunca se crea otra cuenta para el correo.

## Resueltas en el hito 0003

- Se necesita una entidad `volunteers` separada del perfil universal para representar personas actuales e históricas sin crear Auth, cuenta, invitación ni onboarding.
- Email y teléfono son señales de posible duplicado, no claves únicas; el administrador puede confirmar históricos legítimos.

## Resueltas en el hito 0004

- La asignación de proyecto referencia exclusivamente el padrón `volunteers`, no Auth, cuentas o perfiles.
- Projects V1 es solo para administrator mediante `project.manage`; no introduce scopes ni activa project_manager/coordinator.
- El proyecto mínimo usa nombre, descripción opcional y estado `active|closed`; no hay capacidad ni calendario.
- La participación es directa, activa por `ended_at is null`, histórica al finalizar y sin aprobación o eliminación.
- Cerrar falla mientras existan participaciones activas y nunca las finaliza automáticamente.

## Pendientes

1. ¿Se separarán nombre legal, preferido y de presentación?
2. ¿Qué campos exactos forman el perfil básico visible para otros?
3. ¿Todos los responsables acumulan `volunteer` o cada rol recibirá permisos de perfil propios?
4. ¿Qué permiso permite modificar perfiles ajenos y qué campos abarca?
5. ¿Roles, invitaciones y cuentas tendrán alcance por organización, casa, proyecto, región o periodo?
6. ¿Se requieren denegaciones explícitas además de permisos aditivos?
7. ¿Cuál es el plazo productivo de invitación y qué cuotas/rate limits aplican?
8. ¿Qué retención y anonimización se exige para perfiles, invitaciones y auditoría?
9. ¿Qué procedimiento recupera una organización si su único administrador está comprometido?
10. ¿Reactivar una cuenta archivada requiere doble aprobación?
11. ¿Debe invalidarse globalmente el refresh token al suspender/archivar, además del bloqueo inmediato en RLS?
12. ¿Se permitirán cambios de correo y recuperación de contraseña desde la aplicación?
13. ¿Qué runbook recupera una identidad que Auth confirmó pero cuya invitación PostgreSQL fue revocada o venció antes de aceptarse? GoTrue no permite reinvitar esa identidad.
14. ¿Se conservará `account.activate` como recuperación administrativa excepcional de un perfil ya completo que quedó `pending_profile`, o requerirá soporte humano fuera de la UI?
15. ¿Qué política de retención, anonimización, archivo y fusión se aplicará al padrón histórico?

Hasta responderlas se aplica la decisión de menor privilegio y se evitan evoluciones que dependan de esas respuestas.
