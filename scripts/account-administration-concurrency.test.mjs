import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import test from 'node:test';

// Intentionally outside verify. Never discovers/reuses the normal local stack.
const project = 'sistema-voluntariado-aud002';
const container = process.env.AUD002_DISPOSABLE_CONTAINER ?? '';
assert.equal(
  process.env.AUD002_ALLOW_DISPOSABLE_DB,
  'I_AUTHORIZE_AUD002_FIXTURES',
  'Explicit authorization for disposable AUD-002 fixtures is required.',
);
assert.match(
  container,
  /^[a-f0-9]{64}$/u,
  'An exact container ID is required.',
);

assert.equal(
  process.env.DOCKER_HOST ?? '',
  '',
  'DOCKER_HOST overrides are forbidden; select an inspected local Docker context.',
);
const runId = randomUUID().replaceAll('-', '');
const prefix = `aud002_${runId}_`;
const sqlTimeout = 8_000;
let sequence = 0;
let dockerContext;

function docker(args, input) {
  const parameters =
    dockerContext && args[0] !== '--context'
      ? ['--context', dockerContext, ...args]
      : args;
  const result = spawnSync('docker', parameters, {
    encoding: 'utf8',
    input,
    timeout: 20_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const [context] = JSON.parse(docker(['context', 'inspect']));
const endpoint = context.Endpoints.docker.Host;
assert.ok(
  endpoint.startsWith('unix:///') ||
    /^npipe:\/{4}\.\/pipe\/[a-zA-Z0-9_.-]+$/u.test(endpoint),
  'Docker endpoint must be a local Unix socket or named pipe.',
);
dockerContext = context.Name;
const [inspection] = JSON.parse(docker(['inspect', container]));
assert.equal(inspection.Id, container);
assert.equal(inspection.Name, `/supabase_db_${project}`);
assert.equal(inspection.Config.Labels['com.supabase.cli.project'], project);
assert.equal(inspection.State.Running, true);
assert.equal(
  inspection.Mounts.some((mount) => mount.Type === 'bind'),
  false,
);

assert.notEqual(inspection.HostConfig.NetworkMode, 'host');
for (const mount of inspection.Mounts) {
  if (mount.Type !== 'volume') continue;
  assert.ok(
    mount.Name.endsWith(`_${project}`),
    'Every mounted volume must belong to the dedicated AUD002 project.',
  );
  const [volume] = JSON.parse(docker(['volume', 'inspect', mount.Name]));
  assert.equal(volume.Driver, 'local');
  assert.equal(volume.Scope, 'local');
  assert.deepEqual(
    volume.Options ?? {},
    {},
    'Remote/custom volume options are forbidden.',
  );
}

function psqlArgs(stopOnError = true) {
  return [
    '--context',
    dockerContext,
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    `ON_ERROR_STOP=${stopOnError ? '1' : '0'}`,
    '-U',
    'postgres',
    '-h',
    '/var/run/postgresql',
    '-p',
    '5432',
    '-d',
    'postgres',
  ];
}

function sql(statement) {
  return docker(
    psqlArgs(),
    `set statement_timeout = '${sqlTimeout}ms';\n${statement}`,
  );
}

function json(statement) {
  return JSON.parse(sql(statement));
}

class Session {
  #child;
  #buffer = '';
  #pending;
  #errors = '';
  #closed;
  #requests = new Set();
  name = `${prefix}${++sequence}`;

  constructor() {
    this.#child = spawn('docker', psqlArgs(false), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stderr.setEncoding('utf8');
    this.#child.stderr.on('data', (chunk) => {
      this.#errors += chunk;
    });
    this.#child.stdout.on('data', (chunk) => {
      this.#buffer += chunk;
      const pending = this.#pending;
      if (!pending) return;
      const index = this.#buffer.indexOf(pending.marker);
      if (index < 0 || !this.#buffer.slice(index).includes('\n')) return;
      const diagnostic = this.#buffer
        .slice(index + pending.marker.length)
        .trim();
      const state = diagnostic.split(/\s/u)[0];
      const errorMessage = diagnostic.slice(state.length).trim();
      const output = this.#buffer.slice(0, index).trim();
      this.#buffer = '';
      this.#pending = undefined;
      globalThis.clearTimeout(pending.timer);
      pending.resolve({ state, output, errorMessage, errors: this.#errors });
    });
    this.#child.on('error', (error) => this.#fail(error));
    this.#child.stdin.on('error', (error) => this.#fail(error));
    this.#closed = new Promise((resolve) => {
      this.#child.once('close', () => {
        this.#fail(new Error(`Session closed: ${this.#errors}`));
        resolve();
      });
    });
  }

  #fail(error) {
    if (!this.#pending) return;
    globalThis.clearTimeout(this.#pending.timer);
    this.#pending.reject(error);
    this.#pending = undefined;
  }

  execute(statement) {
    assert.equal(
      this.#pending,
      undefined,
      'Only one statement per session at a time.',
    );
    const marker = `__RESULT_${randomUUID()}__`;
    const request = new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(
        () => this.#fail(new Error('Session deadline exceeded.')),
        12_000,
      );
      this.#pending = { marker, resolve, reject, timer };
      this.#child.stdin.write(
        `${statement};\n\\echo ${marker} :SQLSTATE :LAST_ERROR_MESSAGE\n`,
      );
    });
    this.#requests.add(request);
    // Attach rejection handling immediately, including failures during barriers.
    // Callers still receive the original promise and assert its result/error.
    void request.then(
      () => this.#requests.delete(request),
      () => this.#requests.delete(request),
    );
    return request;
  }

  async ok(statement) {
    const result = await this.execute(statement);
    assert.equal(result.state, '00000', JSON.stringify(result));
    return result.output;
  }

  async begin(actor, role = 'authenticated') {
    await this.ok(`set application_name = '${this.name}'`);
    await this.ok(`set statement_timeout = '${sqlTimeout}ms'`);
    await this.ok("set lock_timeout = '7s'");
    await this.ok("set idle_in_transaction_session_timeout = '15s'");
    await this.ok("set deadlock_timeout = '100ms'");
    await this.ok('begin isolation level read committed');
    await this.ok(
      `set local request.jwt.claims = '${JSON.stringify({ sub: actor, role })}'`,
    );
    await this.ok(`set local role ${role}`);
    return this;
  }

  async close() {
    if (!this.#child.stdin.destroyed) this.#child.stdin.end('rollback;\n\\q\n');
    let timer;
    try {
      await Promise.race([
        this.#closed,
        new Promise((_, reject) => {
          timer = globalThis.setTimeout(() => {
            this.#child.kill();
            reject(new Error(`Closing owned session ${this.name} timed out.`));
          }, 2_000);
        }),
      ]);
      await Promise.allSettled([...this.#requests]);
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}

const dataTables = [
  'auth.users',
  'public.profiles',
  'public.accounts',
  'public.user_roles',
  'public.invitations',
  'public.invitation_operation_requests',
  'public.account_status_history',
  'public.audit_logs',
  'public.volunteers',
  'public.projects',
  'public.project_manager_assignments',
  'public.project_volunteer_assignments',
  'public.project_activities',
  'public.project_activity_participations',
  'public.project_activity_attendances',
];

function assertEmpty() {
  const counts = json(
    `select jsonb_build_object(${dataTables
      .map((name) => `'${name}', (select count(*) from ${name})`)
      .join(',')});`,
  );
  for (const [name, count] of Object.entries(counts))
    assert.equal(
      count,
      0,
      `${name} must be empty, without seeds or real data.`,
    );
}

function fixture() {
  const users = Object.fromEntries(
    ['operator', 'adminA', 'adminB', 'a', 'b', 'outsider'].map((key) => [
      key,
      randomUUID(),
    ]),
  );
  const accounts = Object.fromEntries(
    Object.keys(users).map((key) => [key, randomUUID()]),
  );
  const roleIds = Object.fromEntries(
    [
      'administrator',
      'volunteer',
      'coordinator',
      `aud002_operator_${runId}`,
      `aud002_restricted_${runId}`,
    ].map((code) => [code, randomUUID()]),
  );
  const operatorRole = `aud002_operator_${runId}`;
  const restrictedRole = `aud002_restricted_${runId}`;
  const permissions = Object.fromEntries(
    [
      'account.suspend',
      'account.archive',
      'account.reactivate',
      'account.activate',
      'role_assignment.manage',
    ].map((code) => [code, randomUUID()]),
  );
  const ownRoles = Object.values(roleIds)
    .map((id) => `'${id}'`)
    .join(',');
  const ownPermissions = Object.values(permissions)
    .map((id) => `'${id}'`)
    .join(',');
  const ownUsers = Object.values(users)
    .map((id) => `'${id}'`)
    .join(',');
  const ownAccounts = Object.values(accounts)
    .map((id) => `'${id}'`)
    .join(',');
  const setupSql = `begin;
    insert into public.roles(id,code,description) values ${Object.entries(
      roleIds,
    )
      .map(([code, id]) => `('${id}','${code}','AUD002 disposable fixture')`)
      .join(',')}
      on conflict(code) do nothing;
    insert into public.permissions(id,code,description) values ${Object.entries(
      permissions,
    )
      .map(([code, id]) => `('${id}','${code}','AUD002 disposable fixture')`)
      .join(',')}
      on conflict(code) do nothing;
    insert into public.role_permissions(role_id,permission_id)
      select r.id,p.id from public.roles r cross join public.permissions p
      where r.code='${operatorRole}' and p.code in (${Object.keys(permissions)
        .map((code) => `'${code}'`)
        .join(',')});
    insert into public.role_grant_policies(actor_role_id,target_role_id,can_grant,can_revoke)
      select a.id,t.id,true,true from public.roles a cross join public.roles t
      where a.code='${operatorRole}' and t.code in ('administrator','coordinator','volunteer');
    insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
      values ${Object.entries(users)
        .map(
          ([key, id]) =>
            `('${id}','authenticated','authenticated','aud002-${key.toLowerCase()}-${runId}@example.invalid',statement_timestamp(),statement_timestamp(),statement_timestamp(),'{}','{}')`,
        )
        .join(',')};
    insert into public.accounts(id,auth_user_id,status) values ${Object.keys(
      users,
    )
      .map((key) => `('${accounts[key]}','${users[key]}','active')`)
      .join(',')};
    insert into public.user_roles(user_id,role_id)
      select f.user_id,r.id from (values ${Object.entries(users)
        .map(
          ([key, id]) =>
            `('${id}'::uuid,'${key === 'operator' ? operatorRole : key.startsWith('admin') ? 'administrator' : 'volunteer'}')`,
        )
        .join(',')}) f(user_id,role_code)
      join public.roles r on r.code=f.role_code;
    commit;`;
  return {
    users,
    accounts,
    restrictedRole,
    setup() {
      sql(setupSql);
    },
    cleanup() {
      sql(`begin;
        delete from public.audit_logs where actor_user_id in (${ownUsers}) or target_user_id in (${ownUsers}) or entity_id in (${ownAccounts});
        delete from public.account_status_history where account_id in (${ownAccounts});
        delete from public.user_roles where user_id in (${ownUsers});
        delete from public.accounts where id in (${ownAccounts});
        delete from public.profiles where id in (${ownUsers});
        delete from auth.users where id in (${ownUsers});
        delete from public.role_grant_policies where actor_role_id in (${ownRoles});
        delete from public.role_permissions where role_id in (${ownRoles});
        delete from public.roles where id in (${ownRoles});
        delete from public.permissions where id in (${ownPermissions});
        commit;`);
      assertEmpty();
    },
  };
}

function status(
  f,
  target = 'a',
  next = 'suspended',
  reason = 'AUD002 fixture transition',
) {
  return `select id from public.change_account_status('${f.accounts[target]}','${next}','${reason}')`;
}

function role(f, target = 'a', code = 'coordinator', operation = 'grant') {
  return `select id from public.manage_account_role('${f.accounts[target]}','${code}','${operation}')`;
}

function snapshot(f, target = 'a') {
  return json(`select jsonb_build_object(
    'status',a.status,'version',a.authority_version,
    'roles',(select coalesce(jsonb_agg(r.code order by r.code),'[]') from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=a.auth_user_id),
    'history',(select count(*) from public.account_status_history h where h.account_id=a.id),
    'audit',(select count(*) from public.audit_logs l where l.entity_id=a.id),
    'correlated',(select count(*) from public.account_status_history h join public.audit_logs l on l.correlation_id=h.correlation_id and l.entity_id=h.account_id and l.actor_user_id=h.actor_user_id and l.previous_state=h.from_status and l.new_state=h.to_status and l.action='account.'||h.to_status where h.account_id=a.id),
    'unsafeAudit',(select count(*) from public.audit_logs l where l.entity_id=a.id and (l.metadata ?| array['email','reason','token','password'] or l.actor_user_id is distinct from '${f.users.operator}'::uuid))
    ) from public.accounts a where a.id='${f.accounts[target]}';`);
}

function assertSnapshot(f, target, expected) {
  assert.deepEqual(snapshot(f, target), {
    ...expected,
    correlated: expected.history,
    unsafeAudit: 0,
  });
}

async function waitForMutex(waiter, owner) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const reached = json(`select to_jsonb(exists(
      select 1 from pg_catalog.pg_stat_activity w
      join pg_catalog.pg_locks l on l.pid=w.pid
      join pg_catalog.pg_stat_activity b on b.pid=any(pg_catalog.pg_blocking_pids(w.pid))
      where w.application_name='${waiter.name}' and b.application_name='${owner.name}'
        and w.wait_event_type='Lock' and l.locktype='advisory'
        and l.classid=20260724 and l.objid=1 and l.objsubid=2 and not l.granted
    ));`);
    if (reached) return;
    // Poll a server-observed condition; elapsed time alone never releases a worker.
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  }
  throw new Error('Worker did not reach the expected advisory-lock barrier.');
}

async function expectState(promise, state) {
  const result = await promise;
  assert.notEqual(result.state, '40P01', `DEADLOCK: ${JSON.stringify(result)}`);
  assert.notEqual(
    result.state,
    '57014',
    'Statement timeout is not a business conflict.',
  );
  assert.notEqual(
    result.state,
    '55P03',
    'Lock timeout is not a business conflict.',
  );
  assert.equal(result.state, state, JSON.stringify(result));
}

test(
  'AUD-002 real PostgreSQL concurrency (authorized disposable database only)',
  { timeout: 180_000 },
  async (t) => {
    assert.equal(
      Math.floor(
        Number(sql("select current_setting('server_version_num');")) / 10_000,
      ),
      17,
    );
    const controller = new Session();
    t.after(async () => {
      await controller.close();
    });
    await controller.ok(`set application_name = '${prefix}controller'`);
    // Session-level harness guard, independent of the application's mutex.
    assert.equal(
      await controller.ok('select pg_try_advisory_lock(20261122,2)'),
      't',
    );
    assertEmpty();

    async function scenario(name, body) {
      await t.test(name, async () => {
        assertEmpty();
        const f = fixture();
        const sessions = [];
        const open = async (
          actor = f.users.operator,
          apiRole = 'authenticated',
        ) => {
          const session = new Session();
          sessions.push(session);
          return session.begin(actor, apiRole);
        };
        const errors = [];
        try {
          f.setup();
          await body(f, open);
        } catch (error) {
          errors.push(error);
        } finally {
          // Terminate only this case's exact, unique application names, rolling back
          // pending transactions even when an assertion/worker failed.
          const names = sessions.map((s) => `'${s.name}'`).join(',');
          if (sessions.length) {
            try {
              sql(
                `select pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where application_name in (${names});`,
              );
            } catch (error) {
              errors.push(error);
            }
          }
          const closures = await Promise.allSettled(
            sessions.map((session) => session.close()),
          );
          for (const result of closures)
            if (result.status === 'rejected') errors.push(result.reason);
          // Never delete fixtures while a worker might still be writing them.
          try {
            if (sessions.length)
              assert.equal(
                Number(
                  sql(
                    `select count(*) from pg_catalog.pg_stat_activity where application_name in (${names});`,
                  ),
                ),
                0,
                'Owned PostgreSQL sessions remain; fixtures retained for inspection.',
              );
            assert.equal(
              Number(
                sql(
                  "select count(*) from pg_catalog.pg_locks where locktype='advisory' and classid=20260724 and objid=1 and objsubid=2;",
                ),
              ),
              0,
              'Administrative mutex must be released after worker teardown.',
            );
            f.cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length)
          throw new AggregateError(errors, `AUD002 scenario failed: ${name}`);
      });
    }

    for (const sameAccount of [true, false]) {
      await scenario(
        `role first, ${sameAccount ? 'same' : 'different'} account: no row/advisory cycle`,
        async (f, open) => {
          const owner = await open();
          await owner.ok('select pg_advisory_xact_lock(20260724,1)');
          const waiter = await open();
          const change = waiter.execute(status(f));
          await waitForMutex(waiter, owner);
          await expectState(
            owner.execute(role(f, sameAccount ? 'a' : 'b')),
            '00000',
          );
          await owner.ok('commit');
          await expectState(change, '00000');
          await waiter.ok('commit');
          assertSnapshot(f, 'a', {
            status: 'suspended',
            version: sameAccount ? 3 : 2,
            roles: sameAccount ? ['coordinator', 'volunteer'] : ['volunteer'],
            history: 1,
            audit: sameAccount ? 2 : 1,
          });
          if (!sameAccount)
            assertSnapshot(f, 'b', {
              status: 'active',
              version: 2,
              roles: ['coordinator', 'volunteer'],
              history: 0,
              audit: 1,
            });
        },
      );
      await scenario(
        `status first, ${sameAccount ? 'same' : 'different'} account: serialized outcome`,
        async (f, open) => {
          const owner = await open();
          await owner.ok(status(f));
          const waiter = await open();
          const change = waiter.execute(role(f, sameAccount ? 'a' : 'b'));
          await waitForMutex(waiter, owner);
          await owner.ok('commit');
          await expectState(change, sameAccount ? '23514' : '00000');
          await waiter.ok(sameAccount ? 'rollback' : 'commit');
          assertSnapshot(f, 'a', {
            status: 'suspended',
            version: 2,
            roles: ['volunteer'],
            history: 1,
            audit: 1,
          });
          if (!sameAccount)
            assertSnapshot(f, 'b', {
              status: 'active',
              version: 2,
              roles: ['coordinator', 'volunteer'],
              history: 0,
              audit: 1,
            });
        },
      );
    }

    await scenario(
      'simultaneous RPCs preserve one serial outcome',
      async (f, open) => {
        const first = await open();
        const second = await open();
        const [stateResult, roleResult] = await Promise.all([
          first.execute(status(f)).then(async (result) => {
            await first.ok(result.state === '00000' ? 'commit' : 'rollback');
            return result;
          }),
          second.execute(role(f)).then(async (result) => {
            await second.ok(result.state === '00000' ? 'commit' : 'rollback');
            return result;
          }),
        ]);
        await expectState(Promise.resolve(stateResult), '00000');
        assert.ok(
          ['00000', '23514'].includes(roleResult.state),
          JSON.stringify(roleResult),
        );
        const granted = roleResult.state === '00000';
        assertSnapshot(f, 'a', {
          status: 'suspended',
          version: granted ? 3 : 2,
          roles: granted ? ['coordinator', 'volunteer'] : ['volunteer'],
          history: 1,
          audit: granted ? 2 : 1,
        });
      },
    );

    for (const firstKind of ['status', 'role'])
      await scenario(
        `${firstKind} rollback releases mutex without partial writes`,
        async (f, open) => {
          const owner = await open();
          await owner.ok(firstKind === 'status' ? status(f) : role(f));
          const waiter = await open();
          const pending = waiter.execute(
            firstKind === 'status' ? role(f) : status(f),
          );
          await waitForMutex(waiter, owner);
          await owner.ok('rollback');
          await expectState(pending, '00000');
          await waiter.ok('commit');
          assertSnapshot(f, 'a', {
            status: firstKind === 'status' ? 'active' : 'suspended',
            version: 2,
            roles:
              firstKind === 'status'
                ? ['coordinator', 'volunteer']
                : ['volunteer'],
            history: firstKind === 'status' ? 0 : 1,
            audit: 1,
          });
        },
      );

    const reductions = [
      [
        'suspend/archive',
        (f) => status(f, 'adminA'),
        (f) => status(f, 'adminB', 'archived'),
      ],
      [
        'revoke/revoke',
        (f) => role(f, 'adminA', 'administrator', 'revoke'),
        (f) => role(f, 'adminB', 'administrator', 'revoke'),
      ],
      [
        'suspend/revoke',
        (f) => status(f, 'adminA'),
        (f) => role(f, 'adminB', 'administrator', 'revoke'),
      ],
    ];
    for (const [label, left, right] of reductions)
      for (const reverse of [false, true]) {
        await scenario(
          `last administrator ${label}, reverse=${reverse}`,
          async (f, open) => {
            const initial = Number(
              sql(
                "select count(*) from public.accounts a join public.user_roles u on u.user_id=a.auth_user_id join public.roles r on r.id=u.role_id where a.status='active' and r.code='administrator' and r.archived_at is null;",
              ),
            );
            assert.equal(initial, 2);
            const owner = await open();
            await owner.ok((reverse ? right : left)(f));
            const waiter = await open();
            const pending = waiter.execute((reverse ? left : right)(f));
            await waitForMutex(waiter, owner);
            await owner.ok('commit');
            const result = await pending;
            await expectState(Promise.resolve(result), '23514');
            assert.match(result.errorMessage, /last_active_administrator/u);
            await waiter.ok('rollback');
            assert.equal(
              Number(
                sql(
                  "select count(*) from public.accounts a join public.user_roles u on u.user_id=a.auth_user_id join public.roles r on r.id=u.role_id where a.status='active' and r.code='administrator' and r.archived_at is null;",
                ),
              ),
              1,
            );
            const winnerIsStatus =
              label === 'suspend/archive' ||
              (label === 'suspend/revoke' && !reverse);
            assertSnapshot(f, reverse ? 'adminB' : 'adminA', {
              status: winnerIsStatus
                ? reverse
                  ? 'archived'
                  : 'suspended'
                : 'active',
              version: 2,
              roles: winnerIsStatus ? ['administrator'] : [],
              history: winnerIsStatus ? 1 : 0,
              audit: 1,
            });
            assertSnapshot(f, reverse ? 'adminA' : 'adminB', {
              status: 'active',
              version: 1,
              roles: ['administrator'],
              history: 0,
              audit: 0,
            });
          },
        );
      }

    for (const kind of ['status', 'role'])
      await scenario(
        `${kind} rechecks permission after waiting on G`,
        async (f, open) => {
          const owner = await open();
          await owner.ok('select pg_advisory_xact_lock(20260724,1)');
          const waiter = await open();
          const pending = waiter.execute(
            kind === 'status' ? status(f) : role(f),
          );
          await waitForMutex(waiter, owner);
          await owner.ok(status(f, 'operator'));
          await owner.ok('commit');
          await expectState(pending, '42501');
          await waiter.ok('rollback');
          assertSnapshot(f, 'a', {
            status: 'active',
            version: 1,
            roles: ['volunteer'],
            history: 0,
            audit: 0,
          });
          assert.equal(snapshot(f, 'operator').status, 'suspended');
        },
      );

    for (const kind of [
      'self-grant',
      'self-revoke',
      'permission-status',
      'permission-role',
      'policy',
      'anonymous',
      'legacy',
      'reason',
    ])
      await scenario(
        `denied ${kind} has no partial effects`,
        async (f, open) => {
          const actor = kind.startsWith('permission')
            ? f.users.outsider
            : f.users.operator;
          const session = await open(
            actor,
            kind === 'anonymous' ? 'anon' : 'authenticated',
          );
          const statement =
            kind === 'self-grant'
              ? role(f, 'operator', 'volunteer')
              : kind === 'self-revoke'
                ? role(f, 'operator', 'volunteer', 'revoke')
                : kind === 'permission-role'
                  ? role(f)
                  : kind === 'policy'
                    ? role(f, 'a', f.restrictedRole)
                    : kind === 'legacy'
                      ? `select id from public.change_account_status_legacy('${f.accounts.a}','suspended','AUD002 fixture')`
                      : status(
                          f,
                          'a',
                          'suspended',
                          kind === 'reason' ? 'x' : 'AUD002 fixture',
                        );
          await expectState(
            session.execute(statement),
            kind === 'reason' ? '22023' : '42501',
          );
          await session.ok('rollback');
          assertSnapshot(f, 'a', {
            status: 'active',
            version: 1,
            roles: ['volunteer'],
            history: 0,
            audit: 0,
          });
          assert.equal(snapshot(f, 'operator').version, 1);
        },
      );
  },
);
