import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const adminUserId = '00000000-0000-4000-8000-000000000004';
const managerUserId = '00000000-0000-4000-8000-000000000007';
const managerAccountId = '10000000-0000-4000-8000-000000000007';
const databaseName = 'postgres';
const databaseUser = 'postgres';
const projectLabel = 'sistema-voluntariado';
const sessionTimeoutMs = 15_000;
const blockingEvidenceTimeoutMs = 5_000;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    timeout: sessionTimeoutMs,
    ...options,
  });
  if (result.error) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return result.stdout.trim();
}

function findDatabaseContainer() {
  const output = docker([
    'ps',
    '--filter',
    `label=com.supabase.cli.project=${projectLabel}`,
    '--filter',
    'name=supabase_db_',
    '--format',
    '{{.ID}}',
  ]);
  const containers = output.split(/\r?\n/u).filter(Boolean);
  if (containers.length !== 1) {
    throw new Error(
      `Expected one running local Supabase database container, found ${containers.length}. Run the local database reset first.`,
    );
  }
  return containers[0];
}

function psqlArgs(containerId) {
  return [
    'exec',
    '-i',
    containerId,
    'psql',
    '-X',
    '-qAt',
    '-U',
    databaseUser,
    '-d',
    databaseName,
  ];
}

function runSql(containerId, sql) {
  const result = spawnSync(
    'docker',
    [...psqlArgs(containerId), '-v', 'ON_ERROR_STOP=1'],
    {
      encoding: 'utf8',
      input: sql,
      killSignal: 'SIGKILL',
      timeout: sessionTimeoutMs,
    },
  );
  if (result.error) {
    throw new Error(`PostgreSQL command failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`PostgreSQL command failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function authenticatedTransaction(userId, applicationName) {
  return `
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
set local statement_timeout = '${sessionTimeoutMs}ms';
set local application_name = ${sqlLiteral(applicationName)};
`;
}

class PsqlSession {
  #closed = false;
  #exitPromise;
  #lines = [];
  #process;
  #querySequence = 0;
  #stderr = '';
  #stdoutBuffer = '';

  constructor(containerId) {
    this.#process = spawn('docker', psqlArgs(containerId), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#process.stdout.setEncoding('utf8');
    this.#process.stderr.setEncoding('utf8');
    this.#process.stdout.on('data', (chunk) => {
      this.#stdoutBuffer += chunk;
      const parts = this.#stdoutBuffer.split(/\r?\n/u);
      this.#stdoutBuffer = parts.pop() ?? '';
      this.#lines.push(...parts);
    });
    this.#process.stderr.on('data', (chunk) => {
      this.#stderr += chunk;
    });
    this.#exitPromise = new Promise((resolve) => {
      this.#process.once('close', (code, signal) => {
        this.#closed = true;
        resolve({ code, signal });
      });
    });
  }

  get lines() {
    return this.#lines;
  }

  get stderr() {
    return this.#stderr;
  }

  send(sql) {
    if (this.#closed || !this.#process.stdin.writable) {
      throw new Error(
        `Cannot write to closed PostgreSQL session: ${this.#stderr}`,
      );
    }
    this.#process.stdin.write(`${sql}\n`);
  }

  async waitForLine(predicate, description, timeoutMs = sessionTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.#lines.find(predicate);
      if (match !== undefined) return match;
      if (this.#closed) {
        throw new Error(
          `PostgreSQL session exited before ${description}. stderr: ${this.#stderr.trim()}`,
        );
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for ${description}. stdout: ${this.#lines.join(' | ')}; stderr: ${this.#stderr.trim()}`,
    );
  }

  async queryScalar(sql) {
    this.#querySequence += 1;
    const startMarker = `__QUERY_${this.#querySequence}_START__`;
    const endMarker = `__QUERY_${this.#querySequence}_END__`;
    this.send(`\\echo ${startMarker}\n${sql}\n\\echo ${endMarker}`);
    await this.waitForLine(
      (line) => line === endMarker,
      `observer query ${this.#querySequence}`,
    );
    const startIndex = this.#lines.lastIndexOf(startMarker);
    const endIndex = this.#lines.lastIndexOf(endMarker);
    return (
      this.#lines
        .slice(startIndex + 1, endIndex)
        .filter(Boolean)
        .at(-1) ?? ''
    );
  }

  async rollbackAndClose() {
    if (!this.#closed) {
      this.#process.stdin.write('\\set ON_ERROR_STOP off\nrollback;\n\\q\n');
      this.#process.stdin.end();
    }
    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = globalThis.setTimeout(
        () => resolve({ code: null, signal: 'TIMEOUT' }),
        2_000,
      );
    });
    const exit = await Promise.race([this.#exitPromise, timeout]);
    globalThis.clearTimeout(timeoutId);
    if (exit.signal === 'TIMEOUT' && !this.#closed) {
      this.#process.kill('SIGKILL');
      await this.#exitPromise;
    }
  }
}

