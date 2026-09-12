# ExecPlan 0010: UI/UX Polish V1

- Estado: en ejecución; Fase 1 y corrección visual 1.1 completadas
- Fecha: 2026-09-11
- Rama autorizada: `feat/ui-ux-polish-v1`
- Commit base: `33678c1bb708fc0872496a575b4b3cdb35f6c1b3`

## Objetivo

Mejorar coherentemente la presentación, legibilidad, accesibilidad y adaptación
responsive de la aplicación web actual sin modificar funciones, reglas de
negocio, permisos, contratos, transiciones ni condiciones de disponibilidad de
las acciones.

Este plan cubre exclusivamente UI de presentación, estilos y componentes
visuales compartidos. Toda autorización continúa derivándose de los mismos
permisos, capacidades, estados y servicios actuales. Un elemento oculto,
deshabilitado, de solo lectura o terminal debe conservar exactamente esa
condición después del polish.

## Estado inicial y método de auditoría

La aplicación usa React/Vite, una hoja global `apps/web/src/styles.css` y dos
primitivas en `packages/ui`: `Button` y `Field`. El shell tiene header superior,
sidebar fija de `14rem` y contenido sin un contenedor interior uniforme. Las
páginas combinan paneles, tarjetas, tablas, listas y formularios mediante clases
globales, pero no existe un conjunto explícito de tokens, variantes semánticas o
componentes compartidos para estados, badges, encabezados, diálogos, selects,
textareas y tablas.

Se revisaron el código, las pruebas de presentación/E2E y la aplicación local con
una cuenta fixture administrativa. La inspección visual se realizó en:

- escritorio `1280 × 800`: login, perfil, proyectos, invitaciones y detalle de un
  proyecto cerrado;
- tablet `768 × 1024`: detalle de proyecto cerrado y tabla de actividades;
- móvil `390 × 844`: shell, perfil y listado de proyectos.

No se versionaron capturas de esta auditoría porque el estado local contenía datos
personales y residuos de pruebas. Las futuras capturas deberán reconstruirse con
fixtures deterministas `.invalid`, sin tokens, enlaces de invitación, correos
reales ni otros datos personales.

El host disponible ejecuta Node `22.21.0`, distinto de `22.18.0` fijado por el
repositorio; pnpm sí coincide en `11.9.0`.

## Diagnóstico visual actual

### Shell, navegación y responsive

- **P0** — El breakpoint único de `720px` deja activo el sidebar de `14rem` a
  `768px`. El contenido útil queda comprimido, los títulos largos se parten de
  forma agresiva y las tablas pierden sus columnas de acción fuera del viewport.
- **P0** — En móvil la navegación se convierte en enlaces inline que ocupan varias
  filas sin control de overflow. Desplaza el contenido y no escala bien si aparecen
  más destinos autorizados o traducciones largas.
- **P0** — El detalle de proyecto desborda el `body` en móvil incluso cuando sus
  tablas ya están envueltas. A `390px` se observó un ancho de documento aproximado
  de `711px`: hay que permitir `min-width: 0` en los grids y confinar el overflow a
  regiones de tabla identificables.
- **P1** — El header comunica marca y sesión, pero no identidad/rol ni contexto de
  página; el logout compite visualmente con la navegación principal.
- **P1** — Los anchos máximos cambian entre `42rem`, `62rem`, `78rem` y ancho
  completo sin una regla clara por tipo de contenido. El ritmo lateral y la
  densidad varían entre perfil, formularios, listados y detalles.
- **P1** — Falta navegación contextual consistente para volver de detalle/edición
  al listado o a la entidad padre. No se añadirán destinos nuevos: solo se podrán
  presentar mejor enlaces que ya forman parte del recorrido autorizado.

### Sistema visual

- **P1** — Tamaños, colores, radios, bordes y sombras son valores literales
  repetidos; no hay tokens que garanticen contraste y consistencia.
- **P1** — Un único estilo global de `h1` llega hasta `3.5rem`, adecuado para login
  pero sobredimensionado en títulos administrativos largos, especialmente en
  tablet.
