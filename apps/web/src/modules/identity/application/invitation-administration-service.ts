import { failure, type Result } from '@sistema-voluntariado/shared-kernel';

import type {
  InvitationCommandResult,
  InvitationSummary,
} from '../domain/account-administration';
import { normalizeAdministrativeReason } from '../domain/account-lifecycle';
import { createCanonicalInvitationRequest } from '../domain/invitation';
import type {
  InvitationAdministrationGateway,
  InvitationIdempotentCommand,
} from './invitation-administration-gateway';

const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateIdempotentCommand = (
  command: InvitationIdempotentCommand,
): Result<InvitationIdempotentCommand> => {
  if (
    !idempotencyKeyPattern.test(command.idempotencyKey) ||
    !idempotencyKeyPattern.test(command.invitationId)
  ) {
    return failure({
      code: 'validation',
      message: 'Los identificadores de la operación no son válidos.',
    });
  }

  return { ok: true, value: command };
};

export class InvitationAdministrationService {
  public constructor(
    private readonly gateway: InvitationAdministrationGateway,
  ) {}

  public createInvitation(input: {
    readonly displayName?: string | null | undefined;
    readonly email: string;
    readonly idempotencyKey: string;
    readonly preferredLocale: string;
    readonly requestedInitialRoleCode: string;
  }): Promise<Result<InvitationCommandResult>> {
    const request = createCanonicalInvitationRequest(input);
    if (!request.ok) {
      return Promise.resolve(request);
    }

    if (!idempotencyKeyPattern.test(input.idempotencyKey)) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'La clave de idempotencia no es válida.',
        }),
      );
    }

    return this.gateway.createInvitation({
      ...request.value,
      idempotencyKey: input.idempotencyKey,
    });
  }

  public listInvitations(): Promise<Result<readonly InvitationSummary[]>> {
    return this.gateway.listInvitations();
  }

  public replaceInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>> {
    const command = validateIdempotentCommand(input);
    return command.ok
      ? this.gateway.replaceInvitation(command.value)
      : Promise.resolve(command);
  }

  public resendInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>> {
    const command = validateIdempotentCommand(input);
    return command.ok
      ? this.gateway.resendInvitation(command.value)
      : Promise.resolve(command);
  }

  public revokeInvitation(input: {
    readonly invitationId: string;
    readonly reason: string;
  }): Promise<Result<InvitationCommandResult>> {
    const reason = normalizeAdministrativeReason(input.reason);
    if (!reason.ok) {
      return Promise.resolve(reason);
    }

    if (!idempotencyKeyPattern.test(input.invitationId)) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'La invitación no es válida.',
        }),
      );
    }

    return this.gateway.revokeInvitation({
      invitationId: input.invitationId,
      reason: reason.value,
    });
  }
}
