# Visión del producto

Sistema-Voluntariado será la fuente operacional para personas voluntarias y responsables autorizados. Debe reducir coordinación manual sin convertir información personal en un catálogo abierto ni asumir reglas todavía desconocidas.

## Resultado de esta entrega

Las personas usuarias entran exclusivamente por invitación, completan el perfil mínimo y acceden según el estado y los permisos efectivos de su cuenta. Una cuenta activa puede consultar y actualizar únicamente su propio `display_name` y `preferred_locale`; responsables autorizados pueden gestionar invitaciones, roles y estados de cuenta con historial y auditoría. Correo y credenciales de las cuentas pertenecen a Supabase Auth.

De forma separada, administrator dispone de un padrón institucional de voluntarios actuales e históricos con nombre, correo opcional y celular opcional. Un registro del padrón no es una cuenta, no crea Auth ni invitaciones y puede pertenecer a alguien que nunca use la aplicación. El padrón permite consulta paginada, alta, edición e importación/exportación Excel. No se capturan documentos, información médica, datos financieros ni contactos de emergencia.

Administrator también gestiona proyectos administrativos mínimos y vincula directamente registros del padrón mediante Project Volunteer Assignments. Un proyecto activo admite Assignments y Project Activities con nombre, descripción opcional, inicio, fin opcional y ubicación textual opcional. Cada Activity nace `scheduled` y solo puede terminar `completed` o `cancelled`; los estados terminales son históricos. Administrator o manager contextual pueden seleccionar para una Activity solo Volunteers con Assignment activa hacia ese Project, conservar el histórico y finalizar la Participation explícitamente mientras el lifecycle siga abierto. En Activities completed registran Attendance `present|absent` por cada Participation; la ausencia de registro permanece visible como `Sin registrar` y el Project cerrado conserva todo read-only. El proyecto solo puede cerrarse cuando no quedan Assignments activos ni Activities programadas. Administrator puede asignar cuentas `project_manager` activas a proyectos activos. Cada manager ve solo sus proyectos con scope vigente y gestiona Assignments, Activities, Participants y Attendance dentro del lifecycle; la autoridad se revalida en cada operación. El scope histórico es independiente del cierre. No existe un framework genérico de scopes, aprobación, capacidad ni acceso del voluntario.

## Evolución futura

Grupos, alojamiento, asistencia genérica/por horas/check-in, RSVP, reuniones, tareas, recurrencia, calendarios externos, flujos de aprobación, notificaciones, incidencias y finanzas se incorporarán por recorridos verticales después de acordar reglas. Activity Attendance V1 queda limitada a `present|absent` sobre una Participation existente, con experiencia integrada en Participants; no anticipa esas extensiones.

## Principios de producto

- Pedir el mínimo dato necesario y explicar su uso.
- Basar autorización en permisos concretos.
- Distinguir propuesta, revisión y confirmación en flujos sensibles.
- Hacer visibles estados reales; no mostrar pantallas ficticias.
- Diseñar para español y preparar inglés desde el inicio.
