import console from 'node:console';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';

const network = 'supabase_network_sistema-voluntariado';
const loopback = '127.0.0.1';
const services = {
  supabase_db_sistema_voluntariado: ['5432/tcp', '54322'],
  supabase_kong_sistema_voluntariado: ['8000/tcp', '54321'],
  supabase_inbucket_sistema_voluntariado: ['8025/tcp', '54324'],
  supabase_mailpit_sistema_voluntariado: ['8025/tcp', '54324'],
  supabase_studio_sistema_voluntariado: ['3000/tcp', '54323'],
  supabase_analytics_sistema_voluntariado: ['4000/tcp', '54327'],
};

export function checkQualityBindings(containers, mode) {
  if (!Array.isArray(containers) || containers.length === 0) {
    throw new Error('No containers found for binding inspection.');
  }
  if (mode !== 'probe' && mode !== 'stack') {
    throw new Error('Unknown binding inspection mode.');
  }
  if (mode === 'probe' && containers.length !== 1) {
    throw new Error('Expected exactly one isolation probe.');
  }

  const ports = new Set();
  for (const container of containers) {
    const name = container.Name.slice(1).replaceAll('-', '_');
    const attachments = Object.keys(container.NetworkSettings.Networks);
    if (
      attachments.length !== 1 ||
      attachments[0] !== network ||
      container.HostConfig.PublishAllPorts
    ) {
      throw new Error(`Unexpected network or automatic publication: ${name}.`);
    }

    const expected = mode === 'probe' ? ['8080/tcp', '15432'] : services[name];
    const configured = Object.entries(container.HostConfig.PortBindings ?? {});
    const effective = Object.entries(
      container.NetworkSettings.Ports ?? {},
    ).filter(([, bindings]) => bindings?.length);
    if (!expected) {
      if (configured.length || effective.length) {
        throw new Error(`Unexpected published port: ${name}.`);
      }
      continue;
    }

    const [[configuredPort, requested] = []] = configured;
    const [[effectivePort, actual] = []] = effective;
    const [containerPort, hostPort] = expected;
    if (
      configured.length !== 1 ||
      effective.length !== 1 ||
      configuredPort !== containerPort ||
      effectivePort !== containerPort ||
      requested?.length !== 1 ||
      !['', loopback].includes(requested[0].HostIp) ||
      requested[0].HostPort !== hostPort ||
      actual?.length !== 1 ||
      actual[0].HostIp !== loopback ||
      actual[0].HostPort !== hostPort ||
      ports.has(hostPort)
    ) {
      throw new Error(`Missing or non-loopback publication: ${name}.`);
    }
    ports.add(hostPort);
  }

  if (
    mode === 'stack' &&
    !['54321', '54322', '54324'].every((port) => ports.has(port))
  ) {
    throw new Error('Kong, PostgreSQL or Mailpit publication is missing.');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkQualityBindings(JSON.parse(await text(process.stdin)), process.argv[2]);
  console.log('Effective Docker publications verified on IPv4 loopback.');
}