- **P1** — Todos los botones secundarios comparten apariencia. Acciones neutras,
  primarias, destructivas y de navegación no tienen jerarquía diferenciada.
- **P1** — Estados de dominio aparecen como texto plano. Activo, cerrado,
  suspendido, archivado y estados terminales requieren badges semánticos que no
  dependan solo del color.
- **P2** — No hay sistema de iconos. Se podrían añadir iconos pequeños y
  decorativos para orientación y estado, siempre acompañados de texto y sin
  introducir una dependencia pesada.
- **P2** — Sombras y elevación son más intensas de lo necesario en paneles grandes;
  el acabado puede ser más sobrio sin perder separación.

### Componentes y estados

- **P0** — Loading, error y empty suelen renderizarse como párrafos sueltos, con
  cambios de layout y semántica inconsistente. Varios errores y éxitos no usan
  `role="alert"`, `role="status"` o regiones live de forma uniforme.
- **P0** — Las tablas no tienen caption accesible y su scroll horizontal no tiene
  indicación visual ni alternativa móvil. En tablet/móvil las acciones pueden
  quedar fuera de vista.
- **P0** — Confirmaciones sensibles dependen de `window.confirm`. Son visualmente
  ajenas al producto y limitan la jerarquía, pero sustituirlas cambiaría una
  interacción crítica. V1 mantendrá confirmación, texto, cancelación, idempotencia
  y operación exacta; solo diferenciará visualmente sus disparadores.
- **P0** — El motivo de revocación de Invitaciones aparece separado del objeto y
  de la acción a la que aplica. La relación visual es débil y aumenta el riesgo de
  actuar con un motivo residual. No se cambiará cuándo se solicita ni qué operación
  lo consume.
- **P1** — Inputs compartidos existen, pero selects y textareas se implementan
  manualmente; esto duplica labels, descripción, errores, IDs y atributos ARIA.
- **P0** — El input de archivo de importación queda reducido y opaco sin transferir
  el foco al label visible. Debe añadirse `:focus-within` sin cambiar `accept`,
  disabled ni handler.
- **P1** — Empty states alternan entre paneles estructurados y texto plano; success
  y error alternan entre notices con y sin semántica accesible.
- **P1** — El disabled se expresa principalmente con opacidad. Debe seguir usando
  el atributo nativo bajo las mismas condiciones, pero distinguirse también por
  cursor, borde, relleno y texto sin sugerir disponibilidad.
- **P1** — Tarjetas y filas contienen links y botones con estilos dispares; el área
  interactiva y la acción primaria no siempre se reconocen al escanear.
- **P2** — Los loading states pueden usar skeletons mínimos solo donde no oculten
  mensajes ni causen anuncios repetitivos; el texto accesible debe permanecer.

### Páginas y UX

- **P0** — Invitaciones y detalle de cuenta concentran operaciones de alto impacto
  con igual peso visual. Deben separar lectura, edición y acciones sensibles sin
  alterar filtros de permiso/estado.
- **P0** — Detalle de proyecto reúne resumen, voluntarios, managers, actividades y
  participantes en una columna extensa. En pantallas pequeñas el usuario pierde
  contexto y las tablas requieren scroll repetido.
- **P0** — El sistema debe congelar la matriz actual de visibilidad, disabled y
  read-only. No se puede mostrar como disabled una capacidad hoy oculta, porque
  eso revelaría funcionalidad no autorizada.
- **P1** — Login/onboarding tienen buena concentración y labels explícitos, pero
  sus estados de espera, callback, recuperación y bloqueo no comparten una
  estructura visual estable.
- **P1** — Perfil desperdicia espacio en escritorio con dos columnas asimétricas y
  ofrece poca asociación visual entre descripción, formulario y feedback.
- **P1** — Listados de Cuentas e Invitaciones usan tarjetas; Proyectos y
  Voluntarios usan tablas. La elección puede mantenerse según densidad, pero
  encabezados, metadatos, badges, estados y acciones deben compartir lenguaje.
- **P1** — Formularios de búsqueda ocupan demasiado ancho y el botón adquiere
  proporciones distintas por grid, especialmente en móvil.
