import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const adminUserId = '00000000-0000-4000-8000-000000000004';
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

function administratorTransaction(applicationName) {
  return `
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${adminUserId}","role":"authenticated"}';
set local statement_timeout = '${sessionTimeoutMs}ms';
set local application_name = ${sqlLiteral(applicationName)};
`;
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

function cleanupFixture(containerId, fixture) {
  runSql(
    containerId,
    `
begin;
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
   );
delete from public.project_volunteer_assignments
where project_id = '${fixture.projectId}'::uuid;
delete from public.projects where id = '${fixture.projectId}'::uuid;
delete from public.volunteers where id = '${fixture.volunteerId}'::uuid;
commit;
`,
  );
}

async function beginSession(session, applicationName) {
  session.send(`${administratorTransaction(applicationName)}
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

async function expectedFailure(session, message) {
  const stateLine = await session.waitForLine(
    (line) => line.startsWith('__SQLSTATE__:'),
    'contending SQLSTATE',
  );
  await session.waitForLine(
    (line) => line === '__CONTENDER_DONE__',
    'contending rollback',
  );
  assert.equal(stateLine.replace('__SQLSTATE__:', '').trim(), '23514');
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
  (select count(*) from public.project_volunteer_assignments where project_id = '${fixture.projectId}'::uuid);
`,
  );
  assert.equal(output, '0|0|0|0|0');
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
    const assignmentAuditBefore = runSql(
      containerId,
      `select count(*) from public.audit_logs where action = 'project_assignment.created';`,
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
      and actor_user_id = '${adminUserId}'::uuid) || '|' ||
  (select count(*) from public.audit_logs where action = 'project_assignment.created');
`,
      );
      assert.equal(finalState, `closed|0|0|0|1|${assignmentAuditBefore}`);
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
