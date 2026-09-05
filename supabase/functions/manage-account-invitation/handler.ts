export type InvitationOperation = 'create' | 'replace' | 'resend' | 'revoke';

interface AccountContext {
  readonly accountStatus: string;
  readonly permissions: readonly string[];
}

export interface DeliveryReservation {
  readonly acknowledgedAuthUserId: string | null;
  readonly accountId: string;
  readonly correlationId: string;
  readonly deliveryAttemptId: string | null;
  readonly displayName: string | null;
  readonly invitationId: string;
  readonly normalizedEmail: string;
  readonly preferredLocale: 'en' | 'es';
  readonly requestedInitialRoleCode: string;
  readonly shouldDeliver: boolean;
  readonly operationOutcome:
    'completed' | 'execute' | 'failed' | 'in_progress' | 'replayed';
  readonly sourceInvitationId: string;
  readonly status: string;
}

interface AcceptanceChallenge {
  readonly hash: string;
  readonly raw: string;
}

type AuthDeliveryReconciliation =
  | { readonly authUserId: string; readonly kind: 'applied' }
  | { readonly kind: 'ambiguous' | 'not_applied' };

interface SafeCommandResult {
  readonly accountId: string;
  readonly invitationId: string;
  readonly status: string;
}

type PublicOperationOutcome =
  'completed' | 'failed' | 'in_progress' | 'replayed';

interface CreateInput {
  readonly displayName: string | null;
  readonly email: string;
  readonly idempotencyKey: string;
  readonly operation: 'create';
  readonly preferredLocale: 'en' | 'es';
  readonly requestedInitialRoleCode: string;
}

interface IdempotentActionInput {
  readonly idempotencyKey: string;
  readonly invitationId: string;
  readonly operation: 'replace' | 'resend';
}

interface RevokeInput {
  readonly idempotencyKey: string;
  readonly invitationId: string;
  readonly operation: 'revoke';
  readonly reason: string;
}

type CommandInput = CreateInput | IdempotentActionInput | RevokeInput;

export interface InvitationHandlerDependencies {
  readonly acknowledgeDelivery: (input: {
    readonly authUserId: string;
    readonly deliveryAttemptId: string;
    readonly invitationId: string;
  }) => Promise<void>;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly authenticate: (
    authorization: string,
  ) => Promise<{ readonly id: string }>;
  readonly createAcceptanceChallenge: () => Promise<AcceptanceChallenge>;
  readonly finalizeDelivery: (input: {
    readonly authUserId: string | null;
    readonly deliveryAttemptId: string;
    readonly invitationId: string;
    readonly providerErrorCode: string | null;
    readonly succeeded: boolean;
  }) => Promise<SafeCommandResult>;
  readonly reconcileAuthDelivery: (input: {
    readonly deliveryAttemptId: string;
    readonly email: string;
    readonly invitationId: string;
  }) => Promise<AuthDeliveryReconciliation>;
  readonly getAccountContext: (
    authorization: string,
  ) => Promise<AccountContext | null>;
  readonly inviteAuthUser: (input: {
    readonly acceptanceChallenge: string;
    readonly acceptanceChallengeHash: string;
    readonly deliveryAttemptId: string;
    readonly deliveryGeneration: number;
    readonly displayName: string | null;
    readonly email: string;
    readonly invitationId: string;
    readonly locale: 'en' | 'es';
  }) => Promise<{ readonly id: string }>;
  readonly updateAuthUserInvitation: (input: {
    readonly acceptanceChallengeHash: string;
    readonly authUserId: string;
    readonly deliveryAttemptId: string;
    readonly deliveryGeneration: number;
    readonly displayName: string | null;
    readonly invitationId: string;
    readonly locale: 'en' | 'es';
  }) => Promise<void>;
  readonly stageAcceptanceChallenge: (input: {
    readonly challengeHash: string;
    readonly deliveryAttemptId: string;
    readonly invitationId: string;
  }) => Promise<{ readonly generation: number }>;
  readonly prepareAction: (
    authorization: string,
    input: IdempotentActionInput | RevokeInput,
  ) => Promise<DeliveryReservation>;
  readonly prepareCreate: (
    authorization: string,
    input: CreateInput,
  ) => Promise<DeliveryReservation>;
  readonly recordSafeEvent: (
    event: string,
    identifiers: Readonly<Record<string, string>>,
  ) => void;
}