- **P0** — El grid de fechas de Activity continúa en dos columnas bajo el
  breakpoint móvil y los controles `datetime-local` pueden desbordarse a 320px.
- **P1** — Importación Excel contiene controles, resumen, preview, duplicados y
  confirmación en un flujo largo; necesita agrupación visual progresiva sin
  modificar validación, atomicidad ni selección explícita de duplicados.
- **P2** — Detalles de invitación, voluntario y cuenta pueden mejorar el escaneo de
  pares término/valor, fechas e historial sin cambiar contenido.

## Invariantes funcionales y de seguridad

1. El shell seguirá ocultando Invitaciones, Cuentas, Voluntarios y Proyectos con
   los mismos permisos; `PermissionRoute` seguirá negando acceso por ruta.
2. Solo cuentas `active` tienen shell operativo. `invited`, `pending_profile`,
   `suspended`, `archived`, errores recuperables y acceso denegado conservarán los
   redirects y acciones actuales.
3. Onboarding seguirá siendo exclusivamente por invitación. No se añadirá alta
   pública, cambio de correo, recuperación de contraseña ni nuevos campos.
4. Las combinaciones actuales de permiso, status, scope, `submitting`/`busy` y
   existencia de challenge seguirán controlando presencia y disabled. El CSS o
   los componentes no serán fuente de autorización. Si un CTA actual de Volunteers
   aparece desde una ruta `read` pero su servicio/ruta exige `create`, `update`,
   `import`, `export` o `project.manage`, su visibilidad se alineará con ese permiso
   ya existente; no se inventará ni ampliará autorización.
5. Invitaciones conservarán estados y operaciones exactas: reenviar, sustituir,
   revocar y recuperar no se combinarán ni se habilitarán para estados nuevos.
   Coordinación seguirá limitada al rol inicial `volunteer`.
6. Cuentas conservarán transiciones, restricciones de roles y diferencias entre
   “Recuperar cuenta verificada” y “Recuperar invitación”. No se prometerán en UI
   reglas que solo puede decidir el servidor, como último administrador.
7. `Profile`, `Account` y `Volunteer` seguirán siendo conceptos distintos. También
   se mantendrán separados Project Assignment y Activity Participation.
8. Un proyecto `closed` conserva historia y puede conservar la edición descriptiva
   ya permitida; no se asumirá que toda edición está prohibida. Assignments y
   Activities sí conservan su mutabilidad actual.
9. Activities `completed|cancelled` y participaciones históricas no obtendrán
   acciones. Se preservarán los significados “Histórica; no finalizada
   explícitamente” e “Histórico de solo lectura”.
10. No se tocarán servicios, gateways, contratos, RPC, RLS, migraciones, Edge
    Functions ni composición, salvo imports puramente visuales permitidos desde la
    capa de presentación.

## Principios visuales

1. **Claridad antes que decoración:** una acción primaria inequívoca por región;
   acciones sensibles separadas y explícitas.
2. **Densidad administrativa legible:** controles compactos, títulos contenidos y
   bloques escaneables sin esconder información.
3. **Estado redundante:** texto + forma/icono + color; nunca color como única señal.
4. **Responsive por contenido:** shell y colecciones cambian antes de comprimirse;
   no se fuerza una tabla de escritorio dentro de un móvil.
5. **Accesibilidad nativa:** landmarks, headings, labels, focus y teclado como parte
   del componente, no como corrección posterior.
6. **Autorización inalterable:** el polish representa decisiones existentes; no las
   infiere ni las sustituye.
7. **Movimiento discreto:** transiciones solo cosméticas, breves y anulables con
   `prefers-reduced-motion`.

## Sistema de diseño ligero propuesto

Mantener CSS propio y ampliar `packages/ui` de forma incremental, sin adoptar un
framework visual ni realizar un refactor arquitectónico.

### Tokens CSS

- Color: canvas, surface, surface-subtle, text, text-muted, border, primary,
  primary-hover, focus, success, warning, danger e info; cada par fondo/texto se
  verificará contra WCAG AA.
- Tipografía: familia sans para interfaz y serif solo en títulos de marca/página;
  escala acotada para display, `h1`, `h2`, `h3`, body y caption con line-height
  explícito.
