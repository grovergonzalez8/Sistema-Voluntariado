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
- La asignación Project–Volunteer es directa, activa por `ended_at is null`, histórica al finalizar y sin aprobación o eliminación.
- Cerrar falla mientras existan Project Volunteer Assignments activos y nunca los finaliza automáticamente.

## Resueltas en el hito 0005

- El alcance de `project_manager` es una relación histórica explícita entre `accounts` y `projects`, no un framework genérico.
- Las altas exigen cuenta y proyecto activos, rol/permiso vigentes y ausencia de scope activo equivalente.
- El cierre no finaliza scopes previos: `closed + active manager scope` es válido, mientras `closed + active volunteer assignment` sigue prohibido.
- Suspensión, archivo, pérdida de rol/permiso o finalización del scope corta la autoridad dinámicamente sin borrar el histórico.

## Resueltas en el hito 0006

- Project Activity pertenece exactamente a un Project y usa `scheduled`, `completed` y `cancelled`; solo `scheduled` es mutable y ambos terminales son irreversibles.
- Una Activity solo se crea o muta en Project `active`; cualquier Activity `scheduled` impide el cierre sin ser completada, cancelada, eliminada ni retimestamped automáticamente.
- Administrator usa `project.manage`; project manager hereda `project.read_assigned`/`project.manage_assigned` junto con su scope dinámico. Los placeholders `activity.create`/`activity.join` no autorizan esta V1.
- Attendance, RSVP, responsables individuales, Tasks, recurrencia, notificaciones y calendarios externos quedan deliberadamente fuera de alcance.

## Resueltas en el hito 0007

- Activity Participation es una relación histórica entre `project_activities` y el padrón `volunteers`; no usa cuentas/Auth ni copia contacto o metadata.
- Solo una Activity `scheduled` de un Project `active` admite alta/finalización, y el Volunteer necesita un Project Volunteer Assignment activo hacia ese Project exacto.
- `ended_at is null` significa que no se finalizó explícitamente; Activity terminal o Project cerrado vuelve la fila histórica read-only sin completar ese timestamp automáticamente.
- Una Participation no finalizada en Activity `scheduled` bloquea finalizar el Assignment correspondiente. Una Participation finalizada o una Activity terminal no bloquea.
- Administrator usa `project.manage`; project manager usa lectura/mutación asignada con cuenta, rol, permiso y scope vigentes. Attendance, RSVP, self-join y Tasks no forman parte de esta V1.

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
13. Resuelta en Invitation Flow Hardening V1: un administrador con `invitation.recover` usa el recovery idempotente y auditado únicamente cuando Auth/Account/Invitation prueban ownership bilateral; crea una autorización nueva y conserva la cuenta `invited`. Si la prueba falla, se requiere revisión humana y no se modifica Auth.
14. Resuelta en Invitation Flow Hardening V1: `account.activate` solo recupera un `pending_profile` completo cuando Auth está confirmado, existe invitación aceptada con challenge consumido, rol vigente y perfil completo. Nunca fuerza activación ni salta onboarding.
15. ¿Qué política de retención, anonimización, archivo y fusión se aplicará al padrón histórico?

Hasta responderlas se aplica la decisión de menor privilegio y se evitan evoluciones que dependan de esas respuestas.
