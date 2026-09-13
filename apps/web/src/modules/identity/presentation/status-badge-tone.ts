import type { AccountStatus } from '../domain/account-lifecycle';
import type { InvitationStatus } from '../domain/invitation';

export type StatusBadgeTone =
  'danger' | 'info' | 'neutral' | 'success' | 'warning';

export function getAccountStatusTone(status: AccountStatus): StatusBadgeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'invited':
      return 'info';
    case 'pending_profile':
      return 'warning';
    case 'suspended':
      return 'danger';
    case 'archived':
      return 'neutral';
  }
}

export function getInvitationStatusTone(
  status: InvitationStatus,
): StatusBadgeTone {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'pending':
      return 'warning';
    case 'sent':
      return 'info';
    case 'delivery_failed':
    case 'revoked':
      return 'danger';
    case 'expired':
    case 'superseded':
      return 'neutral';
  }
}