- Spacing: escala de `4, 8, 12, 16, 24, 32, 48, 64px`.
- Radius: control, card y pill; evitar radios literales por pantalla.
- Elevación: border, shadow-sm y shadow-md; sin sombras para expresar estado.
- Layout: ancho de lectura, ancho de formulario y ancho administrativo, más gutters
  fluidos y breakpoints basados en el contenido observado.
- Motion: duración/easing únicos y bloque global de reduced motion.

### Primitivas compartidas afectadas

- `Button`/`ButtonLink`: variantes primary, secondary y danger; tamaños; busy y
  disabled visual, conservando elemento nativo, nombre accesible y condición.
- `Field`, `SelectField`, `TextAreaField`: label, hint, error, required, readonly,
  disabled y asociaciones ARIA uniformes.
- `Notice`: error, warning, success e info con política explícita de `alert`/`status`.
- `StatusBadge`: mapeos visuales definidos por cada módulo; nunca decide reglas.
- `PageHeader` y `SectionHeader`: título, descripción, eyebrow y slot de acciones.
- `Panel`, `EmptyState` y `LoadingState`: geometría y semántica consistentes.
- `DataTable`/`ResponsiveCollection`: caption, wrapper con affordance de scroll y
  presentación móvil decidida por cada página sin duplicar información.
- Las confirmaciones nativas se mantienen en V1. Un `ConfirmDialog` requeriría un
  plan posterior con pruebas de equivalencia de foco, cancelación, Escape, pending
  e idempotencia.

No se crearán componentes genéricos que reciban permisos o reglas de dominio. La
presentación de cada módulo continuará calculando visibilidad, disabled, estado y
copy contractual antes de entregar props visuales.

## Componentes y páginas afectadas

| Prioridad | Superficie                                 | Cambio visual propuesto                                                                    |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| P0        | `AppShell`                                 | skip link, landmarks, navegación responsive, focus y estado activo inequívoco              |
| P0        | tablas/listas                              | caption, scroll visible, adaptación móvil, estados y acciones accesibles                   |
| P0        | notices/loading/empty                      | semántica live uniforme, reserva de espacio razonable y reintento visible cuando ya existe |
| P0        | confirmaciones                             | jerarquía danger en disparadores; conservar confirmación, texto y condición                |
| P0        | Invitaciones/Cuentas                       | separar contexto, motivo y acciones sensibles; preservar permission/status guards          |
| P0        | Project detail/Activities/Participations   | jerarquía de secciones, navegación contextual y terminal/read-only explícito               |
| P0        | Volunteer list/detail/import               | alinear CTAs con permisos existentes y mostrar foco en selección de archivo                |
| P1        | Login/onboarding/access                    | card y estados de acceso consistentes, sin añadir recorridos                               |
| P1        | Perfil                                     | ancho de lectura/formulario y feedback asociado al submit                                  |
| P1        | Proyectos/Voluntarios/Cuentas/Invitaciones | encabezados, búsqueda, conteos, badges y acciones consistentes                             |
| P1        | Volunteer import                           | pasos visuales y resumen más claros, misma validación/atomicidad                           |
| P2        | detalles e historiales                     | refinamiento tipográfico, iconos decorativos y metadatos escaneables                       |

## Responsive

- **Desktop, `≥ 1200px`:** sidebar estable; contenido administrativo con max-width
  y gutters; tablas completas; formularios de dos columnas solo cuando los campos
  mantienen ancho útil.
- **Tablet, `768–1199px`:** shell compacto o navegación horizontal accesible antes
  de que el sidebar reduzca el contenido; títulos administrativos limitados;
  formularios a una columna cuando corresponda; tablas con affordance o
  presentación por filas/tarjetas.
- **Mobile, `320–767px`:** header apilable, navegación horizontal de una línea con
  overflow comunicado, acciones full-width solo cuando mejora la selección, cards
  sin overflow y targets mínimos de `44 × 44px`.
- Probar zoom a `200%` y reflow a `320 CSS px`; ningún control, mensaje o acción
  autorizada puede quedar inaccesible por clipping u overflow bidimensional.

