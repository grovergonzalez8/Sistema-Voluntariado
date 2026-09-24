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
const sessionTimeoutMs = 20_000;
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
  if (!line) {
    throw new Error(`Missing ${marker} in PostgreSQL output: ${output}`);
  }
  return line.slice(marker.length + 1);
}

function createFixture(containerId, suffix) {
  const volunteerId = randomUUID();
  runSql(
    containerId,
    `insert into public.volunteers (id, full_name) values ('${volunteerId}'::uuid, ${sqlLiteral(`Attendance ${suffix}`)});`,
  );
  const projectOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-project-${suffix}`)}
select '__PROJECT__:' || id
from public.create_project(${sqlLiteral(`Attendance concurrency ${suffix}`)}, null);
commit;
`,
  );
  const projectId = parseMarker(projectOutput, '__PROJECT__');
  const assignmentOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-assignment-${suffix}`)}
select '__ASSIGNMENT__:' || assignment_id
from public.assign_volunteer_to_project(
  '${projectId}'::uuid,
  '${volunteerId}'::uuid
);
commit;
`,
  );
  const activityOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-activity-${suffix}`)}
select '__ACTIVITY__:' || id
from public.create_project_activity(
  '${projectId}'::uuid,
  ${sqlLiteral(`Attendance activity ${suffix}`)},
  null,
  statement_timestamp(),
  null,
  null
);
commit;
`,
  );
  const activityId = parseMarker(activityOutput, '__ACTIVITY__');
  const participationOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-participation-${suffix}`)}
select '__PARTICIPATION__:' || participation_id
from public.create_project_activity_participation(
  '${projectId}'::uuid,
  '${activityId}'::uuid,
  '${volunteerId}'::uuid
);
commit;
`,
  );
  return {
    activityId,
    assignmentId: parseMarker(assignmentOutput, '__ASSIGNMENT__'),
    participationId: parseMarker(participationOutput, '__PARTICIPATION__'),
    projectId,
    volunteerId,
  };
}

function completeActivity(containerId, fixture, suffix) {
  runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-complete-${suffix}`)}
select * from public.complete_project_activity(
  '${fixture.projectId}'::uuid,
  '${fixture.activityId}'::uuid
);
commit;
`,
  );
}

function finishVolunteerAssignment(containerId, fixture, suffix) {
  runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-finish-assignment-${suffix}`)}
select * from public.finish_project_volunteer_assignment(
  '${fixture.assignmentId}'::uuid
);
commit;
`,
  );
}

