import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

export const accountStatuses = [
  'invited',
  'pending_profile',
  'active',
  'suspended',
  'archived',
] as const;

export type AccountStatus = (typeof accountStatuses)[number];

const allowedTransitions: Readonly<
  Record<AccountStatus, readonly AccountStatus[]>
> = {
  active: ['suspended', 'archived'],
  archived: ['active'],
  invited: ['pending_profile'],
  pending_profile: ['active'],
  suspended: ['active', 'archived'],
};

export interface AccountTransition {
  readonly from: AccountStatus;
  readonly to: AccountStatus;
}

export function isAccountStatus(value: string): value is AccountStatus {
  return accountStatuses.some((status) => status === value);
}

export function createAccountTransition(
  from: AccountStatus,
  to: AccountStatus,
): Result<AccountTransition> {
  if (!allowedTransitions[from].includes(to)) {
    return failure({
      code: 'conflict',
      message: `La transición de cuenta ${from} → ${to} no está permitida.`,
    });
  }

  return success({ from, to });
}

export function hasOperationalAccess(status: AccountStatus): boolean {
  return status === 'active';
}

export function requiresOnboarding(status: AccountStatus): boolean {
  return status === 'invited' || status === 'pending_profile';
}

export function isBlockedAccountStatus(status: AccountStatus): boolean {
  return status === 'suspended' || status === 'archived';
}

export function normalizeAdministrativeReason(reason: string): Result<string> {
  const normalized = reason.trim().replace(/\s+/g, ' ');

  if (normalized.length < 3 || normalized.length > 500) {
    return failure({
      code: 'validation',
      message: 'El motivo debe tener entre 3 y 500 caracteres.',
    });
  }

  return success(normalized);
}
