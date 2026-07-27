import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  acquireSingleEdgeRuntimeContainer,
  assertFunctionCanStart,
  partitionEdgeRuntimeContainers,
  probeInvitationFunction,
  probeSupabaseGateway,
  runManagedE2E,
  runIndependentCleanups,
} from './e2e-service-orchestrator.mjs';
import { runResetLocalDatabase } from './reset-local-database.mjs';

const response = (body, status, headers = {}) =>
  Promise.resolve(
    new globalThis.Response(body, {
      headers,
      status,
    }),
  );

test('accepts only the typed invitation handler response as ready', async () => {
  const probe = await probeInvitationFunction(() =>
    response(JSON.stringify({ code: 'unauthenticated' }), 401, {
      'access-control-allow-methods': 'POST, OPTIONS',
      'content-type': 'application/json; charset=utf-8',
      via: 'kong/2.8.1',
    }),
  );

  assert.deepEqual(probe, { kind: 'ready', status: 401 });
});

test('does not mistake generic Kong or a different 401 for readiness', async () => {
  const kongOptions = await probeInvitationFunction(() =>
    response('', 200, { server: 'kong/2.8.1' }),
  );
  const unrelatedUnauthorized = await probeInvitationFunction(() =>
    response(JSON.stringify({ code: 'invalid_jwt' }), 401, {
      'content-type': 'application/json',
    }),
  );

  assert.equal(kongOptions.kind, 'unexpected');
  assert.equal(unrelatedUnauthorized.kind, 'unexpected');
});

test('recognizes the idle gateway and an absent Function as unavailable', async () => {
  for (const status of [502, 503]) {
    const idleGateway = await probeInvitationFunction(() =>
      response('', status, { server: 'kong/2.8.1' }),
    );
    assert.equal(idleGateway.kind, 'unavailable');
  }
  const missingFunction = await probeInvitationFunction(() =>
    response('Function not found', 404, { via: 'kong/2.8.1' }),
  );

  assert.equal(missingFunction.kind, 'unavailable');
});

test('distinguishes a healthy Supabase gateway from a stalled Function route', async () => {
  const gateway = await probeSupabaseGateway(() =>
    response(JSON.stringify({ name: 'GoTrue' }), 200, {
      'content-type': 'application/json',
    }),
  );

  assert.deepEqual(gateway, { kind: 'ready', status: 200 });
  assert.doesNotThrow(() =>
    assertFunctionCanStart(
      { detail: 'request timed out', kind: 'unreachable', status: null },
      [],
      gateway,
    ),
  );
});

test('requires typed gateway health even when the Function route says absent', () => {
  assert.throws(
    () =>
      assertFunctionCanStart({ kind: 'unavailable', status: 404 }, [], {
        detail: 'unexpected health HTTP 404',
        kind: 'unexpected',
        status: 404,
      }),
    /typed GoTrue health response/u,
  );
});

test('refuses an existing Function, unexpected port owner, or orphan container', () => {
  assert.throws(
    () => assertFunctionCanStart({ kind: 'ready', status: 401 }, []),
    /already active/u,
  );
  assert.throws(
    () =>
      assertFunctionCanStart(
        { detail: 'unexpected HTTP 200', kind: 'unexpected', status: 200 },
        [],
      ),
    /unexpected response/u,
  );
  assert.throws(
    () =>
      assertFunctionCanStart({ kind: 'unavailable', status: 503 }, [
        'container-id',
      ]),
    /already running/u,
  );
  assert.throws(
    () =>
      assertFunctionCanStart(
        { detail: 'request timed out', kind: 'unreachable', status: null },
        [],
        { detail: 'connection refused', kind: 'unreachable', status: null },
      ),
    /typed GoTrue health response/u,
  );
});

test('runs E2E only after readiness and always tears down its Function', async () => {
  const events = [];
  const handle = { id: 'function-process' };

  await runManagedE2E({
    assertCanStart: async () => events.push('preflight'),
    runPlaywright: async () => events.push('playwright'),
    showLogs: async () => events.push('logs'),
    startFunction: async () => {
      events.push('start');
      return handle;
    },
    stopFunction: async () => events.push('stop'),
    waitUntilReady: async () => events.push('ready'),
  });

  assert.deepEqual(events, [
    'preflight',
    'start',
    'ready',
    'playwright',
    'stop',
  ]);
});