## Accesibilidad

- Añadir enlace “Saltar al contenido”, landmarks y jerarquía de headings estable.
- Usar `:focus-visible` de alto contraste para links, buttons, inputs, selects,
  textareas y controles del menú; no eliminar el outline sin sustituto.
- Mantener labels persistentes y asociar hint/error mediante IDs únicos. No usar
  placeholder como label.
- Verificar contraste WCAG AA: texto normal `4.5:1`, texto grande y bordes/estados
  interactivos `3:1` cuando aplique.
- Definir cuándo un mensaje es interrupción (`alert`) y cuándo actualización
  (`status`); evitar múltiples anuncios durante loading/refetch.
- Proveer caption/nombre accesible a tablas y contexto accesible a acciones
  repetidas “Ver detalle”, “Editar”, “Finalizar” y “Participantes”. El texto visible
  contractual puede conservarse y ampliarse con nombre accesible contextual.
- Confirmaciones nativas: conservar texto y cancelación; los disparadores deben
  mantener focus visible, disabled y bloqueo contra doble submit.
- Navegación por teclado completa, orden DOM lógico y target mínimo de 44px.
- Respetar `prefers-reduced-motion`; no usar animación para comunicar loading o
  success de forma exclusiva.

## Fases de implementación

### Fase 1 — Fundaciones, shell y estados P0

- Introducir tokens y escala tipográfica/spacing en CSS.
- Extender las primitivas visuales mínimas en `packages/ui`.
- Pulir AppShell, skip link, focus visible y navegación desktop/tablet/mobile.
- Estandarizar LoadingState, EmptyState, Notice, StatusBadge y wrappers de tablas.
- Añadir pruebas de componente para semántica, teclado, disabled y mapeos de
  variantes; capturar baseline y resultado con fixtures seguros.

Salida: shell y estados base utilizables a 320, 390, 768, 1024 y 1280 px, sin
cambiar la matriz de navegación o permisos.

### Fase 2 — Identidad, perfil y registro

- Aplicar PageHeader, campos y estados compartidos a login/onboarding, perfil,
  cuentas, invitaciones y voluntarios/importación.
- Reagrupar visualmente formularios densos y acciones sensibles.
- Mantener los `window.confirm` existentes y aplicar solamente jerarquía visual a
  sus disparadores.
- Validar ES/EN, longitudes extremas, errores, success, empty, read-only y disabled.

Salida: recorridos de identidad y registro coherentes, sin cambios de copy
contractual, roles, estados, idempotencia ni acciones disponibles.

### Fase 3 — Proyectos, actividades, participantes y cierre

- Aplicar jerarquía responsive y componentes compartidos a list/detail/edit,
  assignments, managers, Activities y Activity Participations.
- Tratar tablas densas y estados historical/terminal sin crear acciones nuevas.
- Ejecutar la matriz visual/funcional completa, regresión E2E, accesibilidad,
  screenshots seguros y revisión especializada.
- Actualizar este ExecPlan con evidencia, decisiones y resultado final.

Salida: polish integrado y verificable de todas las páginas actuales.

## Screenshots y checklist manual

Preparar una matriz antes/después con datos `.invalid` en `1280×800`, `1024×768`,
`768×1024`, `390×844` y `320×800`. No versionar PII, tokens ni links de Mailpit.

- [ ] Login vacío, errores por campo, credenciales inválidas y submit pending.
- [ ] Invitación válida, inválida, expirada, revocada, sustituida y ya aceptada.
- [ ] Complete profile en ES/EN, errores, submit pending y cleanup de sesión.
- [ ] Acceso initializing, recoverable error, forbidden, suspended y archived.
- [ ] Perfil loading/error/empty/success, dirty/no-dirty y cambio ES/EN.
- [ ] Shell por administrator, coordinator, project_manager, volunteer y cuenta sin
      roles; comparar enlaces visibles y acceso directo por URL.
- [ ] Invitaciones por cada status; verificar reenviar/sustituir/revocar y motivo
      bajo las mismas condiciones actuales.
