import { spawn, spawnSync } from 'node:child_process';
import console from 'node:console';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delayTimer } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

export const invitationFunctionUrl =
  'http://127.0.0.1:54321/functions/v1/manage-account-invitation';
export const supabaseHealthUrl = 'http://127.0.0.1:54321/auth/v1/health';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const allowedOrigin = 'http://localhost:5173';
const supabaseProjectId = 'sistema-voluntariado';

const delay = (milliseconds) => delayTimer(milliseconds);

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function redactSensitiveOutput(output) {
  return output
    .replace(/sb_secret_[A-Za-z0-9_-]+/gu, '[redacted-supabase-secret]')
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,
      '[redacted-jwt]',
    );
}

export async function probeInvitationFunction(
  fetchImplementation = globalThis.fetch,
) {
  try {
    const response = await fetchImplementation(invitationFunctionUrl, {
      body: '{}',
      headers: {
        'content-type': 'application/json',
        origin: allowedOrigin,
      },
      method: 'POST',
      signal: globalThis.AbortSignal.timeout(2_000),
    });
    const responseText = await response.text();
    let responseBody = null;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const allowedMethods =
      response.headers.get('access-control-allow-methods') ?? '';
    if (
      response.status === 401 &&
      contentType.includes('application/json') &&
      allowedMethods.includes('POST') &&
      allowedMethods.includes('OPTIONS') &&
      responseBody &&
      typeof responseBody === 'object' &&
      responseBody.code === 'unauthenticated'
    ) {
      return { kind: 'ready', status: response.status };
    }

    const proxySignature =
      `${response.headers.get('server') ?? ''} ${response.headers.get('via') ?? ''}`.toLowerCase();
    if (
      ([502, 503].includes(response.status) &&
        proxySignature.includes('kong')) ||
      (response.status === 404 && responseText.trim() === 'Function not found')
    ) {
      return { kind: 'unavailable', status: response.status };
    }

    return {
      detail: `unexpected HTTP ${response.status}`,
      kind: 'unexpected',
      status: response.status,
    };
  } catch (error) {
    return {
      detail: safeErrorMessage(error),
      kind: 'unreachable',
      status: null,
    };
  }
}

export async function probeSupabaseGateway(
  fetchImplementation = globalThis.fetch,
) {
  try {
    const response = await fetchImplementation(supabaseHealthUrl, {
      signal: globalThis.AbortSignal.timeout(2_000),
    });
    const responseText = await response.text();
    let responseBody = null;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = null;
    }
    if (
      response.status === 200 &&
      responseBody &&
      typeof responseBody === 'object' &&
      responseBody.name === 'GoTrue'
    ) {
      return { kind: 'ready', status: response.status };
    }
    return {
      detail: `unexpected health HTTP ${response.status}`,
      kind: 'unexpected',
      status: response.status,
    };
  } catch (error) {
    return {
      detail: safeErrorMessage(error),
      kind: 'unreachable',
      status: null,
    };
  }
}

export function assertFunctionCanStart(
  probe,
  runningContainerIds,
  gatewayProbe = { kind: 'ready', status: 200 },
) {
  if (runningContainerIds.length > 0) {
    throw new Error(
      'An Edge Runtime container is already running before E2E orchestration. Stop the previous local suite with `corepack pnpm db:stop`, then start it again with `corepack pnpm db:start`. No existing Function was reused.',
    );
  }
  if (probe.kind === 'ready') {
    throw new Error(
      'manage-account-invitation is already active before E2E orchestration. Refusing to start or reuse a second Function server.',
    );
  }
  if (gatewayProbe.kind !== 'ready') {
    throw new Error(
      `The local Supabase gateway did not return its typed GoTrue health response. Run \`corepack pnpm db:start\` first. ${gatewayProbe.detail ?? gatewayProbe.kind}`,
    );
  }
  if (probe.kind === 'unreachable') {
    return;
  }
  if (probe.kind !== 'unavailable') {
    throw new Error(
      `The Function URL returned an unexpected response (${probe.detail}). Another process may own the local port; no server was reused.`,
    );
  }
}

