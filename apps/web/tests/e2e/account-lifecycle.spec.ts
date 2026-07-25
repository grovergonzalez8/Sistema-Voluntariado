import {
  expect,
  test,
  type APIRequestContext,
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

async function findMailpitMessageId(
  request: APIRequestContext,
  recipient: string,
): Promise<string | null> {
  const response = await request.get(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok()) return null;
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload['messages'])) return null;
  const messages: readonly unknown[] = payload['messages'];
  for (const message of messages) {
    if (!isRecord(message) || typeof message['ID'] !== 'string') continue;
    const recipients = message['To'];
    if (!Array.isArray(recipients)) continue;
    const recipientRows: readonly unknown[] = recipients;
    if (
      recipientRows.some((row) => isRecord(row) && row['Address'] === recipient)
    ) {
      return message['ID'];
    }
  }
  return null;
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
    await adminPage.getByLabel('Correo electrónico').fill(invitedEmail);
    await adminPage.getByLabel('Nombre visible').fill('Invitado E2E');
    await adminPage.getByLabel('Rol inicial').selectOption('volunteer');
    await adminPage.getByRole('button', { name: 'Crear invitación' }).click();
    await expect(adminPage.getByText('Invitación creada.')).toBeVisible();

    await expect
      .poll(() => findMailpitMessageId(request, invitedEmail))
      .not.toBeNull();
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
