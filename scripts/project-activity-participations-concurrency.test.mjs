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
  if (!line) {
    throw new Error(`Missing ${marker} in PostgreSQL output: ${output}`);
  }
  return line.slice(marker.length + 1);
}

function createFixture(containerId, suffix) {
  const volunteerId = randomUUID();
  runSql(
    containerId,
    `insert into public.volunteers (id, full_name) values ('${volunteerId}'::uuid, ${sqlLiteral(`Participation ${suffix}`)});`,
  );
  const projectOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `participation-project-${suffix}`)}
select '__PROJECT__:' || id
from public.create_project(${sqlLiteral(`Participation concurrency ${suffix}`)}, null);
commit;
`,
  );
  const projectId = parseMarker(projectOutput, '__PROJECT__');
  const assignmentOutput = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `participation-assignment-${suffix}`)}
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
    `${authenticatedTransaction(adminUserId, `participation-activity-${suffix}`)}
select '__ACTIVITY__:' || id
from public.create_project_activity(
  '${projectId}'::uuid,
  ${sqlLiteral(`Activity ${suffix}`)},
  null,
  statement_timestamp(),
  null,
  null
);
commit;
`,
  );
  return {
    activityId: parseMarker(activityOutput, '__ACTIVITY__'),
    assignmentId: parseMarker(assignmentOutput, '__ASSIGNMENT__'),
    projectId,
    volunteerId,
  };
}

function createManagerScope(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `participation-scope-${suffix}`)}
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

function createParticipation(containerId, fixture, suffix) {
  const output = runSql(
    containerId,
    `${authenticatedTransaction(adminUserId, `participation-row-${suffix}`)}
select '__PARTICIPATION__:' || participation_id
from public.create_project_activity_participation(
  '${fixture.projectId}'::uuid,
  '${fixture.activityId}'::uuid,
  '${fixture.volunteerId}'::uuid
);
commit;
`,
  );
  return parseMarker(output, '__PARTICIPATION__');
}

function createAuthorityAdministrator(containerId, suffix) {
  const accountId = randomUUID();
  const userId = randomUUID();
  runSql(
    containerId,
    `
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '${userId}'::uuid,
  'authenticated',
  'authenticated',
  ${sqlLiteral(`authority-${suffix}@example.invalid`)},
  extensions.crypt('local-test-only-not-a-secret', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  statement_timestamp(),
  statement_timestamp(),
  '',
  '',
  '',
  ''
);
insert into public.accounts (id, auth_user_id, status)
values ('${accountId}'::uuid, '${userId}'::uuid, 'active');
insert into public.user_roles (user_id, role_id, granted_by)
select '${userId}'::uuid, role.id, '${adminUserId}'::uuid
from public.roles as role
where role.code = 'administrator';
`,
  );
  return { accountId, userId };
}

function cleanupAuthorityAdministrator(containerId, authorityAdministrator) {
  runSql(
    containerId,
    `
begin;
set local session_replication_role = replica;
delete from public.audit_logs
where actor_user_id = '${authorityAdministrator.userId}'::uuid
   or target_user_id = '${authorityAdministrator.userId}'::uuid
   or (
     entity_type = 'account'
     and entity_id = '${authorityAdministrator.accountId}'::uuid
   );
delete from public.account_status_history
where account_id = '${authorityAdministrator.accountId}'::uuid;
delete from public.user_roles
where user_id = '${authorityAdministrator.userId}'::uuid;
delete from public.accounts
where id = '${authorityAdministrator.accountId}'::uuid;
delete from public.profiles
where id = '${authorityAdministrator.userId}'::uuid;
delete from auth.users
where id = '${authorityAdministrator.userId}'::uuid;
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
   or (
     entity_type = 'project_activity'
     and entity_id in (
       select id from public.project_activities
       where project_id = '${fixture.projectId}'::uuid
     )
   )
   or (
     entity_type = 'project_volunteer_assignment'
     and entity_id in (
       select id from public.project_volunteer_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   )
   or (
     entity_type = 'project_manager_assignment'
     and entity_id in (
       select id from public.project_manager_assignments
       where project_id = '${fixture.projectId}'::uuid
     )
   )
   or (
     entity_type = 'project_activity_participation'
     and entity_id in (
       select participation.id
       from public.project_activity_participations as participation
       inner join public.project_activities as activity
         on activity.id = participation.activity_id
       where activity.project_id = '${fixture.projectId}'::uuid
     )
   );
delete from public.project_activity_participations
where activity_id in (
  select id from public.project_activities
  where project_id = '${fixture.projectId}'::uuid
);
delete from public.project_activities where project_id = '${fixture.projectId}'::uuid;
delete from public.project_volunteer_assignments where project_id = '${fixture.projectId}'::uuid;
delete from public.project_manager_assignments where project_id = '${fixture.projectId}'::uuid;
delete from public.projects where id = '${fixture.projectId}'::uuid;
delete from public.volunteers where id = '${fixture.volunteerId}'::uuid;
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
  const prefix = `part-${randomUUID().slice(0, 8)}`;
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

async function runAuthorityScenario(label, callback) {
  const containerId = findDatabaseContainer();
  const authorityAdministrator = createAuthorityAdministrator(
    containerId,
    `${label}-${randomUUID()}`,
  );
  try {
    await runScenario(label, (context) =>
      callback({ ...context, authorityAdministrator }),
    );
  } finally {
    cleanupAuthorityAdministrator(containerId, authorityAdministrator);
  }
}

function addSql(fixture) {
  return `select * from public.create_project_activity_participation(
    '${fixture.projectId}'::uuid,
    '${fixture.activityId}'::uuid,
    '${fixture.volunteerId}'::uuid
  );`;
}

function finishParticipationSql(fixture, participationId) {
  return `select * from public.finish_project_activity_participation(
    '${fixture.projectId}'::uuid,
    '${fixture.activityId}'::uuid,
    '${participationId}'::uuid
  );`;
}

test('add participation wins against finish project assignment', async () => {
  await runScenario('add-wins-finish-assignment', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-add`,
    );
    await runHolder(context.holder, addSql(context.fixture));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-finish-assignment`,
    );
    sendExpectedFailure(
      context.contender,
      `select * from public.finish_project_volunteer_assignment('${context.fixture.assignmentId}'::uuid);`,
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
      'volunteer_has_scheduled_activity_participations',
    );
    assert.equal(
      scalar(
        context.containerId,
        `select (assignment.ended_at is null)::text || '|' || count(participation.id)
         from public.project_volunteer_assignments as assignment
         left join public.project_activity_participations as participation
           on participation.volunteer_id = assignment.volunteer_id
          and participation.activity_id = '${context.fixture.activityId}'::uuid
          and participation.ended_at is null
         where assignment.id = '${context.fixture.assignmentId}'::uuid
         group by assignment.ended_at;`,
      ),
      'true|1',
    );
  });
});

