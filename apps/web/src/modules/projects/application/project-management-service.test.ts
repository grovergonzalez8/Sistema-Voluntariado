import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { ProjectAuthorizationPort } from './project-authorization-port';
import type { ProjectManagementGateway } from './project-management-gateway';
import { ProjectManagementService } from './project-management-service';

const projectId = '10000000-0000-4000-8000-000000000001';
const volunteerId = '20000000-0000-4000-8000-000000000001';
const assignmentId = '30000000-0000-4000-8000-000000000001';
const project = {
  createdAt: '2026-08-24T10:00:00Z',
  description: null,
  id: projectId,
  name: 'Proyecto V1',
  status: 'active' as const,
  updatedAt: '2026-08-24T10:00:00Z',
};

function createGateway(): {
  readonly gateway: ProjectManagementGateway;
  readonly spies: Readonly<
    Record<keyof ProjectManagementGateway, ReturnType<typeof vi.fn>>
  >;
} {
  const spies = {
    assignVolunteer: vi.fn().mockResolvedValue(
      success({
        assignmentId,
        createdAt: '2026-08-24T10:00:00Z',
        endedAt: null,
        projectId,
        startedAt: '2026-08-24T10:00:00Z',
        updatedAt: '2026-08-24T10:00:00Z',
        volunteerId,
        volunteerName: 'Voluntaria Uno',
      }),
    ),
    closeProject: vi
      .fn()
      .mockResolvedValue(success({ ...project, status: 'closed' })),
    createProject: vi.fn().mockResolvedValue(success(project)),
    endAssignment: vi.fn().mockResolvedValue(
      success({
        assignmentId,
        createdAt: '2026-08-24T10:00:00Z',
        endedAt: '2026-08-24T11:00:00Z',
        projectId,
        startedAt: '2026-08-24T10:00:00Z',
        updatedAt: '2026-08-24T11:00:00Z',
        volunteerId,
        volunteerName: 'Voluntaria Uno',
      }),
    ),
    getProject: vi.fn().mockResolvedValue(success(project)),
    listProjectAssignments: vi.fn().mockResolvedValue(success([])),
    listProjects: vi
      .fn()
      .mockResolvedValue(
        success({ items: [project], limit: 25, offset: 0, total: 1 }),
      ),
    listVolunteerProjects: vi.fn().mockResolvedValue(success([])),
    searchVolunteerCandidates: vi.fn().mockResolvedValue(success([])),
    updateProject: vi.fn().mockResolvedValue(success(project)),
  };
  return { gateway: spies, spies };
}

function createAuthorization(allowed = true): ProjectAuthorizationPort {
  return { hasPermission: vi.fn().mockResolvedValue(success(allowed)) };
}

describe('ProjectManagementService', () => {
  it('canonicalizes and delegates project creation after authorization', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectManagementService(
      createAuthorization(),
      gateway,
    );

    const result = await service.createProject({
      description: '  Apoyo   local ',
      name: '  Proyecto   V1 ',
    });

    expect(result).toEqual(success(project));
    expect(spies.createProject).toHaveBeenCalledWith({
      description: 'Apoyo local',
      name: 'Proyecto V1',
    });
  });

  it('fails closed without calling the gateway', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectManagementService(
      createAuthorization(false),
      gateway,
    );

    const result = await service.getProject(projectId);

    expect(result).toEqual({
      error: {
        code: 'forbidden',
        message: 'No tienes permiso para administrar proyectos.',
      },
      ok: false,
    });
    expect(spies.getProject).not.toHaveBeenCalled();
  });

  it('validates identifiers and list filters before infrastructure', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectManagementService(
      createAuthorization(),
      gateway,
    );

    expect(await service.assignVolunteer('bad-id', volunteerId)).toMatchObject({
      ok: false,
    });
    expect(await service.endAssignment('bad-id')).toMatchObject({ ok: false });
    expect(await service.listProjects({ limit: 101 })).toMatchObject({
      ok: false,
    });
    expect(spies.assignVolunteer).not.toHaveBeenCalled();
    expect(spies.endAssignment).not.toHaveBeenCalled();
    expect(spies.listProjects).not.toHaveBeenCalled();
  });

  it('delegates the direct assignment lifecycle and historical queries', async () => {
    const { gateway, spies } = createGateway();
    const service = new ProjectManagementService(
      createAuthorization(),
      gateway,
    );

    expect((await service.assignVolunteer(projectId, volunteerId)).ok).toBe(
      true,
    );
    expect((await service.endAssignment(assignmentId)).ok).toBe(true);
    expect((await service.listProjectAssignments(projectId)).ok).toBe(true);
    expect((await service.listVolunteerProjects(volunteerId)).ok).toBe(true);
    expect(
      (await service.searchVolunteerCandidates(projectId, ' Uno ')).ok,
    ).toBe(true);
    expect(spies.searchVolunteerCandidates).toHaveBeenCalledWith(
      projectId,
      'Uno',
    );
  });
});
