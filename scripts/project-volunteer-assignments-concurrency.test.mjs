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
      `Expected one running local Supabase database container, found ${containers.length}. Run \`corepack pnpm db:start\` and \`corepack pnpm db:reset\` first.`,
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

function administratorTransaction(applicationName) {
  return authenticatedTransaction(adminUserId, applicationName);
}

class PsqlSession {
  #closed = false;
  #exitPromise;
  #lines = [];
  #process;
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

  get closed() {
    return this.#closed;
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
        `Cannot write to a closed PostgreSQL session. ${this.#stderr}`,
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
    `${administratorTransaction(`projects-concurrency-fixture-${suffix}`)}
select '__PROJECT__:' || id
from public.create_project(${sqlLiteral(`Concurrency project ${suffix}`)}, null);
select '__VOLUNTEER__:' || id
from public.create_volunteer(
  ${sqlLiteral(`Concurrency volunteer ${suffix}`)},
  null,
  null,
  false
);
commit;
`,
  );
  return {
    projectId: parseMarker(output, '__PROJECT__'),
    volunteerId: parseMarker(output, '__VOLUNTEER__'),
  };
}

function createManagerScope(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${administratorTransaction(`manager-scope-fixture-${suffix}`)}
select '__MANAGER_ASSIGNMENT__:' || assignment_id
from public.assign_project_manager(
  '${fixture.projectId}'::uuid,
  '${managerAccountId}'::uuid
);
commit;
`,
  );
  return parseMarker(output, '__MANAGER_ASSIGNMENT__');
}

function cleanupFixture(containerId, fixture) {
  runSql(
    containerId,
    `
begin;
set local session_replication_role = replica;
delete from public.audit_logs
where (entity_type = 'project' and entity_id = '${fixture.projectId}'::uuid)
   or (entity_type = 'volunteer' and entity_id = '${fixture.volunteerId}'::uuid)
   or (
     entity_type = 'project_assignment'
     and entity_id in (
       select id
       from public.project_volunteer_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   )
   or (
     entity_type = 'project_manager_assignment'
     and entity_id in (
       select id
       from public.project_manager_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   );
delete from public.project_manager_assignments
where project_id = '${fixture.projectId}'::uuid;
delete from public.project_volunteer_assignments
where project_id = '${fixture.projectId}'::uuid;
delete from public.projects where id = '${fixture.projectId}'::uuid;
delete from public.volunteers where id = '${fixture.volunteerId}'::uuid;
commit;
`,
  );
}

async function beginSession(session, applicationName) {
  return beginAuthenticatedSession(session, adminUserId, applicationName);
}

async function beginAuthenticatedSession(session, userId, applicationName) {
  session.send(`${authenticatedTransaction(userId, applicationName)}
select '__PID__:' || pg_backend_pid();`);
  const line = await session.waitForLine(
    (candidate) => candidate.startsWith('__PID__:'),
    `${applicationName} backend PID`,
  );
  return Number(line.slice('__PID__:'.length));
}

async function waitForBlockedBy(
  containerId,
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
    const state = runSql(
      containerId,
      `
select case
  when activity.wait_event_type = 'Lock'
    and ${blockerPid} = any(pg_blocking_pids(${waiterPid}))
  then 'blocked'
  else coalesce(activity.wait_event_type, activity.state, 'missing')
end
from pg_stat_activity as activity
where activity.pid = ${waiterPid};
`,
    );
    if (state === 'blocked') return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  }
  throw new Error(
    `PostgreSQL did not report backend ${waiterPid} blocked by ${blockerPid}.`,
  );
}

function sendExpectedFailure(session, rpcSql) {
  session.send(`
\\set ON_ERROR_STOP off
${rpcSql}
\\echo __SQLSTATE__: :SQLSTATE
rollback;
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

async function expectedFailure(session, message, sqlState = '23514') {
  const stateLine = await session.waitForLine(
    (line) => line.startsWith('__SQLSTATE__:'),
    'contending SQLSTATE',
  );
  await session.waitForLine(
    (line) => line === '__CONTENDER_DONE__',
    'contending rollback',
  );
  assert.equal(stateLine.replace('__SQLSTATE__:', '').trim(), sqlState);
  assert.match(session.stderr, new RegExp(message, 'u'));
}

function assertNoResidualState(containerId, prefix, fixture) {
  const output = runSql(
    containerId,
    `
select
  (select count(*) from pg_stat_activity where application_name like ${sqlLiteral(`${prefix}%`)}) || '|' ||
  (select count(*) from pg_locks as lock
    inner join pg_stat_activity as activity on activity.pid = lock.pid
    where activity.application_name like ${sqlLiteral(`${prefix}%`)}) || '|' ||
  (select count(*) from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.volunteers where id = '${fixture.volunteerId}'::uuid) || '|' ||
  (select count(*) from public.project_volunteer_assignments where project_id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.project_manager_assignments where project_id = '${fixture.projectId}'::uuid);
`,
  );
  assert.equal(output, '0|0|0|0|0|0');
}

test(
  'assign-first blocks close and preserves an active project with one assignment',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `projects-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const assignSession = new PsqlSession(containerId);
    const closeSession = new PsqlSession(containerId);
    try {
      const assignPid = await beginSession(assignSession, `${prefix}-assign`);
      const closePid = await beginSession(closeSession, `${prefix}-close`);
      assignSession.send(`
select '__ASSIGNMENT__:' || assignment_id
from public.assign_volunteer_to_project(
  '${fixture.projectId}'::uuid,
  '${fixture.volunteerId}'::uuid
);
select '__HOLDER_READY__';
`);
      const assignmentLine = await assignSession.waitForLine(
        (line) => line.startsWith('__ASSIGNMENT__:'),
        'created assignment ID',
      );
      const assignmentId = assignmentLine.slice('__ASSIGNMENT__:'.length);
      await assignSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'assignment holder readiness',
      );

      sendExpectedFailure(
        closeSession,
        `select * from public.close_project('${fixture.projectId}'::uuid);`,
      );
      await waitForBlockedBy(containerId, closeSession, closePid, assignPid);
      context.diagnostic(
        `close backend ${closePid} blocked by assign ${assignPid}`,
      );
      await commitHolder(assignSession);
      await expectedFailure(closeSession, 'project_has_active_assignments');

      const finalState = runSql(
        containerId,
        `
select
  (select status from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.project_volunteer_assignments
    where project_id = '${fixture.projectId}'::uuid and ended_at is null) || '|' ||
  (select count(*) from public.projects as project
    inner join public.project_volunteer_assignments as assignment
      on assignment.project_id = project.id
    where project.status = 'closed' and assignment.ended_at is null) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project_assignment.created'
      and entity_id = '${assignmentId}'::uuid
      and actor_user_id = '${adminUserId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project.closed'
      and entity_id = '${fixture.projectId}'::uuid);
`,
      );
      assert.equal(finalState, 'active|1|0|1|0');
    } finally {
      await Promise.all([
        assignSession.rollbackAndClose(),
        closeSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'close-first blocks assignment and preserves a closed project without assignments',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `projects-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const closeSession = new PsqlSession(containerId);
    const assignSession = new PsqlSession(containerId);
    try {
      const closePid = await beginSession(closeSession, `${prefix}-close`);
      const assignPid = await beginSession(assignSession, `${prefix}-assign`);
      closeSession.send(`
select '__CLOSE_STATUS__:' || status
from public.close_project('${fixture.projectId}'::uuid);
select '__HOLDER_READY__';
`);
      await closeSession.waitForLine(
        (line) => line === '__CLOSE_STATUS__:closed',
        'uncommitted closed project',
      );
      await closeSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'close holder readiness',
      );

      sendExpectedFailure(
        assignSession,
        `select * from public.assign_volunteer_to_project(
          '${fixture.projectId}'::uuid,
          '${fixture.volunteerId}'::uuid
        );`,
      );
      await waitForBlockedBy(containerId, assignSession, assignPid, closePid);
      context.diagnostic(
        `assign backend ${assignPid} blocked by close ${closePid}`,
      );
      await commitHolder(closeSession);
      await expectedFailure(assignSession, 'project_closed');

      const finalState = runSql(
        containerId,
        `
select
  (select status from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.project_volunteer_assignments
    where project_id = '${fixture.projectId}'::uuid and ended_at is null) || '|' ||
  (select count(*) from public.project_volunteer_assignments
    where project_id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.projects as project
    inner join public.project_volunteer_assignments as assignment
      on assignment.project_id = project.id
    where project.status = 'closed' and assignment.ended_at is null) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project.closed'
      and entity_id = '${fixture.projectId}'::uuid
      and actor_user_id = '${adminUserId}'::uuid);
`,
      );
      assert.equal(finalState, 'closed|0|0|0|1');
    } finally {
      await Promise.all([
        closeSession.rollbackAndClose(),
        assignSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'manager-assign-first blocks close and preserves the active manager scope after close',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `manager-close-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const assignSession = new PsqlSession(containerId);
    const closeSession = new PsqlSession(containerId);
    try {
      const assignPid = await beginSession(assignSession, `${prefix}-assign`);
      const closePid = await beginSession(closeSession, `${prefix}-close`);
      assignSession.send(`
select '__MANAGER_ASSIGNMENT__:' || assignment_id
from public.assign_project_manager(
  '${fixture.projectId}'::uuid,
  '${managerAccountId}'::uuid
);
select '__HOLDER_READY__';
`);
      const assignmentLine = await assignSession.waitForLine(
        (line) => line.startsWith('__MANAGER_ASSIGNMENT__:'),
        'created manager assignment ID',
      );
      const assignmentId = assignmentLine.slice(
        '__MANAGER_ASSIGNMENT__:'.length,
      );
      await assignSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'manager assignment holder readiness',
      );

      closeSession.send(`
select '__CLOSE_STATUS__:' || status
from public.close_project('${fixture.projectId}'::uuid);
commit;
\\echo __CONTENDER_DONE__
`);
      await waitForBlockedBy(containerId, closeSession, closePid, assignPid);
      context.diagnostic(
        `close backend ${closePid} blocked by manager assign ${assignPid}`,
      );
      await commitHolder(assignSession);
      await closeSession.waitForLine(
        (line) => line === '__CLOSE_STATUS__:closed',
        'close after manager assignment commit',
      );
      await closeSession.waitForLine(
        (line) => line === '__CONTENDER_DONE__',
        'close contender commit',
      );

      const finalState = runSql(
        containerId,
        `
select
  (select status from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.project_manager_assignments
    where project_id = '${fixture.projectId}'::uuid and ended_at is null) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project_manager_assignment.created'
      and entity_id = '${assignmentId}'::uuid
      and actor_user_id = '${adminUserId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project.closed'
      and entity_id = '${fixture.projectId}'::uuid);
`,
      );
      assert.equal(finalState, 'closed|1|1|1');
    } finally {
      await Promise.all([
        assignSession.rollbackAndClose(),
        closeSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'manager-close-first blocks assignment and rejects the new scope',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `manager-close-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const managerAuditBefore = runSql(
      containerId,
      `select count(*) from public.audit_logs where action = 'project_manager_assignment.created';`,
    );
    const closeSession = new PsqlSession(containerId);
    const assignSession = new PsqlSession(containerId);
    try {
      const closePid = await beginSession(closeSession, `${prefix}-close`);
      const assignPid = await beginSession(assignSession, `${prefix}-assign`);
      closeSession.send(`
select '__CLOSE_STATUS__:' || status
from public.close_project('${fixture.projectId}'::uuid);
select '__HOLDER_READY__';
`);
      await closeSession.waitForLine(
        (line) => line === '__CLOSE_STATUS__:closed',
        'uncommitted closed project for manager assignment',
      );
      await closeSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'manager close holder readiness',
      );

      sendExpectedFailure(
        assignSession,
        `select * from public.assign_project_manager(
          '${fixture.projectId}'::uuid,
          '${managerAccountId}'::uuid
        );`,
      );
      await waitForBlockedBy(containerId, assignSession, assignPid, closePid);
      context.diagnostic(
        `manager assign backend ${assignPid} blocked by close ${closePid}`,
      );
      await commitHolder(closeSession);
      await expectedFailure(assignSession, 'project_closed');

      const finalState = runSql(
        containerId,
        `
select
  (select status from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.project_manager_assignments
    where project_id = '${fixture.projectId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project.closed'
      and entity_id = '${fixture.projectId}'::uuid
      and actor_user_id = '${adminUserId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs
    where action = 'project_manager_assignment.created');
`,
      );
      assert.equal(finalState, `closed|0|1|${managerAuditBefore}`);
    } finally {
      await Promise.all([
        closeSession.rollbackAndClose(),
        assignSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'concurrent manager assignments create exactly one active scope',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `manager-duplicate-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const firstSession = new PsqlSession(containerId);
    const secondSession = new PsqlSession(containerId);
    try {
      const firstPid = await beginSession(firstSession, `${prefix}-first`);
      const secondPid = await beginSession(secondSession, `${prefix}-second`);
      firstSession.send(`
select '__MANAGER_ASSIGNMENT__:' || assignment_id
from public.assign_project_manager(
  '${fixture.projectId}'::uuid,
  '${managerAccountId}'::uuid
);
select '__HOLDER_READY__';
`);
      await firstSession.waitForLine(
        (line) => line.startsWith('__MANAGER_ASSIGNMENT__:'),
        'first manager assignment',
      );
      await firstSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'first manager assignment readiness',
      );
      sendExpectedFailure(
        secondSession,
        `select * from public.assign_project_manager(
          '${fixture.projectId}'::uuid,
          '${managerAccountId}'::uuid
        );`,
      );
      await waitForBlockedBy(containerId, secondSession, secondPid, firstPid);
      context.diagnostic(
        `second manager assign ${secondPid} blocked by first ${firstPid}`,
      );
      await commitHolder(firstSession);
      await expectedFailure(
        secondSession,
        'project_manager_assignment_already_active',
        '23505',
      );

      const finalState = runSql(
        containerId,
        `
select
  (select count(*) from public.project_manager_assignments
    where project_id = '${fixture.projectId}'::uuid and ended_at is null) || '|' ||
  (select count(*) from public.audit_logs as audit
    inner join public.project_manager_assignments as assignment
      on assignment.id = audit.entity_id
    where assignment.project_id = '${fixture.projectId}'::uuid
      and audit.action = 'project_manager_assignment.created');
`,
      );
      assert.equal(finalState, '1|1');
    } finally {
      await Promise.all([
        firstSession.rollbackAndClose(),
        secondSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'manager mutation first serializes scope end after the authorized update',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `manager-scope-end-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const managerAssignmentId = createManagerScope(
      containerId,
      fixture,
      suffix,
    );
    const mutationSession = new PsqlSession(containerId);
    const endSession = new PsqlSession(containerId);
    try {
      const mutationPid = await beginAuthenticatedSession(
        mutationSession,
        managerUserId,
        `${prefix}-mutation`,
      );
      const endPid = await beginSession(endSession, `${prefix}-end`);
      mutationSession.send(`
select '__UPDATED__:' || name
from public.update_project(
  '${fixture.projectId}'::uuid,
  'Manager mutation wins',
  null
);
select '__HOLDER_READY__';
`);
      await mutationSession.waitForLine(
        (line) => line === '__UPDATED__:Manager mutation wins',
        'authorized manager update',
      );
      await mutationSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'manager mutation holder readiness',
      );
      endSession.send(`
select '__ENDED__:' || assignment_id
from public.finish_project_manager_assignment(
  '${managerAssignmentId}'::uuid
);
commit;
\\echo __CONTENDER_DONE__
`);
      await waitForBlockedBy(containerId, endSession, endPid, mutationPid);
      context.diagnostic(
        `scope end ${endPid} blocked by manager mutation ${mutationPid}`,
      );
      await commitHolder(mutationSession);
      await endSession.waitForLine(
        (line) => line === `__ENDED__:${managerAssignmentId}`,
        'scope end after manager mutation',
      );
      await endSession.waitForLine(
        (line) => line === '__CONTENDER_DONE__',
        'scope end commit',
      );

      const finalState = runSql(
        containerId,
        `
select
  (select name from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select case when ended_at is null then 'active' else 'ended' end
    from public.project_manager_assignments where id = '${managerAssignmentId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs
    where entity_id = '${managerAssignmentId}'::uuid
      and action = 'project_manager_assignment.ended');
`,
      );
      assert.equal(finalState, 'Manager mutation wins|ended|1');
    } finally {
      await Promise.all([
        mutationSession.rollbackAndClose(),
        endSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);

test(
  'scope end first blocks and denies the concurrent manager mutation',
  { concurrency: false, timeout: 30_000 },
  async (context) => {
    const containerId = findDatabaseContainer();
    const suffix = randomUUID();
    const prefix = `manager-scope-end-concurrency-${suffix}`;
    const fixture = createFixture(containerId, suffix);
    const managerAssignmentId = createManagerScope(
      containerId,
      fixture,
      suffix,
    );
    const endSession = new PsqlSession(containerId);
    const mutationSession = new PsqlSession(containerId);
    try {
      const endPid = await beginSession(endSession, `${prefix}-end`);
      const mutationPid = await beginAuthenticatedSession(
        mutationSession,
        managerUserId,
        `${prefix}-mutation`,
      );
      endSession.send(`
select '__ENDED__:' || assignment_id
from public.finish_project_manager_assignment(
  '${managerAssignmentId}'::uuid
);
select '__HOLDER_READY__';
`);
      await endSession.waitForLine(
        (line) => line === `__ENDED__:${managerAssignmentId}`,
        'uncommitted manager scope end',
      );
      await endSession.waitForLine(
        (line) => line === '__HOLDER_READY__',
        'scope end holder readiness',
      );
      sendExpectedFailure(
        mutationSession,
        `select * from public.update_project(
          '${fixture.projectId}'::uuid,
          'Unauthorized mutation',
          null
        );`,
      );
      await waitForBlockedBy(containerId, mutationSession, mutationPid, endPid);
      context.diagnostic(
        `manager mutation ${mutationPid} blocked by scope end ${endPid}`,
      );
      await commitHolder(endSession);
      await expectedFailure(mutationSession, 'permission_denied', '42501');

      const finalState = runSql(
        containerId,
        `
select
  (select name from public.projects where id = '${fixture.projectId}'::uuid) || '|' ||
  (select case when ended_at is null then 'active' else 'ended' end
    from public.project_manager_assignments where id = '${managerAssignmentId}'::uuid);
`,
      );
      assert.equal(finalState, `${`Concurrency project ${suffix}`}|ended`);
    } finally {
      await Promise.all([
        endSession.rollbackAndClose(),
        mutationSession.rollbackAndClose(),
      ]);
      cleanupFixture(containerId, fixture);
      assertNoResidualState(containerId, prefix, fixture);
    }
  },
);
