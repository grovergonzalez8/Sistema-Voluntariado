# Preguntas de negocio pendientes

## Resueltas en el hito 0002

- El alta es exclusivamente por invitación; el rol inicial sale del registro protegido y se aplica al completar el perfil.
- `accounts` posee el ciclo de vida; `profiles` conserva el perfil universal mínimo.
- Una identidad Auth sin cuenta aprovisionada se deniega por defecto. Una cuenta activa puede existir sin roles y, por tanto, sin permisos.
- Suspensión y archivo conservan historial/roles pero bloquean permisos; reactivación es administrativa y explícita.
- Una invitación revocada o vencida puede recibir una sucesora en la misma cuenta; nunca se crea otra cuenta para el correo.

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
13. ¿Se necesita una entidad `volunteers` separada del perfil universal?
14. ¿Qué runbook recupera una identidad que Auth confirmó pero cuya invitación PostgreSQL fue revocada o venció antes de aceptarse? GoTrue no permite reinvitar esa identidad.
15. ¿Se conservará `account.activate` como recuperación administrativa excepcional de un perfil ya completo que quedó `pending_profile`, o requerirá soporte humano fuera de la UI?

Hasta responderlas se aplica la decisión de menor privilegio y se evita crear tablas o pantallas relacionadas.
