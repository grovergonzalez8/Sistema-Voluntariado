import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

export type RoleMutationOperation = 'grant' | 'revoke';

export interface RoleGrantPolicyDecision {
  readonly actorHasPermission: boolean;
  readonly actorId: string;
  readonly actorIsActive: boolean;
  readonly operation: RoleMutationOperation;
  readonly policyAllowsOperation: boolean;
  readonly roleIsActive: boolean;
  readonly targetAccountIsActive: boolean;
  readonly targetUserId: string;
}

export function authorizeRoleMutation(
  decision: RoleGrantPolicyDecision,
): Result<void> {
  if (decision.actorId === decision.targetUserId) {
    return failure({
      code: 'forbidden',
      message: 'No puedes modificar tus propios roles.',
    });
  }

  if (
    !decision.actorIsActive ||
    !decision.actorHasPermission ||
    !decision.policyAllowsOperation ||
    !decision.roleIsActive ||
    !decision.targetAccountIsActive
  ) {
    return failure({
      code: 'forbidden',
      message: 'No tienes autoridad para modificar este rol.',
    });
  }

  return success(undefined);
}