export class InvitationHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  minimum = 1,
  maximum = 500,
): string {
  if (typeof value !== 'string') {
    throw new InvitationHttpError(
      400,
      'invalid_body',
      `El campo ${field} no es válido.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new InvitationHttpError(
      400,
      'invalid_body',
      `El campo ${field} no es válido.`,
    );
  }

  return normalized;
}

function requiredUuid(value: unknown, field: string): string {
  const candidate = requiredString(value, field, 36, 36);
  if (!uuidPattern.test(candidate)) {
    throw new InvitationHttpError(
      400,
      'invalid_body',
      `El campo ${field} no es válido.`,
    );
  }
  return candidate;
}

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new InvitationHttpError(
      400,
      'invalid_body',
      'La solicitud contiene campos no permitidos.',
    );
  }
}

export function parseInvitationCommand(body: unknown): CommandInput {
  if (!isRecord(body)) {
    throw new InvitationHttpError(
      400,
      'invalid_body',
      'El cuerpo de la solicitud no es válido.',
    );
  }

  const operation = requiredString(body['operation'], 'operation', 1, 16);
  if (operation === 'create') {
    rejectUnknownKeys(body, [
      'displayName',
      'email',
      'idempotencyKey',
      'operation',
      'preferredLocale',
      'requestedInitialRoleCode',
    ]);
    const preferredLocale = requiredString(
      body['preferredLocale'],
      'preferredLocale',
      2,
      2,
    );
    if (preferredLocale !== 'es' && preferredLocale !== 'en') {
      throw new InvitationHttpError(
        400,
        'invalid_body',
        'El idioma solicitado no es válido.',
      );
    }

    const displayName =
      body['displayName'] === null || body['displayName'] === undefined
        ? null
        : requiredString(body['displayName'], 'displayName', 1, 100);

    return {
      displayName,
      email: requiredString(body['email'], 'email', 3, 254),
      idempotencyKey: requiredUuid(body['idempotencyKey'], 'idempotencyKey'),
      operation,
      preferredLocale,
      requestedInitialRoleCode: requiredString(
        body['requestedInitialRoleCode'],
        'requestedInitialRoleCode',
        1,
        64,
      ),
    };
  }

  if (operation === 'resend' || operation === 'replace') {
    rejectUnknownKeys(body, ['idempotencyKey', 'invitationId', 'operation']);
    return {
      idempotencyKey: requiredUuid(body['idempotencyKey'], 'idempotencyKey'),
      invitationId: requiredUuid(body['invitationId'], 'invitationId'),
      operation,
    };
  }

  if (operation === 'revoke') {
    rejectUnknownKeys(body, [
      'idempotencyKey',
      'invitationId',
      'operation',
      'reason',
    ]);
    return {
      idempotencyKey: requiredUuid(body['idempotencyKey'], 'idempotencyKey'),
      invitationId: requiredUuid(body['invitationId'], 'invitationId'),
      operation,
      reason: requiredString(body['reason'], 'reason', 3, 500),
    };
  }

  throw new InvitationHttpError(
    400,
    'invalid_body',
    'La operación solicitada no es válida.',
  );
}

function operationResponse(
  origin: string,
  httpStatus: number,
  outcome: PublicOperationOutcome,
  reservation: Pick<
    DeliveryReservation,
    'accountId' | 'invitationId' | 'status'
  >,
): Response {
  return jsonResponse(origin, httpStatus, {
    accountId: reservation.accountId,
    invitationId: reservation.invitationId,
    outcome,
    status: reservation.status,
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-origin': origin,
    vary: 'origin',
  };
}

function jsonResponse(origin: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...jsonHeaders, ...corsHeaders(origin) },
    status,
  });
}

function providerFailure(error: unknown): {
  readonly ambiguous: boolean;
  readonly code: 'auth_provider_outcome_unknown' | 'auth_provider_rejected';
} {
  const status = isRecord(error) ? error['status'] : null;
  const rejected = typeof status === 'number' && status >= 400 && status < 500;
  return rejected
    ? { ambiguous: false, code: 'auth_provider_rejected' }
    : { ambiguous: true, code: 'auth_provider_outcome_unknown' };
}

function requiredPermission(operation: InvitationOperation): string {
  if (operation === 'create') return 'invitation.create';
  if (operation === 'revoke') return 'invitation.revoke';
  return 'invitation.resend';
}

export function createInvitationHandler(
  dependencies: InvitationHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = request.headers.get('origin') ?? '';
    if (!dependencies.allowedOrigins.has(origin)) {
      return new Response(
        JSON.stringify({
          code: 'origin_denied',
          message: 'Origen no autorizado.',
        }),
        { headers: jsonHeaders, status: 403 },
      );
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin), status: 204 });
    }

    try {
      if (request.method !== 'POST') {
        throw new InvitationHttpError(
          405,
          'method_not_allowed',
          'Método no permitido.',
        );
      }

      const contentType = request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim();
      if (contentType !== 'application/json') {
        throw new InvitationHttpError(
          415,
          'unsupported_media_type',
          'Content-Type debe ser application/json.',
        );
      }

      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw new InvitationHttpError(
          401,
          'unauthenticated',
          'Debes iniciar sesión.',
        );
      }

      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        throw new InvitationHttpError(
          400,
          'invalid_body',
          'El cuerpo de la solicitud no es válido.',
        );
      }
      const command = parseInvitationCommand(rawBody);
      await dependencies.authenticate(authorization);
      const context = await dependencies.getAccountContext(authorization);
      if (context?.accountStatus !== 'active') {
        throw new InvitationHttpError(
          403,
          'account_blocked',
          'La cuenta no está activa.',
        );
      }

      const permission = requiredPermission(command.operation);
      if (!context.permissions.includes(permission)) {
        throw new InvitationHttpError(
          403,
          'permission_denied',
          'No tienes permiso para esta operación.',
        );
      }

      const reservation =
        command.operation === 'create'
          ? await dependencies.prepareCreate(authorization, command)
          : await dependencies.prepareAction(authorization, command);

      if (reservation.operationOutcome !== 'execute') {
        const outcome = reservation.operationOutcome;
        dependencies.recordSafeEvent(`invitation.command_${outcome}`, {
          correlationId: reservation.correlationId,
          invitationId: reservation.invitationId,
          operation: command.operation,
        });
        if (outcome === 'in_progress') {
          return operationResponse(origin, 202, outcome, reservation);
        }
        if (outcome === 'failed') {
          return operationResponse(origin, 200, outcome, reservation);
        }
        return operationResponse(origin, 200, outcome, reservation);
      }

      if (!reservation.deliveryAttemptId) {
        throw new InvitationHttpError(
          409,
          'delivery_lease_missing',
          'La entrega no puede iniciarse.',
        );
      }
      const deliveryAttemptId = reservation.deliveryAttemptId;

      const reconciliationInput = {
        deliveryAttemptId,
        email: reservation.normalizedEmail,
        invitationId: reservation.invitationId,
      };
      const reconciliationRequired = () => {
        dependencies.recordSafeEvent(
          'invitation.delivery_reconciliation_required',
          {
            correlationId: reservation.correlationId,
            invitationId: reservation.invitationId,
            operation: command.operation,
          },
        );
        return new InvitationHttpError(
          503,
          'invitation_reconciliation_required',
          'La entrega requiere reconciliación segura. Reintenta con la misma clave.',
        );
      };
      const closeUnknownDelivery = async () => {
        await dependencies.finalizeDelivery({
          authUserId: null,
          deliveryAttemptId,
          invitationId: reservation.invitationId,
          providerErrorCode: 'auth_provider_outcome_unknown',
          succeeded: false,
        });
      };
      const reconcileDelivery = async (): Promise<
        Awaited<
          ReturnType<InvitationHandlerDependencies['reconcileAuthDelivery']>
        >
      > => {
        try {
          return await dependencies.reconcileAuthDelivery(reconciliationInput);
        } catch {
          return { kind: 'ambiguous' };
        }
      };

      let authUser: { readonly id: string };
      if (reservation.acknowledgedAuthUserId) {
        authUser = { id: reservation.acknowledgedAuthUserId };
      } else {
        let shouldCallProvider = reservation.shouldDeliver;
        let recoveredUserId: string | null = null;

        if (!shouldCallProvider) {
          const reconciliation = await reconcileDelivery();
          if (reconciliation.kind === 'applied') {
            recoveredUserId = reconciliation.authUserId;
          } else if (reconciliation.kind === 'not_applied') {
            shouldCallProvider = true;
          } else {
            await closeUnknownDelivery();
            throw reconciliationRequired();
          }
        }

        if (shouldCallProvider) {
          const challenge = await dependencies.createAcceptanceChallenge();
          const staged = await dependencies.stageAcceptanceChallenge({
            challengeHash: challenge.hash,
            deliveryAttemptId,
            invitationId: reservation.invitationId,
          });
          try {
            authUser = await dependencies.inviteAuthUser({
              acceptanceChallenge: challenge.raw,
              acceptanceChallengeHash: challenge.hash,
              deliveryAttemptId,
              deliveryGeneration: staged.generation,
              displayName: reservation.displayName,
              email: reservation.normalizedEmail,
              invitationId: reservation.invitationId,
              locale: reservation.preferredLocale,
            });
          } catch (error) {
            const failure = providerFailure(error);
            const reconciliation = await reconcileDelivery();
            if (reconciliation.kind === 'applied') {
              authUser = { id: reconciliation.authUserId };
            } else {
              const providerErrorCode =
                !failure.ambiguous && reconciliation.kind === 'not_applied'
                  ? 'auth_provider_rejected'
                  : 'auth_provider_outcome_unknown';
              await dependencies.finalizeDelivery({
                authUserId: null,
                deliveryAttemptId,
                invitationId: reservation.invitationId,
                providerErrorCode,
                succeeded: false,
              });
              if (providerErrorCode === 'auth_provider_outcome_unknown') {
                throw reconciliationRequired();
              }
              dependencies.recordSafeEvent('invitation.delivery_failed', {
                correlationId: reservation.correlationId,
                invitationId: reservation.invitationId,
                operation: command.operation,
                providerErrorCode,
              });
              throw new InvitationHttpError(
                502,
                'invitation_delivery_failed',
                'No fue posible enviar la invitación. Puedes reintentar de forma segura.',
              );
            }
          }

          try {
            await dependencies.updateAuthUserInvitation({
              acceptanceChallengeHash: challenge.hash,
              authUserId: authUser.id,
              deliveryAttemptId,
              deliveryGeneration: staged.generation,
              displayName: reservation.displayName,
              invitationId: reservation.invitationId,
              locale: reservation.preferredLocale,
            });
          } catch {
            const reconciliation = await reconcileDelivery();
            if (reconciliation.kind !== 'applied') {
              await closeUnknownDelivery();
              throw reconciliationRequired();
            }
            authUser = { id: reconciliation.authUserId };
          }
        } else {
          if (!recoveredUserId) throw reconciliationRequired();
          authUser = { id: recoveredUserId };
        }

        try {
          await dependencies.acknowledgeDelivery({
            authUserId: authUser.id,
            deliveryAttemptId,
            invitationId: reservation.invitationId,
          });
        } catch {
          const reconciliation = await reconcileDelivery();
          if (reconciliation.kind !== 'applied') {
            await closeUnknownDelivery();
            throw reconciliationRequired();
          }
          authUser = { id: reconciliation.authUserId };
          try {
            await dependencies.acknowledgeDelivery({
              authUserId: authUser.id,
              deliveryAttemptId,
              invitationId: reservation.invitationId,
            });
          } catch {
            throw reconciliationRequired();
          }
        }
      }

      let result: SafeCommandResult;
      try {
        result = await dependencies.finalizeDelivery({
          authUserId: authUser.id,
          deliveryAttemptId,
          invitationId: reservation.invitationId,
          providerErrorCode: null,
          succeeded: true,
        });
      } catch {
        dependencies.recordSafeEvent(
          'invitation.delivery_reconciliation_required',
          {
            correlationId: reservation.correlationId,
            invitationId: reservation.invitationId,
            operation: command.operation,
          },
        );
        throw new InvitationHttpError(
          503,
          'invitation_reconciliation_required',
          'La entrega requiere reconciliación segura. Reintenta con la misma clave.',
        );
      }
      dependencies.recordSafeEvent('invitation.delivery_completed', {
        correlationId: reservation.correlationId,
        invitationId: result.invitationId,
        operation: command.operation,
      });
      return jsonResponse(origin, 200, { ...result, outcome: 'completed' });
    } catch (error) {
      if (error instanceof InvitationHttpError) {
        return jsonResponse(origin, error.status, {
          code: error.code,
          message: error.message,
        });
      }

      dependencies.recordSafeEvent('invitation.command_failed', {});
      return jsonResponse(origin, 500, {
        code: 'internal_error',
        message: 'No fue posible completar la operación.',
      });
    }
  };
}
