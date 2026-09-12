# ExecPlan 0009: Gmail SMTP opt-in para Supabase local

- Estado: completado y preparado para el commit solicitado
- Fecha: 2026-09-09
- Rama autorizada: `chore/local-gmail-smtp`
- Commit base: `90fcca49de2b76b2fd22cb58bd82cd861d280af2`

## Objetivo

Mantener Mailpit como transporte predeterminado de Supabase local y añadir un
comando manual `pnpm db:start:real-email` que configure Gmail SMTP mediante
credenciales locales, sin modificar Invitations, base de datos ni servicios
remotos.

## Estado inicial

`pnpm db:start` ejecuta Supabase CLI `2.109.1` con `[local_smtp] enabled = true`.
`supabase/config.toml` conserva `site_url = "http://localhost:5173"` y el redirect
`http://localhost:5173/auth/callback`. No existe un modo de correo real. El árbol
inicial está limpio y la rama requerida está activa. El host expone Node
`22.21.0`, no el `22.18.0` fijado; pnpm sí es `11.9.0`.

## Alcance

- Orquestación local para seleccionar Mailpit o Gmail antes de arrancar Supabase.
- Configuración SMTP Gmail fija (`smtp.gmail.com:587`) con STARTTLS negociado por
  Supabase Auth.
- Archivo local ignorado para `LOCAL_REAL_SMTP_USER`, `LOCAL_REAL_SMTP_PASS` y
  `LOCAL_REAL_SMTP_SENDER`, más ejemplo sin secretos.
- Pruebas focalizadas de validación, aislamiento de entorno, comando y seguridad
  de logs.
- Documentación local de uso y retorno a Mailpit.

## Fuera de alcance

- Lógica productiva de Invitations, migraciones, RLS, RPC, seeds o dependencias.
- Supabase remoto, deploy, push o envío de un correo real durante validación.
- Cambios de `site_url` o redirects locales.

## Decisiones

1. Usar los overrides de configuración `SUPABASE_*` soportados por la CLI
   `2.109.1`; no editar temporalmente `config.toml` ni inventar flags.
2. Declarar `[auth.email.smtp]` deshabilitado en la configuración versionada y
   activar SMTP externo solo en el proceso explícito.
3. Hacer que el modo predeterminado fuerce Mailpit y desactive SMTP externo para
   que tests/CI no hereden accidentalmente un opt-in.
4. Rechazar un arranque si el stack ya está activo, porque `supabase start` no
   recrea servicios cuando detecta la base local en ejecución; el cambio de modo
   exige `pnpm db:stop`.
5. No imprimir valores del archivo de secretos; los errores solo enumeran nombres
   de variables ausentes.
6. Rechazar el modo real cuando `CI=true` o `CI=1`; ambos modos comprueban que el
   stack esté detenido antes de arrancar.

## Riesgos

- Una contraseña de aplicación inválida hará fallar la entrega en tiempo de uso,
  aunque el stack pueda iniciar correctamente.
- Gmail puede aplicar límites o políticas externas; el modo es exclusivamente
  manual y local.
- La paridad de runtime exacta no puede demostrarse con el Node disponible.

## Fases y progreso

- [x] Inspeccionar instrucciones, scripts, configuración y CLI exacta.
- [x] Implementar configuración, wrapper, ejemplo ignorado y documentación.
- [x] Ejecutar pruebas focalizadas y comprobar Mailpit predeterminado.
- [x] Incorporar revisión especializada de solo lectura.
- [x] Ejecutar gates finales y cerrar el plan.
- [x] Crear el commit solicitado `chore(auth): add opt-in local Gmail SMTP`.

## Validaciones y criterios de aceptación

- `pnpm db:start` arranca con Mailpit y sin SMTP externo.
- `pnpm db:start:real-email` falla si falta el archivo o alguna variable, sin
  revelar `LOCAL_REAL_SMTP_PASS`.
- Con las tres variables presentes, el wrapper pasa a Supabase SMTP externo con
  host `smtp.gmail.com`, puerto `587`, Mailpit deshabilitado y URLs localhost sin
  cambios.
- Las pruebas no arrancan Docker ni envían correo.
- `pnpm verify` y `git diff --check` terminan correctamente.
- El árbol no contiene secretos y el archivo local esperado está ignorado.

Evidencia incremental del 2026-09-09:

| Comando o comprobación                       | Resultado observado                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test:local-smtp-orchestration`         | PASS, 10/10                                                                         |
| `pnpm test:ci-orchestration`                 | PASS, 13/13 tras adaptar el contrato de ownership al wrapper                        |
| `pnpm lint`                                  | PASS                                                                                |
| `pnpm db:start:real-email` sin archivo       | fallo esperado; solo informa la ruta y los nombres requeridos                       |
| arranque Gmail con credenciales ficticias    | PASS; `smtp.gmail.com:587`, Mailpit ausente, password presente sin mostrar su valor |
| `pnpm db:start` e inspección de contenedores | PASS; Mailpit presente y Auth apunta a `supabase_inbucket_*:1025`                   |
| `pnpm db:stop` y `git status --short`        | PASS; solo permanece el diff de implementación                                      |
| `pnpm install --frozen-lockfile`             | PASS; lockfile sin cambios                                                          |
| `pnpm verify`                                | PASS; 13/13 orquestación, 10/10 SMTP, 243 unitarias, 4 integración y build          |
| `pnpm db:test` antes de reset                | FAIL esperado por fixtures previos: cinco aserciones de conteo                      |
| `pnpm db:reset && pnpm db:test`              | PASS limpio; 8 archivos, 583 pruebas                                                |
| `pnpm test:e2e`                              | PASS; 20/20 con Mailpit                                                             |
| `git diff --check`                           | PASS                                                                                |

## Descubrimientos

- Supabase CLI `2.109.1` carga configuración con Viper y soporta overrides
  `SUPABASE_*` para campos de `config.toml`; además, `supabase start` devuelve el
  stack ya activo sin recrear Auth.
- La CLI pasa host, puerto, usuario, password y sender a GoTrue; el puerto SMTP
  `587` usa STARTTLS del cliente SMTP de Auth.

## Decisiones durante la ejecución

- La revisión QA detectó que la prueba de ownership del Edge Runtime todavía
  inspeccionaba el comando anterior; se actualizó para afirmar el wrapper y su
  flag `--exclude edge-runtime` sin relajar el contrato.
- La revisión arquitectónica detectó que un stack Gmail activo podía producir un
  falso éxito de `pnpm db:start`. El preflight ahora se aplica a ambos modos y se
  añadió la protección explícita de CI.
- `db:test` falló primero por datos persistentes del volumen local. Tras el reset
  canónico, las 583 pruebas aprobaron; ambas observaciones se conservan.
- Arquitectura: PASS. El cambio vive en scripts/configuración/documentación, no
  introduce imports en módulos de producto y `lint:boundaries` aprobó.
- Revisiones especializadas QA y arquitectura: PASS final, sin hallazgos.

## Resultado final

Mailpit permanece predeterminado y forzado para el comando normal. Gmail se
activa solo mediante el comando explícito, el archivo local ignorado y fuera de
CI. Se verificaron ambos transportes con contenedores locales sin enviar correo
real; `site_url` y redirects permanecen en localhost. No se tocaron Invitations,
migraciones, RLS, RPC, dependencias ni Supabase remoto. El runtime disponible fue
Node `22.21.0`, por lo que la paridad exacta con `22.18.0` queda no ejecutada; pnpm
`11.9.0` y Supabase CLI `2.109.1` sí coinciden. No se hizo deploy ni push.