function parseMarker(output, marker) {
  const line = output
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`${marker}:`));
  if (!line)
    throw new Error(`Missing ${marker} in PostgreSQL output: ${output}`);
  return line.slice(marker.length + 1);
}

function createFixture(containerId, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `activities-fixture-${suffix}`)}
select '__PROJECT__:' || id
from public.create_project(${sqlLiteral(`Activity concurrency ${suffix}`)}, null);
commit;
`,
  );
  return { projectId: parseMarker(output, '__PROJECT__') };
}

function createActivity(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `activity-row-${suffix}`)}
select '__ACTIVITY__:' || id
from public.create_project_activity(
  '${fixture.projectId}'::uuid,
  ${sqlLiteral(`Activity ${suffix}`)},
  null,
  statement_timestamp(),
  null,
  null
);
commit;
`,
  );
  return parseMarker(output, '__ACTIVITY__');
}

function createManagerScope(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `activity-scope-${suffix}`)}
select '__SCOPE__:' || assignment_id
from public.assign_project_manager(
  '${fixture.projectId}'::uuid,
  '${managerAccountId}'::uuid
);
commit;
`,
  );
  return parseMarker(output, '__SCOPE__');
}

function cleanupFixture(containerId, fixture) {
  runSql(
    containerId,
    `