test('finish project assignment wins against add participation', async () => {
  await runScenario('finish-assignment-wins-add', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-finish-assignment`,
    );
    await runHolder(
      context.holder,
      `select * from public.finish_project_volunteer_assignment('${context.fixture.assignmentId}'::uuid);`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-add`,
    );
    sendExpectedFailure(context.contender, addSql(context.fixture));
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(context.contender, 'volunteer_not_assigned_to_project');
    assert.equal(
      scalar(
        context.containerId,
        `select (assignment.ended_at is not null)::text || '|' ||
          (select count(*) from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid)
         from public.project_volunteer_assignments as assignment
         where assignment.id = '${context.fixture.assignmentId}'::uuid;`,
      ),
      'true|0',
    );
  });
});

async function addWinsTerminal(transition) {
  await runScenario(`add-wins-${transition}`, async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-add`,
    );
    await runHolder(context.holder, addSql(context.fixture));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-${transition}`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.${transition}_project_activity(
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
    await commitHolder(context.holder);
    await expectSuccess(context.contender);
    assert.equal(
      scalar(
        context.containerId,
        `select activity.status || '|' || (participation.ended_at is null)::text
         from public.project_activities as activity
         inner join public.project_activity_participations as participation
           on participation.activity_id = activity.id
         where activity.id = '${context.fixture.activityId}'::uuid;`,
      ),
      `${transition === 'complete' ? 'completed' : 'cancelled'}|true`,
    );
  });
}

