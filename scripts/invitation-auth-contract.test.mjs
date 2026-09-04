import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

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
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
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

async function verifyInvitation(link) {
  const response = await globalThis.fetch(link, { redirect: 'manual' });
  const location = response.headers.get('location');
  assert.ok(location);
  const redirect = new globalThis.URL(location);
  const fragment = new globalThis.URLSearchParams(redirect.hash.slice(1));
  return {
    accessToken: fragment.get('access_token'),
    errorCode:
      fragment.get('error_code') ?? redirect.searchParams.get('error_code'),
    refreshToken: fragment.get('refresh_token'),
  };
}

test('replace invalidates link A and only link B accepts generation B', async () => {
  const environment = localSupabaseEnvironment();
  assert.ok(environment.API_URL);
  assert.ok(environment.ANON_KEY);
  assert.ok(environment.SERVICE_ROLE_KEY);

  const administrator = createClient(
    environment.API_URL,
    environment.ANON_KEY,
    { auth: { persistSession: false } },
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
    administrator.rpc('prepare_account_invitation_v2', {
      requested_display_name: 'Auth Contract',
      requested_email: email,
      requested_idempotency_key: randomUUID(),
      requested_locale: 'es',
      requested_role_code: 'volunteer',
    }),
  );
  const beforeA = new Set(await recipientMessageIds(email));
  const { data: inviteAData, error: inviteAError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        preferred_locale: 'es',
      },
      redirectTo: 'http://localhost:5173/auth/callback',
    });
  assert.equal(inviteAError, null);
  const { error: metadataAError } = await admin.auth.admin.updateUserById(
    inviteAData.user.id,
    { app_metadata: { account_invitation_id: invitationA.invitation_id } },
  );
  assert.equal(metadataAError, null);
  const { error: acknowledgeAError } = await admin.rpc(
    'acknowledge_account_invitation_delivery',
    {
      requested_auth_user_id: inviteAData.user.id,
      requested_delivery_attempt_id: invitationA.delivery_attempt_id,
      requested_invitation_id: invitationA.invitation_id,
    },
  );
  assert.equal(acknowledgeAError, null);
  await exactlyOneRow(
    admin.rpc('finalize_account_invitation_delivery_v2', {
      delivery_succeeded: true,
      requested_auth_user_id: inviteAData.user.id,
      requested_delivery_attempt_id: invitationA.delivery_attempt_id,
      requested_invitation_id: invitationA.invitation_id,
      requested_provider_error_code: null,
    }),
  );
  const linkA = await invitationLink(await waitForNewMessage(email, beforeA));

  const invitationB = await exactlyOneRow(
    administrator.rpc('prepare_account_invitation_action_v2', {
      requested_idempotency_key: randomUUID(),
      requested_invitation_id: invitationA.invitation_id,
      requested_operation: 'replace',
      requested_reason: null,
    }),
  );
  const beforeB = new Set(await recipientMessageIds(email));
  const { data: inviteBData, error: inviteBError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { preferred_locale: 'es' },
      redirectTo: 'http://localhost:5173/auth/callback',
    });
  assert.equal(inviteBError, null);
  const { error: metadataError } = await admin.auth.admin.updateUserById(
    inviteBData.user.id,
    {
      app_metadata: { account_invitation_id: invitationB.invitation_id },
      user_metadata: {
        preferred_locale: 'es',
      },
    },
  );
  assert.equal(metadataError, null);
  const { error: acknowledgeBError } = await admin.rpc(
    'acknowledge_account_invitation_delivery',
    {
      requested_auth_user_id: inviteBData.user.id,
      requested_delivery_attempt_id: invitationB.delivery_attempt_id,
      requested_invitation_id: invitationB.invitation_id,
    },
  );
  assert.equal(acknowledgeBError, null);
  await exactlyOneRow(
    admin.rpc('finalize_account_invitation_delivery_v2', {
      delivery_succeeded: true,
      requested_auth_user_id: inviteBData.user.id,
      requested_delivery_attempt_id: invitationB.delivery_attempt_id,
      requested_invitation_id: invitationB.invitation_id,
      requested_provider_error_code: null,
    }),
  );
  const linkB = await invitationLink(await waitForNewMessage(email, beforeB));

  const resultA = await verifyInvitation(linkA);
  assert.equal(resultA.accessToken, null);
  assert.equal(resultA.errorCode, 'otp_expired');

  const resultB = await verifyInvitation(linkB);
  assert.ok(resultB.accessToken);
  assert.ok(resultB.refreshToken);
  const recipient = createClient(environment.API_URL, environment.ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: sessionError } = await recipient.auth.setSession({
    access_token: resultB.accessToken,
    refresh_token: resultB.refreshToken,
  });
  assert.equal(sessionError, null);
  const accepted = await exactlyOneRow(
    recipient.rpc('accept_current_account_invitation_v2'),
  );
  assert.equal(accepted.account_status, 'pending_profile');
  const acceptedInvitation = await exactlyOneRow(
    administrator.rpc('get_account_invitation_detail', {
      requested_invitation_id: invitationB.invitation_id,
    }),
  );
  assert.equal(acceptedInvitation.status, 'accepted');
  assert.equal(inviteAData.user.id, inviteBData.user.id);

  // Race gate: A can be consumed after DB prepares B but before Auth emits B.
  // Either Auth rejects reinviting the now-confirmed identity, or PostgreSQL
  // rejects the ACK because confirmation predates the current Auth issue.
  const raceEmail = `auth-race-${randomUUID()}@example.invalid`;
  const invitationC = await exactlyOneRow(
    administrator.rpc('prepare_account_invitation_v2', {
      requested_display_name: 'Auth Race',
      requested_email: raceEmail,
      requested_idempotency_key: randomUUID(),
      requested_locale: 'es',
      requested_role_code: 'volunteer',
    }),
  );
  const beforeC = new Set(await recipientMessageIds(raceEmail));
  const { data: inviteCData, error: inviteCError } =
    await admin.auth.admin.inviteUserByEmail(raceEmail, {
      data: { preferred_locale: 'es' },
      redirectTo: 'http://localhost:5173/auth/callback',
    });
  assert.equal(inviteCError, null);
  const { error: metadataCError } = await admin.auth.admin.updateUserById(
    inviteCData.user.id,
    { app_metadata: { account_invitation_id: invitationC.invitation_id } },
  );
  assert.equal(metadataCError, null);
  const { error: acknowledgeCError } = await admin.rpc(
    'acknowledge_account_invitation_delivery',
    {
      requested_auth_user_id: inviteCData.user.id,
      requested_delivery_attempt_id: invitationC.delivery_attempt_id,
      requested_invitation_id: invitationC.invitation_id,
    },
  );
  assert.equal(acknowledgeCError, null);
  await exactlyOneRow(
    admin.rpc('finalize_account_invitation_delivery_v2', {
      delivery_succeeded: true,
      requested_auth_user_id: inviteCData.user.id,
      requested_delivery_attempt_id: invitationC.delivery_attempt_id,
      requested_invitation_id: invitationC.invitation_id,
      requested_provider_error_code: null,
    }),
  );
  const linkC = await invitationLink(
    await waitForNewMessage(raceEmail, beforeC),
  );
  const invitationD = await exactlyOneRow(
    administrator.rpc('prepare_account_invitation_action_v2', {
      requested_idempotency_key: randomUUID(),
      requested_invitation_id: invitationC.invitation_id,
      requested_operation: 'replace',
      requested_reason: null,
    }),
  );
  const resultC = await verifyInvitation(linkC);
  assert.ok(resultC.accessToken);
  assert.ok(resultC.refreshToken);
  const raceRecipient = createClient(
    environment.API_URL,
    environment.ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { error: raceSessionError } = await raceRecipient.auth.setSession({
    access_token: resultC.accessToken,
    refresh_token: resultC.refreshToken,
  });
  assert.equal(raceSessionError, null);

  const { data: inviteDData, error: inviteDError } =
    await admin.auth.admin.inviteUserByEmail(raceEmail, {
      data: { preferred_locale: 'es' },
      redirectTo: 'http://localhost:5173/auth/callback',
    });
  if (inviteDError) {
    await exactlyOneRow(
      admin.rpc('finalize_account_invitation_delivery_v2', {
        delivery_succeeded: false,
        requested_auth_user_id: null,
        requested_delivery_attempt_id: invitationD.delivery_attempt_id,
        requested_invitation_id: invitationD.invitation_id,
        requested_provider_error_code: 'auth_provider_rejected',
      }),
    );
  } else {
    const { error: metadataDError } = await admin.auth.admin.updateUserById(
      inviteDData.user.id,
      { app_metadata: { account_invitation_id: invitationD.invitation_id } },
    );
    assert.equal(metadataDError, null);
    const { error: unsafeAcknowledgeError } = await admin.rpc(
      'acknowledge_account_invitation_delivery',
      {
        requested_auth_user_id: inviteDData.user.id,
        requested_delivery_attempt_id: invitationD.delivery_attempt_id,
        requested_invitation_id: invitationD.invitation_id,
      },
    );
    assert.equal(
      unsafeAcknowledgeError?.message,
      'auth_user_confirmed_before_delivery',
    );
    await exactlyOneRow(
      admin.rpc('finalize_account_invitation_delivery_v2', {
        delivery_succeeded: false,
        requested_auth_user_id: null,
        requested_delivery_attempt_id: invitationD.delivery_attempt_id,
        requested_invitation_id: invitationD.invitation_id,
        requested_provider_error_code: 'auth_provider_outcome_unknown',
      }),
    );
  }

  await raceRecipient.auth.refreshSession();
  const { error: raceAcceptanceError } = await raceRecipient.rpc(
    'accept_current_account_invitation_v2',
  );
  assert.ok(raceAcceptanceError);
  const blockedSuccessor = await exactlyOneRow(
    administrator.rpc('get_account_invitation_detail', {
      requested_invitation_id: invitationD.invitation_id,
    }),
  );
  assert.equal(blockedSuccessor.status, 'delivery_failed');
});
