import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import test from 'node:test';

import { checkQualityBindings } from './check-quality-bindings.mjs';

function fixture(name, target, port) {
  return {
    Name: `/${name}`,
    HostConfig: {
      PortBindings: target
        ? { [target]: [{ HostIp: '', HostPort: port }] }
        : {},
      PublishAllPorts: false,
    },
    NetworkSettings: {
      Networks: { 'supabase_network_sistema-voluntariado': {} },
      Ports: target
        ? { [target]: [{ HostIp: '127.0.0.1', HostPort: port }] }
        : { '9999/tcp': null },
    },
  };
}

test('accepts the Docker probe and internal-only Auth beside the required services', () => {
  checkQualityBindings([fixture('probe', '8080/tcp', '15432')], 'probe');
  checkQualityBindings(
    [
      fixture('supabase_auth_sistema-voluntariado'),
      fixture('supabase_db_sistema-voluntariado', '5432/tcp', '54322'),
      fixture('supabase_kong_sistema-voluntariado', '8000/tcp', '54321'),
      fixture('supabase_mailpit_sistema-voluntariado', '8025/tcp', '54324'),
      fixture('supabase_analytics_sistema-voluntariado', '4000/tcp', '54327'),
    ],
    'stack',
  );
});

test('rejects wildcard, IPv6 wildcard, non-loopback and extra effective mappings', () => {
  for (const host of ['0.0.0.0', '::', '192.0.2.10', '']) {
    const item = fixture('probe', '8080/tcp', '15432');
    item.NetworkSettings.Ports['8080/tcp'][0].HostIp = host;
    assert.throws(() => checkQualityBindings([item], 'probe'), /non-loopback/u);
  }
  const item = fixture('probe', '8080/tcp', '15432');
  item.NetworkSettings.Ports['8080/tcp'].push({
    HostIp: '::',
    HostPort: '15432',
  });
  assert.throws(() => checkQualityBindings([item], 'probe'), /non-loopback/u);
});

test('rejects missing services, stray networks and unexpected published services', () => {
  const kong = fixture(
    'supabase_kong_sistema-voluntariado',
    '8000/tcp',
    '54321',
  );
  assert.throws(() => checkQualityBindings([kong], 'stack'), /missing/u);
  kong.NetworkSettings.Networks.bridge = {};
  assert.throws(() => checkQualityBindings([kong], 'stack'), /network/u);
  const auth = fixture(
    'supabase_auth_sistema-voluntariado',
    '9999/tcp',
    '15432',
  );
  assert.throws(
    () => checkQualityBindings([auth], 'stack'),
    /Unexpected published/u,
  );
});

test('reads a large inspection document through a pipe', async () => {
  const inspection = fixture('probe', '8080/tcp', '15432');
  inspection.Config = { Env: ['SYNTHETIC='.padEnd(256 * 1024, 'x')] };
  const verifier = spawn(
    process.execPath,
    ['scripts/check-quality-bindings.mjs', 'probe'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const completion = once(verifier, 'close');
  const stderr = text(verifier.stderr);
  const stdout = text(verifier.stdout);
  verifier.stdin.end(JSON.stringify([inspection]));
  assert.deepEqual(await completion, [0, null], await stderr);
  assert.match(await stdout, /Effective Docker publications verified/u);
});