begin;
set local session_replication_role = replica;
delete from public.audit_logs
where (entity_type = 'project' and entity_id = '${fixture.projectId}'::uuid)
   or (
     entity_type = 'project_activity'
     and entity_id in (
       select id from public.project_activities
       where project_id = '${fixture.projectId}'::uuid
     )
   )
   or (
     entity_type = 'project_manager_assignment'
     and entity_id in (
       select id from public.project_manager_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   );
delete from public.project_activities where project_id = '${fixture.projectId}'::uuid;
delete from public.project_manager_assignments where project_id = '${fixture.projectId}'::uuid;
delete from public.projects where id = '${fixture.projectId}'::uuid;
commit;
`,
  );
}

async function beginSession(session, userId, applicationName) {
  session.send(`${authenticatedTransaction(userId, applicationName)}
select '__PID__:' || pg_backend_pid();`);
  const line = await session.waitForLine(
    (candidate) => candidate.startsWith('__PID__:'),
    `${applicationName} backend PID`,
  );
  return Number(line.slice('__PID__:'.length));
}

async function waitForBlockedBy(
  observer,
  waiterSession,
  waiterPid,
  blockerPid,
) {
  const deadline = Date.now() + blockingEvidenceTimeoutMs;
  while (Date.now() < deadline) {
    if (waiterSession.lines.includes('__CONTENDER_DONE__')) {
      throw new Error(
        'Contending RPC completed before the expected row lock wait.',
      );
    }
    const state = await observer.queryScalar(`
select case
  when activity.wait_event_type = 'Lock'
    and ${blockerPid} = any(pg_blocking_pids(${waiterPid}))
  then 'blocked'
  else coalesce(activity.wait_event_type, activity.state, 'missing')
end
from pg_stat_activity as activity
where activity.pid = ${waiterPid};
`);
    if (state === 'blocked') return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  }
  throw new Error(
    `PostgreSQL did not report backend ${waiterPid} blocked by ${blockerPid}.`,
  );
}

async function runHolder(session, sql) {
  session.send(`${sql}
\\echo __HOLDER_READY__`);
  await session.waitForLine(
    (line) => line === '__HOLDER_READY__',
    'holder operation',
  );
}

function sendExpectedFailure(session, sql) {
  session.send(`
\\set ON_ERROR_STOP off
${sql}
\\echo __SQLSTATE__: :SQLSTATE
\\echo __ERROR_MESSAGE__: :LAST_ERROR_MESSAGE
rollback;
\\echo __CONTENDER_DONE__
`);
}

function sendExpectedSuccess(session, sql) {
  session.send(`
\\set ON_ERROR_STOP on
${sql}
commit;
\\echo __CONTENDER_DONE__
`);
}

async function commitHolder(session) {
  session.send('commit;\n\\echo __HOLDER_COMMITTED__');
  await session.waitForLine(
    (line) => line === '__HOLDER_COMMITTED__',
    'holder commit',
  );
}

async function expectFailure(session, message, sqlState = '23514') {
  const stateLine = await session.waitForLine(
    (line) => line.startsWith('__SQLSTATE__:'),
    'contending SQLSTATE',
  );
  const messageLine = await session.waitForLine(
    (line) => line.startsWith('__ERROR_MESSAGE__:'),
    'contending error message',
  );
  await session.waitForLine(
    (line) => line === '__CONTENDER_DONE__',
    'contending rollback',
  );
  assert.equal(stateLine.replace('__SQLSTATE__:', '').trim(), sqlState);
  assert.match(messageLine, new RegExp(message, 'u'));
}

async function expectSuccess(session) {
  await session.waitForLine(
    (line) => line === '__CONTENDER_DONE__',
    'contending commit',
  );
  assert.equal(session.stderr.trim(), '');
}

function scalar(containerId, sql) {
  return runSql(containerId, sql).split(/\r?\n/u).at(-1) ?? '';
}

function assertNoResidualState(containerId, prefix) {
  const state = scalar(
    containerId,
    `
select
  (select count(*) from pg_stat_activity where application_name like ${sqlLiteral(`${prefix}%`)}) || '|' ||
  (select count(*) from pg_locks as lock
    inner join pg_stat_activity as activity on activity.pid = lock.pid
    where activity.application_name like ${sqlLiteral(`${prefix}%`)});
`,
  );
  assert.equal(state, '0|0');
}

async function runScenario(label, callback) {
  const containerId = findDatabaseContainer();
  const suffix = `${label}-${randomUUID()}`;
  const prefix = `act-${randomUUID().slice(0, 8)}`;
  const fixture = createFixture(containerId, suffix);
  const holder = new PsqlSession(containerId);
  const contender = new PsqlSession(containerId);
  const observer = new PsqlSession(containerId);
  try {
    await callback({
      containerId,
      contender,
      fixture,
      holder,
      observer,
      prefix,
      suffix,
    });
  } finally {
    await Promise.all([
      holder.rollbackAndClose(),
      contender.rollbackAndClose(),
      observer.rollbackAndClose(),
    ]);
    cleanupFixture(containerId, fixture);
    assertNoResidualState(containerId, prefix);
  }
}

test('activity create wins against project close', async () => {
  await runScenario('create-wins-close', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-create`,
    );
    await runHolder(
      context.holder,
      `select * from public.create_project_activity(
        '${context.fixture.projectId}'::uuid,
        'Create winner', null, statement_timestamp(), null, null
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-close`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.close_project('${context.fixture.projectId}'::uuid);`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'project_has_scheduled_activities');
    assert.equal(
      scalar(
        context.containerId,
        `select status || '|' || (select count(*) from public.project_activities where project_id = project.id) from public.projects as project where id = '${context.fixture.projectId}'::uuid;`,
      ),
      'active|1',
    );
  });
});

test('project close wins against activity create', async () => {
  await runScenario('close-wins-create', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-close`,
    );
    await runHolder(
      context.holder,
      `select * from public.close_project('${context.fixture.projectId}'::uuid);`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-create`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.create_project_activity(
        '${context.fixture.projectId}'::uuid,
        'Losing create', null, statement_timestamp(), null, null
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'project_closed');
    assert.equal(
      scalar(
        context.containerId,
        `select status || '|' || (select count(*) from public.project_activities where project_id = project.id) from public.projects as project where id = '${context.fixture.projectId}'::uuid;`,
      ),
      'closed|0',
    );
  });
});

async function terminalWinsClose(target) {
  await runScenario(`${target}-wins-close`, async (context) => {
    const activityId = createActivity(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-${target}`,
    );
    await runHolder(
      context.holder,
      `select * from public.${target}_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-close`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.close_project('${context.fixture.projectId}'::uuid);`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select project.status || '|' || activity.status from public.projects as project inner join public.project_activities as activity on activity.project_id = project.id where activity.id = '${activityId}'::uuid;`,
      ),
      `closed|${target === 'complete' ? 'completed' : 'cancelled'}`,
    );
  });
}

