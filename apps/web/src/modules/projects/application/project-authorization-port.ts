import type { Result } from '@sistema-voluntariado/shared-kernel';

export const projectPermissions = {
  manage: 'project.manage',
  manageAssigned: 'project.manage_assigned',
  readAssigned: 'project.read_assigned',
} as const;

export const projectManagementPermission = projectPermissions.manage;
export type ProjectPermission =
  (typeof projectPermissions)[keyof typeof projectPermissions];

export interface ProjectCapabilities {
  readonly manage: boolean;
  readonly manageAssigned: boolean;
  readonly readAssigned: boolean;
}

export interface ProjectAuthorizationPort {
  hasPermission(permission: ProjectPermission): Promise<Result<boolean>>;
}
