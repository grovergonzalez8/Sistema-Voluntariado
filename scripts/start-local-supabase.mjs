import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { fileURLToPath, URL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
export const realEmailEnvironmentPath = fileURLToPath(
  new URL('../supabase/.env.real-email.local', import.meta.url),
);

const requiredRealEmailVariables = [
  'LOCAL_REAL_SMTP_USER',
  'LOCAL_REAL_SMTP_PASS',
  'LOCAL_REAL_SMTP_SENDER',
];

const smtpOverrideVariables = [
  'SUPABASE_AUTH_EMAIL_SMTP_HOST',
  'SUPABASE_AUTH_EMAIL_SMTP_PORT',
  'SUPABASE_AUTH_EMAIL_SMTP_USER',
  'SUPABASE_AUTH_EMAIL_SMTP_PASS',
  'SUPABASE_AUTH_EMAIL_SMTP_ADMIN_EMAIL',
  'SUPABASE_AUTH_EMAIL_SMTP_SENDER_NAME',
];

function withoutSmtpOverrides(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([variable]) => !smtpOverrideVariables.includes(variable),
    ),
  );
}

export function createMailpitEnvironment(environment = process.env) {
  return {
    ...withoutSmtpOverrides(environment),
    SUPABASE_AUTH_EMAIL_SMTP_ENABLED: 'false',
    SUPABASE_LOCAL_SMTP_ENABLED: 'true',
  };
}

export function createRealEmailEnvironment({
  environment = process.env,
  environmentPath = realEmailEnvironmentPath,
  fileExists = existsSync,
  readFile = readFileSync,
} = {}) {
  if (!fileExists(environmentPath)) {
    throw new Error(
      'Missing supabase/.env.real-email.local. Copy supabase/.env.real-email.example to that path and fill in its three variables.',
    );
  }

  const localSecrets = parseEnv(readFile(environmentPath, 'utf8'));
  const missingVariables = requiredRealEmailVariables.filter(
    (variable) => !localSecrets[variable]?.trim(),
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `supabase/.env.real-email.local must define non-empty values for: ${missingVariables.join(', ')}`,
    );
  }

  return {
    ...withoutSmtpOverrides(environment),
    SUPABASE_AUTH_EMAIL_SMTP_ADMIN_EMAIL: localSecrets.LOCAL_REAL_SMTP_SENDER,
    SUPABASE_AUTH_EMAIL_SMTP_ENABLED: 'true',
    SUPABASE_AUTH_EMAIL_SMTP_HOST: 'smtp.gmail.com',
    SUPABASE_AUTH_EMAIL_SMTP_PASS: localSecrets.LOCAL_REAL_SMTP_PASS,
    SUPABASE_AUTH_EMAIL_SMTP_PORT: '587',
    SUPABASE_AUTH_EMAIL_SMTP_SENDER_NAME: 'Sistema Voluntariado (local)',
    SUPABASE_AUTH_EMAIL_SMTP_USER: localSecrets.LOCAL_REAL_SMTP_USER,
    SUPABASE_LOCAL_SMTP_ENABLED: 'false',
  };
}

function commandFailure(command, result) {
  if (result.error) return result.error;
  const error = new Error(
    `${command} failed (exit=${String(result.status ?? 1)}).`,
  );
  error.exitCode = result.status ?? 1;
  return error;
}

export function startLocalSupabase({
  mode = 'mailpit',
  pnpmCli = process.env['npm_execpath'],
  runCommand = spawnSync,
  environmentOptions,
} = {}) {
  if (!pnpmCli) {
    throw new Error('Run this command through pnpm.');
  }
  if (mode !== 'mailpit' && mode !== 'real-email') {
    throw new Error(`Unsupported local email mode: ${mode}`);
  }
  if (
    mode === 'real-email' &&
    ['1', 'true'].includes(
      String(
        environmentOptions?.environment?.CI ?? process.env['CI'],
      ).toLowerCase(),
    )
  ) {
    throw new Error('Real email mode is disabled when CI is set.');
  }

  const environment =
    mode === 'real-email'
      ? createRealEmailEnvironment(environmentOptions)
      : createMailpitEnvironment(environmentOptions?.environment);

  const status = runCommand(
    process.execPath,
    [pnpmCli, 'exec', 'supabase', 'status', '--output', 'json'],
    { cwd: workspaceRoot, env: environment, stdio: 'ignore' },
  );
  if (!status.error && status.status === 0) {
    throw new Error(
      `Supabase local is already running. Run pnpm db:stop before starting with ${mode === 'real-email' ? 'Gmail SMTP' : 'Mailpit'}.`,
    );
  }

  console.info(
    mode === 'real-email'
      ? 'Starting Supabase local with Gmail SMTP (smtp.gmail.com:587, STARTTLS).'
      : 'Starting Supabase local with Mailpit.',
  );

  const result = runCommand(
    process.execPath,
    [pnpmCli, 'exec', 'supabase', 'start', '--exclude', 'edge-runtime'],
    { cwd: workspaceRoot, env: environment, stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) {
    throw commandFailure('supabase start', result);
  }
}

const isDirectInvocation =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectInvocation) {
  try {
    const realEmail = process.argv.slice(2).includes('--real-email');
    startLocalSupabase({ mode: realEmail ? 'real-email' : 'mailpit' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error && typeof error === 'object' && 'exitCode' in error
        ? Number(error.exitCode)
        : 1;
  }
}
