import { execFileSync } from 'node:child_process';

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';

const localPassword = 'local-test-only-not-a-secret';
const supabaseUrl =
  process.env['VITE_SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const anonKey = process.env['VITE_SUPABASE_ANON_KEY'] ?? '';
const localServiceRoleKey =
  process.env['LOCAL_SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const mailpitUrl = 'http://127.0.0.1:54324';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readProtectedCounts(request: APIRequestContext) {
  const serviceHeaders = {
    apikey: localServiceRoleKey,
    authorization: `Bearer ${localServiceRoleKey}`,
  };
  const usersResponse = await request.get(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: serviceHeaders },
  );
  expect(usersResponse.ok()).toBe(true);
  const usersPayload: unknown = await usersResponse.json();
  if (!isRecord(usersPayload) || !Array.isArray(usersPayload['users'])) {
    throw new Error('Local Auth returned an invalid admin users payload.');
  }

  const tokenResponse = await request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      data: {
        email: 'administrator@example.invalid',
        password: localPassword,
      },
      headers: { apikey: anonKey, 'content-type': 'application/json' },
    },
  );
  expect(tokenResponse.ok()).toBe(true);
  const tokenPayload: unknown = await tokenResponse.json();
  if (
    !isRecord(tokenPayload) ||
    typeof tokenPayload['access_token'] !== 'string'
  ) {
    throw new Error('Local administrator session is unavailable.');
  }
  const accountsResponse = await request.post(
    `${supabaseUrl}/rest/v1/rpc/list_accounts`,
    {
      data: { requested_limit: 100, requested_offset: 0, requested_search: '' },
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${tokenPayload['access_token']}`,
        'content-type': 'application/json',
      },
    },
  );
  expect(accountsResponse.ok()).toBe(true);
  const accountsPayload: unknown = await accountsResponse.json();
  if (!Array.isArray(accountsPayload)) {
    throw new Error('Local accounts payload is invalid.');
  }

  return {
    accounts: accountsPayload.length,
    users: usersPayload['users'].length,
  };
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

async function confirmButton(page: Page, name: string): Promise<void> {
  const rpcName = name.startsWith('Agregar')
    ? 'manage_account_role'
    : 'change_account_status';
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/rest/v1/rpc/${rpcName}`),
  );
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.getByRole('button', { name }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
}

async function findMailpitMessageIds(
  request: APIRequestContext,
  recipient: string,
): Promise<string[]> {
  const response = await request.get(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok()) return [];
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload['messages'])) return [];
  const matches: string[] = [];
  const messages: readonly unknown[] = payload['messages'];
  for (const message of messages) {
    if (!isRecord(message) || typeof message['ID'] !== 'string') continue;
    const recipients = message['To'];
    if (!Array.isArray(recipients)) continue;
    const recipientRows: readonly unknown[] = recipients;
    if (
      recipientRows.some((row) => isRecord(row) && row['Address'] === recipient)
    ) {
      matches.push(message['ID']);
    }
  }
  return matches;
}

async function findMailpitMessageId(
  request: APIRequestContext,
  recipient: string,
): Promise<string | null> {
  return (await findMailpitMessageIds(request, recipient))[0] ?? null;
}

async function readInvitationLink(
  request: APIRequestContext,
  messageId: string,
): Promise<string> {
  const response = await request.get(
    `${mailpitUrl}/api/v1/message/${encodeURIComponent(messageId)}`,
  );
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload['Text'] !== 'string') {
    throw new Error('Mailpit returned an invalid local message.');
  }
  const match = /https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/.exec(
    payload['Text'],
  );
  if (!match?.[0]) throw new Error('The local invitation link was not found.');
  return match[0];
}

async function createInvitationFromUi(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<{ readonly link: string; readonly messageId: string }> {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Nombre visible').fill('Invitación negativa E2E');
  await page.getByLabel('Rol inicial').selectOption('volunteer');
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/manage-account-invitation'),
  );
  await page.getByRole('button', { name: 'Crear invitación' }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByText('Invitación creada.')).toBeVisible();
  await expect
    .poll(() => findMailpitMessageIds(request, email))
    .toHaveLength(1);
  const messageId = await findMailpitMessageId(request, email);
  if (!messageId) throw new Error('The isolated Mailpit message is missing.');
  return { link: await readInvitationLink(request, messageId), messageId };
}

