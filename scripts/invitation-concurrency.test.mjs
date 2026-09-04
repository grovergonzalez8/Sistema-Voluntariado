import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '../apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';

const administratorId = '00000000-0000-4000-8000-000000000004';
const projectLabel = 'sistema-voluntariado';
const timeoutMs = 15_000;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ?? result.stderr.trim() ?? 'Docker command failed.',
    );
  }
  return result.stdout.trim();
}

function databaseContainer() {
  const output = docker([
    'ps',
    '--filter',
    `label=com.supabase.cli.project=${projectLabel}`,
    '--filter',
    'name=supabase_db_',
    '--format',
    '{{.ID}}',
  ]);
  const ids = output.split(/\r?\n/u).filter(Boolean);
  assert.equal(ids.length, 1);
  return ids[0];
}

function psqlArgs(containerId) {
  return [
    'exec',
    '-i',
    containerId,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];
}

function runSql(containerId, sql) {
  return docker(psqlArgs(containerId), { input: sql });
}

function authenticatedSql(userId, metadataInvitationId, body, name) {
  const claims = JSON.stringify({
    role: 'authenticated',
    sub: userId,
    app_metadata: metadataInvitationId
      ? { account_invitation_id: metadataInvitationId }
      : {},
  }).replaceAll("'", "''");
  return `
set role authenticated;
set request.jwt.claims = '${claims}';
set application_name = '${name}';
set statement_timeout = '${timeoutMs}ms';
${body}
`;
}

function startSql(containerId, sql) {
  const child = spawn('docker', psqlArgs(containerId), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(sql);
  return new Promise((resolve) => {
    child.once('close', (code) =>
      resolve({ code, stderr: stderr.trim(), stdout: stdout.trim() }),
    );
  });
}

class Blocker {
  #child;
  #closed = false;
  #ready;

  constructor(containerId, sql) {
    this.#child = spawn('docker', psqlArgs(containerId), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stderr.setEncoding('utf8');
    this.#ready = new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => reject(new Error('PostgreSQL blocker did not become ready.')),
        5_000,
      );
      this.#child.stdout.on('data', (chunk) => {
        if (chunk.includes('__BLOCKER_READY__')) {
          globalThis.clearTimeout(timeout);
          resolve();
        }
      });
      this.#child.once('error', (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      });
    });
    this.#child.stdin.write(`begin;\n${sql}\n\\echo __BLOCKER_READY__\n`);
  }

  ready() {
    return this.#ready;
  }

  release() {
    if (this.#closed) return;
    this.#closed = true;
    this.#child.stdin.end('commit;\n');
  }
}

async function waitForBlocked(containerId, names, expectedCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const count = Number(
      runSql(
        containerId,
        `select count(*) from pg_catalog.pg_stat_activity
         where application_name = any(array[${names
           .map((name) => `'${name}'`)
           .join(',')}])
           and wait_event_type = 'Lock';`,
      ),
    );
    if (count === expectedCount) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  }
  throw new Error(
    `Workers did not reach the PostgreSQL lock barrier: ${names}`,
  );
}

function localEnvironment() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'status', '-o', 'env'],
    { encoding: 'utf8' },
  );
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/u))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

const environment = localEnvironment();
const administrator = createClient(environment.API_URL, environment.ANON_KEY, {
  auth: { persistSession: false },
});
const authAdmin = createClient(
  environment.API_URL,
  environment.SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
await administrator.auth.signInWithPassword({
  email: 'administrator@example.invalid',
  password: 'local-test-only-not-a-secret',
});

async function oneRow(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  assert.equal(data.length, 1);
  return data[0];
}

async function acceptableInvitation(label) {
  const email = `${label}-${randomUUID()}@example.invalid`;
  const invitation = await oneRow(
    administrator.rpc('prepare_account_invitation_v2', {
      requested_display_name: label,
      requested_email: email,
      requested_idempotency_key: randomUUID(),
      requested_locale: 'es',
      requested_role_code: 'volunteer',
    }),
  );
  const { data: authData, error: authError } =
    await authAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { account_invitation_id: invitation.invitation_id },
    });
  if (authError) throw authError;
  const { error: ackError } = await authAdmin.rpc(
    'acknowledge_account_invitation_delivery',
    {
      requested_auth_user_id: authData.user.id,
      requested_delivery_attempt_id: invitation.delivery_attempt_id,
      requested_invitation_id: invitation.invitation_id,
    },
  );
  if (ackError) throw ackError;
  await oneRow(
    authAdmin.rpc('finalize_account_invitation_delivery_v2', {
      delivery_succeeded: true,
      requested_auth_user_id: authData.user.id,
      requested_delivery_attempt_id: invitation.delivery_attempt_id,
      requested_invitation_id: invitation.invitation_id,
      requested_provider_error_code: null,
    }),
  );
  return { ...invitation, authUserId: authData.user.id, email };
}

