import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

export const invitationStatuses = [
  'pending',
  'sent',
  'accepted',
  'revoked',
  'expired',
  'delivery_failed',
  'superseded',
] as const;

export type InvitationStatus = (typeof invitationStatuses)[number];

export type PreferredLocale = 'en' | 'es';

const invitationTransitions: Readonly<
  Record<InvitationStatus, readonly InvitationStatus[]>
> = {
  accepted: [],
  delivery_failed: [
    'sent',
    'delivery_failed',
    'revoked',
    'expired',
    'superseded',
  ],
  expired: [],
  pending: ['sent', 'delivery_failed', 'revoked', 'expired', 'superseded'],
  revoked: [],
  sent: ['sent', 'accepted', 'revoked', 'expired', 'superseded'],
  superseded: [],
};

const openInvitationStatuses: readonly InvitationStatus[] = [
  'pending',
  'sent',
  'delivery_failed',
];

export interface InvitationState {
  readonly expiresAt: string;
  readonly status: InvitationStatus;
}

export interface InvitationTransition {
  readonly from: InvitationStatus;
  readonly to: InvitationStatus;
}

export interface CanonicalInvitationRequest {
  readonly displayName: string | null;
  readonly normalizedEmail: string;
  readonly preferredLocale: PreferredLocale;
  readonly requestedInitialRoleCode: string;
}

export function isInvitationStatus(value: string): value is InvitationStatus {
  return invitationStatuses.some((status) => status === value);
}

export function createInvitationTransition(
  from: InvitationStatus,
  to: InvitationStatus,
): Result<InvitationTransition> {
  if (!invitationTransitions[from].includes(to)) {
    return failure({
      code: 'conflict',
      message: `La transición de invitación ${from} → ${to} no está permitida.`,
    });
  }

  return success({ from, to });
}

export function isOpenInvitationStatus(status: InvitationStatus): boolean {
  return openInvitationStatuses.includes(status);
}

export function getEffectiveInvitationStatus(
  invitation: InvitationState,
  now: Date,
): InvitationStatus {
  if (
    isOpenInvitationStatus(invitation.status) &&
    Date.parse(invitation.expiresAt) <= now.getTime()
  ) {
    return 'expired';
  }

  return invitation.status;
}

export function normalizeEmail(email: string): Result<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.indexOf('@');
  const lastAtIndex = normalizedEmail.lastIndexOf('@');
  const domain = normalizedEmail.slice(atIndex + 1);

  if (
    normalizedEmail.length < 3 ||
    normalizedEmail.length > 254 ||
    atIndex < 1 ||
    atIndex !== lastAtIndex ||
    domain.length < 3 ||
    !domain.includes('.') ||
    /\s/.test(normalizedEmail)
  ) {
    return failure({
      code: 'validation',
      message: 'El correo electrónico no es válido.',
    });
  }

  return success(normalizedEmail);
}

export function createCanonicalInvitationRequest(input: {
  readonly displayName?: string | null | undefined;
  readonly email: string;
  readonly preferredLocale: string;
  readonly requestedInitialRoleCode: string;
}): Result<CanonicalInvitationRequest> {
  const email = normalizeEmail(input.email);
  if (!email.ok) {
    return email;
  }

  if (input.preferredLocale !== 'es' && input.preferredLocale !== 'en') {
    return failure({
      code: 'validation',
      message: 'El idioma de la invitación no es válido.',
    });
  }

  const displayName = input.displayName?.trim().replace(/\s+/g, ' ') ?? null;
  if (
    displayName !== null &&
    (displayName.length < 1 || displayName.length > 100)
  ) {
    return failure({
      code: 'validation',
      message: 'El nombre visible debe tener entre 1 y 100 caracteres.',
    });
  }

  if (!/^[a-z][a-z0-9_]*$/.test(input.requestedInitialRoleCode)) {
    return failure({
      code: 'validation',
      message: 'El rol inicial solicitado no es válido.',
    });
  }

  return success({
    displayName,
    normalizedEmail: email.value,
    preferredLocale: input.preferredLocale,
    requestedInitialRoleCode: input.requestedInitialRoleCode,
  });
}

export function createInvitationFingerprintSource(
  operation: string,
  request: CanonicalInvitationRequest,
): string {
  return JSON.stringify([
    operation,
    request.normalizedEmail,
    request.displayName,
    request.preferredLocale,
    request.requestedInitialRoleCode,
  ]);
}

export function getInvitationAcceptanceError(
  status: InvitationStatus,
): Result<void> {
  switch (status) {
    case 'sent':
      return success(undefined);
    case 'expired':
      return failure({
        code: 'invitation-expired',
        message: 'La invitación venció.',
      });
    case 'revoked':
      return failure({
        code: 'invitation-revoked',
        message: 'La invitación fue revocada.',
      });
    case 'superseded':
      return failure({
        code: 'invitation-superseded',
        message: 'La invitación fue sustituida.',
      });
    case 'accepted':
      return failure({
        code: 'invitation-used',
        message: 'La invitación ya fue utilizada.',
      });
    case 'delivery_failed':
    case 'pending':
      return failure({
        code: 'conflict',
        message: 'La invitación todavía no está disponible.',
      });
  }
}
