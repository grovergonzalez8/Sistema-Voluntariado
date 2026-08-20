# Prompt 0005 — Volunteer Registry V1

- Fecha: 2026-08-16
- Herramienta: Codex, GPT-5.6 Sol, reasoning medium
- Rama solicitada: `feat/volunteer-registry-v1`
- Base confirmada: `main@c6f7392`

## Objetivo y alcance recibido

Implementar la primera versión del Registro Administrativo de Voluntarios como base institucional de personas actuales e históricas. Un voluntario registrado no es un usuario: no crea Supabase Auth, `account`, invitación, onboarding ni vínculo automático con `volunteer-profile`.

Solo administrator puede listar, buscar, ordenar, registrar, consultar, editar, importar y exportar. La protección debe reutilizar RBAC y existir en navegación, rutas, aplicación, PostgreSQL/RLS y RPC. Los campos V1 son nombre completo, correo opcional y celular opcional; el teléfono es texto y debe preservar `+`, ceros y formato internacional.

La solución requiere módulo separado, migración nueva sin editar `202607230001_foundation.sql` ni `202607240002_account_lifecycle.sql`, modelo relacional simple, mínimo privilegio, auditoría existente y sin borrado físico. Debe soportar consulta server-side paginada, búsqueda por los tres campos, orden por nombre o fecha, detalle y edición.

No se permiten restricciones únicas automáticas para correo o teléfono. Se debe definir una política común de detección/advertencia y confirmación para alta, edición e importación, preservando duplicados históricos legítimos y cubriéndola con pruebas.

Excel debe usar una dependencia existente o una nueva dependencia pnpm mínima y justificada. El flujo preferido es seleccionar `.xlsx`, validar encabezados/filas/límites, mostrar preview con válidas, inválidas y posibles duplicadas, confirmar una importación con semántica y atomicidad explícitas y no guardar el archivo. La exportación debe incluir nombre, correo, celular y fecha de registro, idealmente para todo el conjunto lógico filtrado.

Se solicitaron estados completos de UI, pruebas de dominio/aplicación, PostgreSQL/RLS, frontend, Excel y un E2E crítico; verificaciones incrementales y baseline final completa: formato, lint, arquitectura, tipos, unitarias, integración, Edge Function, orquestación, build, DB lint, pgTAP, E2E, concurrencia y scans de seguridad.

## Exclusiones explícitas

Sin registro público, autoinscripción, Auth/invitaciones automáticas, vínculo cuenta-voluntario, horas, asistencias, proyectos, asignaciones, certificados, documentos, actividad, dashboards, analítica, notificaciones, custom fields, formularios dinámicos, CSV, jobs ni sincronización externa.

## Entrega solicitada

Commits coherentes en la rama dedicada, sin push, PR ni merge. Informe final con Git, diseño, datos, migración, seguridad, CRUD, consultas, duplicados, Excel, auditoría, dependencias, archivos, conteos de pruebas/baseline, regresiones, pendientes y estado de revisión.

Este registro conserva requisitos y decisiones sin secretos, tokens, URLs privadas ni datos personales reales. El prompt detallado permanece también en la conversación de trabajo; esta versión elimina repetición operacional sin cambiar el alcance.