test('completing the last scheduled activity wins before close', async () => {
  await terminalWinsClose('complete');
});

test('close waits and rejects while an activity remains scheduled', async () => {
  await runScenario('close-observes-scheduled', async (context) => {
    createActivity(context.containerId, context.fixture, context.suffix);
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-project-lock`,
    );
    await runHolder(
      context.holder,
      `select * from public.update_project(
        '${context.fixture.projectId}'::uuid,
        'Project lock holder',
        null
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-close`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.close_project('${context.fixture.projectId}'::uuid);`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'project_has_scheduled_activities');
    assert.equal(
      scalar(
        context.containerId,
        `select status from public.projects where id = '${context.fixture.projectId}'::uuid;`,
      ),
      'active',
    );
  });
});

test('cancelling the last scheduled activity wins before close', async () => {
  await terminalWinsClose('cancel');
});

async function terminalTransitionWins(winner, loser) {
  await runScenario(`${winner}-wins-${loser}`, async (context) => {
    const activityId = createActivity(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-${winner}`,
    );
    await runHolder(
      context.holder,
      `select * from public.${winner}_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-${loser}`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.${loser}_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'project_activity_not_scheduled');
    assert.equal(
      scalar(
        context.containerId,
        `select status || '|' || (select count(*) from public.audit_logs where entity_type = 'project_activity' and entity_id = activity.id and action in ('project_activity.completed', 'project_activity.cancelled')) from public.project_activities as activity where id = '${activityId}'::uuid;`,
      ),
      `${winner === 'complete' ? 'completed' : 'cancelled'}|1`,
    );
  });
}

test('complete wins against cancel exactly once', async () => {
  await terminalTransitionWins('complete', 'cancel');
});

test('cancel wins against complete exactly once', async () => {
  await terminalTransitionWins('cancel', 'complete');
});

test('contextual activity mutation wins before scope removal', async () => {
  await runScenario('mutation-wins-scope-removal', async (context) => {
    const activityId = createActivity(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const scopeId = createManagerScope(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      managerUserId,
      `${context.prefix}-mutation`,
    );
    await runHolder(
      context.holder,
      `select * from public.update_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid,
        'Manager winner', null, statement_timestamp(), null, null
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-scope-removal`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.finish_project_manager_assignment('${scopeId}'::uuid);`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select activity.name || '|' || (scope.ended_at is not null)::text from public.project_activities as activity cross join public.project_manager_assignments as scope where activity.id = '${activityId}'::uuid and scope.id = '${scopeId}'::uuid;`,
      ),
      'Manager winner|true',
    );
  });
});

test('scope removal wins before contextual activity mutation', async () => {
  await runScenario('scope-removal-wins-mutation', async (context) => {
    const activityId = createActivity(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const scopeId = createManagerScope(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-scope-removal`,
    );
    await runHolder(
      context.holder,
      `select * from public.finish_project_manager_assignment('${scopeId}'::uuid);`,
    );
    const contenderPid = await beginSession(
      context.contender,
      managerUserId,
      `${context.prefix}-mutation`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.update_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid,
        'Manager loser', null, statement_timestamp(), null, null
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'permission_denied', '42501');
    assert.equal(
      scalar(
        context.containerId,
        `select name from public.project_activities where id = '${activityId}'::uuid;`,
      ),
      `Activity ${context.suffix}`,
    );
  });
});

function contextualMutationSql(operation, context, activityId, outcome) {
  if (operation === 'create') {
    return `select * from public.create_project_activity(
      '${context.fixture.projectId}'::uuid,
      'Manager ${outcome} create', null, statement_timestamp(), null, null
    );`;
  }
  assert.ok(activityId);
  return `select * from public.${operation}_project_activity(
    '${context.fixture.projectId}'::uuid,
    '${activityId}'::uuid
  );`;
}

