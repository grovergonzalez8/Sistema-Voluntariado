# Preguntas de negocio pendientes

1. ¿`profiles` representa toda cuenta o solamente personas voluntarias?
2. ¿Se separarán nombre legal, preferido y de presentación?
3. ¿Qué campos exactos forman el perfil básico visible para otros?
4. ¿El alta será por invitación, autoservicio o administración?
5. ¿Quién asigna el primer rol y valida que una cuenta esté provisionada?
6. ¿Todos los responsables acumulan el rol `volunteer` para gestionar su perfil?
7. ¿Qué permiso permite modificar perfiles ajenos y qué campos abarca?
8. ¿Roles y permisos tendrán alcance por casa, proyecto, región o periodo?
9. ¿Se requieren denegaciones explícitas además de permisos aditivos?
10. ¿Qué significan suspensión, archivo, finalización y eliminación de cuenta?
11. ¿Qué retención y anonimización se exige para perfiles y auditoría?
12. ¿Qué operaciones adicionales deben auditarse y quién puede leerlas?
13. ¿Debe existir control optimista de concurrencia al editar perfiles?
14. ¿Qué ocurre si una cuenta autenticada no tiene perfil o rol?
15. ¿Se permitirán cambios de correo o contraseña desde la aplicación?
16. ¿Qué capacidades exactas recibe cada rol no voluntario?
17. ¿Se necesita una entidad `volunteers` separada del perfil universal?

Hasta responderlas se aplica la decisión de menor privilegio y se evita crear tablas o pantallas relacionadas.