- [ ] Cuenta invited/pending_profile/active/suspended/archived; roles grantables,
      rol existente, servidor rechaza última administración y auto-mutación.
- [ ] Voluntarios empty/resultados/sin resultados, sort, paginación, detalle,
      creación, edición, duplicate warning y export pending.
- [ ] Importación: archivo inválido, processing, preview válido/inválido, duplicados
      incluidos/excluidos, atomicidad y resultado.
- [ ] Proyectos empty/resultados/paginación; admin y manager contextual dentro/fuera
      de scope; proyecto active/closed.
- [ ] Assignments de voluntario y manager activas/históricas; búsqueda sin
      candidatos y acciones según permiso/status.
- [ ] Activities scheduled/completed/cancelled; creación/edición, confirmación y
      read-only terminal.
- [ ] Participations current/finished/historical-unended; activity/project terminal
      y ausencia estricta de acciones de mutación.
- [ ] Todas las tablas con teclado, lector de pantalla, zoom 200%, nombres largos,
      fechas largas y scroll/alternativa móvil visibles.
- [ ] Tab/Shift+Tab, Enter/Space, cancelación de confirm, skip link y navegación
      mobile.
- [ ] Contraste automático + revisión manual de focus, badges, disabled y notices.
- [ ] Reduced motion y preferencia de color del sistema sin pérdida de información.

## Validaciones y criterios de aceptación

### Gates automatizados previstos

- `corepack pnpm verify`.
- Tests focalizados de componentes/páginas modificadas.
- `corepack pnpm db:reset && corepack pnpm db:test`.
- `corepack pnpm test:e2e` con recorridos actuales y nuevas aserciones de
  visibilidad/disabled/read-only por rol y estado.
- Auditoría automatizada de accesibilidad sobre rutas representativas y los tres
  tamaños principales, sin sustituir la revisión manual.
- `git diff --check` y escaneos de secretos, `service_role` en frontend, `any`,
  `@ts-ignore`, lint suppressions, TODO y FIXME.

### Criterios de aceptación

1. No cambia ninguna llamada a servicio, payload, contrato, validación de dominio,
   permiso, redirect, transición, idempotency key ni condición de acción.
2. La matriz antes/después prueba igualdad exacta de elementos presentes, ocultos,
   disabled y read-only para cada rol/scope/status cubierto.
3. Ningún estado terminal obtiene CTA de mutación y ninguna función no autorizada
   se revela como disabled.
4. Todas las páginas son utilizables con teclado, zoom 200% y viewport de 320px sin
   clipping de acciones autorizadas; `body.scrollWidth === body.clientWidth` y el
   overflow permitido queda confinado a una región de tabla accesible.
5. Focus, labels, headings, landmarks, notices, diálogos y tablas pasan las pruebas
   automatizadas aplicables y la revisión manual.
6. Todos los pares de color cumplen WCAG AA y los estados no dependen solo del
   color.
7. ES y EN conservan significado, variables i18n y nombres accesibles usados por
   las pruebas de contrato.
8. No se añaden dependencias salvo justificación explícita; preferencia por CSS y
   componentes existentes.
9. El diff se limita a presentación, UI compartida, estilos, tests visuales/de
   accesibilidad y documentación.

## Riesgos de regresión funcional

- Extraer componentes puede mover accidentalmente guards de permiso/status a una
  primitiva visual. Mitigación: calcularlos en la página y probar matriz exacta.
- Cambiar la apariencia de un disparador sensible puede minimizar o exagerar la
  operación. Mitigación: tono danger consistente y confirmación nativa intacta.
- Convertir tablas en cards puede cambiar orden DOM, nombres accesibles o esconder
  acciones. Mitigación: una sola fuente de datos y pruebas a cada breakpoint.
- Cambiar copy o `aria-label` puede romper contratos E2E y significado de seguridad.
  Mitigación: congelar textos sensibles y revisar ES/EN.
- Loading/success compartidos pueden anunciar demasiado o borrar feedback antes de
  tiempo. Mitigación: conservar el mismo ciclo de estado y probar regiones live.