for (const operation of ['create', 'complete', 'cancel']) {
  test(`contextual ${operation} wins before scope removal`, async () => {
    await runScenario(`${operation}-wins-scope-removal`, async (context) => {
      const activityId =
        operation === 'create'
          ? null
          : createActivity(
              context.containerId,
              context.fixture,
              context.suffix,
            );
      const scopeId = createManagerScope(
        context.containerId,
        context.fixture,
        context.suffix,
      );
      const holderPid = await beginSession(
        context.holder,
        managerUserId,
        `${context.prefix}-${operation}`,
      );
      await runHolder(
        context.holder,
        contextualMutationSql(operation, context, activityId, 'winner'),
      );
      const contenderPid = await beginSession(
        context.contender,
        adminUserId,
        `${context.prefix}-scope-removal`,
      );
      sendExpectedSuccess(
        context.contender,
        `select * from public.finish_project_manager_assignment('${scopeId}'::uuid);`,
      );
      await waitForBlockedBy(
        context.observer,
        context.contender,
        contenderPid,
        holderPid,
      );
      await commitHolder(context.holder);
      await expectSuccess(context.contender);
      assert.equal(
        scalar(
          context.containerId,
          `select (ended_at is not null)::text from public.project_manager_assignments where id = '${scopeId}'::uuid;`,
        ),
        'true',
      );
      assert.equal(
        scalar(
          context.containerId,
          operation === 'create'
            ? `select status from public.project_activities where project_id = '${context.fixture.projectId}'::uuid and name = 'Manager winner create';`
            : `select status from public.project_activities where id = '${activityId}'::uuid;`,
        ),
        operation === 'create'
          ? 'scheduled'
          : operation === 'complete'
            ? 'completed'
            : 'cancelled',
      );
    });
  });

  test(`scope removal wins before contextual ${operation}`, async () => {
    await runScenario(`scope-removal-wins-${operation}`, async (context) => {
      const activityId =
        operation === 'create'
          ? null
          : createActivity(
              context.containerId,
              context.fixture,
              context.suffix,
            );
      const scopeId = createManagerScope(
        context.containerId,
        context.fixture,
        context.suffix,
      );
      const holderPid = await beginSession(
        context.holder,
        adminUserId,
        `${context.prefix}-scope-removal`,
      );
      await runHolder(
        context.holder,
        `select * from public.finish_project_manager_assignment('${scopeId}'::uuid);`,
      );
      const contenderPid = await beginSession(
        context.contender,
        managerUserId,
        `${context.prefix}-${operation}`,
      );
      sendExpectedFailure(
        context.contender,
        contextualMutationSql(operation, context, activityId, 'loser'),
      );
      await waitForBlockedBy(
        context.observer,
        context.contender,
        contenderPid,
        holderPid,
      );
      await commitHolder(context.holder);
      await expectFailure(context.contender, 'permission_denied', '42501');
      assert.equal(
        scalar(
          context.containerId,
          operation === 'create'
            ? `select count(*) from public.project_activities where project_id = '${context.fixture.projectId}'::uuid;`
            : `select status from public.project_activities where id = '${activityId}'::uuid;`,
        ),
        operation === 'create' ? '0' : 'scheduled',
      );
    });
  });
}

test('independent activity creates serialize on their shared project', async () => {
  await runScenario('create-create', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-first`,
    );
    await runHolder(
      context.holder,
      `select * from public.create_project_activity(
        '${context.fixture.projectId}'::uuid,
        'First independent activity', null, statement_timestamp(), null, null
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-second`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.create_project_activity(
        '${context.fixture.projectId}'::uuid,
        'Second independent activity', null, statement_timestamp(), null, null
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select count(*) from public.project_activities where project_id = '${context.fixture.projectId}'::uuid;`,
      ),
      '2',
    );
  });
});

test('scheduled update commits before a waiting terminal transition', async () => {
  await runScenario('update-before-complete', async (context) => {
    const activityId = createActivity(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-update`,
    );
    await runHolder(
      context.holder,
      `select * from public.update_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid,
        'Updated before terminal', null, statement_timestamp(), null, null
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-complete`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.complete_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${activityId}'::uuid
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select name || '|' || status from public.project_activities where id = '${activityId}'::uuid;`,
      ),
      'Updated before terminal|completed',
    );
  });
});
