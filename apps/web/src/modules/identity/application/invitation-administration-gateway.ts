import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  InvitationCommandResult,
  InvitationSummary,
} from '../domain/account-administration';
import type { CanonicalInvitationRequest } from '../domain/invitation';

export interface CreateInvitationCommand extends CanonicalInvitationRequest {
  readonly idempotencyKey: string;
}

export interface InvitationIdempotentCommand {
  readonly idempotencyKey: string;
  readonly invitationId: string;
}

export interface RevokeInvitationCommand {
  readonly idempotencyKey: string;
  readonly invitationId: string;
  readonly reason: string;
}

export interface RecoverInvitationCommand {
  readonly accountId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface InvitationAdministrationGateway {
  createInvitation(
    input: CreateInvitationCommand,
  ): Promise<Result<InvitationCommandResult>>;
  getInvitationDetail(invitationId: string): Promise<Result<InvitationSummary>>;
  listInvitations(): Promise<Result<readonly InvitationSummary[]>>;
  replaceInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>>;
  resendInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>>;
  revokeInvitation(
    input: RevokeInvitationCommand,
  ): Promise<Result<InvitationCommandResult>>;
  recoverAccountInvitation(
    input: RecoverInvitationCommand,
  ): Promise<Result<InvitationCommandResult>>;
}
