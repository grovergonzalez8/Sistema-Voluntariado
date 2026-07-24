import { fileURLToPath, URL } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const fileEnvironment = loadEnv('development', workspaceRoot, '');
const suppliedSupabaseKey =
  process.env['VITE_SUPABASE_ANON_KEY'] ??
  fileEnvironment['VITE_SUPABASE_ANON_KEY'];
const suppliedSupabaseUrl =
  process.env['VITE_SUPABASE_URL'] ?? fileEnvironment['VITE_SUPABASE_URL'];
const runLocalProfileE2e = Boolean(suppliedSupabaseKey && suppliedSupabaseUrl);

process.env['RUN_LOCAL_PROFILE_E2E'] = runLocalProfileE2e ? 'true' : 'false';

export default defineConfig({
  fullyParallel: true,
  reporter: 'html',
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'vite --host 127.0.0.1 --port 4173',
    env: {
      VITE_SUPABASE_ANON_KEY:
        suppliedSupabaseKey ?? 'local-ui-test-not-a-secret',
      VITE_SUPABASE_URL: suppliedSupabaseUrl ?? 'http://127.0.0.1:54321',
    },
    reuseExistingServer: !process.env['CI'],
    url: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
