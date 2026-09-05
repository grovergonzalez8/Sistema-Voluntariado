import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { URL, URLSearchParams } from 'node:url';

import { createClient } from '../apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';

const mailpitUrl = 'http://127.0.0.1:54324';

function localSupabaseEnvironment() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'status', '-o', 'env'],
    { encoding: 'utf8' },
  );
  return Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/u))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

async function exactlyOneRow(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  assert.equal(data?.length, 1);
  return data[0];
}

async function recipientMessageIds(email) {
  const response = await globalThis.fetch(`${mailpitUrl}/api/v1/messages`);
  assert.equal(response.ok, true);
  const body = await response.json();
  return body.messages
    .filter((message) =>
      message.To?.some((recipient) => recipient.Address === email),
    )
    .map((message) => message.ID);
}

async function waitForNewMessage(email, previousIds) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ids = await recipientMessageIds(email);
    const nextId = ids.find((id) => !previousIds.has(id));
    if (nextId) return nextId;
    await delay(100);
  }
  throw new Error('Timed out waiting for a local invitation email.');
}

async function invitationLink(messageId) {
  const response = await globalThis.fetch(
    `${mailpitUrl}/api/v1/message/${encodeURIComponent(messageId)}`,
  );
  assert.equal(response.ok, true);
  const body = await response.json();
  const match = /https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/u.exec(
    body.Text,
  );
  assert.ok(match?.[0]);
  return match[0];
}

function challengeFromVerificationLink(link) {
  const redirectTo = new URL(link).searchParams.get('redirect_to');
  assert.ok(redirectTo);
  return new URL(redirectTo).searchParams.get('invitation_challenge');
}

async function verifyInvitation(link) {
  const response = await globalThis.fetch(link, { redirect: 'manual' });
  assert.equal(response.status, 303);
  const location = response.headers.get('location');
  assert.ok(location);
  const redirect = new URL(location);
  const fragment = new URLSearchParams(redirect.hash.slice(1));
  return {
    accessToken: fragment.get('access_token'),
    callbackChallenge: redirect.searchParams.get('invitation_challenge'),
    refreshToken: fragment.get('refresh_token'),
  };
}

function newChallenge() {
  const raw = randomBytes(32).toString('base64url');
  return {
    hash: createHash('sha256').update(raw, 'utf8').digest('hex'),
    raw,
  };
}

async function deliver(admin, email, invitation) {
  const challenge = newChallenge();
  const before = new Set(await recipientMessageIds(email));
  const { data: generation, error: stageError } = await admin.rpc(
    'stage_account_invitation_acceptance_challenge',
    {
      requested_challenge_hash: challenge.hash,
      requested_delivery_attempt_id: invitation.delivery_attempt_id,
      requested_invitation_id: invitation.invitation_id,
    },
  );
  assert.equal(stageError, null);
  assert.equal(typeof generation, 'number');
  const callback = new URL('http://localhost:5173/auth/callback');
  callback.searchParams.set('invitation_challenge', challenge.raw);
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { preferred_locale: 'es' },
      redirectTo: callback.toString(),
    });
  assert.equal(inviteError, null);
  const { error: metadataError } = await admin.auth.admin.updateUserById(
    inviteData.user.id,
    {
      app_metadata: {
        account_invitation_acceptance_challenge_hash: challenge.hash,
        account_invitation_delivery_attempt_id: invitation.delivery_attempt_id,
        account_invitation_delivery_generation: generation,
        account_invitation_id: invitation.invitation_id,
      },
    },
  );
  assert.equal(metadataError, null);
  const { error: acknowledgeError } = await admin.rpc(
    'acknowledge_account_invitation_delivery',
    {
      requested_auth_user_id: inviteData.user.id,
      requested_delivery_attempt_id: invitation.delivery_attempt_id,
      requested_invitation_id: invitation.invitation_id,
    },
  );
  assert.equal(acknowledgeError, null);
  await exactlyOneRow(
    admin.rpc('finalize_account_invitation_delivery_v2', {
      delivery_succeeded: true,
      requested_auth_user_id: inviteData.user.id,
      requested_delivery_attempt_id: invitation.delivery_attempt_id,
      requested_invitation_id: invitation.invitation_id,
      requested_provider_error_code: null,
    }),
  );
  const link = await invitationLink(await waitForNewMessage(email, before));
  assert.equal(challengeFromVerificationLink(link), challenge.raw);
  return { authUserId: inviteData.user.id, challenge, link };
}