function createManagerScope(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-scope-${suffix}`)}
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

function attendanceSql(fixture, operation) {
  const expectedStatus = operation === 'record' ? 'null' : "'present'";
  const requestedStatus = operation === 'record' ? 'present' : 'absent';
  return `select * from public.set_project_activity_attendance(
    '${fixture.projectId}'::uuid,
    '${fixture.activityId}'::uuid,
    '${fixture.participationId}'::uuid,
    ${expectedStatus},
    '${requestedStatus}'
  );`;
}

function seedAttendance(containerId, fixture, suffix) {
  runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `attendance-seed-${suffix}`)}
${attendanceSql(fixture, 'record')}
commit;
`,
  );
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
   or entity_id = '${fixture.participationId}'::uuid
   or (
     entity_type in (
       'project_activity',
       'project_assignment',
       'project_manager_assignment'
     )
     and entity_id in (
       select id from public.project_activities
       where project_id = '${fixture.projectId}'::uuid
       union all
       select id from public.project_volunteer_assignments
       where project_id = '${fixture.projectId}'::uuid
       union all
       select id from public.project_manager_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   );
delete from public.project_activity_attendances
where participation_id = '${fixture.participationId}'::uuid;
delete from public.project_activity_participations
where id = '${fixture.participationId}'::uuid;
delete from public.project_activities where project_id = '${fixture.projectId}'::uuid;
delete from public.project_volunteer_assignments where project_id = '${fixture.projectId}'::uuid;
delete from public.project_manager_assignments where project_id = '${fixture.projectId}'::uuid;
delete from public.projects where id = '${fixture.projectId}'::uuid;
delete from public.volunteers where id = '${fixture.volunteerId}'::uuid;
commit;
`,
  );
  assert.equal(
    scalar(
      containerId,
      `select count(*)
       from public.audit_logs
       where (entity_type = 'project' and entity_id = '${fixture.projectId}'::uuid)
          or (entity_type = 'volunteer' and entity_id = '${fixture.volunteerId}'::uuid)
          or (entity_type = 'project_activity' and entity_id = '${fixture.activityId}'::uuid)
          or (entity_type = 'project_assignment' and entity_id = '${fixture.assignmentId}'::uuid)
          or entity_id = '${fixture.participationId}'::uuid;`,
    ),
    '0',
    'attendance concurrency fixture audit rows must be removed',
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
  session.send(`${sql}\n\\echo __HOLDER_READY__`);
  await session.waitForLine(
    (line) => line === '__HOLDER_READY__',
    'holder operation',
  );
  assert.equal(session.stderr.trim(), '');
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

async function expectFailure(session, message, sqlState) {
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
  const prefix = `attendance-${randomUUID().slice(0, 8)}`;
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

test('record against record has exactly one authoritative creation', async () => {
  await runScenario('record-record', async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-record-one`,
    );
    await runHolder(context.holder, attendanceSql(context.fixture, 'record'));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-record-two`,
    );
    sendExpectedFailure(
      context.contender,
      attendanceSql(context.fixture, 'record'),
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(
      context.contender,
      'project_activity_attendance_already_recorded',
      '23505',
    );
    assert.equal(
      scalar(
        context.containerId,
        `select count(*) || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_attendance' and entity_id = '${context.fixture.participationId}'::uuid)
         from public.project_activity_attendances where participation_id = '${context.fixture.participationId}'::uuid;`,
      ),
      '1|1',
    );
  });
});

test('correct against correct rejects one stale expected status', async () => {
  await runScenario('correct-correct', async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    seedAttendance(context.containerId, context.fixture, context.suffix);
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-correct-one`,
    );
    await runHolder(context.holder, attendanceSql(context.fixture, 'correct'));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-correct-two`,
    );
    sendExpectedFailure(
      context.contender,
      attendanceSql(context.fixture, 'correct'),
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(
      context.contender,
      'project_activity_attendance_status_conflict',
      '23514',
    );
    assert.equal(
      scalar(
        context.containerId,
        `select status || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_attendance' and entity_id = '${context.fixture.participationId}'::uuid and action = 'project_activity_attendance.updated')
         from public.project_activity_attendances where participation_id = '${context.fixture.participationId}'::uuid;`,
      ),
      'absent|1',
    );
  });
});

async function attendanceWinsProjectClose(operation) {
  await runScenario(`${operation}-wins-close`, async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    if (operation === 'correct') {
      seedAttendance(context.containerId, context.fixture, context.suffix);
    }
    finishVolunteerAssignment(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-${operation}`,
    );
    await runHolder(context.holder, attendanceSql(context.fixture, operation));
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
        `select project.status || '|' || attendance.status
         from public.projects as project
         inner join public.project_activity_attendances as attendance
           on attendance.participation_id = '${context.fixture.participationId}'::uuid
         where project.id = '${context.fixture.projectId}'::uuid;`,
      ),
      `closed|${operation === 'record' ? 'present' : 'absent'}`,
    );
  });
}

async function projectCloseWinsAttendance(operation) {
  await runScenario(`close-wins-${operation}`, async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    if (operation === 'correct') {
      seedAttendance(context.containerId, context.fixture, context.suffix);
    }
    finishVolunteerAssignment(
      context.containerId,
      context.fixture,
      context.suffix,
    );
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
      `${context.prefix}-${operation}`,
    );
    sendExpectedFailure(
      context.contender,
      attendanceSql(context.fixture, operation),
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'project_closed', '23514');
    assert.equal(
      scalar(
        context.containerId,
        `select project.status || '|' ||
          coalesce((select status from public.project_activity_attendances where participation_id = '${context.fixture.participationId}'::uuid), 'unregistered')
         from public.projects as project where project.id = '${context.fixture.projectId}'::uuid;`,
      ),
      `closed|${operation === 'record' ? 'unregistered' : 'present'}`,
    );
  });
}

for (const operation of ['record', 'correct']) {
  test(`${operation} attendance wins before project close`, async () => {
    await attendanceWinsProjectClose(operation);
  });
  test(`project close wins before ${operation} attendance`, async () => {
    await projectCloseWinsAttendance(operation);
  });
}