async function terminalWinsAdd(transition) {
  await runScenario(`${transition}-wins-add`, async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-${transition}`,
    );
    await runHolder(
      context.holder,
      `select * from public.${transition}_project_activity(
        '${context.fixture.projectId}'::uuid,
        '${context.fixture.activityId}'::uuid
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-add`,
    );
    sendExpectedFailure(context.contender, addSql(context.fixture));
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
        `select activity.status || '|' ||
          (select count(*) from public.project_activity_participations where activity_id = activity.id)
         from public.project_activities as activity
         where activity.id = '${context.fixture.activityId}'::uuid;`,
      ),
      `${transition === 'complete' ? 'completed' : 'cancelled'}|0`,
    );
  });
}

test('add participation wins before complete activity', async () => {
  await addWinsTerminal('complete');
});

test('complete activity wins before add participation', async () => {
  await terminalWinsAdd('complete');
});

test('add participation wins before cancel activity', async () => {
  await addWinsTerminal('cancel');
});

test('cancel activity wins before add participation', async () => {
  await terminalWinsAdd('cancel');
});

test('duplicate add has exactly one winner', async () => {
  await runScenario('add-add-same-pair', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-first-add`,
    );
    await runHolder(context.holder, addSql(context.fixture));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-second-add`,
    );
    sendExpectedFailure(context.contender, addSql(context.fixture));
    await waitForBlockedBy(
      context.observer,
      context.contender,
      contenderPid,
      holderPid,
    );
    await commitHolder(context.holder);
    await expectFailure(
      context.contender,
      'project_activity_participation_already_active',
      '23505',
    );
    assert.equal(
      scalar(
        context.containerId,
        `select
          (select count(*) from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid) || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_participation' and action = 'project_activity_participation.created' and entity_id in (
            select id from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid
          ));`,
      ),
      '1|1',
    );
  });
});

test('duplicate finish has exactly one winner', async () => {
  await runScenario('finish-finish-same-row', async (context) => {
    const participationId = createParticipation(
      context.containerId,
      context.fixture,
      context.suffix,
    );
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-first-finish`,
    );
    await runHolder(
      context.holder,
      finishParticipationSql(context.fixture, participationId),
    );
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-second-finish`,
    );
    sendExpectedFailure(
      context.contender,
      finishParticipationSql(context.fixture, participationId),
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
      'project_activity_participation_already_ended',
    );
    assert.equal(
      scalar(
        context.containerId,
        `select (participation.ended_at is not null)::text || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_participation' and entity_id = participation.id and action = 'project_activity_participation.ended')
         from public.project_activity_participations as participation
         where participation.id = '${participationId}'::uuid;`,
      ),
      'true|1',
    );
  });
});

async function managerMutationWinsScopeRemoval(operation) {
  await runScenario(`${operation}-wins-scope-removal`, async (context) => {
    const participationId =
      operation === 'finish'
        ? createParticipation(
            context.containerId,
            context.fixture,
            context.suffix,
          )
        : null;
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
      operation === 'add'
        ? addSql(context.fixture)
        : finishParticipationSql(context.fixture, participationId),
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
        `select (scope.ended_at is not null)::text || '|' ||
          (participation.ended_at is ${operation === 'add' ? 'null' : 'not null'})::text
         from public.project_manager_assignments as scope
         cross join public.project_activity_participations as participation
         where scope.id = '${scopeId}'::uuid
           and participation.activity_id = '${context.fixture.activityId}'::uuid;`,
      ),
      'true|true',
    );
  });
}

async function scopeRemovalWinsManagerMutation(operation) {
  await runScenario(`scope-removal-wins-${operation}`, async (context) => {
    const participationId =
      operation === 'finish'
        ? createParticipation(
            context.containerId,
            context.fixture,
            context.suffix,
          )
        : null;
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
      operation === 'add'
        ? addSql(context.fixture)
        : finishParticipationSql(context.fixture, participationId),
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
        operation === 'add'
          ? `select (scope.ended_at is not null)::text || '|' ||
              (select count(*) from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid)
             from public.project_manager_assignments as scope where scope.id = '${scopeId}'::uuid;`
          : `select (scope.ended_at is not null)::text || '|' || (participation.ended_at is null)::text
             from public.project_manager_assignments as scope
             cross join public.project_activity_participations as participation
             where scope.id = '${scopeId}'::uuid and participation.id = '${participationId}'::uuid;`,
      ),
      operation === 'add' ? 'true|0' : 'true|true',
    );
  });
}

test('manager add wins before scope removal', async () => {
  await managerMutationWinsScopeRemoval('add');
});

test('scope removal wins before manager add', async () => {
  await scopeRemovalWinsManagerMutation('add');
});

test('manager finish wins before scope removal', async () => {
  await managerMutationWinsScopeRemoval('finish');
});

test('scope removal wins before manager finish', async () => {
  await scopeRemovalWinsManagerMutation('finish');
});

test('administrator suspension wins before participation mutation', async () => {
  await runAuthorityScenario('suspension-wins-admin-add', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      adminUserId,
      `${context.prefix}-suspension`,
    );
    await runHolder(
      context.holder,
      `select * from public.change_account_status(
        '${context.authorityAdministrator.accountId}'::uuid,
        'suspended',
        'Suspensión concurrente autorizada'
      );`,
    );
    const contenderPid = await beginSession(
      context.contender,
      context.authorityAdministrator.userId,
      `${context.prefix}-admin-add`,
    );
    sendExpectedFailure(context.contender, addSql(context.fixture));
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
        `select account.status || '|' ||
          (select count(*) from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid) || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_participation' and action = 'project_activity_participation.created' and entity_id in (
            select id from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid
          ))
         from public.accounts as account
         where account.id = '${context.authorityAdministrator.accountId}'::uuid;`,
      ),
      'suspended|0|0',
    );
  });
});

test('administrator participation mutation wins before suspension', async () => {
  await runAuthorityScenario('admin-add-wins-suspension', async (context) => {
    const holderPid = await beginSession(
      context.holder,
      context.authorityAdministrator.userId,
      `${context.prefix}-admin-add`,
    );
    await runHolder(context.holder, addSql(context.fixture));
    const contenderPid = await beginSession(
      context.contender,
      adminUserId,
      `${context.prefix}-suspension`,
    );
    sendExpectedSuccess(
      context.contender,
      `select * from public.change_account_status(
        '${context.authorityAdministrator.accountId}'::uuid,
        'suspended',
        'Suspensión posterior autorizada'
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
        `select account.status || '|' ||
          (select count(*) from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid and ended_at is null) || '|' ||
          (select count(*) from public.audit_logs where entity_type = 'project_activity_participation' and action = 'project_activity_participation.created' and entity_id in (
            select id from public.project_activity_participations where activity_id = '${context.fixture.activityId}'::uuid
          ))
         from public.accounts as account
         where account.id = '${context.authorityAdministrator.accountId}'::uuid;`,
      ),
      'suspended|1|1',
    );
  });
});
