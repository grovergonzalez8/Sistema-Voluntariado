import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const supabaseProjectId = 'sistema-voluntariado';

function commandFailure(command, result) {
  if (result.error) return result.error;
  const error = new Error(
    `${command} failed (exit=${String(result.status)}).${result.stderr?.trim() ? ` ${result.stderr.trim()}` : ''}`,
  );
  error.exitCode = result.status ?? 1;
  return error;
}

function removeAutomaticEdgeRuntime(runCommand) {
  const edgeRuntimeContainers = runCommand(
    'docker',
    [
      'ps',
      '--all',
      '--quiet',
      '--filter',
      `label=com.supabase.cli.project=${supabaseProjectId}`,
      '--filter',
      'name=supabase_edge_runtime_',
    ],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  if (edgeRuntimeContainers.error || edgeRuntimeContainers.status !== 0) {
    throw commandFailure(
      'docker ps (Edge Runtime cleanup)',
      edgeRuntimeContainers,
    );
  }

  const containerIds = edgeRuntimeContainers.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  if (containerIds.length === 0) return;

  const remove = runCommand('docker', ['rm', '--force', ...containerIds], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (remove.error || remove.status !== 0) {
    throw commandFailure('docker rm (Edge Runtime cleanup)', remove);
  }
}

export function runResetLocalDatabase({
  pnpmCli = process.env['npm_execpath'],
  runCommand = spawnSync,
} = {}) {
  if (!pnpmCli) {
    throw new Error('Database reset must run through pnpm.');
  }

  let resetFailure = null;
  let cleanupFailure = null;
  try {
    const reset = runCommand(
      process.execPath,
      [pnpmCli, 'exec', 'supabase', 'db', 'reset', '--local'],
      { cwd: workspaceRoot, stdio: 'inherit' },
    );
    if (reset.error || reset.status !== 0) {
      resetFailure = commandFailure('supabase db reset --local', reset);
    }
  } finally {
    try {
      removeAutomaticEdgeRuntime(runCommand);
    } catch (error) {
      cleanupFailure = error;
    }
  }

  if (resetFailure && cleanupFailure) {
    throw new AggregateError(
      [resetFailure, cleanupFailure],
      `${resetFailure.message} Edge Runtime cleanup also failed: ${cleanupFailure.message}`,
    );
  }
  if (resetFailure) throw resetFailure;
  if (cleanupFailure) throw cleanupFailure;

  console.info(
    'Database reset complete; automatic Edge Runtime ownership removed.',
  );
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  try {
    runResetLocalDatabase();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error && typeof error === 'object' && 'exitCode' in error
        ? Number(error.exitCode)
        : 1;
  }
}
