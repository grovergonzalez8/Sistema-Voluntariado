import { fileURLToPath, URL } from 'node:url';
import { execFileSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

import { assertLocalSupabaseUrl } from './playwright-local-environment';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const fileEnvironment = loadEnv('development', workspaceRoot, '');
const suppliedSupabaseKey =
  process.env['VITE_SUPABASE_ANON_KEY'] ??
  fileEnvironment['VITE_SUPABASE_ANON_KEY'];
const configuredSupabaseUrl =
  process.env['VITE_SUPABASE_URL'] ?? fileEnvironment['VITE_SUPABASE_URL'];
if (!suppliedSupabaseKey || !configuredSupabaseUrl) {
  throw new Error(
    'E2E requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the local Supabase environment.',
  );
}
const suppliedSupabaseUrl = assertLocalSupabaseUrl(configuredSupabaseUrl);
const pnpmCli = process.env['npm_execpath'];
if (!pnpmCli) throw new Error('E2E must run through pnpm.');
const localStatus = execFileSync(
  process.execPath,
  [pnpmCli, 'exec', 'supabase', 'status', '-o', 'env'],
  { cwd: workspaceRoot, encoding: 'utf8' },
);
const localServiceRoleKey = /^SERVICE_ROLE_KEY="?([^"\r\n]+)"?$/m.exec(
  localStatus,
)?.[1];
if (!localServiceRoleKey) {
  throw new Error('E2E requires the local Supabase service role key.');
}

process.env['RUN_LOCAL_PROFILE_E2E'] = 'true';
process.env['LOCAL_SUPABASE_SERVICE_ROLE_KEY'] = localServiceRoleKey;

export default defineConfig({
  fullyParallel: false,
  reporter: 'html',
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'vite --host localhost --port 5173',
    env: {
      VITE_SUPABASE_ANON_KEY: suppliedSupabaseKey,
      VITE_SUPABASE_URL: suppliedSupabaseUrl,
    },
    name: 'Frontend',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    url: 'http://localhost:5173',
  },
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
