import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { ProjectActivity } from '../domain/project-activity';
import type { ProjectAuthorizationPort } from './project-authorization-port';
import type { ProjectActivityGateway } from './project-activity-gateway';
import { ProjectActivityService } from './project-activity-service';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const activity: ProjectActivity = {
  createdAt: '2026-08-26T14:00:00.000Z',
  description: null,
  endsAt: null,
  id: activityId,
  locationText: null,
  name: 'Actividad V1',
  projectId,
  startsAt: '2026-08-27T14:00:00.000Z',
  status: 'scheduled',
  statusChangedAt: '2026-08-26T14:00:00.000Z',
  updatedAt: '2026-08-26T14:00:00.000Z',
};
const input = {
  description: '  Apoyo   local ',
  endsAt: '',
  locationText: '  Plaza   central ',
  name: '  Actividad   V1 ',
  startsAt: '2026-08-27T10:00:00-04:00',
};

function createGateway(): {
  readonly gateway: ProjectActivityGateway;
  readonly spies: Readonly<
    Record<keyof ProjectActivityGateway, ReturnType<typeof vi.fn>>
  >;
} {
  const spies = {
    cancelProjectActivity: vi
      .fn()
      .mockResolvedValue(success({ ...activity, status: 'cancelled' })),
    completeProjectActivity: vi
      .fn()
      .mockResolvedValue(success({ ...activity, status: 'completed' })),
    createProjectActivity: vi.fn().mockResolvedValue(success(activity)),
    getProjectActivity: vi.fn().mockResolvedValue(success(activity)),
    listProjectActivities: vi.fn().mockResolvedValue(success([activity])),
    updateProjectActivity: vi.fn().mockResolvedValue(success(activity)),
  };
  return { gateway: spies, spies };
}

function createAuthorization(
  allowedPermissions: readonly string[],
): ProjectAuthorizationPort {
  return {
    hasPermission: vi
      .fn()
      .mockImplementation((permission: string) =>
        Promise.resolve(success(allowedPermissions.includes(permission))),
      ),
  };
}

describe('ProjectActivityService', () => {
  it('canonicalizes create input and delegates without technical fields', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityService(
      createAuthorization(['project.manage']),
      gateway,
    );

    expect((await service.createProjectActivity(projectId, input)).ok).toBe(
      true,
    );
    expect(spies.createProjectActivity).toHaveBeenCalledWith({
      description: 'Apoyo local',
      endsAt: null,
      locationText: 'Plaza central',
      name: 'Actividad V1',
      projectId,
      startsAt: '2026-08-27T14:00:00.000Z',
    });
  });

  it('allows contextual read and every scheduled mutation contract', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityService(
      createAuthorization(['project.read_assigned', 'project.manage_assigned']),
      gateway,
    );

    expect((await service.listProjectActivities(projectId)).ok).toBe(true);
    expect((await service.getProjectActivity(projectId, activityId)).ok).toBe(
      true,
    );
    expect(
      (await service.updateProjectActivity(projectId, activityId, input)).ok,
    ).toBe(true);
    expect(
      (await service.completeProjectActivity(projectId, activityId)).ok,
    ).toBe(true);
    expect(
      (await service.cancelProjectActivity(projectId, activityId)).ok,
    ).toBe(true);
    expect(spies.updateProjectActivity).toHaveBeenCalledOnce();
    expect(spies.completeProjectActivity).toHaveBeenCalledWith(
      projectId,
      activityId,
    );
    expect(spies.cancelProjectActivity).toHaveBeenCalledWith(
      projectId,
      activityId,
    );
  });

  it('fails closed and never delegates without either approved authority', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityService(
      createAuthorization([]),
      gateway,
    );

    expect(await service.listProjectActivities(projectId)).toMatchObject({
      error: { code: 'forbidden' },
      ok: false,
    });
    expect(await service.createProjectActivity(projectId, input)).toMatchObject(
      {
        error: { code: 'forbidden' },
        ok: false,
      },
    );
    expect(spies.listProjectActivities).not.toHaveBeenCalled();
    expect(spies.createProjectActivity).not.toHaveBeenCalled();
  });

  it('validates IDs and dates before infrastructure', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityService(
      createAuthorization(['project.manage']),
      gateway,
    );

    expect(
      await service.getProjectActivity('bad-id', activityId),
    ).toMatchObject({ ok: false });
    expect(
      await service.updateProjectActivity(projectId, activityId, {
        ...input,
        endsAt: '2026-08-27T09:00:00Z',
        startsAt: '2026-08-27T10:00:00Z',
      }),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(spies.getProjectActivity).not.toHaveBeenCalled();
    expect(spies.updateProjectActivity).not.toHaveBeenCalled();
  });
});