test('A challenge cannot authorize B with B identity and metadata', async () => {
  const environment = localSupabaseEnvironment();
  assert.ok(environment.API_URL);
  assert.ok(environment.ANON_KEY);
  assert.ok(environment.SERVICE_ROLE_KEY);

  const administrator = createClient(
    environment.API_URL,
    environment.ANON_KEY,
    {
      auth: { persistSession: false },
    },
  );
  const admin = createClient(
    environment.API_URL,
    environment.SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const email = `auth-contract-${randomUUID()}@example.invalid`;
  const { error: signInError } = await administrator.auth.signInWithPassword({
    email: 'administrator@example.invalid',
    password: 'local-test-only-not-a-secret',
  });
  assert.equal(signInError, null);

  const invitationA = await exactlyOneRow(
    administrator.rpc('prepare_account_invitation_v3', {
      requested_display_name: 'Auth Contract',
      requested_email: email,
      requested_idempotency_key: randomUUID(),
      requested_locale: 'es',
      requested_role_code: 'volunteer',
    }),
  );
  const deliveryA = await deliver(admin, email, invitationA);

  const invitationB = await exactlyOneRow(
    administrator.rpc('prepare_account_invitation_action_v3', {
      requested_idempotency_key: randomUUID(),
      requested_invitation_id: invitationA.invitation_id,
      requested_operation: 'replace',
      requested_reason: null,
    }),
  );
  const deliveryB = await deliver(admin, email, invitationB);
  assert.notEqual(deliveryA.challenge.hash, deliveryB.challenge.hash);
  assert.equal(deliveryA.authUserId, deliveryB.authUserId);

  const verifiedB = await verifyInvitation(deliveryB.link);
  assert.equal(verifiedB.callbackChallenge, deliveryB.challenge.raw);
  assert.ok(verifiedB.accessToken);
  assert.ok(verifiedB.refreshToken);
  const recipient = createClient(environment.API_URL, environment.ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: sessionError } = await recipient.auth.setSession({
    access_token: verifiedB.accessToken,
    refresh_token: verifiedB.refreshToken,
  });
  assert.equal(sessionError, null);
  const { data: currentUser, error: userError } =
    await recipient.auth.getUser();
  assert.equal(userError, null);
  assert.equal(
    currentUser.user.app_metadata.account_invitation_id,
    invitationB.invitation_id,
  );

  const { error: wrongChallengeError } = await recipient.rpc(
    'accept_current_account_invitation_v3',
    { requested_acceptance_challenge: deliveryA.challenge.raw },
  );
  assert.equal(wrongChallengeError?.message, 'invitation_challenge_mismatch');
  const beforeAcceptance = await exactlyOneRow(
    administrator.rpc('get_account_invitation_detail', {
      requested_invitation_id: invitationB.invitation_id,
    }),
  );
  assert.equal(beforeAcceptance.status, 'sent');

  const accepted = await exactlyOneRow(
    recipient.rpc('accept_current_account_invitation_v3', {
      requested_acceptance_challenge: deliveryB.challenge.raw,
    }),
  );
  assert.equal(accepted.account_status, 'pending_profile');
  const acceptedInvitation = await exactlyOneRow(
    administrator.rpc('get_account_invitation_detail', {
      requested_invitation_id: invitationB.invitation_id,
    }),
  );
  assert.equal(acceptedInvitation.status, 'accepted');
});
