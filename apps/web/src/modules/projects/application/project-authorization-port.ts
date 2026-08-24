import type { Result } from '@sistema-voluntariado/shared-kernel';

export const projectManagementPermission = 'project.manage' as const;

export interface ProjectAuthorizationPort {
  hasPermission(
    permission: typeof projectManagementPermission,
  ): Promise<Result<boolean>>;
}
