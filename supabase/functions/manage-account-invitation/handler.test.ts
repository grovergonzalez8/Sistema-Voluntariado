import { describe, expect, it, vi } from 'vitest';

import {
  createInvitationHandler,
  InvitationHttpError,
  parseInvitationCommand,
  type InvitationHandlerDependencies,
} from './handler';

const origin = 'http://localhost:5173';
const authorization = 'Bearer test-jwt-not-a-secret';
const firstId = '30000000-0000-4000-8000-000000000001';
const secondId = '30000000-0000-4000-8000-000000000002';

function reservation(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    acknowledgedAuthUserId: null,
    accountId: secondId,
    correlationId: '30000000-0000-4000-8000-000000000003',
    deliveryAttemptId: '30000000-0000-4000-8000-000000000004',
    displayName: 'Persona invitada',
    invitationId: firstId,
    normalizedEmail: 'invited@example.invalid',
    preferredLocale: 'es' as const,
    requestedInitialRoleCode: 'volunteer',
    shouldDeliver: true,
    operationOutcome: 'execute' as const,
    sourceInvitationId: firstId,
    status: 'pending',
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<InvitationHandlerDependencies> = {},
): InvitationHandlerDependencies {
  return {
    acknowledgeDelivery: vi.fn(() => Promise.resolve()),
    allowedOrigins: new Set([origin]),
    authenticate: vi.fn(() => Promise.resolve({ id: 'actor-id' })),
    createAcceptanceChallenge: vi.fn(() =>
      Promise.resolve({
        hash: 'a'.repeat(64),
        raw: 'a'.repeat(43),
      }),
    ),
    finalizeDelivery: vi.fn(() =>
      Promise.resolve({
        accountId: secondId,
        invitationId: firstId,
        status: 'sent',
      }),
    ),
    reconcileAuthDelivery: vi.fn(() =>
      Promise.resolve({ kind: 'not_applied' as const }),
    ),
    getAccountContext: vi.fn(() =>
      Promise.resolve({
        accountStatus: 'active',
        permissions: [
          'invitation.create',
          'invitation.resend',
          'invitation.revoke',
          'invitation.recover',
        ],
      }),
    ),
    inviteAuthUser: vi.fn(() => Promise.resolve({ id: 'auth-user-id' })),
    sendRecoveryEmail: vi.fn(() => Promise.resolve()),
    prepareAction: vi.fn(() => Promise.resolve(reservation())),
    prepareCreate: vi.fn(() => Promise.resolve(reservation())),
    prepareRecovery: vi.fn(() => Promise.resolve(reservation())),
    recordSafeEvent: vi.fn(),
    stageAcceptanceChallenge: vi.fn(() => Promise.resolve({ generation: 1 })),
    updateAuthUserInvitation: vi.fn(() => Promise.resolve()),
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
  it('parses recovery without accepting an invitation identifier as an account', () => {
    expect(
      parseInvitationCommand({
        accountId: secondId,
        idempotencyKey: firstId,
        operation: 'recover',
        reason: 'Reconciliación Auth y cuenta',
      }),
    ).toEqual({
      accountId: secondId,
      idempotencyKey: firstId,
      operation: 'recover',
      reason: 'Reconciliación Auth y cuenta',
    });
  });

  it('uses the real recovery email path and never Auth invite for recovery', async () => {
    const recoveryReservation = reservation({
      acknowledgedAuthUserId: 'auth-user-id',
      operationOutcome: 'execute',
    });
    const deps = dependencies({
      prepareRecovery: vi.fn(() => Promise.resolve(recoveryReservation)),
    });
    const response = await createInvitationHandler(deps)(
      request({
        accountId: secondId,
        idempotencyKey: firstId,
        operation: 'recover',
        reason: 'Reconciliación Auth y cuenta',
      }),
    );

    expect(response.status).toBe(200);
    expect(deps.prepareRecovery).toHaveBeenCalledOnce();
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.sendRecoveryEmail).toHaveBeenCalledOnce();
  });

  it('does not rotate the challenge or resend email for an in-progress recovery replay', async () => {
    const deps = dependencies({
      prepareRecovery: vi.fn(() =>
        Promise.resolve(
          reservation({
            acknowledgedAuthUserId: 'auth-user-id',
            operationOutcome: 'in_progress',
            shouldDeliver: false,
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        accountId: secondId,
        idempotencyKey: firstId,
        operation: 'recover',
        reason: 'Reconciliación Auth y cuenta',
      }),
    );

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      outcome: 'in_progress',
    });
    expect(deps.stageAcceptanceChallenge).not.toHaveBeenCalled();
    expect(deps.sendRecoveryEmail).not.toHaveBeenCalled();
  });

  it('rejects an origin outside the configured allowlist', async () => {
    const handler = createInvitationHandler(dependencies());
    const response = await handler(
      request(createBody(), {
        headers: { origin: 'https://untrusted.invalid' },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await responseBody(response)).toMatchObject({
      code: 'origin_denied',
    });
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
      outcome: 'completed',
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
            operationOutcome: 'replayed',
            status: 'sent',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(await responseBody(response)).toMatchObject({
      outcome: 'replayed',
      status: 'sent',
    });
  });

  it('reports an active lease as in_progress without a provider call', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.resolve(
          reservation({
            deliveryAttemptId: null,
            operationOutcome: 'in_progress',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      outcome: 'in_progress',
    });
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).not.toHaveBeenCalled();
  });

  it('returns a durable failed outcome without another provider call', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.resolve(
          reservation({
            deliveryAttemptId: null,
            operationOutcome: 'failed',
            status: 'delivery_failed',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      outcome: 'failed',
      status: 'delivery_failed',
    });
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).not.toHaveBeenCalled();
  });

  it('reconciles an exact Auth identity after an acknowledgement loss', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.resolve(reservation({ shouldDeliver: false })),
      ),
      reconcileAuthDelivery: vi.fn(() =>
        Promise.resolve({
          authUserId: 'reconciled-auth-user-id',
          kind: 'applied' as const,
        }),
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
    expect(deps.stageAcceptanceChallenge).not.toHaveBeenCalled();
  });

  it('fails closed when reconciliation itself is unavailable', async () => {
    const deps = dependencies({
      prepareCreate: vi.fn(() =>
        Promise.resolve(reservation({ shouldDeliver: false })),
      ),
      reconcileAuthDelivery: vi.fn(() =>
        Promise.reject(new Error('Auth Admin unavailable')),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toMatchObject({
      code: 'invitation_reconciliation_required',
    });
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        providerErrorCode: 'auth_provider_outcome_unknown',
        succeeded: false,
      }),
    );
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
  });

  it('reconciles Auth before retrying a failed ACK persistence', async () => {
    const acknowledgeDelivery = vi
      .fn<InvitationHandlerDependencies['acknowledgeDelivery']>()
      .mockRejectedValueOnce(new Error('ack unavailable'))
      .mockResolvedValueOnce();
    const reconcileAuthDelivery = vi.fn(() =>
      Promise.resolve({
        authUserId: 'auth-user-id',
        kind: 'applied' as const,
      }),
    );
    const deps = dependencies({
      acknowledgeDelivery,
      reconcileAuthDelivery,
    });

    const response = await createInvitationHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(acknowledgeDelivery).toHaveBeenCalledTimes(2);
    expect(reconcileAuthDelivery).toHaveBeenCalledOnce();
    expect(acknowledgeDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      reconcileAuthDelivery.mock.invocationCallOrder[0] ?? 0,
    );
    expect(reconcileAuthDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      acknowledgeDelivery.mock.invocationCallOrder[1] ?? 0,
    );
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: 'auth-user-id', succeeded: true }),
    );
  });

  it('a new resend rotates its challenge and calls Auth', async () => {
    const deps = dependencies({
      reconcileAuthDelivery: vi.fn(() =>
        Promise.resolve({ kind: 'ambiguous' as const }),
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
    expect(deps.reconcileAuthDelivery).not.toHaveBeenCalled();
    expect(deps.stageAcceptanceChallenge).toHaveBeenCalledOnce();
    expect(deps.inviteAuthUser).toHaveBeenCalledOnce();
  });

  it('rotates replace metadata before acknowledging and finalizing B', async () => {
    const updateAuthUserInvitation = vi.fn(() => Promise.resolve());
    const acknowledgeDelivery = vi.fn(() => Promise.resolve());
    const finalizeDelivery = vi.fn(() =>
      Promise.resolve({
        accountId: secondId,
        invitationId: secondId,
        status: 'sent',
      }),
    );
    const deps = dependencies({
      acknowledgeDelivery,
      finalizeDelivery,
      prepareAction: vi.fn(() =>
        Promise.resolve(
          reservation({
            invitationId: secondId,
            sourceInvitationId: firstId,
          }),
        ),
      ),
      updateAuthUserInvitation,
    });
    const response = await createInvitationHandler(deps)(
      request({
        idempotencyKey: secondId,
        invitationId: firstId,
        operation: 'replace',
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).toHaveBeenCalledOnce();
    expect(deps.updateAuthUserInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: secondId }),
    );
    expect(deps.acknowledgeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: secondId }),
    );
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: secondId, succeeded: true }),
    );
    expect(updateAuthUserInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      acknowledgeDelivery.mock.invocationCallOrder[0] ?? 0,
    );
    expect(acknowledgeDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      finalizeDelivery.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('resumes an acknowledged replace without sending another email', async () => {
    const deps = dependencies({
      prepareAction: vi.fn(() =>
        Promise.resolve(
          reservation({ acknowledgedAuthUserId: 'acknowledged-user-id' }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        idempotencyKey: secondId,
        invitationId: firstId,
        operation: 'replace',
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.inviteAuthUser).not.toHaveBeenCalled();
    expect(deps.createAcceptanceChallenge).not.toHaveBeenCalled();
    expect(deps.updateAuthUserInvitation).not.toHaveBeenCalled();
    expect(deps.acknowledgeDelivery).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: 'acknowledged-user-id' }),
    );
  });

  it('returns recoverable reconciliation_required after delivery and finalize failure', async () => {
    const deps = dependencies({
      finalizeDelivery: vi.fn(() =>
        Promise.reject(new Error('database unavailable')),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toMatchObject({
      code: 'invitation_reconciliation_required',
    });
    expect(deps.acknowledgeDelivery).toHaveBeenCalledOnce();
    expect(deps.recordSafeEvent).not.toHaveBeenCalledWith(
      'invitation.delivery_completed',
      expect.anything(),
    );
  });

  it('revokes without invoking Auth Admin', async () => {
    const deps = dependencies({
      prepareAction: vi.fn(() =>
        Promise.resolve(
          reservation({
            deliveryAttemptId: null,
            operationOutcome: 'completed',
            status: 'revoked',
          }),
        ),
      ),
    });
    const response = await createInvitationHandler(deps)(
      request({
        idempotencyKey: secondId,
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
      status: 429,
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
        providerErrorCode: 'auth_provider_rejected',
        succeeded: false,
      }),
    );
  });

  it('closes an ambiguous provider outcome without exposing or retrying it', async () => {
    const deps = dependencies({
      inviteAuthUser: vi.fn(() =>
        Promise.reject(new Error('transport outcome unknown')),
      ),
      reconcileAuthDelivery: vi.fn(() =>
        Promise.resolve({ kind: 'ambiguous' as const }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toMatchObject({
      code: 'invitation_reconciliation_required',
    });
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        providerErrorCode: 'auth_provider_outcome_unknown',
        succeeded: false,
      }),
    );
    expect(
      vi.mocked(deps.reconcileAuthDelivery).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deps.finalizeDelivery).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not misreport a post-delivery metadata failure as provider failure', async () => {
    const deps = dependencies({
      updateAuthUserInvitation: vi.fn(() =>
        Promise.reject(new Error('metadata acknowledgement unavailable')),
      ),
      reconcileAuthDelivery: vi.fn(() =>
        Promise.resolve({ kind: 'ambiguous' as const }),
      ),
    });
    const response = await createInvitationHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toMatchObject({
      code: 'invitation_reconciliation_required',
    });
    expect(deps.finalizeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        providerErrorCode: 'auth_provider_outcome_unknown',
        succeeded: false,
      }),
    );
    expect(deps.recordSafeEvent).not.toHaveBeenCalledWith(
      'invitation.delivery_failed',
      expect.anything(),
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
      {
        correlationId: '30000000-0000-4000-8000-000000000003',
        invitationId: firstId,
        operation: 'create',
      },
    );
    expect(
      JSON.stringify(vi.mocked(deps.recordSafeEvent).mock.calls),
    ).not.toContain('invited@example.invalid');
  });
});
