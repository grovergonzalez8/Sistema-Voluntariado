import type { AccountStatus } from './account-lifecycle';
import type { InvitationStatus, PreferredLocale } from './invitation';

export interface AccountContext {
  readonly accountId: string;
  readonly authorityVersion: string;
  readonly permissions: readonly string[];
  readonly status: AccountStatus;
}

export interface InvitationSummary {
  readonly accountId: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly displayName: string | null;
  readonly expiresAt: string;
  readonly id: string;
  readonly normalizedEmail: string;
  readonly preferredLocale: PreferredLocale;
  readonly requestedInitialRoleCode: string;
  readonly sentAt: string | null;
  readonly status: InvitationStatus;
}

export interface AccountSummary {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly roles: readonly string[];
  readonly status: AccountStatus;
  readonly updatedAt: string;
  readonly userId: string | null;
}

export interface AccountStatusHistoryEntry {
  readonly changedAt: string;
  readonly changedBy: string | null;
  readonly fromStatus: AccountStatus | null;
  readonly reason: string;
  readonly toStatus: AccountStatus;
}

export interface AuditEntry {
  readonly action: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly occurredAt: string;
}

export interface RoleSummary {
  readonly code: string;
  readonly description: string;
}

export interface AccountDetail extends AccountSummary {
  readonly audit: readonly AuditEntry[];
  readonly grantableRoles: readonly RoleSummary[];
  readonly history: readonly AccountStatusHistoryEntry[];
}

export interface InvitationCommandResult {
  readonly accountId: string;
  readonly invitationId: string;
  readonly status: InvitationStatus;
}

export interface OnboardingCompletion {
  readonly accountId: string;
  readonly status: 'active';
}