async function invitationAction(
  page: Page,
  email: string,
  name: 'Revocar' | 'Sustituir',
): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/manage-account-invitation'),
  );
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByRole('article')
    .filter({ hasText: email })
    .getByRole('button', { name })
    .click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByText('Invitación actualizada.')).toBeVisible();
}

async function expectInvitationLinkRejected(
  browser: Browser,
  link: string,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await expect(page).toHaveURL(/\/(invite\/accept|login)$/u);
  if (page.url().endsWith('/invite/accept')) {
    await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  }
  await expect(page).toHaveURL(/\/login$/u);
  expect(
    await page.evaluate(() => {
      for (const storageKey of Object.keys(localStorage)) {
        if (localStorage.getItem(storageKey)?.includes('access_token')) {
          return true;
        }
      }
      return false;
    }),
  ).toBe(false);
  await context.close();
}

async function assertCanonicalInvitationState(
  request: APIRequestContext,
  email: string,
  expectedDisplayName = 'Persona Activada E2E',
): Promise<void> {
  const serviceHeaders = {
    apikey: localServiceRoleKey,
    authorization: `Bearer ${localServiceRoleKey}`,
  };
  const tokenResponse = await request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      data: {
        email: 'administrator@example.invalid',
        password: localPassword,
      },
      headers: { apikey: anonKey, 'content-type': 'application/json' },
    },
  );
  expect(tokenResponse.ok()).toBe(true);
  const tokenPayload: unknown = await tokenResponse.json();
  if (
    !isRecord(tokenPayload) ||
    typeof tokenPayload['access_token'] !== 'string'
  ) {
    throw new Error('Local administrator session is unavailable.');
  }
  const adminHeaders = {
    apikey: anonKey,
    authorization: `Bearer ${tokenPayload['access_token']}`,
    'content-type': 'application/json',
  };
  const invitationResponse = await request.post(
    `${supabaseUrl}/rest/v1/rpc/list_account_invitations`,
    { data: {}, headers: adminHeaders },
  );
  expect(invitationResponse.ok()).toBe(true);
  const invitationsPayload: unknown = await invitationResponse.json();
  if (!Array.isArray(invitationsPayload)) {
    throw new Error('Local invitation list is invalid.');
  }
  const invitations: readonly unknown[] = invitationsPayload;
  const invitation: unknown = invitations.find(
    (candidate) =>
      isRecord(candidate) && candidate['normalized_email'] === email,
  );
  expect(isRecord(invitation)).toBe(true);
  if (!isRecord(invitation)) return;
  expect(invitation['status']).toBe('accepted');
  expect(typeof invitation['account_id']).toBe('string');

  const accountResponse = await request.post(
    `${supabaseUrl}/rest/v1/rpc/get_account_detail`,
    {
      data: { requested_account_id: invitation['account_id'] },
      headers: adminHeaders,
    },
  );
  expect(accountResponse.ok()).toBe(true);
  const accountsPayload: unknown = await accountResponse.json();
  if (!Array.isArray(accountsPayload) || accountsPayload.length !== 1) {
    throw new Error('Local account detail is invalid.');
  }
  const account: unknown = accountsPayload[0];
  expect(isRecord(account)).toBe(true);
  if (!isRecord(account)) return;
  expect(account['account_status']).toBe('active');
  expect(account['email']).toBe(email);
  expect(account['display_name']).toBe(expectedDisplayName);
  expect(account['roles']).toEqual(['volunteer']);
  expect(typeof account['user_id']).toBe('string');
  const accountAudit: readonly unknown[] = Array.isArray(account['audit'])
    ? account['audit']
    : [];
  expect(
    accountAudit.filter(
      (entry) => isRecord(entry) && entry['action'] === 'invitation.accepted',
    ),
  ).toHaveLength(1);

  const usersResponse = await request.get(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: serviceHeaders },
  );
  const usersPayload: unknown = await usersResponse.json();
  expect(usersResponse.ok()).toBe(true);
  if (!isRecord(usersPayload) || !Array.isArray(usersPayload['users'])) {
    throw new Error('Local Auth returned an invalid users payload.');
  }
  const users: readonly unknown[] = usersPayload['users'];
  const authUser: unknown = users.find(
    (candidate) => isRecord(candidate) && candidate['email'] === email,
  );
  expect(
    users.filter(
      (candidate) => isRecord(candidate) && candidate['email'] === email,
    ),
  ).toHaveLength(1);
  expect(isRecord(authUser)).toBe(true);
  if (isRecord(authUser)) {
    expect(authUser['id']).toBe(account['user_id']);
    expect(typeof authUser['email_confirmed_at']).toBe('string');
  }
}

