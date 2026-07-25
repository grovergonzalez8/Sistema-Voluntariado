import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const environmentPath = fileURLToPath(
  new URL('../supabase/functions/.env.local', import.meta.url),
);
const requiredVariables = ['APP_ORIGIN', 'ALLOWED_ORIGINS'];

if (!existsSync(environmentPath)) {
  console.error(
    'Missing supabase/functions/.env.local. Run: Copy-Item supabase/functions/.env.example supabase/functions/.env.local',
  );
  process.exit(1);
}

const variables = new Map(
  readFileSync(environmentPath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      return separator < 0
        ? [line, '']
        : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);
const missingVariables = requiredVariables.filter(
  (variable) => !variables.get(variable),
);

if (missingVariables.length > 0) {
  console.error(
    `supabase/functions/.env.local must define non-empty values for: ${missingVariables.join(', ')}`,
  );
  process.exit(1);
}

const pnpmCli = process.env['npm_execpath'];
if (!pnpmCli) {
  console.error('Run this command through pnpm: corepack pnpm functions:serve');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    pnpmCli,
    'exec',
    'supabase',
    'functions',
    'serve',
    'manage-account-invitation',
    '--no-verify-jwt',
    '--env-file',
    environmentPath,
  ],
  { cwd: workspaceRoot, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
