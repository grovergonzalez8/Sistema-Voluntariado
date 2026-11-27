import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import {
  acquireSingleEdgeRuntimeContainer,
  assertFunctionCanStart,
  partitionEdgeRuntimeContainers,
  probeInvitationFunction,
  probeSupabaseGateway,
  runManagedE2E,
  runIndependentCleanups,
  stopManagedFunction,
  stopOwnedEdgeRuntimeContainer,
  waitForInvitationFunction,
  captureOwnedEdgeRuntimeContainers,
  createOwnedFunctionEnvironment,
  createE2ETerminator,
  finalizeManagedFunction,
  installE2ESignalHandlers,
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

test('accepts an owned Edge container removed by the child during cleanup', async () => {
  const containerId = '0ac54d615819';
  const dockerCalls = [];
  let listCalls = 0;
  let stopTreeCalls = 0;
  const handle = {
    child: { exitCode: null, signalCode: null },
    ownedContainerIds: [containerId],
    stopPromise: null,
  };
  const operations = {
    listContainers: () => {
      listCalls += 1;
      return listCalls === 1 ? [containerId] : [];
    },
    stopContainer: (ownedContainerId) =>
      stopOwnedEdgeRuntimeContainer(ownedContainerId, (arguments_) => {
        dockerCalls.push(arguments_);
        if (arguments_[0] === 'stop') {
          throw new Error(
            `Docker command failed: docker stop --time 5 ${containerId}\nError response from daemon: No such container: ${containerId}`,
          );
        }
        return '';
      }),
    stopTree: async () => {
      stopTreeCalls += 1;
    },
  };

  await stopManagedFunction(handle, operations);
  await stopManagedFunction(handle, {
    listContainers: () => {
      throw new Error('cleanup ran twice');
    },
    stopContainer: () => {
      throw new Error('cleanup ran twice');
    },
    stopTree: async () => {
      throw new Error('cleanup ran twice');
    },
  });

  assert.equal(stopTreeCalls, 1);
  assert.equal(listCalls, 2);
  assert.deepEqual(dockerCalls, [
    ['stop', '--time', '5', containerId],
    ['ps', '--all', '--quiet', '--no-trunc', '--filter', `id=${containerId}`],
  ]);
});

test('propagates a real Docker stop failure while the container still exists', () => {
  const containerId = '0ac54d615819';
  const stopError = new Error('Docker daemon denied the stop request');

  assert.throws(
    () =>
      stopOwnedEdgeRuntimeContainer(containerId, (arguments_) => {
        if (arguments_[0] === 'stop') throw stopError;
        return `${containerId}abcdef`;
      }),
    (error) => error === stopError,
  );
});

test('propagates Docker inspection failure instead of assuming cleanup', () => {
  const containerId = '0ac54d615819';

  assert.throws(
    () =>
      stopOwnedEdgeRuntimeContainer(containerId, () => {
        throw new Error('Docker daemon unavailable');
      }),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
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
  const supabaseStart = readFileSync(
    'scripts/start-local-supabase.mjs',
    'utf8',
  );
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
  const qualitySupabase = readFileSync('scripts/quality-supabase.sh', 'utf8');
  const qualityPrepare = 'bash scripts/quality-supabase.sh prepare';
  const qualityStart = 'bash scripts/quality-supabase.sh start-unseeded';
  const qualityCleanup = 'bash scripts/quality-supabase.sh cleanup';

  assert.equal(
    rootPackage.scripts['db:start'],
    'node scripts/start-local-supabase.mjs',
  );
  assert.match(supabaseStart, /'--exclude',\s*'edge-runtime'/u);
  assert.equal(
    rootPackage.scripts['db:reset'],
    'node scripts/reset-local-database.mjs',
  );
  assert.equal(
    rootPackage.scripts['test:e2e'],
    'node scripts/e2e-service-orchestrator.mjs',
  );
  assert.equal(
    rootPackage.scripts['projects:test:concurrency'],
    'node --test scripts/project-volunteer-assignments-concurrency.test.mjs scripts/project-activities-concurrency.test.mjs scripts/project-activity-participations-concurrency.test.mjs scripts/project-activity-attendance-concurrency.test.mjs',
  );
  assert.match(
    rootPackage.scripts['account-lifecycle:test'],
    /db:test.*projects:test:concurrency.*test:e2e/u,
  );
  assert.equal(webPackage.scripts['test:e2e:playwright'], 'playwright test');
  assert.equal((playwright.match(/command: 'vite/gu) ?? []).length, 1);
  assert.match(playwright, /name: 'Frontend'/u);
  assert.doesNotMatch(playwright, /functions:serve/u);
  assert.match(supabaseConfig, /\[edge_runtime\][\s\S]*?enabled = false/u);
  assert.ok(workflow.includes(qualityPrepare));
  assert.ok(workflow.includes(qualityStart));
  assert.ok(workflow.includes(qualityCleanup));
  assert.match(qualitySupabase, /pnpm db:start[^\n]*\n\s+verify_stack/u);
  assert.match(qualitySupabase, /pnpm db:stop --no-backup/u);
  assert.match(workflow, /pnpm projects:test:concurrency/u);
  assert.match(workflow, /pnpm test:e2e/u);
  assert.doesNotMatch(workflow, /functions:serve/u);
  assert.ok(
    workflow.indexOf(qualityPrepare) < workflow.indexOf(qualityStart) &&
      workflow.indexOf(qualityStart) < workflow.indexOf('pnpm db:reset') &&
      workflow.indexOf('pnpm db:reset') <
        workflow.indexOf('pnpm projects:test:concurrency'),
  );
  assert.ok(
    workflow.indexOf('pnpm db:test') <
      workflow.indexOf('pnpm projects:test:concurrency'),
  );
  assert.ok(
    workflow.indexOf('pnpm projects:test:concurrency') <
      workflow.indexOf('pnpm test:functions'),
  );
  assert.ok(
    workflow.indexOf('pnpm test:functions') < workflow.indexOf('pnpm test:e2e'),
  );
  assert.ok(
    workflow.indexOf('pnpm test:e2e') < workflow.indexOf(qualityCleanup),
  );
});

test('AUD008 partial startup cleans its marked runtime before propagating readiness error', async () => {
  const id = 'a'.repeat(64);
  const stopped = [];
  const failure = new Error('readiness timeout');
  const handle = {
    child: {},
    ownerToken: 'run-token',
    ownedContainerIds: [],
    stopPromise: null,
  };
  let present = true;
  await assert.rejects(
    runManagedE2E({
      assertCanStart: async () => undefined,
      startFunction: async () => handle,
      waitUntilReady: async () => {
        throw failure;
      },
      runPlaywright: async () => assert.fail('must not run'),
      showLogs: async () => undefined,
      stopFunction: (h) =>
        stopManagedFunction(h, {
          listContainers: () => (present ? [id] : []),
          inspectContainer: () => ({
            Id: id,
            Config: {
              Labels: { 'com.supabase.cli.project': 'sistema-voluntariado' },
              Env: ['SV_E2E_RUNTIME_OWNER=run-token'],
            },
          }),
          stopTree: async () => undefined,
          stopContainer: (own) => {
            stopped.push(own);
            present = false;
          },
        }),
    }),
    (error) => error === failure,
  );
  assert.deepEqual(stopped, [id]);
});

test('AUD008 independent cleanup survives a synchronous failure', async () => {
  let second = false;
  await assert.rejects(
    runIndependentCleanups([
      () => {
        throw new Error('sync cleanup');
      },
      () => {
        second = true;
      },
    ]),
    /sync cleanup/u,
  );
  assert.equal(second, true);
});

const ownedInfo = (id, token) => ({
  Id: id,
  Config: {
    Labels: { 'com.supabase.cli.project': 'sistema-voluntariado' },
    Env: [`SV_E2E_RUNTIME_OWNER=${token}`],
  },
});

test('AUD008 ownership requires exact marker, full ID and project, never singleton/name alone', () => {
  const id = 'b'.repeat(64);
  for (const info of [
    ownedInfo(id, 'foreign'),
    { ...ownedInfo(id, 'ours'), Id: 'c'.repeat(64) },
    {
      ...ownedInfo(id, 'ours'),
      Config: { Env: ['SV_E2E_RUNTIME_OWNER=ours'], Labels: {} },
    },
  ]) {
    const handle = { ownerToken: 'ours', ownedContainerIds: [] };
    assert.throws(
      () =>
        captureOwnedEdgeRuntimeContainers(handle, {
          listContainers: () => [id],
          inspectContainer: () => info,
        }),
      /unowned/u,
    );
    assert.deepEqual(handle.ownedContainerIds, []);
  }
});

test('AUD008 consecutive runs cannot inherit each other ownership', () => {
  const id = 'b'.repeat(64);
  const first = { ownerToken: 'first', ownedContainerIds: [] };
  const second = { ownerToken: 'second', ownedContainerIds: [] };
  const operations = {
    listContainers: () => [id],
    inspectContainer: () => ownedInfo(id, 'first'),
  };
  captureOwnedEdgeRuntimeContainers(first, operations);
  captureOwnedEdgeRuntimeContainers(first, operations);
  assert.deepEqual(first.ownedContainerIds, [id]);
  assert.throws(
    () => captureOwnedEdgeRuntimeContainers(second, operations),
    /unowned/u,
  );
  assert.deepEqual(second.ownedContainerIds, []);
});

test('AUD008 discovery tolerates removal but propagates failed Docker inspection', () => {
  const id = 'b'.repeat(64);
  const error = new Error('inspect unavailable');
  const handle = { ownerToken: 'ours', ownedContainerIds: [] };
  let listed = false;
  captureOwnedEdgeRuntimeContainers(handle, {
    listContainers: () => {
      if (listed) return [];
      listed = true;
      return [id];
    },
    inspectContainer: () => {
      throw error;
    },
  });
  assert.throws(
    () =>
      captureOwnedEdgeRuntimeContainers(handle, {
        listContainers: () => [id],
        inspectContainer: () => {
          throw error;
        },
      }),
    (e) => e === error,
  );
});

test('AUD008 environment preserves settings and refuses marker overrides or line injection', () => {
  assert.equal(
    createOwnedFunctionEnvironment('APP_ORIGIN=http://localhost:5173', 'ours'),
    'APP_ORIGIN=http://localhost:5173\nSV_E2E_RUNTIME_OWNER=ours\n',
  );
  assert.throws(
    () => createOwnedFunctionEnvironment('SV_E2E_RUNTIME_OWNER=old', 'ours'),
    /reserved/u,
  );
  assert.throws(
    () => createOwnedFunctionEnvironment('', 'ours\nBAD=1'),
    /Invalid/u,
  );
});

test('AUD008 polls ownership before readiness timeout and rejects a child exiting during probe', async () => {
  let captures = 0;
  const child = { exitCode: null, signalCode: null };
  await assert.rejects(
    waitForInvitationFunction({
      child,
      timeoutMs: 15,
      pollIntervalMs: 1,
      captureOwnership: () => {
        captures++;
      },
      fetchImplementation: () => response('Function not found', 404),
    }),
    /Timed out/u,
  );
  assert.ok(captures > 0);
  await assert.rejects(
    waitForInvitationFunction({
      child,
      fetchImplementation: () => {
        child.exitCode = 1;
        return response(JSON.stringify({ code: 'unauthenticated' }), 401, {
          'content-type': 'application/json',
          'access-control-allow-methods': 'POST, OPTIONS',
        });
      },
    }),
    /exited during/u,
  );
});

test('AUD008 cleans all proven containers despite process, inspection and first-stop failures', async () => {
  const stopped = [];
  const handle = {
    child: {},
    ownedContainerIds: ['first', 'second'],
    stopPromise: null,
  };
  await assert.rejects(
    stopManagedFunction(handle, {
      stopTree: async () => {
        throw new Error('tree failure');
      },
      listContainers: () => {
        throw new Error('inspection failure');
      },
      stopContainer: (id) => {
        stopped.push(id);
        if (id === 'first') throw new Error('stop failure');
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some((e) => e.message === 'tree failure') &&
      error.errors.some((e) => e.message === 'stop failure'),
  );
  assert.deepEqual(stopped, ['first', 'second']);
});

test('AUD008 removes a successfully stopped owned runtime by its exact ID', () => {
  const calls = [];
  const id = 'a'.repeat(64);
  stopOwnedEdgeRuntimeContainer(id, (args) => {
    calls.push(args);
    return '';
  });
  assert.deepEqual(calls, [
    ['stop', '--time', '5', id],
    ['rm', id],
  ]);
});

test('AUD008 foreign runtime appearing during teardown is reported and never stopped', async () => {
  let lists = 0;
  const stopped = [];
  await assert.rejects(
    stopManagedFunction(
      { child: {}, ownedContainerIds: ['ours'], stopPromise: null },
      {
        stopTree: async () => undefined,
        listContainers: () => (++lists === 1 ? ['ours'] : ['foreign']),
        stopContainer: (id) => stopped.push(id),
      },
    ),
    /unowned/u,
  );
  assert.deepEqual(stopped, ['ours']);
});

test('AUD008 original, teardown, log and artifact errors all survive', async () => {
  const failures = ['primary', 'teardown', 'logs', 'artifacts'].map(
    (message) => new Error(message),
  );
  await assert.rejects(
    runManagedE2E({
      assertCanStart: async () => undefined,
      startFunction: async () => ({}),
      waitUntilReady: async () => {
        throw failures[0];
      },
      runPlaywright: async () => assert.fail(),
      stopFunction: async () => {
        throw failures[1];
      },
      showLogs: async () => {
        throw failures[2];
      },
      removeArtifacts: async () => {
        throw failures[3];
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.every((e, index) => e === failures[index]) &&
      error.errors.length === 4,
  );
});

test('AUD008 signal interruption blocks new startup, independently cleans and exits once', async () => {
  for (const exitCode of [130, 143]) {
    const events = [];
    const errors = [];
    const termination = createE2ETerminator({
      cleanup: () =>
        runIndependentCleanups([
          () => {
            events.push('playwright');
            throw new Error('stop process');
          },
          () => {
            events.push('function');
          },
        ]),
      finish: () => {
        events.push('logs');
        throw new Error('logs failed');
      },
      report: (error) => errors.push(error),
      exit: (code) => events.push(code),
    });
    termination.assertRunning();
    const stopped = termination.terminate(exitCode);
    assert.throws(() => termination.assertRunning(), /interrupted/u);
    assert.equal(termination.terminate(99), stopped);
    await stopped;
    assert.deepEqual(events, ['playwright', 'function', 'logs', exitCode]);
    assert.equal(errors.length, 2);
  }
});

test('AUD008 one failed candidate inspection cannot hide another marked owner', async () => {
  const bad = 'b'.repeat(64),
    own = 'c'.repeat(64);
  const error = new Error('candidate inspect failed');
  const stopped = [];
  const handle = {
    child: {},
    ownerToken: 'ours',
    ownedContainerIds: [],
    stopPromise: null,
  };
  await assert.rejects(
    stopManagedFunction(handle, {
      listContainers: () => (stopped.length ? [bad] : [bad, own]),
      inspectContainer: (id) => {
        if (id === bad) throw error;
        return ownedInfo(own, 'ours');
      },
      stopTree: async () => undefined,
      stopContainer: (id) => stopped.push(id),
    }),
    (failure) =>
      failure instanceof AggregateError && failure.errors.includes(error),
  );
  assert.deepEqual(stopped, [own]);
});

test('AUD008 marker identifies renamed owned containers while ordinary project containers remain untouched', () => {
  const own = 'c'.repeat(64),
    db = 'd'.repeat(64);
  const handle = { ownerToken: 'ours', ownedContainerIds: [] };
  captureOwnedEdgeRuntimeContainers(handle, {
    listContainers: () => [db, own],
    inspectContainer: (id) =>
      id === own
        ? { ...ownedInfo(own, 'ours'), Name: '/renamed-own' }
        : {
            Id: db,
            Name: '/supabase_db_sistema-voluntariado',
            Config: {
              Env: [],
              Labels: { 'com.supabase.cli.project': 'sistema-voluntariado' },
            },
          },
  });
  assert.deepEqual(handle.ownedContainerIds, [own]);
});

test('AUD008 repeated identical signals keep their listener until cleanup completes', async () => {
  const target = new EventEmitter();
  let release;
  let cleans = 0;
  let exits = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const termination = createE2ETerminator({
    cleanup: async () => {
      cleans++;
      await gate;
    },
    finish: async () => undefined,
    report: () => assert.fail(),
    exit: () => {
      exits++;
    },
  });
  const dispose = installE2ESignalHandlers(target, termination.terminate);
  target.emit('SIGINT');
  target.emit('SIGINT');
  target.emit('SIGTERM');
  assert.equal(target.listenerCount('SIGINT'), 1);
  release();
  await termination.terminate(99);
  assert.equal(cleans, 1);
  assert.equal(exits, 1);
  dispose();
  assert.equal(target.listenerCount('SIGINT'), 0);
  assert.equal(target.listenerCount('SIGTERM'), 0);
});

test('AUD008 signal and normal finalization share logs and deletion exactly once', async () => {
  for (const signalFirst of [false, true]) {
    const handle = {};
    const events = [];
    const dependencies = {
      showLogs: async () => events.push('logs'),
      removeArtifacts: async () => events.push('remove'),
    };
    const first = finalizeManagedFunction(handle, {
      ...dependencies,
      logs: signalFirst,
    });
    const second = finalizeManagedFunction(handle, {
      ...dependencies,
      logs: !signalFirst,
    });
    assert.equal(first, second);
    await first;
    assert.deepEqual(events, signalFirst ? ['logs', 'remove'] : ['remove']);
  }
});

test('AUD008 finalization preserves both log and artifact failures', async () => {
  const log = new Error('logs'),
    artifact = new Error('artifact');
  await assert.rejects(
    finalizeManagedFunction(
      {},
      {
        logs: true,
        showLogs: async () => {
          throw log;
        },
        removeArtifacts: async () => {
          throw artifact;
        },
      },
    ),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === log &&
      error.errors[1] === artifact,
  );
});