- Nuevos iconos pueden convertirse en la única señal o introducir bundle excesivo.
  Mitigación: texto obligatorio y set mínimo/local.
- La hoja global puede causar regresiones lejanas. Mitigación: tokens primero,
  migración por superficie y screenshots antes/después.
- Inconsistencia preexistente: candidatos de manager buscados antes del cierre
  podrían quedar renderizados después de cerrar el proyecto, aunque backend niegue
  asignarlos. Resolverla cambiaría comportamiento observable y requiere una tarea
  funcional separada; este polish solo debe detectarla y no ocultarla
  silenciosamente.

## Fuera de alcance

- Lógica productiva, reglas de negocio, permisos, contratos, servicios, gateways y
  composición no visual.
- Migraciones, seeds, SQL, RLS, grants, RPC, triggers, Edge Functions y Supabase.
- Nuevos módulos, rutas, roles, capacidades, estados, filtros, búsqueda, paginación
  o acciones.
- Registro público, recuperación de contraseña, cambio de correo y ampliación del
  perfil.
- Attendance, RSVP, self-join, tasks, responsables individuales de Activity,
  recurrencia, capacidad, aprobaciones, notificaciones y calendarios externos.
- Resolver bugs funcionales preexistentes o cambiar reglas para proyectos cerrados.
- Rediseño de marca, dark mode, internacionalización adicional, analytics o
  personalización por usuario.
- Sustituir `window.confirm` por diálogos propios.
- Refactor arquitectónico amplio o adopción de un framework de componentes.

## Progreso

- [x] Confirmar rama autorizada, instrucciones y siguiente número de ExecPlan.
- [x] Auditar código, estilos, componentes, pruebas y contratos actuales.
- [x] Revisar aplicación local en escritorio, tablet y móvil sin ejecutar mutaciones.
- [x] Incorporar revisiones especializadas de arquitectura, QA y contratos de
      dominio/seguridad.
- [x] Aprobar este ExecPlan antes de cualquier implementación.
- [x] Ejecutar Fase 1.
- [x] Ejecutar corrección visual Fase 1.1 de shell, overflow, títulos y densidad.
- [ ] Ejecutar Fase 2.
- [ ] Ejecutar Fase 3 y cerrar el plan con evidencia.

## Verificaciones de esta entrega documental

| Gate                          | Comando                                                                                   | Resultado                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dependencias                  | `corepack pnpm install --frozen-lockfile`                                                 | PASS; pnpm `11.9.0`; warning no bloqueante por Node `22.21.0` vs `22.18.0`                          |
| Formato                       | `corepack pnpm format:check` y `git diff --check`                                         | PASS                                                                                                |
| Gate estático                 | `corepack pnpm verify`                                                                    | PASS; lint, boundaries, architecture, typecheck, 243 unitarias, 4 integración y build               |
| Base local, primer intento    | `corepack pnpm db:test`                                                                   | FAIL esperado por datos residuales del volumen local; se observaron conteos contaminados            |
| Base local, canónico          | `corepack pnpm db:reset && corepack pnpm db:test`                                         | PASS; 8 archivos, 583 pruebas                                                                       |
| E2E, primer intento           | `corepack pnpm test:e2e`                                                                  | FAIL de infraestructura local: Mailpit detenido (`ECONNREFUSED`); 17 pass, 1 fail y 2 no ejecutados |
| E2E, stack Mailpit reiniciado | `corepack pnpm db:stop && corepack pnpm db:start && corepack pnpm test:e2e`               | PASS; 20/20                                                                                         |
| Escaneos                      | `rg` sobre frontend/UI para `service_role`, `any`, `@ts-ignore`, suppressions, TODO/FIXME | PASS; 0 coincidencias en superficies de producto                                                    |

Los gates se ejecutaron como verificación del estado actual y no como evidencia de
una implementación de UI. No se modificaron migraciones, servicios, contratos ni
datos remotos. El agente de revisión documental adicional no estuvo disponible por
límite de uso; las revisiones de arquitectura, QA y contratos de dominio sí fueron
incorporadas.

## Descubrimientos

- `packages/ui` contiene solo `Button` y `Field`; el resto de los patrones se
  repite en presentación o CSS global.
