import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import type { ProjectActivityAttendance } from '../domain/project-activity-attendance';
import type { ProjectActivityAttendanceGateway } from './project-activity-attendance-gateway';
import { ProjectActivityAttendanceService } from './project-activity-attendance-service';
import type { ProjectAuthorizationPort } from './project-authorization-port';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
const attendance: ProjectActivityAttendance = {
  createdAt: '2026-09-21T14:00:00.000Z',
  participationId,
  status: 'present',
  updatedAt: '2026-09-21T14:00:00.000Z',
};
const authorization: ProjectAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function createGateway() {
  const listAttendances = vi
    .fn<ProjectActivityAttendanceGateway['listAttendances']>()
    .mockResolvedValue(success([attendance]));
  const setAttendance = vi
    .fn<ProjectActivityAttendanceGateway['setAttendance']>()
    .mockResolvedValue(success(attendance));
  return {
    gateway: { listAttendances, setAttendance },
    listAttendances,
    setAttendance,
  };
}

describe('ProjectActivityAttendanceService', () => {
  it('uses null expected status only for an initial record', async () => {
    const { gateway, setAttendance } = createGateway();
    const service = new ProjectActivityAttendanceService(
      authorization,
      gateway,
    );

    await service.setAttendance(
      projectId,
      activityId,
      participationId,
      null,
      'present',
    );

    expect(setAttendance).toHaveBeenCalledWith(
      projectId,
      activityId,
      participationId,
      null,
      'present',
    );
  });

  it('passes the currently known status when correcting', async () => {
    const { gateway, setAttendance } = createGateway();
    const service = new ProjectActivityAttendanceService(
      authorization,
      gateway,
    );

    await service.setAttendance(
      projectId,
      activityId,
      participationId,
      'present',
      'absent',
    );

    expect(setAttendance).toHaveBeenCalledWith(
      projectId,
      activityId,
      participationId,
      'present',
      'absent',
    );
  });

  it('propagates stale conflicts without reading or retrying', async () => {
    const { gateway, listAttendances, setAttendance } = createGateway();
    setAttendance.mockResolvedValue(
      failure({
        code: 'attendance-stale',
        message: 'La asistencia cambió desde la última lectura.',
      }),
    );
    const service = new ProjectActivityAttendanceService(
      authorization,
      gateway,
    );

    expect(
      await service.setAttendance(
        projectId,
        activityId,
        participationId,
        'present',
        'absent',
      ),
    ).toMatchObject({ error: { code: 'attendance-stale' }, ok: false });
    expect(setAttendance).toHaveBeenCalledOnce();
    expect(listAttendances).not.toHaveBeenCalled();
  });

  it('fails before the gateway for invalid identifiers', async () => {
    const { gateway, listAttendances, setAttendance } = createGateway();
    const service = new ProjectActivityAttendanceService(
      authorization,
      gateway,
    );

    expect(await service.listAttendances('bad-id', activityId)).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
    expect(
      await service.setAttendance(
        projectId,
        activityId,
        'bad-id',
        null,
        'present',
      ),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(listAttendances).not.toHaveBeenCalled();
    expect(setAttendance).not.toHaveBeenCalled();
  });
});
