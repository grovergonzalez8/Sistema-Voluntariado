# Visión del producto

Sistema-Voluntariado será la fuente operacional para personas voluntarias y responsables autorizados. Debe reducir coordinación manual sin convertir información personal en un catálogo abierto ni asumir reglas todavía desconocidas.

## Resultado de esta entrega

Las personas usuarias entran exclusivamente por invitación, completan el perfil mínimo y acceden según el estado y los permisos efectivos de su cuenta. Una cuenta activa puede consultar y actualizar únicamente su propio `display_name` y `preferred_locale`; responsables autorizados pueden gestionar invitaciones, roles y estados de cuenta con historial y auditoría. Correo y credenciales de las cuentas pertenecen a Supabase Auth.

De forma separada, administrator dispone de un padrón institucional de voluntarios actuales e históricos con nombre, correo opcional y celular opcional. Un registro del padrón no es una cuenta, no crea Auth ni invitaciones y puede pertenecer a alguien que nunca use la aplicación. El padrón permite consulta paginada, alta, edición e importación/exportación Excel. No se capturan documentos, información médica, datos financieros ni contactos de emergencia.

Administrator también gestiona proyectos administrativos mínimos y vincula directamente registros del padrón. Un proyecto activo admite participaciones; cada participación conserva inicio y finalización de servidor. Finalizar mantiene el histórico y el proyecto solo puede cerrarse cuando no quedan participaciones activas. Administrator puede asignar cuentas `project_manager` activas a proyectos activos. Cada manager ve solo sus proyectos con scope vigente, puede editar sus datos descriptivos y gestionar participaciones según el lifecycle existente. El scope histórico es independiente del cierre del proyecto y la autoridad se revalida en cada operación. No existe un framework genérico de scopes, aprobación, capacidad, calendario, actividades ni acceso del voluntario.

## Evolución futura

Grupos, alojamiento, actividades, reuniones, tareas, flujos de aprobación, notificaciones, incidencias y finanzas se incorporarán por recorridos verticales después de acordar reglas. Ninguno existe como funcionalidad o tabla en esta entrega.

## Principios de producto

- Pedir el mínimo dato necesario y explicar su uso.
- Basar autorización en permisos concretos.
- Distinguir propuesta, revisión y confirmación en flujos sensibles.
- Hacer visibles estados reales; no mostrar pantallas ficticias.
- Diseñar para español y preparar inglés desde el inicio.
