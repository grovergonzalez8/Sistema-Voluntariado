import type { Result } from '@sistema-voluntariado/shared-kernel';

export const volunteerRegistryPermissions = [
  'volunteer_registry.read',
  'volunteer_registry.create',
  'volunteer_registry.update',
  'volunteer_registry.import',
  'volunteer_registry.export',
] as const;

export type VolunteerRegistryPermission =
  (typeof volunteerRegistryPermissions)[number];

export interface VolunteerAuthorizationPort {
  hasPermission(
    permission: VolunteerRegistryPermission,
  ): Promise<Result<boolean>>;
}