test('shows logs and tears down when readiness or Playwright fails', async () => {
  for (const failedStage of ['readiness', 'playwright']) {
    const events = [];
    await assert.rejects(
      runManagedE2E({
        assertCanStart: async () => events.push('preflight'),
        runPlaywright: async () => {
          events.push('playwright');
          if (failedStage === 'playwright') throw new Error('test failure');
        },
        showLogs: async () => events.push('logs'),
        startFunction: async () => {
          events.push('start');
          return { id: 'function-process' };
        },
        stopFunction: async () => events.push('stop'),
        waitUntilReady: async () => {
          events.push('ready');
          if (failedStage === 'readiness') throw new Error('startup failure');
        },
      }),
    );
    assert.deepEqual(events.slice(-2), ['stop', 'logs']);
    assert.equal(events.includes('playwright'), failedStage === 'playwright');
  }
});

test('preserves both the test failure and a teardown failure', async () => {
  await assert.rejects(
    runManagedE2E({
      assertCanStart: async () => undefined,
      runPlaywright: async () => {
        throw new Error('functional failure');
      },
      showLogs: async () => undefined,
      startFunction: async () => ({ id: 'function-process' }),
      stopFunction: async () => {
        throw new Error('teardown failure');
      },
      waitUntilReady: async () => undefined,
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some(
        (failure) => failure.message === 'functional failure',
      ) &&
      error.errors.some((failure) => failure.message === 'teardown failure'),
  );
});

test('stops only acquired Edge containers and reports concurrent ones', () => {
  assert.deepEqual(
    partitionEdgeRuntimeContainers(['owned'], ['owned', 'concurrent']),
    { ownedAndRunning: ['owned'], unowned: ['concurrent'] },
  );
  assert.throws(
    () => acquireSingleEdgeRuntimeContainer(['first', 'second']),
    /ambiguous container ownership/u,
  );
  assert.equal(acquireSingleEdgeRuntimeContainer(['owned']), 'owned');
});

test('signal cleanup attempts Playwright and Functions independently', async () => {
  const events = [];
  await assert.rejects(
    runIndependentCleanups([
      async () => {
        events.push('playwright');
        throw new Error('playwright cleanup failure');
      },
      async () => {
        events.push('functions');
        throw new Error('functions cleanup failure');
      },
    ]),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(events, ['playwright', 'functions']);
});

test('database reset cleanup runs even when the reset command fails', () => {
  const calls = [];
  const results = [
    { status: 7 },
    { status: 0, stderr: '', stdout: 'edge-container\n' },
    { status: 0, stderr: '', stdout: 'edge-container\n' },
  ];

  assert.throws(
    () =>
      runResetLocalDatabase({
        pnpmCli: 'pnpm.cjs',
        runCommand: (command, arguments_) => {
          calls.push([command, arguments_]);
          return results.shift();
        },
      }),
    /supabase db reset --local failed/u,
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], ['docker', ['rm', '--force', 'edge-container']]);
});

test('keeps process ownership aligned across scripts, Playwright, and Actions', () => {
  const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
  const webPackage = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  const playwright = readFileSync('apps/web/playwright.config.ts', 'utf8');
  const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');

  assert.match(rootPackage.scripts['db:start'], /exclude edge-runtime/u);
  assert.equal(
    rootPackage.scripts['db:reset'],
    'node scripts/reset-local-database.mjs',
  );
  assert.equal(
    rootPackage.scripts['test:e2e'],
    'node scripts/e2e-service-orchestrator.mjs',
  );
  assert.equal(webPackage.scripts['test:e2e:playwright'], 'playwright test');
  assert.equal((playwright.match(/command: 'vite/gu) ?? []).length, 1);
  assert.match(playwright, /name: 'Frontend'/u);
  assert.doesNotMatch(playwright, /functions:serve/u);
  assert.match(supabaseConfig, /\[edge_runtime\][\s\S]*?enabled = false/u);
  assert.match(workflow, /pnpm db:start/u);
  assert.match(workflow, /pnpm test:e2e/u);
  assert.doesNotMatch(workflow, /functions:serve/u);
  assert.ok(
    workflow.indexOf('pnpm db:start') < workflow.indexOf('pnpm test:e2e'),
  );
  assert.ok(
    workflow.indexOf('pnpm test:e2e') < workflow.indexOf('pnpm db:stop'),
  );
});
