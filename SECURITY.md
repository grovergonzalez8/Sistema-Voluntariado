# Política de seguridad

## Reporte responsable

No abra un issue público para vulnerabilidades. Contacte de forma privada al propietario o al canal de seguridad designado por la organización e incluya impacto, pasos mínimos de reproducción y versión afectada. Como todavía no existe un contacto público aprobado, solicite al propietario el canal privado antes de compartir detalles sensibles.

No incluya secretos, tokens, datos personales reales ni pruebas contra sistemas remotos. No explote más allá de lo necesario para demostrar el problema.

## Alcance inicial

La seguridad cubre la aplicación web, migraciones PostgreSQL, funciones, RLS, autenticación y dependencias. RLS y permisos de columna son controles obligatorios; la navegación del frontend no es una frontera de seguridad.

## Respuesta

El propietario confirmará recepción, clasificará el riesgo, coordinará una corrección y comunicará cuándo puede divulgarse. No se prometen plazos hasta establecer un proceso organizacional formal.

## Datos y secretos

No se almacenan pasaportes, información médica, documentos de identidad, datos financieros ni archivos personales en esta fase. La clave `service_role` nunca pertenece al navegador. Consulte `docs/security/threat-model.md` para riesgos y controles.
