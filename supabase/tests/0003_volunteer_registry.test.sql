begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(93);

select has_table('public', 'volunteers', 'volunteers table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.volunteers'::regclass),
  'volunteers enables RLS'
);
select is(
  (
    select count(*)
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'volunteers'
      and constraint_type = 'FOREIGN KEY'
  ),
  0::bigint,
  'volunteers has no identity or account foreign keys'
);
select ok(
  not has_table_privilege('authenticated', 'public.volunteers', 'select')
    and not has_table_privilege('authenticated', 'public.volunteers', 'insert')
    and not has_table_privilege('authenticated', 'public.volunteers', 'update')
    and not has_table_privilege('authenticated', 'public.volunteers', 'delete'),
  'authenticated has no direct volunteer table privileges'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_volunteers(text,text,integer,integer)',
    'execute'
  ),
  'authenticated may execute the authorized list projection'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_volunteers(text,text,integer,integer)',
    'execute'
  ),
  'anonymous cannot execute the list projection'
);
select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'find_volunteer_duplicates',
        'preview_volunteer_import_duplicates',
        'list_volunteers',
        'get_volunteer_detail',
        'create_volunteer',
        'update_volunteer',
        'import_volunteers',
        'export_volunteers'
      )
      and prosecdef
      and proconfig = array['search_path=""']
  ),
  8::bigint,
  'every exposed registry RPC is security definer with an empty search path'
);
select ok(
  (
    select bool_and(pg_get_function_result(oid) not like '%phone_match_key%')
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'get_volunteer_detail',
        'create_volunteer',
        'update_volunteer'
      )
  ),
  'detail and mutation projections never expose the phone match key'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.volunteers$$,
  '42501',
  'permission denied for table volunteers',
  'anonymous cannot read the table'
);
select throws_ok(
  $$select * from public.create_volunteer('Anónima', null, null, false)$$,
  '42501',
  'permission denied for function create_volunteer',
  'anonymous cannot create volunteers'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('volunteer_registry.read'),
  false,
  'a volunteer has no registry read permission'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', 25, 0)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot list the registry'
);
select throws_ok(
  $$select * from public.create_volunteer('No autorizada', null, null, false)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot create a registry entry'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"No autorizada","email":null,"phone":null,"acceptPotentialDuplicate":false}]'::jsonb)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot import the registry'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', 1000, 0)$$,
  '42501',
  'permission_denied',
  'a volunteer cannot export the registry'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.has_permission('volunteer_registry.read'),
  false,
  'a coordinator has no registry read permission'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', 25, 0)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot list the registry'
);
select throws_ok(
  $$select * from public.create_volunteer('Coordinación', null, null, false)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot create registry entries'
);
select throws_ok(
  $$select * from public.update_volunteer('10000000-0000-4000-8000-000000000001', 'Coordinación', null, null, false)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot update registry entries'
);
select throws_ok(
  $$select * from public.import_volunteers('[]'::jsonb)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot import registry entries'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":2,"email":null,"phone":null}]'::jsonb)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot preview registry import duplicates'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', 1000, 0)$$,
  '42501',
  'permission_denied',
  'a coordinator cannot export registry entries'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)
    from unnest(
      array[
        'volunteer_registry.read',
        'volunteer_registry.create',
        'volunteer_registry.update',
        'volunteer_registry.import',
        'volunteer_registry.export'
      ]
    ) as required_permission(code)
    where public.has_permission(required_permission.code)
  ),
  5::bigint,
  'an administrator has every registry capability'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates(null::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a SQL null row collection'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects an empty row collection'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[1]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a non-object row'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview requires rowNumber'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":null,"email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a null rowNumber'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":"2","email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a string rowNumber'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":2.5,"email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a decimal rowNumber'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":0,"email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects rowNumber zero'
);
select throws_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":-2,"email":null,"phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'preview rejects a negative rowNumber'
);
select lives_ok(
  $$select * from public.preview_volunteer_import_duplicates('[{"rowNumber":2,"email":null,"phone":null}]'::jsonb)$$,
  'preview accepts a structurally valid row'
);
select lives_ok(
  $$
    create temporary table test_historical_volunteer as
    select * from public.create_volunteer(
      '  Persona   Histórica  ', null, null, false
    )
  $$,
  'an administrator creates a historical volunteer without contact data'
);
select is(
  (select full_name from test_historical_volunteer),
  'Persona Histórica',
  'creation canonicalizes name whitespace'
);
reset role;
select is(
  (select count(*) from auth.users),
  6::bigint,
  'creating a volunteer does not create Auth users'
);
select is(
  (select count(*) from public.accounts),
  5::bigint,
  'creating a volunteer does not create accounts'
);
select is(
  (select count(*) from public.invitations),
  0::bigint,
  'creating a volunteer does not create invitations'
);
set local role authenticated;
select lives_ok(
  $$
    create temporary table test_contact_volunteer as
    select * from public.create_volunteer(
      'Contacto Base',
      '  CONTACTO@EXAMPLE.INVALID  ',
      ' +591 (02) 001-020 ',
      false
    )
  $$,
  'an administrator creates a volunteer with canonical contact data'
);
select is(
  (select email from test_contact_volunteer),
  'contacto@example.invalid',
  'email is stored canonicalized'
);
select is(
  (select phone from test_contact_volunteer),
  '+591 (02) 001-020',
  'phone formatting and zeros are preserved'
);
select throws_ok(
  $$select * from public.create_volunteer('Correo repetido', 'CONTACTO@example.invalid', null, false)$$,
  '23505',
  'duplicate_confirmation_required',
  'exact canonical email requires duplicate confirmation'
);
select throws_ok(
  $$select * from public.create_volunteer('Celular repetido', null, '+591-02-001020', false)$$,
  '23505',
  'duplicate_confirmation_required',
  'equivalent formatted phone requires duplicate confirmation'
);
select throws_ok(
  $$select * from public.create_volunteer('Confirmación nula', 'contacto@example.invalid', null, null)$$,
  '23505',
  'duplicate_confirmation_required',
  'null cannot bypass duplicate confirmation during creation'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada sin confirmación","email":"contacto@example.invalid","phone":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import requires the duplicate confirmation property'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada nula","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":null}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects a null duplicate confirmation'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada falsa","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":false}]'::jsonb)$$,
  '23505',
  'duplicate_confirmation_required',
  'boolean false cannot confirm an import duplicate'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada string","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":"true"}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects a string duplicate confirmation'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada numérica","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":1}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects a numeric duplicate confirmation'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada objeto","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":{}}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects an object duplicate confirmation'
);
select throws_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada array","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":[]}]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects an array duplicate confirmation'
);
select lives_ok(
  $$select * from public.import_volunteers('[{"fullName":"Fila válida independiente","email":"no-duplicada@example.invalid","phone":null,"acceptPotentialDuplicate":false}]'::jsonb)$$,
  'boolean false remains valid for a non-duplicate import row'
);
select lives_ok(
  $$select * from public.create_volunteer('Persona Histórica', null, null, false)$$,
  'a matching name alone is not a duplicate signal'
);
select is(
  (
    select matched_fields
    from public.find_volunteer_duplicates(
      'contacto@example.invalid',
      '+591 (02) 001-020',
      null
    )
    where volunteer_id = (select id from test_contact_volunteer)
  ),
  array['email', 'phone']::text[],
  'duplicate preview reports the exact matching fields'
);
select is(
  (
    select matched_fields
    from public.preview_volunteer_import_duplicates(
      '[{"rowNumber":8,"email":"contacto@example.invalid","phone":null}]'::jsonb
    )
    where volunteer_id = (select id from test_contact_volunteer)
  ),
  array['email']::text[],
  'import preview checks a batch against PostgreSQL in one authorized call'
);
select lives_ok(
  format(
    'select * from public.update_volunteer(%L, %L, %L, %L, false)',
    (select id from test_contact_volunteer),
    'Contacto Base',
    'contacto@example.invalid',
    '+591 (02) 001-020'
  ),
  'editing excludes the volunteer itself from duplicate checks'
);
select lives_ok(
  $$select * from public.import_volunteers('[{"fullName":"Duplicada confirmada","email":"contacto@example.invalid","phone":null,"acceptPotentialDuplicate":true}]'::jsonb)$$,
  'only explicit boolean true confirms an import duplicate'
);
select lives_ok(
  $$select * from public.create_volunteer('Histórico legítimo', 'contacto@example.invalid', null, true)$$,
  'an administrator may explicitly retain a legitimate duplicate'
);
select throws_ok(
  format(
    'select * from public.update_volunteer(%L, %L, %L, null, false)',
    (select id from test_historical_volunteer),
    'Cambio bloqueado',
    'contacto@example.invalid'
  ),
  '23505',
  'duplicate_confirmation_required',
  'editing to another volunteer contact requires confirmation'
);
select throws_ok(
  format(
    'select * from public.update_volunteer(%L, %L, %L, null, null)',
    (select id from test_historical_volunteer),
    'Confirmación nula',
    'contacto@example.invalid'
  ),
  '23505',
  'duplicate_confirmation_required',
  'null cannot bypass duplicate confirmation during editing'
);
select is(
  (
    select total_count
    from public.list_volunteers('Contacto Base', 'newest', 1, 0)
  ),
  1::bigint,
  'search executes across the server-side registry and returns total count'
);
select is(
  (
    select total_count
    from public.list_volunteers('59102001020', 'newest', 1, 0)
  ),
  1::bigint,
  'digit-only search finds a stored formatted phone'
);
select is(
  (
    select full_name
    from public.list_volunteers('', 'name_asc', 1, 0)
  ),
  'Contacto Base',
  'name ordering is stable and server-side'
);
select is(
  (
    select count(*)
    from public.list_volunteers('', 'newest', 1, 1)
  ),
  1::bigint,
  'pagination applies limit and offset server-side'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', null, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a null limit'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', 0, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a zero limit'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', -1, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a negative limit'
);
select lives_ok(
  $$select * from public.list_volunteers('', 'newest', 100, 0)$$,
  'list accepts its maximum limit'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', 101, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a limit above its maximum'
);
select throws_ok(
  $$select * from public.list_volunteers('', 'newest', 25, null)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a null offset'
);
select throws_ok(
  $$select * from public.list_volunteers('', null, 25, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'list rejects a null sort'
);
select is(
  (
    select id
    from public.get_volunteer_detail((select id from test_contact_volunteer))
  ),
  (select id from test_contact_volunteer),
  'administrator reads an authorized volunteer detail'
);
select lives_ok(
  format(
    'select * from public.update_volunteer(%L, %L, %L, %L, false)',
    (select id from test_contact_volunteer),
    'Contacto Actualizado',
    'nuevo@example.invalid',
    '+591 70000001'
  ),
  'administrator updates volunteer fields'
);
select is(
  (
    select action
    from public.audit_logs
    where entity_id = (select id from test_historical_volunteer)
    order by created_at
    limit 1
  ),
  'volunteer.created',
  'manual creation is audited'
);
select is(
  (
    select actor_user_id
    from public.audit_logs
    where entity_id = (select id from test_historical_volunteer)
    order by created_at
    limit 1
  ),
  '00000000-0000-4000-8000-000000000004'::uuid,
  'the audit actor comes from the authenticated session'
);
select is(
  (
    select changed_fields
    from public.audit_logs
    where entity_id = (select id from test_contact_volunteer)
      and action = 'volunteer.updated'
    order by created_at desc
    limit 1
  ),
  array['full_name', 'email', 'phone']::text[],
  'updates audit field names without copied values'
);
select lives_ok(
  $$
    select * from public.import_volunteers(
      '[
        {"fullName":"Importada Uno","email":"uno@example.invalid","phone":null,"acceptPotentialDuplicate":false},
        {"fullName":"Importada Dos","email":null,"phone":"+591 70000002","acceptPotentialDuplicate":false}
      ]'::jsonb
    )
  $$,
  'a valid selected import is atomic and succeeds'
);
select is(
  (
    select total_count
    from public.list_volunteers('Importada', 'newest', 1, 0)
  ),
  2::bigint,
  'all selected valid import rows are inserted'
);
select is(
  (
    select metadata
    from public.audit_logs
    where action = 'volunteer.imported'
    order by created_at desc
    limit 1
  ),
  '{"duplicate_count": 0, "inserted_count": 2, "requested_count": 2}'::jsonb,
  'import audit stores server-calculated counts without PII'
);
select throws_ok(
  $$
    select * from public.import_volunteers(
      '[
        {"fullName":"Rollback Válida","email":null,"phone":null,"acceptPotentialDuplicate":false},
        {"fullName":"","email":null,"phone":null,"acceptPotentialDuplicate":false}
      ]'::jsonb
    )
  $$,
  '22023',
  'invalid_import_row',
  'an invalid selected row rejects the entire import transaction'
);
select is(
  (
    select count(*)
    from public.list_volunteers('Rollback Válida', 'newest', 25, 0)
  ),
  0::bigint,
  'a rejected import leaves no partial inserts'
);
select throws_ok(
  $$
    select * from public.import_volunteers(
      '[{"fullName":"Clave extra","email":null,"phone":null,"acceptPotentialDuplicate":false,"actorId":"00000000-0000-4000-8000-000000000004"}]'::jsonb
    )
  $$,
  '22023',
  'invalid_import_payload',
  'import rejects unknown client-controlled properties'
);
select throws_ok(
  $$select * from public.import_volunteers(null::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects a SQL null row collection'
);
select throws_ok(
  $$select * from public.import_volunteers('[]'::jsonb)$$,
  '22023',
  'invalid_import_size',
  'import rejects an empty row collection'
);
select throws_ok(
  $$select * from public.import_volunteers('[1]'::jsonb)$$,
  '22023',
  'invalid_import_payload',
  'import rejects a non-object row'
);
select is(
  (
    select count(*)
    from public.export_volunteers('Importada', 'name_asc', 1000, 0)
  ),
  2::bigint,
  'export returns the complete filtered set rather than a rendered page'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', null, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a null limit'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', 0, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a zero limit'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', -1, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a negative limit'
);
select lives_ok(
  $$select * from public.export_volunteers('', 'newest', 1000, 0)$$,
  'export accepts its maximum limit'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', 1001, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a limit above its maximum'
);
select throws_ok(
  $$select * from public.export_volunteers('', 'newest', 1000, null)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a null offset'
);
select throws_ok(
  $$select * from public.export_volunteers('', null, 1000, 0)$$,
  '22023',
  'invalid_volunteer_query',
  'export rejects a null sort'
);

select * from finish();
rollback;