- Hay un solo breakpoint a `720px`; la prueba visual a `768px` confirmó compresión
  severa del contenido junto al sidebar.
- Las tablas ya están dentro de wrappers con overflow horizontal, pero no comunican
  que hay contenido fuera del viewport ni proporcionan adaptación móvil.
- La revisión QA midió overflow de `body` a `390px` en Project detail; no basta con
  estilizar `.table-scroll`.
- El selector de archivo carece de focus visible en el control presentado y el
  grid de fechas de Activity no colapsa en móvil.
- React Router mantiene una segunda barrera de permisos, además de ocultar enlaces
  en el shell. Ambas capas deben permanecer.
- Las pruebas E2E existentes localizan muchas acciones por rol/nombre visible; son
  evidencia útil de contrato, no una invitación a renombrarlas durante el polish.
- Editar la descripción de un proyecto cerrado puede estar permitido para un
  manager contextual; “closed” no significa inmutabilidad total de toda la entidad.

## Decisiones durante la ejecución

- Se propone CSS propio + primitivas incrementales en lugar de un framework para
  limitar cambios, dependencias y riesgo arquitectónico.
- Se conservarán tablas en desktop y se decidirá por página entre scroll comunicado
  o representación apilada en móvil; no se impondrá una abstracción universal.
- Se mantendrá `window.confirm` en V1 para no alterar interacciones críticas; un
  diálogo propio queda fuera de alcance.
- Las capturas actuales no se guardaron por contener datos personales. La evidencia
  visual versionable deberá usar fixtures seguros y deterministas.
- El bug potencial de candidatos de manager tras cierre queda documentado, pero no
  se resolverá dentro de un polish sin autorización funcional explícita.
- La corrección 1.1 eliminó `overflow-x: hidden` del `body` y resolvió el ancho en
  los componentes responsables. Solo navegación y `TableRegion` conservan scroll
  horizontal intencional.
- El destino activo de la navegación se desplaza a la zona visible al cambiar de
  ruta. Este efecto es exclusivamente presentacional y no modifica rutas, permisos
  ni el orden de los enlaces.
- Los nombres dinámicos usan una escala tipográfica menor y `overflow-wrap` para
  preservar palabras normales y partir únicamente cadenas que no caben.

## Resultado final

Fase 1 y corrección visual 1.1 completadas. El shell, las fundaciones visuales y
los estados compartidos están implementados; Fases 2 y 3 permanecen pendientes.
La validación 1.1 cubrió perfil y voluntarios en escritorio, tablet `768px`,
invitaciones a `440px` y un proyecto existente de 44 caracteres a `390px`, con
`documentElement.scrollWidth === clientWidth`. La regresión E2E del shell verifica
logout visible, targets de navegación de al menos `44px`, item activo alcanzable,
focus visible y ausencia de overflow global. No se modificaron reglas, permisos,
servicios, contratos, base de datos ni infraestructura.

### Evidencia de Fase 1.1

| Gate                                                   | Resultado                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `corepack pnpm typecheck`                              | PASS                                                                   |
| `corepack pnpm lint` y `corepack pnpm lint:boundaries` | PASS                                                                   |
| `corepack pnpm test:unit`                              | PASS; 44 archivos, 243 pruebas                                         |
| `corepack pnpm build`                                  | PASS                                                                   |
| `corepack pnpm verify`                                 | PASS; formato, arquitectura, tipos, unitarias, 4 integraciones y build |
| `corepack pnpm test:e2e`                               | PASS; 21/21, incluida la regresión responsive nueva                    |
| `git diff --check` y escaneo de patrones prohibidos    | PASS                                                                   |
| `db:test` y scripts de concurrencia dedicados          | No ejecutados por alcance explícito de Fase 1.1                        |

Las capturas de perfil `1440px`, voluntarios `1440px`, tablet `768px`,
invitaciones `440px` y proyecto largo `390px` se conservaron únicamente en
`/tmp`; no se añadieron al repositorio. El host mantuvo el warning conocido de
Node `22.21.0` frente a `22.18.0`; pnpm coincidió en `11.9.0`.
