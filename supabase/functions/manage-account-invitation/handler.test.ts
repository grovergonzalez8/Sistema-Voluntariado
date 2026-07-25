import { describe, expect, it, vi } from 'vitest';

import {
  createInvitationHandler,
  InvitationHttpError,
  parseInvitationCommand,
  type InvitationHandlerDependencies,
} from './handler';

const origin = 'http://127.0.0.1:5173';
const authorization = 'Bearer test-jwt-not-a-secret';
const firstId = '30000000-0000-4000-8000-000000000001';
const secondId = '30000000-0000-4000-8000-000000000002';

function reservation(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    accountId: secondId,
    correlationId: '30000000-0000-4000-8000-000000000003',
    deliveryAttemptId: '30000000-0000-4000-8000-000000000004',
    displayName: 'Persona invitada',
    invitationId: firstId,
    normalizedEmail: 'invited@example.invalid',
    preferredLocale: 'es' as const,
    requestedInitialRoleCode: 'volunteer',
    shouldDeliver: true,
    status: 'pending',
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<InvitationHandlerDependencies> = {},
): InvitationHandlerDependencies {
  return {
    allowedOrigins: new Set([origin]),
    authenticate: vi.fn(() => Promise.resolve({ id: 'actor-id' })),
    finalizeDelivery: vi.fn(() =>
      Promise.resolve({
        accountId: secondId,
        invitationId: firstId,
        status: 'sent',
      }),
    ),
    findReconciledAuthUser: vi.fn(() => Promise.resolve(null)),
    getAccountContext: vi.fn(() =>
      Promise.resolve({
        accountStatus: 'active',
        permissions: [
          'invitation.create',
          'invitation.resend',
          'invitation.revoke',
        ],
      }),
    ),
    inviteAuthUser: vi.fn(() => Promise.resolve({ id: 'auth-user-id' })),
    prepareAction: vi.fn(() => Promise.resolve(reservation())),
    prepareCreate: vi.fn(() => Promise.resolve(reservation())),
    recordSafeEvent: vi.fn(),
    ...overrides,
  };
}

function createBody() {
  return {
    displayName: 'Persona invitada',
    email: 'invited@example.invalid',
    idempotencyKey: firstId,
    operation: 'create',
    preferredLocale: 'es',
    requestedInitialRoleCode: 'volunteer',
  };
}

