import {
  failure,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

interface SupabaseErrorLike {
  readonly message: string;
}

const knownErrors: Readonly<Record<string, AppErrorCode>> = {
  account_blocked: 'account-blocked',
  account_not_found: 'not-found',
  idempotency_conflict: 'conflict',
  invitation_expired: 'invitation-expired',
  invitation_not_found: 'not-found',
  invitation_revoked: 'invitation-revoked',
  invitation_reconciliation_required: 'server',
  invitation_superseded: 'invitation-superseded',
  invitation_used: 'invitation-used',
  network_error: 'network',
  origin_denied: 'origin-denied',
  permission_denied: 'forbidden',
  role_assignment_denied: 'forbidden',
  role_grant_denied: 'role-not-grantable',
  server_error: 'server',
  unauthenticated: 'unauthenticated',
};

export function supabaseFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = knownErrors[error.message] ?? 'unexpected';
  const messages: Readonly<Record<AppErrorCode, string>> = {
    'account-blocked': 'La cuenta no está activa.',
    configuration: 'La aplicación no está configurada correctamente.',
    conflict: 'La operación entra en conflicto con el estado actual.',
    forbidden: 'No tienes permiso para completar esta operación.',
    'invitation-expired': 'La invitación venció.',
    'invitation-revoked': 'La invitación fue revocada.',
    'invitation-superseded': 'La invitación fue sustituida.',
    'invitation-used': 'La invitación ya fue utilizada.',
    network: 'No fue posible conectar con el servidor.',
    'not-found': 'No se encontró el recurso solicitado.',
    'origin-denied': 'El origen de la aplicación no está autorizado.',
    'role-not-grantable': 'No puedes conceder el rol solicitado.',
    server: 'El servidor no pudo completar temporalmente la operación.',
    unauthenticated: 'Debes iniciar sesión.',
    unexpected: 'No fue posible completar la operación.',
    validation: 'La solicitud no es válida.',
  };

  return failure({ code, message: messages[code] });
}

export function unknownFailure<T>(): Result<T> {
  return failure({
    code: 'unexpected',
    message: 'El servidor devolvió una respuesta no válida.',
  });
}
