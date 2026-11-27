-- Complementary contract tests. Real concurrency lives in the dedicated harness.
-- Run only against an explicitly authorized disposable PostgreSQL instance.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok(
  has_function_privilege('authenticated', 'public.change_account_status(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.manage_account_role(uuid,text,text)', 'EXECUTE'),
  'administrative RPC execute remains available to authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.change_account_status(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.manage_account_role(uuid,text,text)', 'EXECUTE'),
  'anonymous execution remains denied'
);
select ok(
  not has_function_privilege('authenticated', 'public.change_account_status_legacy(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.change_account_status_legacy(uuid,text,text)', 'EXECUTE'),
  'legacy cannot bypass the recovery wrapper'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_catalog.pg_proc where oid='public.change_account_status(uuid,text,text)'::regprocedure),
  'wrapper retains security definer and empty search_path'
);
select is(
  pg_catalog.pg_get_function_result('public.change_account_status(uuid,text,text)'::regprocedure),
  'SETOF accounts',
  'RPC result contract is unchanged'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid='public.accounts'::regclass)
  and not has_table_privilege('authenticated', 'public.accounts', 'UPDATE'),
  'account writes remain behind RPC and RLS'
);

set local role anon;
select throws_ok(
  $$select * from public.change_account_status('00000000-0000-4000-8000-000000000001','suspended','AUD002 fixture')$$,
  '42501', null,
  'anonymous cannot execute state mutation'
);
reset role;
set local role authenticated;
select throws_ok(
  $$select * from public.change_account_status_legacy('00000000-0000-4000-8000-000000000001','suspended','AUD002 fixture')$$,
  '42501', null,
  'authenticated cannot execute legacy directly'
);
reset role;
select * from finish();
rollback;