export async function waitForInvitationFunction({
  child,
  fetchImplementation = globalThis.fetch,
  pollIntervalMs = 250,
  timeoutMs = 120_000,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = { kind: 'unavailable', status: 503 };
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `functions:serve exited before readiness (exit=${String(child.exitCode)}, signal=${String(child.signalCode)}).`,
      );
    }

    lastProbe = await probeInvitationFunction(fetchImplementation);
    if (lastProbe.kind === 'ready') return;
    if (lastProbe.kind === 'unexpected') {
      throw new Error(
        `Function readiness failed: ${lastProbe.detail ?? lastProbe.kind}.`,
      );
    }
    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the typed manage-account-invitation readiness response (last status=${String(lastProbe.status)}).`,
  );
}

export async function runManagedE2E(operations) {
  let handle = null;
  let primaryError = null;
  let teardownError = null;
  let logError = null;
  try {
    await operations.assertCanStart();
    handle = await operations.startFunction();
    await operations.waitUntilReady(handle);
    await operations.runPlaywright();
  } catch (error) {
    primaryError = error;
  } finally {
    if (handle) {
      try {
        await operations.stopFunction(handle);
      } catch (error) {
        teardownError = error;
      }
      if (primaryError || teardownError) {
        try {
          await operations.showLogs(handle);
        } catch (error) {
          logError = error;
        }
      }
    }
  }

  const failures = [primaryError, teardownError, logError].filter(Boolean);
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      failures.map((failure) => safeErrorMessage(failure)).join(' Cleanup: '),
    );
  }
  if (failures.length === 1) throw failures[0];
}

export async function runIndependentCleanups(cleanups) {
  const results = await Promise.allSettled(
    cleanups.map((cleanup) => cleanup()),
  );
  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Independent process cleanup failed.');
  }
  if (failures.length === 1) throw failures[0];
}

function runDocker(arguments_) {
  const result = spawnSync('docker', arguments_, {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Docker command failed: docker ${arguments_.join(' ')}\n${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

function listEdgeRuntimeContainers() {
  const output = runDocker([
    'ps',
    '--quiet',
    '--filter',
    `label=com.supabase.cli.project=${supabaseProjectId}`,
    '--filter',
    'name=supabase_edge_runtime_',
  ]);
  return output ? output.split(/\r?\n/u).filter(Boolean) : [];
}

export function stopOwnedEdgeRuntimeContainer(
  containerId,
  dockerCommand = runDocker,
) {
  try {
    dockerCommand(['stop', '--time', '5', containerId]);
  } catch (stopError) {
    let matchingContainers;
    try {
      const output = dockerCommand([
        'ps',
        '--all',
        '--quiet',
        '--no-trunc',
        '--filter',
        `id=${containerId}`,
      ]);
      matchingContainers = output ? output.split(/\r?\n/u).filter(Boolean) : [];
    } catch (inspectionError) {
      throw new AggregateError(
        [stopError, inspectionError],
        `Failed to stop or verify owned Edge Runtime container ${containerId}.`,
        { cause: inspectionError },
      );
    }

    const containerStillExists = matchingContainers.some(
      (candidateId) =>
        candidateId === containerId || candidateId.startsWith(containerId),
    );
    if (containerStillExists) throw stopError;
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    if (!(await waitForExit(child, 5_000))) {
      throw new Error(
        `Timed out stopping the owned functions:serve process tree (PID ${child.pid}).`,
      );
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    if (!(await waitForExit(child, 5_000))) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  }
}

function spawnPnpm(arguments_, options = {}) {
  const pnpmCli = process.env['npm_execpath'];
  if (!pnpmCli) {
    throw new Error('E2E orchestration must run through pnpm.');
  }
  return spawn(process.execPath, [pnpmCli, ...arguments_], {
    cwd: workspaceRoot,
    env: process.env,
    ...options,
  });
}

function waitForCommand(child, commandName) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${commandName} failed (exit=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      }
    });
  });
}

function createManagedFunction() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sv-e2e-functions-'));
  const logPath = join(temporaryDirectory, 'functions.log');
  const logDescriptor = openSync(logPath, 'a');
  const child = spawnPnpm(['functions:serve'], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', logDescriptor, logDescriptor],
  });
  closeSync(logDescriptor);
  return {
    child,
    logPath,
    ownedContainerIds: [],
    stopPromise: null,
    temporaryDirectory,
  };
}

export function partitionEdgeRuntimeContainers(ownedContainerIds, runningIds) {
  const owned = new Set(ownedContainerIds);
  return {
    ownedAndRunning: runningIds.filter((containerId) => owned.has(containerId)),
    unowned: runningIds.filter((containerId) => !owned.has(containerId)),
  };
}

export function acquireSingleEdgeRuntimeContainer(containerIds) {
  if (containerIds.length !== 1) {
    throw new Error(
      `Expected exactly one Edge Runtime container created by this run; found ${containerIds.length}. No ambiguous container ownership was accepted.`,
    );
  }
  return containerIds[0];
}

export async function stopManagedFunction(
  handle,
  {
    listContainers = listEdgeRuntimeContainers,
    stopContainer = stopOwnedEdgeRuntimeContainer,
    stopTree = stopProcessTree,
  } = {},
) {
  handle.stopPromise ??= (async () => {
    const failures = [];
    try {
      await stopTree(handle.child);
    } catch (error) {
      failures.push(error);
    }

    try {
      const running = listContainers();
      const { ownedAndRunning, unowned } = partitionEdgeRuntimeContainers(
        handle.ownedContainerIds,
        running,
      );
      for (const containerId of ownedAndRunning) {
        stopContainer(containerId);
      }

      const owned = new Set(handle.ownedContainerIds);
      const remainingOwned = listContainers().filter((containerId) =>
        owned.has(containerId),
      );
      if (remainingOwned.length > 0) {
        failures.push(
          new Error(
            `Edge Runtime teardown left owned containers running: ${remainingOwned.join(', ')}`,
          ),
        );
      }
      if (unowned.length > 0) {
        failures.push(
          new Error(
            `Concurrent unowned Edge Runtime containers were detected and left untouched: ${unowned.join(', ')}`,
          ),
        );
      }
    } catch (error) {
      failures.push(error);
    }

    if (failures.length > 0) {
      throw failures.length === 1
        ? failures[0]
        : new AggregateError(failures, 'Edge Function teardown failed.');
    }
  })();
  return handle.stopPromise;
}

function showFunctionLogs(handle) {
  const output = readFileSync(handle.logPath, 'utf8').trim();
  console.error(
    output
      ? `[Edge Functions log]\n${redactSensitiveOutput(output)}`
      : '[Edge Functions log] No output was captured before failure.',
  );
}

function removeTemporaryArtifacts(handle) {
  rmSync(handle.temporaryDirectory, { force: true, recursive: true });
}

async function main() {
  let activeHandle = null;
  let activePlaywright = null;
  let terminationPromise = null;
  const terminate = (exitCode) => {
    terminationPromise ??= (async () => {
      try {
        await runIndependentCleanups([
          async () => {
            if (activePlaywright) await stopProcessTree(activePlaywright);
          },
          async () => {
            if (activeHandle) await stopManagedFunction(activeHandle);
          },
        ]);
      } catch (error) {
        console.error(`Signal cleanup failed: ${safeErrorMessage(error)}`);
      } finally {
        if (activeHandle) removeTemporaryArtifacts(activeHandle);
        process.exit(exitCode);
      }
    })();
  };
  process.once('SIGINT', () => terminate(130));
  process.once('SIGTERM', () => terminate(143));

  try {
    await runManagedE2E({
      assertCanStart: async () => {
        const runningContainers = listEdgeRuntimeContainers();
        const probe = await probeInvitationFunction();
        const gatewayProbe = await probeSupabaseGateway();
        assertFunctionCanStart(probe, runningContainers, gatewayProbe);
      },
      runPlaywright: async () => {
        activePlaywright = spawnPnpm(
          ['--filter', '@sistema-voluntariado/web', 'test:e2e:playwright'],
          {
            detached: process.platform !== 'win32',
            stdio: 'inherit',
          },
        );
        try {
          await waitForCommand(activePlaywright, 'Playwright');
        } finally {
          activePlaywright = null;
        }
      },
      showLogs: async (handle) => showFunctionLogs(handle),
      startFunction: async () => {
        activeHandle = createManagedFunction();
        return activeHandle;
      },
      stopFunction: async (handle) => {
        await stopManagedFunction(handle);
      },
      waitUntilReady: async (handle) => {
        await waitForInvitationFunction({ child: handle.child });
        const acquiredContainerId = acquireSingleEdgeRuntimeContainer(
          listEdgeRuntimeContainers(),
        );
        handle.ownedContainerIds = [acquiredContainerId];
      },
    });
  } finally {
    if (activeHandle) removeTemporaryArtifacts(activeHandle);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
