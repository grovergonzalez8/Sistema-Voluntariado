import { success, type Result } from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type {
  AccountAdministrationGateway,
  AccountListQuery,
  ChangeAccountStatusCommand,
  ManageAccountRoleCommand,
} from '../application/account-administration-gateway';
import type {
  AccountDetail,
  AccountSummary,
  AccountStatusHistoryEntry,
  AuditEntry,
  RoleSummary,
} from '../domain/account-administration';
import { isAccountStatus } from '../domain/account-lifecycle';
import { supabaseFailure, unknownFailure } from './supabase-gateway-result';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function parseHistory(value: unknown): AccountStatusHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: AccountStatusHistoryEntry[] = [];
  const items: readonly unknown[] = value;
  for (const item of items) {
    if (!isRecord(item)) return null;
    const changedAt = stringValue(item, 'changedAt');
    const fromStatus = stringValue(item, 'fromStatus');
    const reason = stringValue(item, 'reason');
    const toStatus = stringValue(item, 'toStatus');
    const changedBy = stringValue(item, 'changedBy');
    if (
      !changedAt ||
      !reason ||
      !toStatus ||
      !isAccountStatus(toStatus) ||
      (fromStatus !== null && !isAccountStatus(fromStatus))
    ) {
      return null;
    }
    entries.push({ changedAt, changedBy, fromStatus, reason, toStatus });
  }
  return entries;
}

function parseAudit(value: unknown): AuditEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: AuditEntry[] = [];
  const items: readonly unknown[] = value;
  for (const item of items) {
    if (!isRecord(item)) return null;
    const action = stringValue(item, 'action');
    const entityId = stringValue(item, 'entityId');
    const entityType = stringValue(item, 'entityType');
    const occurredAt = stringValue(item, 'occurredAt');
    if (!action || !entityId || !entityType || !occurredAt) return null;
    entries.push({ action, entityId, entityType, occurredAt });
  }
  return entries;
}

function parseRoles(value: unknown): RoleSummary[] | null {
  if (!Array.isArray(value)) return null;
  const roles: RoleSummary[] = [];
  const items: readonly unknown[] = value;
  for (const item of items) {
    if (!isRecord(item)) return null;
    const code = stringValue(item, 'code');
    const description = stringValue(item, 'description');
    if (!code || !description) return null;
    roles.push({ code, description });
  }
  return roles;
}

export class SupabaseAccountAdministrationGateway implements AccountAdministrationGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async changeAccountStatus(
    input: ChangeAccountStatusCommand,
  ): Promise<Result<AccountDetail>> {
    const [before, currentUser] = await Promise.all([
      this.getAccountDetail(input.accountId),
      this.client.auth.getUser(),
    ]);
    if (!before.ok) return before;

    const { data, error } = await this.client.rpc('change_account_status', {
      requested_account_id: input.accountId,
      requested_reason: input.reason,
      requested_status: input.status,
    });
    if (error) return supabaseFailure(error);

    const updated = await this.getAccountDetail(input.accountId);
    if (updated.ok) return updated;

    const row = data[0];
    if (
      row &&
      currentUser.data.user?.id === before.value.userId &&
      (row.status === 'suspended' || row.status === 'archived')
    ) {
      return success({
        ...before.value,
        status: row.status,
        updatedAt: row.updated_at,
      });
    }

    return updated;
  }

  public async getAccountDetail(
    accountId: string,
  ): Promise<Result<AccountDetail>> {
    const { data, error } = await this.client.rpc('get_account_detail', {
      requested_account_id: accountId,
    });
    if (error) return supabaseFailure(error);
    const row = data[0];
    if (!row || !isAccountStatus(row.account_status)) return unknownFailure();
    const history = parseHistory(row.history);
    const audit = parseAudit(row.audit);
    const grantableRoles = parseRoles(row.grantable_roles);
    if (!history || !audit || !grantableRoles) return unknownFailure();

    return success({
      accountId: row.account_id,
      audit,
      displayName: row.display_name,
      email: row.email,
      grantableRoles,
      history,
      roles: row.roles,
      status: row.account_status,
      updatedAt: row.updated_at,
      userId: row.user_id,
    });
  }

  public async listAccounts(
    query: AccountListQuery,
  ): Promise<Result<readonly AccountSummary[]>> {
    const { data, error } = await this.client.rpc('list_accounts', {
      requested_limit: query.limit,
      requested_offset: query.offset,
      requested_search: query.search,
    });
    if (error) return supabaseFailure(error);
    const accounts: AccountSummary[] = [];
    for (const row of data) {
      if (!isAccountStatus(row.account_status)) return unknownFailure();
      accounts.push({
        accountId: row.account_id,
        displayName: row.display_name,
        email: row.email,
        roles: row.roles,
        status: row.account_status,
        updatedAt: row.updated_at,
        userId: row.user_id,
      });
    }
    return success(accounts);
  }

  public async manageAccountRole(
    input: ManageAccountRoleCommand,
  ): Promise<Result<AccountDetail>> {
    const { error } = await this.client.rpc('manage_account_role', {
      requested_account_id: input.accountId,
      requested_operation: input.operation,
      requested_role_code: input.roleCode,
    });
    return error
      ? supabaseFailure(error)
      : this.getAccountDetail(input.accountId);
  }
}
