import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  createMailpitEnvironment,
  createRealEmailEnvironment,
  startLocalSupabase,
} from './start-local-supabase.mjs';

const secretContents = [
  'LOCAL_REAL_SMTP_USER=sender@gmail.com',
  'LOCAL_REAL_SMTP_PASS="app password value"',
  'LOCAL_REAL_SMTP_SENDER=sender@gmail.com',
].join('\n');
const environmentOutsideCi = { CI: '' };

function tomlSection(contents, name) {
  const marker = `[${name}]`;
  const start = contents.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${marker}`);
  const remainder = contents.slice(start + marker.length);
  const nextSection = remainder.search(/^\[/mu);
  return nextSection < 0 ? remainder : remainder.slice(0, nextSection);
}

test('tracked config keeps localhost redirects and Mailpit as the default', () => {
  const configPath = fileURLToPath(
    new URL('../supabase/config.toml', import.meta.url),
  );
  const config = readFileSync(configPath, 'utf8');
  const localSmtp = tomlSection(config, 'local_smtp');
  const auth = tomlSection(config, 'auth');
  const smtp = tomlSection(config, 'auth.email.smtp');

  assert.match(localSmtp, /^enabled = true$/mu);
  assert.match(auth, /^site_url = "http:\/\/localhost:5173"$/mu);
  assert.match(
    auth,
    /^additional_redirect_urls = \["http:\/\/localhost:5173\/auth\/callback"\]$/mu,
  );
  assert.match(smtp, /^enabled = false$/mu);
  assert.match(smtp, /^host = "smtp\.gmail\.com"$/mu);
  assert.match(smtp, /^port = 587$/mu);
  assert.match(smtp, /^pass = "env\(LOCAL_REAL_SMTP_PASS\)"$/mu);
});

test('Mailpit is forced even when SMTP overrides are inherited', () => {
  const environment = createMailpitEnvironment({
    SUPABASE_AUTH_EMAIL_SMTP_ENABLED: 'true',
    SUPABASE_AUTH_EMAIL_SMTP_PASS: 'must-not-survive',
    SUPABASE_LOCAL_SMTP_ENABLED: 'false',
  });

  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_ENABLED, 'false');
  assert.equal(environment.SUPABASE_LOCAL_SMTP_ENABLED, 'true');
  assert.equal('SUPABASE_AUTH_EMAIL_SMTP_PASS' in environment, false);
});

test('real email requires the ignored local environment file', () => {
  assert.throws(
    () =>
      createRealEmailEnvironment({
        environment: {},
        fileExists: () => false,
      }),
    /Missing supabase\/\.env\.real-email\.local/u,
  );
});

test('real email reports missing variable names without exposing values', () => {
  assert.throws(
    () =>
      createRealEmailEnvironment({
        environment: {},
        fileExists: () => true,
        readFile: () =>
          'LOCAL_REAL_SMTP_USER=sender@gmail.com\nLOCAL_REAL_SMTP_PASS=hidden-value',
      }),
    (error) => {
      assert.match(error.message, /LOCAL_REAL_SMTP_SENDER/u);
      assert.doesNotMatch(error.message, /hidden-value/u);
      return true;
    },
  );
});

test('real email maps local secrets to official Supabase config overrides', () => {
  const environment = createRealEmailEnvironment({
    environment: {
      SUPABASE_AUTH_EMAIL_SMTP_PASS: 'stale-password',
    },
    fileExists: () => true,
    readFile: () => secretContents,
  });

  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_ENABLED, 'true');
  assert.equal(environment.SUPABASE_LOCAL_SMTP_ENABLED, 'false');
  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_HOST, 'smtp.gmail.com');
  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_PORT, '587');
  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_USER, 'sender@gmail.com');
  assert.equal(
    environment.SUPABASE_AUTH_EMAIL_SMTP_ADMIN_EMAIL,
    'sender@gmail.com',
  );
  assert.equal(environment.SUPABASE_AUTH_EMAIL_SMTP_PASS, 'app password value');
});

test('default orchestration starts Supabase with Mailpit and no real password', () => {
  const calls = [];
  startLocalSupabase({
    pnpmCli: '/pnpm.cjs',
    environmentOptions: {
      environment: { SUPABASE_AUTH_EMAIL_SMTP_PASS: 'inherited-password' },
    },
    runCommand: (command, args, options) => {
      calls.push({ args, command, options });
      return { status: args.includes('status') ? 1 : 0 };
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args.slice(-3), [
    'start',
    '--exclude',
    'edge-runtime',
  ]);
  assert.equal(calls[1].options.env.SUPABASE_LOCAL_SMTP_ENABLED, 'true');
  assert.equal(calls[1].options.env.SUPABASE_AUTH_EMAIL_SMTP_ENABLED, 'false');
  assert.equal('SUPABASE_AUTH_EMAIL_SMTP_PASS' in calls[1].options.env, false);
});

test('default orchestration refuses to reuse a possibly real-email stack', () => {
  assert.throws(
    () =>
      startLocalSupabase({
        pnpmCli: '/pnpm.cjs',
        environmentOptions: { environment: {} },
        runCommand: () => ({ status: 0 }),
      }),
    /pnpm db:stop.*Mailpit/u,
  );
});

test('real email is disabled explicitly in CI', () => {
  for (const ci of ['true', '1']) {
    let commandCalled = false;
    assert.throws(
      () =>
        startLocalSupabase({
          mode: 'real-email',
          pnpmCli: '/pnpm.cjs',
          environmentOptions: { environment: { CI: ci } },
          runCommand: () => {
            commandCalled = true;
            return { status: 0 };
          },
        }),
      /disabled when CI is set/u,
    );
    assert.equal(commandCalled, false);
  }
});

test('real email refuses to reuse an already running local stack', () => {
  const calls = [];
  assert.throws(
    () =>
      startLocalSupabase({
        mode: 'real-email',
        pnpmCli: '/pnpm.cjs',
        environmentOptions: {
          environment: environmentOutsideCi,
          fileExists: () => true,
          readFile: () => secretContents,
        },
        runCommand: (command, args, options) => {
          calls.push({ args, command, options });
          return { status: 0 };
        },
      }),
    /pnpm db:stop/u,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes('status'), true);
});

test('real email preflights status then starts with Gmail overrides', () => {
  const calls = [];
  startLocalSupabase({
    mode: 'real-email',
    pnpmCli: '/pnpm.cjs',
    environmentOptions: {
      environment: environmentOutsideCi,
      fileExists: () => true,
      readFile: () => secretContents,
    },
    runCommand: (command, args, options) => {
      calls.push({ args, command, options });
      return { status: args.includes('status') ? 1 : 0 };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.includes('start'), true);
  assert.equal(calls[1].options.env.SUPABASE_LOCAL_SMTP_ENABLED, 'false');
  assert.equal(calls[1].options.env.SUPABASE_AUTH_EMAIL_SMTP_ENABLED, 'true');
  assert.equal(
    calls[1].options.env.SUPABASE_AUTH_EMAIL_SMTP_PASS,
    'app password value',
  );
});