function request(
  body: unknown = createBody(),
  overrides: {
    readonly headers?: Readonly<Record<string, string>>;
    readonly method?: string;
  } = {},
): Request {
  return new Request(
    'http://127.0.0.1:54321/functions/v1/manage-account-invitation',
    {
      ...(overrides.method === 'GET' ? {} : { body: JSON.stringify(body) }),
      headers: {
        authorization,
        'content-type': 'application/json',
        origin,
        ...overrides.headers,
      },
      method: overrides.method ?? 'POST',
    },
  );
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('manage-account-invitation handler', () => {
  it('rejects an origin outside the configured allowlist', async () => {
    const handler = createInvitationHandler(dependencies());
    const response = await handler(
      request(createBody(), {
        headers: { origin: 'https://untrusted.invalid' },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a valid CORS preflight without authenticating', async () => {
    const deps = dependencies();
    const handler = createInvitationHandler(deps);
    const response = await handler(request(undefined, { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods', async () => {
    const response = await createInvitationHandler(dependencies())(
      request(undefined, { method: 'GET' }),
    );
    expect(response.status).toBe(405);
    expect(await responseBody(response)).toMatchObject({
      code: 'method_not_allowed',
    });
  });

  it('requires application/json', async () => {
    const response = await createInvitationHandler(dependencies())(
      request(createBody(), { headers: { 'content-type': 'text/plain' } }),
    );
    expect(response.status).toBe(415);
  });

  it('requires a bearer token', async () => {
    const response = await createInvitationHandler(dependencies())(
      request(createBody(), { headers: { authorization: '' } }),
    );
    expect(response.status).toBe(401);
  });

  it('returns a safe authentication failure', async () => {
    const response = await createInvitationHandler(
      dependencies({
        authenticate: vi.fn(() =>
          Promise.reject(
            new InvitationHttpError(
              401,
              'unauthenticated',
              'Debes iniciar sesión.',
            ),
          ),
        ),
      }),
    )(request());
    expect(response.status).toBe(401);
    expect(JSON.stringify(await responseBody(response))).not.toContain(
      'test-jwt',
    );
  });

  it('validates malformed JSON before authenticating', async () => {
    const deps = dependencies();
    const response = await createInvitationHandler(deps)(
      new Request(
        'http://127.0.0.1:54321/functions/v1/manage-account-invitation',
        {
          body: '{',
          headers: {
            authorization,
            'content-type': 'application/json',
            origin,
          },
          method: 'POST',
        },
      ),
    );
    expect(response.status).toBe(400);
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('rejects unknown body fields', () => {
    expect(() =>
      parseInvitationCommand({ ...createBody(), role: 'administrator' }),
    ).toThrow('campos no permitidos');
  });

  it('rejects malformed UUIDs and locales', () => {
    expect(() =>
      parseInvitationCommand({
        ...createBody(),
        idempotencyKey: 'not-a-uuid',
        preferredLocale: 'fr',
      }),
    ).toThrow(InvitationHttpError);
  });

  it('blocks a suspended account before reservation', async () => {
    const deps = dependencies({
      getAccountContext: vi.fn(() =>
        Promise.resolve({
          accountStatus: 'suspended',
          permissions: ['invitation.create'],
        }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({
      code: 'account_blocked',
    });
    expect(deps.prepareCreate).not.toHaveBeenCalled();
  });

  it('blocks an archived account before reservation', async () => {
    const deps = dependencies({
      getAccountContext: vi.fn(() =>
        Promise.resolve({
          accountStatus: 'archived',
          permissions: ['invitation.create'],
        }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(403);
    expect(deps.prepareCreate).not.toHaveBeenCalled();
  });

  it('blocks missing operation permission', async () => {
    const deps = dependencies({
      getAccountContext: vi.fn(() =>
        Promise.resolve({
          accountStatus: 'active',
          permissions: [],
        }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({
      code: 'permission_denied',
    });
  });

  it('creates, delivers, and finalizes a safe invitation response', async () => {
    const deps = dependencies();
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      accountId: secondId,
      invitationId: firstId,
      status: 'sent',
    });
    expect(deps.inviteAuthUser).toHaveBeenCalledOnce();
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: true }),
    );
  });

  it('returns an idempotent reservation without a second provider call', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.resolve(
          reservation({
            deliveryAttemptId: null,
            shouldDeliver: false,
            status: 'sent',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(await responseBody(response)).toMatchObject({ status: 'sent' });
  });

  it('reconciles an exact Auth identity after an acknowledgement loss', async () => {
    const deps = dependencies({
      findReconciledAuthUser: vi.fn(() =>
        Promise.resolve({ id: 'reconciled-auth-user-id' }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: 'reconciled-auth-user-id',
        succeeded: true,
      }),
    );
  });

  it('resend deliberately calls Auth instead of consuming reconciliation', async () => {
    const deps = dependencies({
      findReconciledAuthUser: vi.fn(() =>
        Promise.resolve({ id: 'existing-auth-user-id' }),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        idempotencyKey: secondId,
        invitationId: firstId,
        operation: 'resend',
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.findReconciledAuthUser).not.toHaveBeenCalled();
    expect(deps.inviteAuthUser).toHaveBeenCalledOnce();
  });

  it('revokes without invoking Auth Admin', async () => {
    const deps = dependencies({
      prepareAction: vi.fn(() =>
        Promise.resolve(
          reservation({
            deliveryAttemptId: null,
            shouldDeliver: false,
            status: 'revoked',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        invitationId: firstId,
        operation: 'revoke',
        reason: 'Solicitud local',
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
  });

  it('requires invitation.resend for replace and resend', async () => {
    const deps = dependencies({
      getAccountContext: vi.fn(() =>
        Promise.resolve({
          accountStatus: 'active',
          permissions: ['invitation.create'],
        }),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        idempotencyKey: secondId,
        invitationId: firstId,
        operation: 'replace',
      }),
    );
    expect(response.status).toBe(403);
    expect(deps.prepareAction).not.toHaveBeenCalled();
  });

  it('records delivery_failed after a provider error', async () => {
    const providerError = Object.assign(new Error('provider internal secret'), {
      code: 'email_rate_limit',
    });
    const deps = dependencies({
      inviteAuthUser: vi.fn(() => Promise.reject(providerError)),
    });
    const response = await createInvitationHandler(deps)(request());
    const body = await responseBody(response);
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: 'invitation_delivery_failed' });
    expect(JSON.stringify(body)).not.toContain('provider internal secret');
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        providerErrorCode: 'email_rate_limit',
        succeeded: false,
      }),
    );
  });

  it('never returns a stack trace for an unexpected failure', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.reject(new Error('internal stack and service key')),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    const serialized = JSON.stringify(await responseBody(response));
    expect(response.status).toBe(500);
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('service key');
  });

  it('records only safe identifiers after success', async () => {
    const deps = dependencies();
    await createInvitationHandler(deps)(request());
    expect(deps.recordSafeEvent).toHaveBeenCalledWith(
      'invitation.delivery_completed',
      { invitationId: firstId, operation: 'create' },
    );
    expect(
      JSON.stringify(vi.mocked(deps.recordSafeEvent).mock.calls),
    ).not.toContain('invited@example.invalid');
  });
});