test('create↔create and replace↔replay preserve one open invitation', async () => {
  const containerId = databaseContainer();
  const email = `create-race-${randomUUID()}@example.invalid`;
  const createKey = randomUUID();
  const hashSql = `select pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended('${email}', 20260724));`;
  const blocker = new Blocker(containerId, hashSql);
  await blocker.ready();
  const names = ['invite-create-a', 'invite-create-b'];
  const command = `select operation_outcome || ':' || invitation_id::text
    from public.prepare_account_invitation_v2(
      '${email}', 'Concurrency', 'es', 'volunteer', '${createKey}'::uuid
    );`;
  const workers = names.map((name) =>
    startSql(
      containerId,
      authenticatedSql(administratorId, null, command, name),
    ),
  );
  try {
    await waitForBlocked(containerId, names, 2);
  } finally {
    blocker.release();
  }
  const results = await Promise.all(workers);
  assert.deepEqual(
    results.map((result) => result.code),
    [0, 0],
  );
  assert.deepEqual(
    new Set(results.map((result) => result.stdout.split(':')[0])),
    new Set(['execute', 'in_progress']),
  );
  assert.equal(
    runSql(
      containerId,
      `select count(*) from public.invitations where normalized_email = '${email}';`,
    ),
    '1',
  );

  const sourceId = results[0].stdout.split(':')[1];
  runSql(
    containerId,
    `select * from public.finalize_account_invitation_delivery_v2(
      '${sourceId}'::uuid,
      (select delivery_attempt_id from public.invitations where id = '${sourceId}'),
      null, false, 'auth_provider_rejected'
    );`,
  );
  const failedBlocker = new Blocker(containerId, hashSql);
  await failedBlocker.ready();
  const failedNames = ['invite-failed-a', 'invite-failed-b'];
  const failedWorkers = failedNames.map((name) =>
    startSql(
      containerId,
      authenticatedSql(administratorId, null, command, name),
    ),
  );
  try {
    await waitForBlocked(containerId, failedNames, 2);
  } finally {
    failedBlocker.release();
  }
  const failedResults = await Promise.all(failedWorkers);
  assert.deepEqual(
    new Set(failedResults.map((result) => result.stdout.split(':')[0])),
    new Set(['failed']),
  );
  assert.equal(
    runSql(
      containerId,
      `select count(*) from public.audit_logs
       where entity_id = '${sourceId}' and action = 'invitation.delivery_failed';`,
    ),
    '1',
  );

  const replaceKey = randomUUID();
  const replaceBlocker = new Blocker(containerId, hashSql);
  await replaceBlocker.ready();
  const replaceNames = ['invite-replace-a', 'invite-replace-b'];
  const replaceCommand = `select operation_outcome || ':' || invitation_id::text
    from public.prepare_account_invitation_action_v2(
      '${sourceId}'::uuid, 'replace', '${replaceKey}'::uuid, null
    );`;
  const replaceWorkers = replaceNames.map((name) =>
    startSql(
      containerId,
      authenticatedSql(administratorId, null, replaceCommand, name),
    ),
  );
  try {
    await waitForBlocked(containerId, replaceNames, 2);
  } finally {
    replaceBlocker.release();
  }
  const replaceResults = await Promise.all(replaceWorkers);
  assert.deepEqual(
    new Set(replaceResults.map((result) => result.stdout.split(':')[0])),
    new Set(['execute', 'in_progress']),
  );
  assert.equal(
    runSql(
      containerId,
      `select count(*) from public.invitations
       where account_id = (select account_id from public.invitations where id = '${sourceId}')
         and status in ('pending', 'sent', 'delivery_failed');`,
    ),
    '1',
  );
});