function forceInvitationExpiry(email: string): void {
  if (!/^[a-z0-9@._-]+$/u.test(email)) {
    throw new Error('The local expiry fixture email is invalid.');
  }
  execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `update public.invitations set created_at = '1999-01-01T00:00:00Z', expires_at = '2000-01-01T00:00:00Z' where normalized_email = '${email}' and status in ('pending', 'sent', 'delivery_failed')`,
    ],
    { stdio: 'ignore' },
  );
}

async function rpcStatus(
  page: Page,
  functionName: string,
  args: Readonly<Record<string, unknown>>,
): Promise<number> {
  return page.evaluate(
    async ({ functionName: requestedFunction, functionUrl, key, payload }) => {
      let accessToken: string | null = null;
      for (const storageKey of Object.keys(localStorage)) {
        if (
          !storageKey.startsWith('sb-') ||
          !storageKey.endsWith('-auth-token')
        )
          continue;
        const rawSession = localStorage.getItem(storageKey);
        if (!rawSession) continue;
        const parsed: unknown = JSON.parse(rawSession);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'access_token' in parsed &&
          typeof parsed.access_token === 'string'
        ) {
          accessToken = parsed.access_token;
          break;
        }
      }
      if (!accessToken) return 401;
      const response = await fetch(
        `${functionUrl}/rest/v1/rpc/${requestedFunction}`,
        {
          body: JSON.stringify(payload),
          headers: {
            apikey: key,
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );
      return response.status;
    },
    { functionName, functionUrl: supabaseUrl, key: anonKey, payload: args },
  );
}

async function currentAccountId(page: Page): Promise<string> {
  return page.evaluate(
    async ({ functionUrl, key }) => {
      let accessToken: string | null = null;
      for (const storageKey of Object.keys(localStorage)) {
        if (
          !storageKey.startsWith('sb-') ||
          !storageKey.endsWith('-auth-token')
        )
          continue;
        const rawSession = localStorage.getItem(storageKey);
        if (!rawSession) continue;
        const parsed: unknown = JSON.parse(rawSession);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'access_token' in parsed &&
          typeof parsed.access_token === 'string'
        ) {
          accessToken = parsed.access_token;
          break;
        }
      }
      if (!accessToken) throw new Error('No local session.');
      const response = await fetch(
        `${functionUrl}/rest/v1/rpc/get_my_account_context`,
        {
          body: '{}',
          headers: {
            apikey: key,
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );
      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || payload.length !== 1) {
        throw new Error('Invalid local account context.');
      }
      const row: unknown = payload[0];
      if (
        typeof row !== 'object' ||
        row === null ||
        !('account_id' in row) ||
        typeof row.account_id !== 'string'
      ) {
        throw new Error('Invalid local account identifier.');
      }
      return row.account_id;
    },
    { functionUrl: supabaseUrl, key: anonKey },
  );
}

async function edgeCreateStatus(
  page: Page,
  email: string,
  roleCode: string,
): Promise<number> {
  return page.evaluate(
    async ({ edgeUrl, key, requestedEmail, requestedRole }) => {
      let accessToken: string | null = null;
      for (const storageKey of Object.keys(localStorage)) {
        if (
          !storageKey.startsWith('sb-') ||
          !storageKey.endsWith('-auth-token')
        )
          continue;
        const rawSession = localStorage.getItem(storageKey);
        if (!rawSession) continue;
        const parsed: unknown = JSON.parse(rawSession);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'access_token' in parsed &&
          typeof parsed.access_token === 'string'
        ) {
          accessToken = parsed.access_token;
          break;
        }
      }
      if (!accessToken) return 401;
      const response = await fetch(
        `${edgeUrl}/functions/v1/manage-account-invitation`,
        {
          body: JSON.stringify({
            displayName: null,
            email: requestedEmail,
            idempotencyKey: crypto.randomUUID(),
            operation: 'create',
            preferredLocale: 'es',
            requestedInitialRoleCode: requestedRole,
          }),
          headers: {
            apikey: key,
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );
      return response.status;
    },
    {
      edgeUrl: supabaseUrl,
      key: anonKey,
      requestedEmail: email,
      requestedRole: roleCode,
    },
  );
}

test.describe.serial('account lifecycle', () => {
  test('public signup is disabled', async ({ request }) => {
    const email = `public-signup-${String(Date.now())}@example.invalid`;
    const before = await readProtectedCounts(request);
    const response = await request.post(`${supabaseUrl}/auth/v1/signup`, {
      data: { email, password: localPassword },
      headers: { apikey: anonKey, 'content-type': 'application/json' },
    });

    expect(response.ok()).toBe(false);
    expect([400, 403, 422]).toContain(response.status());
    const body: unknown = await response.json();
    expect(isRecord(body) && 'access_token' in body).toBe(false);
    expect(await readProtectedCounts(request)).toEqual(before);
  });

  test('administrator completes invitation, activation, roles, concurrency, and lifecycle', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    const suffix = String(Date.now());
    const invitedEmail = `invited-lifecycle-${suffix}@example.invalid`;
    await signIn(adminPage, 'administrator@example.invalid');
    await adminPage.getByRole('link', { name: 'Invitaciones' }).click();

    const authorityRefetch = adminPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/rest/v1/rpc/get_my_account_context'),
    );
    await adminPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await authorityRefetch).ok()).toBe(true);
    await expect(adminPage).toHaveURL(/\/app\/admin\/invitations$/);
    await expect(adminPage.getByText('Acceso no disponible')).toHaveCount(0);

    const invitationFunction = '**/functions/v1/manage-account-invitation';
    await adminPage.route(invitationFunction, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 'origin_denied',
          message: 'Origen no autorizado.',
        }),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': 'http://localhost:5173' },
        status: 403,
      });
    });
    await adminPage
      .getByLabel(/Correo electr/i)
      .fill(`origin-denied-${suffix}@example.invalid`);
    await adminPage.getByRole('button', { name: /Crear invitaci/ }).click();
    await expect(
      adminPage.getByText(/El origen local de la aplicaci/),
    ).toBeVisible();
    await expect(adminPage).toHaveURL(/\/app\/admin\/invitations$/);
    await expect(adminPage.getByText('Acceso no disponible')).toHaveCount(0);
    await adminPage.unrouteAll({ behavior: 'wait' });

    await adminPage.getByLabel('Correo electrónico').fill(invitedEmail);
    await adminPage.getByLabel('Nombre visible').fill('Invitado E2E');
    await adminPage.getByLabel('Rol inicial').selectOption('volunteer');
    const allowedInvitationResponse = adminPage.waitForResponse((response) =>
      response.url().includes('/manage-account-invitation'),
    );
    await adminPage.getByRole('button', { name: 'Crear invitación' }).click();
    expect((await allowedInvitationResponse).status()).toBe(200);
    await expect(adminPage.getByText('Invitación creada.')).toBeVisible();

    await expect
      .poll(() => findMailpitMessageIds(request, invitedEmail))
      .toHaveLength(1);
    const messageId = await findMailpitMessageId(request, invitedEmail);
    if (!messageId)
      throw new Error('Mailpit message disappeared during the test.');
    const invitationLink = await readInvitationLink(request, messageId);

    const invitedContext = await browser.newContext();
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(invitationLink);
    await expect(invitedPage).toHaveURL(/\/invite\/accept$/);
    await invitedPage
      .getByRole('button', { name: 'Aceptar invitación' })
      .click();
    await expect(invitedPage).toHaveURL(/\/app\/complete-profile$/);
    await invitedPage.getByLabel('Nombre visible').fill('Persona Activada E2E');
    await invitedPage.getByLabel('Contraseña').fill(localPassword);
    await invitedPage.getByLabel('Idioma preferido').selectOption('es');
    await invitedPage.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(invitedPage).toHaveURL(/\/app\/profile$/);
    await invitedPage.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(invitedPage).toHaveURL(/\/login$/);
    await signIn(invitedPage, invitedEmail);
    await expect(invitedPage).toHaveURL(/\/app\/profile$/);
    await expectInvitationLinkRejected(browser, invitationLink);
    await expect
      .poll(() => findMailpitMessageIds(request, invitedEmail))
      .toHaveLength(1);
    await assertCanonicalInvitationState(request, invitedEmail);

    await adminPage.getByRole('link', { name: 'Cuentas' }).click();
    await adminPage
      .getByLabel('Buscar por nombre o correo autorizado')
      .fill(invitedEmail);
    await adminPage.getByRole('button', { name: 'Buscar' }).click();
    await adminPage
      .getByRole('article')
      .filter({ hasText: invitedEmail })
      .getByRole('link', { name: 'Ver detalle' })
      .click();
    const invitedAccountId = adminPage.url().split('/').at(-1);
    if (!invitedAccountId)
      throw new Error('Invited account route has no identifier.');
    await confirmButton(adminPage, 'Agregar Administración');
    await expect(adminPage.getByText('Cuenta actualizada.')).toBeVisible();

    await invitedPage.reload();
    const originalAdminAccountId = await currentAccountId(adminPage);
    const [originalResult, invitedResult] = await Promise.all([
      rpcStatus(adminPage, 'change_account_status', {
        requested_account_id: invitedAccountId,
        requested_reason: 'Prueba concurrente original',
        requested_status: 'suspended',
      }),
      rpcStatus(invitedPage, 'change_account_status', {
        requested_account_id: originalAdminAccountId,
        requested_reason: 'Prueba concurrente invitado',
        requested_status: 'suspended',
      }),
    ]);
    expect(
      [originalResult, invitedResult].filter((status) => status === 200),
    ).toHaveLength(1);
    expect([400, 403, 409]).toContain(
      [originalResult, invitedResult].find((status) => status !== 200),
    );
    if (originalResult === 200) {
      expect(
        await rpcStatus(adminPage, 'change_account_status', {
          requested_account_id: invitedAccountId,
          requested_reason: 'Restauración tras concurrencia',
          requested_status: 'active',
        }),
      ).toBe(200);
    } else {
      expect(
        await rpcStatus(invitedPage, 'change_account_status', {
          requested_account_id: originalAdminAccountId,
          requested_reason: 'Restauración tras concurrencia',
          requested_status: 'active',
        }),
      ).toBe(200);
    }

    const [originalRevoke, invitedRevoke] = await Promise.all([
      rpcStatus(adminPage, 'manage_account_role', {
        requested_account_id: invitedAccountId,
        requested_operation: 'revoke',
        requested_role_code: 'administrator',
      }),
      rpcStatus(invitedPage, 'manage_account_role', {
        requested_account_id: originalAdminAccountId,
        requested_operation: 'revoke',
        requested_role_code: 'administrator',
      }),
    ]);
    expect(
      [originalRevoke, invitedRevoke].filter((status) => status === 200),
    ).toHaveLength(1);
    expect([400, 403, 409]).toContain(
      [originalRevoke, invitedRevoke].find((status) => status !== 200),
    );
    if (originalRevoke === 200) {
      expect(
        await rpcStatus(adminPage, 'manage_account_role', {
          requested_account_id: invitedAccountId,
          requested_operation: 'grant',
          requested_role_code: 'administrator',
        }),
      ).toBe(200);
    } else {
      expect(
        await rpcStatus(invitedPage, 'manage_account_role', {
          requested_account_id: originalAdminAccountId,
          requested_operation: 'grant',
          requested_role_code: 'administrator',
        }),
      ).toBe(200);
    }

    const [revokeDuringArchive, archiveDuringRevoke] = await Promise.all([
      rpcStatus(adminPage, 'manage_account_role', {
        requested_account_id: invitedAccountId,
        requested_operation: 'revoke',
        requested_role_code: 'administrator',
      }),
      rpcStatus(invitedPage, 'change_account_status', {
        requested_account_id: originalAdminAccountId,
        requested_reason: 'Carrera revoke archive',
        requested_status: 'archived',
      }),
    ]);
    expect(
      [revokeDuringArchive, archiveDuringRevoke].filter(
        (status) => status === 200,
      ),
    ).toHaveLength(1);
    expect([400, 403, 409]).toContain(
      [revokeDuringArchive, archiveDuringRevoke].find(
        (status) => status !== 200,
      ),
    );
    if (revokeDuringArchive === 200) {
      expect(
        await rpcStatus(adminPage, 'manage_account_role', {
          requested_account_id: invitedAccountId,
          requested_operation: 'grant',
          requested_role_code: 'administrator',
        }),
      ).toBe(200);
    } else {
      expect(
        await rpcStatus(invitedPage, 'change_account_status', {
          requested_account_id: originalAdminAccountId,
          requested_reason: 'Restauración tras revoke archive',
          requested_status: 'active',
        }),
      ).toBe(200);
    }

    await adminPage.reload();
    await confirmButton(adminPage, 'Suspender');
    await invitedPage.goto('/app/profile');
    await expect(invitedPage).toHaveURL(/\/account-blocked$/);
    await confirmButton(adminPage, 'Reactivar');
    await invitedPage.goto('/app/profile');
    await expect(invitedPage).toHaveURL(/\/app\/profile$/);
    await confirmButton(adminPage, 'Archivar');
    await invitedPage.goto('/app/profile');
    await expect(invitedPage).toHaveURL(/\/account-blocked$/);
    await expect(adminPage.getByText('account.archived')).toBeVisible();

    await invitedContext.close();
  });

  test('replaced, revoked, expired, replay, and actor mismatch fail closed with real links', async ({
    browser,
    page,
    request,
  }) => {
    const suffix = String(Date.now());
    await signIn(page, 'administrator@example.invalid');
    await page.getByRole('link', { name: 'Invitaciones' }).click();

    const replacedEmail = `replaced-${suffix}@example.invalid`;
    const firstDelivery = await createInvitationFromUi(
      page,
      request,
      replacedEmail,
    );
    await invitationAction(page, replacedEmail, 'Sustituir');
    await expect
      .poll(() => findMailpitMessageIds(request, replacedEmail))
      .toHaveLength(2);
    const replacedIds = await findMailpitMessageIds(request, replacedEmail);
    const successorId = replacedIds.find(
      (messageId) => messageId !== firstDelivery.messageId,
    );
    if (!successorId) throw new Error('Replacement email is missing.');
    const successorLink = await readInvitationLink(request, successorId);
    await expectInvitationLinkRejected(browser, firstDelivery.link);
    const successorContext = await browser.newContext();
    const successorPage = await successorContext.newPage();
    await successorPage.goto(successorLink);
    await expect(successorPage).toHaveURL(/\/invite\/accept$/u);
    await successorPage
      .getByRole('button', { name: 'Aceptar invitación' })
      .click();
    await expect(successorPage).toHaveURL(/\/app\/complete-profile$/u);
    await successorPage
      .getByLabel('Nombre visible')
      .fill('Persona Sustituida E2E');
    await successorPage.getByLabel('Contraseña').fill(localPassword);
    await successorPage.getByLabel('Idioma preferido').selectOption('es');
    await successorPage.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(successorPage).toHaveURL(/\/app\/profile$/u);
    await successorPage.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(successorPage, replacedEmail);
    await expect(successorPage).toHaveURL(/\/app\/profile$/u);
    await assertCanonicalInvitationState(
      request,
      replacedEmail,
      'Persona Sustituida E2E',
    );
    await successorContext.close();

    const revokedEmail = `revoked-${suffix}@example.invalid`;
    const revokedDelivery = await createInvitationFromUi(
      page,
      request,
      revokedEmail,
    );
    await invitationAction(page, revokedEmail, 'Revocar');
    await expectInvitationLinkRejected(browser, revokedDelivery.link);
    await expect
      .poll(() => findMailpitMessageIds(request, revokedEmail))
      .toHaveLength(1);

    await page.getByRole('link', { name: 'Cuentas' }).click();
    await page
      .getByLabel('Buscar por nombre o correo autorizado')
      .fill(revokedEmail);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page
      .getByRole('article')
      .filter({ hasText: revokedEmail })
      .getByRole('link', { name: 'Ver detalle' })
      .click();
    const recoveryResponse = page.waitForResponse((response) =>
      response.url().includes('/manage-account-invitation'),
    );
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Recuperar invitación' }).click();
    expect((await recoveryResponse).status()).toBe(200);
    await expect(
      page.getByText('Se envió una recuperación verificada.'),
    ).toBeVisible();
    await expect
      .poll(() => findMailpitMessageIds(request, revokedEmail))
      .toHaveLength(2);
    const recoveryMessageIds = await findMailpitMessageIds(
      request,
      revokedEmail,
    );
    const recoveryMessageId = recoveryMessageIds.find(
      (messageId) => messageId !== revokedDelivery.messageId,
    );
    if (!recoveryMessageId) throw new Error('Recovery email is missing.');
    const recoveryLink = await readInvitationLink(request, recoveryMessageId);
    const recoveryContext = await browser.newContext();
    const recoveryPage = await recoveryContext.newPage();
    await recoveryPage.goto(recoveryLink);
    await expect(recoveryPage).toHaveURL(/\/invite\/accept$/u);
    await recoveryPage
      .getByRole('button', { name: 'Aceptar invitación' })
      .click();
    await expect(recoveryPage).toHaveURL(/\/app\/complete-profile$/u);
    await recoveryPage
      .getByLabel('Nombre visible')
      .fill('Persona Recuperada E2E');
    await recoveryPage.getByLabel('Contraseña').fill(localPassword);
    await recoveryPage.getByLabel('Idioma preferido').selectOption('es');
    await recoveryPage.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(recoveryPage).toHaveURL(/\/app\/profile$/u);
    await recoveryPage.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(recoveryPage, revokedEmail);
    await expect(recoveryPage).toHaveURL(/\/app\/profile$/u);
    await assertCanonicalInvitationState(
      request,
      revokedEmail,
      'Persona Recuperada E2E',
    );
    await recoveryContext.close();

    await page.getByRole('link', { name: 'Invitaciones' }).click();

    const expiredEmail = `expired-${suffix}@example.invalid`;
    const expiredDelivery = await createInvitationFromUi(
      page,
      request,
      expiredEmail,
    );
    forceInvitationExpiry(expiredEmail);
    await page.reload();
    await expect(
      page
        .getByRole('article')
        .filter({ hasText: expiredEmail })
        .getByText('Vencida'),
    ).toBeVisible();
    await expectInvitationLinkRejected(browser, expiredDelivery.link);
    await expect
      .poll(() => findMailpitMessageIds(request, expiredEmail))
      .toHaveLength(1);

    const mismatchEmail = `actor-mismatch-${suffix}@example.invalid`;
    const mismatchDelivery = await createInvitationFromUi(
      page,
      request,
      mismatchEmail,
    );
    const redirectTo = new URL(mismatchDelivery.link).searchParams.get(
      'redirect_to',
    );
    if (!redirectTo) throw new Error('Invitation callback URL is missing.');
    await page.goto(redirectTo);
    await expect(page).toHaveURL(/\/login$/u);
    await expect(
      page.getByText(
        'Esta invitación corresponde a otra cuenta. Inicia sesión con el correo invitado.',
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        for (const storageKey of Object.keys(localStorage)) {
          if (localStorage.getItem(storageKey)?.includes('access_token')) {
            return true;
          }
        }
        return false;
      }),
    ).toBe(false);
    await expect
      .poll(() => findMailpitMessageIds(request, mismatchEmail))
      .toHaveLength(1);
  });

  test('coordinator can invite volunteer but cannot escalate a manipulated request', async ({
    page,
    request,
  }) => {
    const suffix = String(Date.now());
    const allowedEmail = `coordinator-volunteer-${suffix}@example.invalid`;
    const blockedEmail = `coordinator-admin-${suffix}@example.invalid`;
    await signIn(page, 'coordinator@example.invalid');
    await page.getByRole('link', { name: 'Invitaciones' }).click();
    await expect(page.getByLabel('Rol inicial').locator('option')).toHaveCount(
      1,
    );
    await expect(page.getByLabel('Rol inicial')).toHaveValue('volunteer');
    await page.getByLabel('Correo electrónico').fill(allowedEmail);
    await page.getByRole('button', { name: 'Crear invitación' }).click();
    await expect(page.getByText('Invitación creada.')).toBeVisible();
    await expect
      .poll(() => findMailpitMessageId(request, allowedEmail))
      .not.toBeNull();

    expect(await edgeCreateStatus(page, blockedEmail, 'administrator')).toBe(
      403,
    );
    expect(await findMailpitMessageId(request, blockedEmail)).toBeNull();
  });
});
