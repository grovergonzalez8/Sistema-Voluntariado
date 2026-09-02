import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { ProjectActivityParticipation } from '../domain/project-activity-participation';
import type { ProjectAuthorizationPort } from './project-authorization-port';
import type { ProjectActivityParticipationGateway } from './project-activity-participation-gateway';
import { ProjectActivityParticipationService } from './project-activity-participation-service';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const volunteerId = '30000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
const participation: ProjectActivityParticipation = {
  activityId,
  createdAt: '2026-09-02T14:00:00.000Z',
  endedAt: null,
  participationId,
  startedAt: '2026-09-02T14:00:00.000Z',
  updatedAt: '2026-09-02T14:00:00.000Z',
  volunteerId,
  volunteerName: 'Ana Volunteer',
};

function createGateway(): {
  readonly gateway: ProjectActivityParticipationGateway;
  readonly spies: Readonly<
    Record<keyof ProjectActivityParticipationGateway, ReturnType<typeof vi.fn>>
  >;
} {
  const spies = {
    createParticipation: vi.fn().mockResolvedValue(success(participation)),
    finishParticipation: vi
      .fn()
      .mockResolvedValue(
        success({ ...participation, endedAt: '2026-09-02T15:00:00.000Z' }),
      ),
    listParticipations: vi.fn().mockResolvedValue(success([participation])),
    searchEligibleCandidates: vi
      .fn()
      .mockResolvedValue(
        success([{ volunteerId, volunteerName: 'Ana Volunteer' }]),
      ),
  };
  return { gateway: spies, spies };
}

function createAuthorization(
  allowed: readonly string[],
): ProjectAuthorizationPort {
  return {
    hasPermission: vi
      .fn()
      .mockImplementation((permission: string) =>
        Promise.resolve(success(allowed.includes(permission))),
      ),
  };
}

describe('ProjectActivityParticipationService', () => {
  it('allows global read and mutation capabilities', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityParticipationService(
      createAuthorization(['project.manage']),
      gateway,
    );

    expect((await service.listParticipations(projectId, activityId)).ok).toBe(
      true,
    );
    expect(
      (await service.createParticipation(projectId, activityId, volunteerId))
        .ok,
    ).toBe(true);
    expect(
      (
        await service.finishParticipation(
          projectId,
          activityId,
          participationId,
        )
      ).ok,
    ).toBe(true);
    expect(spies.createParticipation).toHaveBeenCalledWith(
      projectId,
      activityId,
      volunteerId,
    );
  });

  it('uses contextual read and manage capabilities separately', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityParticipationService(
      createAuthorization(['project.read_assigned', 'project.manage_assigned']),
      gateway,
    );

    expect((await service.listParticipations(projectId, activityId)).ok).toBe(
      true,
    );
    expect(
      (
        await service.searchEligibleCandidates(
          projectId,
          activityId,
          '  Ana   Volunteer ',
        )
      ).ok,
    ).toBe(true);
    expect(spies.searchEligibleCandidates).toHaveBeenCalledWith(
      projectId,
      activityId,
      'Ana Volunteer',
    );
  });

  it('fails closed without project authority', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityParticipationService(
      createAuthorization([]),
      gateway,
    );

    expect(
      await service.listParticipations(projectId, activityId),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
    expect(
      await service.createParticipation(projectId, activityId, volunteerId),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
    expect(spies.listParticipations).not.toHaveBeenCalled();
    expect(spies.createParticipation).not.toHaveBeenCalled();
  });

  it('validates every identifier and bounded query before infrastructure', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectActivityParticipationService(
      createAuthorization(['project.manage']),
      gateway,
    );

    expect(
      await service.listParticipations('bad-id', activityId),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(
      await service.finishParticipation(projectId, activityId, 'bad-id'),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(
      await service.searchEligibleCandidates(
        projectId,
        activityId,
        'x'.repeat(101),
      ),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(spies.listParticipations).not.toHaveBeenCalled();
    expect(spies.finishParticipation).not.toHaveBeenCalled();
    expect(spies.searchEligibleCandidates).not.toHaveBeenCalled();
  });
});