test('revoke↔replay creates one transition and one audit row', async () => {
  const containerId = databaseContainer();
  const fixture = await acceptableInvitation('revoke-race');
  const key = randomUUID();
  const blocker = new Blocker(
    containerId,
    `select pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended('${fixture.email}', 20260724));`,
  );
  await blocker.ready();
  const names = ['invite-revoke-a', 'invite-revoke-b'];
  const command = `select operation_outcome
    from public.prepare_account_invitation_action_v2(
      '${fixture.invitation_id}'::uuid, 'revoke', '${key}'::uuid,
      'Revocación concurrente autorizada'
    );`;
  const workers = names.map((name) =>
    startSql(
      containerId,
      authenticatedSql(administratorId, null, command, name),
    ),
  );
  try {
    await waitForBlocked(containerId, names, 2);
  } finally {
    blocker.release();
  }
  const results = await Promise.all(workers);
  assert.deepEqual(
    new Set(results.map((result) => result.stdout)),
    new Set(['completed', 'replayed']),
  );
  assert.equal(
    runSql(
      containerId,
      `select count(*) from public.audit_logs
       where entity_id = '${fixture.invitation_id}' and action = 'invitation.revoked';`,
    ),
    '1',
  );
});

async function terminalRace(kind) {
  const containerId = databaseContainer();
  const fixture = await acceptableInvitation(`terminal-${kind}`);
  const blocker = new Blocker(
    containerId,
    `select id from public.invitations where id = '${fixture.invitation_id}' for update;`,
  );
  await blocker.ready();
  const acceptName = `invite-${kind}-accept`;
  const otherName = `invite-${kind}-other`;
  const accept = startSql(
    containerId,
    authenticatedSql(
      fixture.authUserId,
      fixture.invitation_id,
      'select account_status from public.accept_current_account_invitation_v2();',
      acceptName,
    ),
  );
  const otherBody =
    kind === 'accept'
      ? 'select account_status from public.accept_current_account_invitation_v2();'
      : `select operation_outcome from public.prepare_account_invitation_action_v2(
          '${fixture.invitation_id}'::uuid, '${kind}', '${randomUUID()}'::uuid,
          ${kind === 'revoke' ? "'Carrera terminal autorizada'" : 'null'}
        );`;
  const other = startSql(
    containerId,
    authenticatedSql(
      kind === 'accept' ? fixture.authUserId : administratorId,
      kind === 'accept' ? fixture.invitation_id : null,
      otherBody,
      otherName,
    ),
  );
  try {
    await waitForBlocked(containerId, [acceptName, otherName], 2);
  } finally {
    blocker.release();
  }
  const results = await Promise.all([accept, other]);
  assert.equal(results.filter((result) => result.code === 0).length, 1);
  const final = runSql(
    containerId,
    `select account.status || ':' || invitation.status || ':' ||
      (select count(*) from public.audit_logs as audit
       where audit.entity_id = invitation.id
         and audit.action in ('invitation.accepted', 'invitation.revoked'))
     from public.invitations as invitation
     join public.accounts as account on account.id = invitation.account_id
     where invitation.id = '${fixture.invitation_id}';`,
  );
  if (kind === 'resend') {
    assert.match(final, /^(pending_profile:accepted:1|invited:sent:0)$/u);
  } else {
    assert.match(
      final,
      /^(pending_profile:accepted|invited:(revoked|superseded)):1$/u,
    );
  }
}

test('accept↔revoke has exactly one terminal winner', () =>
  terminalRace('revoke'));

test('accept↔replace has exactly one terminal winner', () =>
  terminalRace('replace'));

test('accept↔resend never cuts an active delivery lease', () =>
  terminalRace('resend'));

test('accept↔accept has exactly one terminal winner', () =>
  terminalRace('accept'));