async function attendanceWinsScopeRemoval(operation) {
  await runScenario(`${operation}-wins-scope-removal`, async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    if (operation === 'correct') {
      seedAttendance(context.containerId, context.fixture, context.suffix);
    }
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
    await runHolder(context.holder, attendanceSql(context.fixture, operation));
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
        `select (scope.ended_at is not null)::text || '|' || attendance.status
         from public.project_manager_assignments as scope
         inner join public.project_activity_attendances as attendance
           on attendance.participation_id = '${context.fixture.participationId}'::uuid
         where scope.id = '${scopeId}'::uuid;`,
      ),
      `true|${operation === 'record' ? 'present' : 'absent'}`,
    );
  });
}

async function scopeRemovalWinsAttendance(operation) {
  await runScenario(`scope-removal-wins-${operation}`, async (context) => {
    completeActivity(context.containerId, context.fixture, context.suffix);
    if (operation === 'correct') {
      seedAttendance(context.containerId, context.fixture, context.suffix);
    }
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
      attendanceSql(context.fixture, operation),
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
        `select (scope.ended_at is not null)::text || '|' ||
          coalesce((select status from public.project_activity_attendances where participation_id = '${context.fixture.participationId}'::uuid), 'unregistered')
         from public.project_manager_assignments as scope where scope.id = '${scopeId}'::uuid;`,
      ),
      `true|${operation === 'record' ? 'unregistered' : 'present'}`,
    );
  });
}

for (const operation of ['record', 'correct']) {
  test(`manager ${operation} wins before scope removal`, async () => {
    await attendanceWinsScopeRemoval(operation);
  });
  test(`scope removal wins before manager ${operation}`, async () => {
    await scopeRemovalWinsAttendance(operation);
  });
}

test('activity completion wins before attendance record', async () => {
  await runScenario('complete-wins-record', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-complete`,
    );
    await runHolder(
      context.holder,
      `select * from public.complete_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${context.fixture.activityId}'::uuid
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-record`,
    );
    sendExpectedSuccess(
      context.contender,
      attendanceSql(context.fixture, 'record'),
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
        `select activity.status || '|' || attendance.status
         from public.project_activities as activity
         inner join public.project_activity_attendances as attendance
           on attendance.participation_id = '${context.fixture.participationId}'::uuid
         where activity.id = '${context.fixture.activityId}'::uuid;`,
      ),
      'completed|present',
    );
  });
});

test('attendance revalidation while scheduled fails before completion', async () => {
  await runScenario('record-scheduled-before-complete', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-record`,
    );
    await runHolder(
      context.holder,
      `select * from public.update_project_activity(
         '${context.fixture.projectId}'::uuid,
         '${context.fixture.activityId}'::uuid,
         'Attendance race lock',
         null,
         statement_timestamp(),
         null,
         null
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
        '${context.fixture.activityId}'::uuid
      );`,
    );
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    context.holder.send(`
savepoint attendance_attempt;
\\set ON_ERROR_STOP off
${attendanceSql(context.fixture, 'record')}
\\echo __SQLSTATE__: :SQLSTATE
\\echo __ERROR_MESSAGE__: :LAST_ERROR_MESSAGE
rollback to savepoint attendance_attempt;
commit;
\\echo __HOLDER_COMMITTED__
`);
    const stateLine = await context.holder.waitForLine(
      (line) => line.startsWith('__SQLSTATE__:'),
      'scheduled record SQLSTATE',
    );
    const messageLine = await context.holder.waitForLine(
      (line) => line.startsWith('__ERROR_MESSAGE__:'),
      'scheduled record error',
    );
    assert.equal(stateLine.replace('__SQLSTATE__:', '').trim(), '23514');
    assert.match(messageLine, /project_activity_not_completed/u);
    await context.holder.waitForLine(
      (line) => line === '__HOLDER_COMMITTED__',
      'scheduled holder commit',
    );
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select status || '|' ||
          (select count(*) from public.project_activity_attendances where participation_id = '${context.fixture.participationId}'::uuid)
         from public.project_activities where id = '${context.fixture.activityId}'::uuid;`,
      ),
      'completed|0',
    );
  });
});
