import { success, type Result } from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type {
  CreateInvitationCommand,
  InvitationAdministrationGateway,
  InvitationIdempotentCommand,
  RecoverInvitationCommand,
  RevokeInvitationCommand,
} from '../application/invitation-administration-gateway';
import type {
  InvitationCommandResult,
  InvitationSummary,
} from '../domain/account-administration';
import { isInvitationStatus } from '../domain/invitation';
import { supabaseFailure, unknownFailure } from './supabase-gateway-result';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type InvitationRow =
  Database['public']['Functions']['list_account_invitations']['Returns'][number];

function parseInvitation(row: InvitationRow): Result<InvitationSummary> {
  if (!isInvitationStatus(row.status)) return unknownFailure();
  if (row.preferred_locale !== 'es' && row.preferred_locale !== 'en') {
    return unknownFailure();
  }
  return success({
    accountId: row.account_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    displayName: row.display_name,
    expiresAt: row.expires_at,
    id: row.id,
    normalizedEmail: row.normalized_email,
    preferredLocale: row.preferred_locale,
    requestedInitialRoleCode: row.requested_initial_role_code,
    sentAt: row.sent_at,
    status: row.status,
    supersededBy: row.superseded_by,
  });
}

function parseCommandResult(value: unknown): Result<InvitationCommandResult> {
  if (!isRecord(value)) return unknownFailure();
  const accountId = value['accountId'];
  const invitationId = value['invitationId'];
  const outcome = value['outcome'];
  const status = value['status'];
  if (
    typeof accountId !== 'string' ||
    typeof invitationId !== 'string' ||
    (outcome !== 'completed' &&
      outcome !== 'failed' &&
      outcome !== 'in_progress' &&
      outcome !== 'replayed') ||
    typeof status !== 'string' ||
    !isInvitationStatus(status)
  ) {
    return unknownFailure();
  }
  return success({ accountId, invitationId, outcome, status });
}

async function parseFunctionFailure<T>(error: unknown): Promise<Result<T>> {
  if (isRecord(error) && error['context'] instanceof Response) {
    try {
      const payload: unknown = await error['context'].clone().json();
      if (isRecord(payload) && typeof payload['code'] === 'string') {
        return supabaseFailure({ message: payload['code'] });
      }
    } catch {
      return supabaseFailure({ message: 'unexpected' });
    }
  }
  if (isRecord(error) && error['name'] === 'FunctionsFetchError') {
    return supabaseFailure({ message: 'network_error' });
  }
  if (isRecord(error) && error['name'] === 'FunctionsRelayError') {
    return supabaseFailure({ message: 'server_error' });
  }
  return supabaseFailure({ message: 'unexpected' });
}

export class SupabaseInvitationAdministrationGateway implements InvitationAdministrationGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public createInvitation(
    input: CreateInvitationCommand,
  ): Promise<Result<InvitationCommandResult>> {
    return this.invoke({
      displayName: input.displayName,
      email: input.normalizedEmail,
      idempotencyKey: input.idempotencyKey,
      operation: 'create',
      preferredLocale: input.preferredLocale,
      requestedInitialRoleCode: input.requestedInitialRoleCode,
    });
  }

  public async getInvitationDetail(
    invitationId: string,
  ): Promise<Result<InvitationSummary>> {
    const { data, error } = await this.client.rpc(
      'get_account_invitation_detail',
      { requested_invitation_id: invitationId },
    );
    if (error) return supabaseFailure(error);
    const row = data[0];
    return row ? parseInvitation(row) : unknownFailure();
  }

  public async listInvitations(): Promise<
    Result<readonly InvitationSummary[]>
  > {
    const { data, error } = await this.client.rpc('list_account_invitations');
    if (error) return supabaseFailure(error);

    const invitations: InvitationSummary[] = [];
    for (const row of data) {
      const invitation = parseInvitation(row);
      if (!invitation.ok) return invitation;
      invitations.push(invitation.value);
    }
    return success(invitations);
  }

  public replaceInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>> {
    return this.invoke({ ...input, operation: 'replace' });
  }

  public resendInvitation(
    input: InvitationIdempotentCommand,
  ): Promise<Result<InvitationCommandResult>> {
    return this.invoke({ ...input, operation: 'resend' });
  }

  public revokeInvitation(
    input: RevokeInvitationCommand,
  ): Promise<Result<InvitationCommandResult>> {
    return this.invoke({ ...input, operation: 'revoke' });
  }

  public recoverAccountInvitation(
    input: RecoverInvitationCommand,
  ): Promise<Result<InvitationCommandResult>> {
    return this.invoke({ ...input, operation: 'recover' });
  }

  private async invoke(
    body: Readonly<Record<string, unknown>>,
  ): Promise<Result<InvitationCommandResult>> {
    const response = await this.client.functions.invoke(
      'manage-account-invitation',
      { body },
    );
    if (response.error) {
      return parseFunctionFailure(response.error);
    }
    const data: unknown = response.data;
    return parseCommandResult(data);
  }
}
