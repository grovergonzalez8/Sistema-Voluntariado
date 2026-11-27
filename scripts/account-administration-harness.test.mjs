import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { URL } from 'node:url';

// These test only refusal before Docker/SQL, never database concurrency.
for (const [name, authorization, container, message] of [
  ['missing opt-in', '', '', 'Explicit authorization'],
  ['wrong opt-in', 'true', 'a'.repeat(64), 'Explicit authorization'],
  [
    'missing container',
    'I_AUTHORIZE_AUD002_FIXTURES',
    '',
    'exact container ID',
  ],
  [
    'non-exact container',
    'I_AUTHORIZE_AUD002_FIXTURES',
    'supabase_db_sistema-voluntariado',
    'exact container ID',
  ],
  [
    'Docker host override',
    'I_AUTHORIZE_AUD002_FIXTURES',
    'a'.repeat(64),
    'DOCKER_HOST overrides',
  ],
]) {
  test(`AUD002 harness refuses ${name} before accessing Docker`, () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/account-administration-concurrency.test.mjs'],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          PATH: '',
          DOCKER_HOST:
            name === 'Docker host override' ? 'tcp://remote.invalid:2375' : '',
          AUD002_ALLOW_DISPOSABLE_DB: authorization,
          AUD002_DISPOSABLE_CONTAINER: container,
        },
      },
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(message), result.stderr);
    assert.doesNotMatch(result.stderr, /spawnSync docker|ENOENT/u);
  });
}
