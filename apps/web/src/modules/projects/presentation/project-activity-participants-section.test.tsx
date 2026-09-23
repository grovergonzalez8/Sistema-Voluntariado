import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectActivityAttendanceGateway } from '../application/project-activity-attendance-gateway';
import { ProjectActivityAttendanceService } from '../application/project-activity-attendance-service';
import type { ProjectActivityParticipationGateway } from '../application/project-activity-participation-gateway';
import { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type { ProjectActivityParticipation } from '../domain/project-activity-participation';
import type { ProjectActivityAttendance } from '../domain/project-activity-attendance';
import type { ProjectActivity } from '../domain/project-activity';
import { ProjectActivityParticipantsSection } from './project-activity-participants-section';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const volunteerId = '30000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
const secondParticipationId = '40000000-0000-4000-8000-000000000002';
const activity: ProjectActivity = {
  createdAt: '2026-09-02T13:00:00.000Z',
  description: null,
  endsAt: null,
  id: activityId,
  locationText: null,
  name: 'Jornada Comunitaria',
  projectId,
  startsAt: '2026-09-03T14:00:00.000Z',
  status: 'scheduled',
  statusChangedAt: '2026-09-02T13:00:00.000Z',
  updatedAt: '2026-09-02T13:00:00.000Z',
};
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
const attendance: ProjectActivityAttendance = {
  createdAt: '2026-09-21T14:00:00.000Z',
  participationId,
  status: 'present',
  updatedAt: '2026-09-21T14:00:00.000Z',
};
const secondParticipation: ProjectActivityParticipation = {
  ...participation,
  participationId: secondParticipationId,
  volunteerId: '30000000-0000-4000-8000-000000000002',
  volunteerName: 'Bea Volunteer',
};
const secondAttendance: ProjectActivityAttendance = {
  ...attendance,
  participationId: secondParticipationId,
};
const authorization: ProjectAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function createGateway(
  overrides: Partial<ProjectActivityParticipationGateway> = {},
): ProjectActivityParticipationGateway {
  return {
    createParticipation: () => Promise.resolve(success(participation)),
    finishParticipation: () =>
      Promise.resolve(
        success({ ...participation, endedAt: '2026-09-02T15:00:00.000Z' }),
      ),
    listParticipations: () => Promise.resolve(success([participation])),
    searchEligibleCandidates: () =>
      Promise.resolve(
        success([{ volunteerId, volunteerName: 'Ana Volunteer' }]),
      ),
    ...overrides,
  };
}

function createAttendanceGateway(
  overrides: Partial<ProjectActivityAttendanceGateway> = {},
): ProjectActivityAttendanceGateway {
  return {
    listAttendances: () => Promise.resolve(success([])),
    setAttendance: () => Promise.resolve(success(attendance)),
    ...overrides,
  };
}

async function renderSection(
  gateway: ProjectActivityParticipationGateway,
  options: {
    readonly activityStatus?: ProjectActivity['status'];
    readonly attendanceGateway?: ProjectActivityAttendanceGateway;
    readonly canManage?: boolean;
    readonly projectStatus?: 'active' | 'closed';
  } = {},
) {
  const i18n = await createI18n();
  return render(
    <I18nextProvider i18n={i18n}>
      <ProjectActivityParticipantsSection
        activity={{
          ...activity,
          status: options.activityStatus ?? 'scheduled',
        }}
        canManage={options.canManage ?? true}
        attendanceService={
          new ProjectActivityAttendanceService(
            authorization,
            options.attendanceGateway ?? createAttendanceGateway(),
          )
        }
        projectId={projectId}
        projectStatus={options.projectStatus ?? 'active'}
        service={
          new ProjectActivityParticipationService(authorization, gateway)
        }
      />
    </I18nextProvider>,
  );
}

describe('ProjectActivityParticipantsSection', () => {
  it('searches eligible candidates, adds and finishes without exposing PII', async () => {
    const user = userEvent.setup();
    const createParticipation = vi
      .fn<ProjectActivityParticipationGateway['createParticipation']>()
      .mockResolvedValue(success(participation));
    const finishParticipation = vi
      .fn<ProjectActivityParticipationGateway['finishParticipation']>()
      .mockResolvedValue(
        success({ ...participation, endedAt: '2026-09-02T15:00:00.000Z' }),
      );
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await renderSection(
      createGateway({ createParticipation, finishParticipation }),
    );

    expect(await screen.findByText('Ana Volunteer')).not.toBeNull();
    const search = screen.getByLabelText(
      'Buscar voluntario asignado por nombre',
    );
    await user.type(search, 'Ana');
    const form = search.closest('form');
    expect(form).not.toBeNull();
    if (!form) throw new Error('Participation candidate form is missing');
    await user.click(within(form).getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    expect(createParticipation).toHaveBeenCalledWith(
      projectId,
      activityId,
      volunteerId,
    );
    await user.click(
      screen.getByRole('button', { name: 'Finalizar participación' }),
    );
    expect(finishParticipation).toHaveBeenCalledWith(
      projectId,
      activityId,
      participationId,
    );
    expect(screen.queryByText(/correo|teléfono|celular/iu)).toBeNull();
    expect(
      screen.queryByText(new RegExp(volunteerId.slice(0, 8), 'u')),
    ).toBeNull();
  });

  it.each([
    ['completed', 'active'],
    ['cancelled', 'active'],
    ['scheduled', 'closed'],
  ] as const)(
    'keeps %s activity in %s project historical and read-only',
    async (activityStatus, projectStatus) => {
      await renderSection(createGateway(), { activityStatus, projectStatus });

      expect(
        await screen.findByText('Histórica; no finalizada explícitamente'),
      ).not.toBeNull();
      expect(
        screen.queryByLabelText('Buscar voluntario asignado por nombre'),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Finalizar participación' }),
      ).toBeNull();
    },
  );

  it('removes loaded candidate actions when the activity becomes terminal', async () => {
    const user = userEvent.setup();
    const gateway = createGateway();
    const service = new ProjectActivityParticipationService(
      authorization,
      gateway,
    );
    const attendanceService = new ProjectActivityAttendanceService(
      authorization,
      createAttendanceGateway(),
    );
    const i18n = await createI18n();
    const renderParticipants = (activityStatus: ProjectActivity['status']) => (
      <I18nextProvider i18n={i18n}>
        <ProjectActivityParticipantsSection
          activity={{ ...activity, status: activityStatus }}
          canManage
          attendanceService={attendanceService}
          projectId={projectId}
          projectStatus="active"
          service={service}
        />
      </I18nextProvider>
    );
    const view = render(renderParticipants('scheduled'));

    const search = await screen.findByLabelText(
      'Buscar voluntario asignado por nombre',
    );
    const form = search.closest('form');
    expect(form).not.toBeNull();
    if (!form) throw new Error('Participation candidate form is missing');
    await user.click(within(form).getByRole('button', { name: 'Buscar' }));
    expect(
      await screen.findByRole('button', { name: 'Agregar' }),
    ).not.toBeNull();

    view.rerender(renderParticipants('completed'));

    expect(screen.queryByRole('button', { name: 'Agregar' })).toBeNull();
    expect(
      screen.queryByLabelText('Buscar voluntario asignado por nombre'),
    ).toBeNull();
  });

  it('shows a bounded loading failure', async () => {
    await renderSection(
      createGateway({
        listParticipations: () =>
          Promise.resolve(
            failure({
              code: 'unexpected',
              message: 'No fue posible cargar participantes.',
            }),
          ),
      }),
    );

    expect(
      await screen.findByText('No fue posible cargar participantes.'),
    ).not.toBeNull();
  });

  it('keeps loading explicit and never presents a pending read as unregistered', async () => {
    let resolveAttendance:
      | ((
          value: ReturnType<
            typeof success<readonly ProjectActivityAttendance[]>
          >,
        ) => void)
      | undefined;
    await renderSection(createGateway(), {
      activityStatus: 'completed',
      attendanceGateway: createAttendanceGateway({
        listAttendances: () =>
          new Promise((resolve) => {
            resolveAttendance = resolve;
          }),
      }),
    });

    expect(
      screen.getByText('Cargando participantes y asistencia…'),
    ).not.toBeNull();
    expect(screen.queryByText('Sin registrar')).toBeNull();
    await waitFor(() => {
      expect(resolveAttendance).toBeDefined();
    });
    resolveAttendance?.(success([]));
    expect(await screen.findByText('Sin registrar')).not.toBeNull();
  });

  it('shows attendance read failure instead of unregistered', async () => {
    await renderSection(createGateway(), {
      activityStatus: 'completed',
      attendanceGateway: createAttendanceGateway({
        listAttendances: () =>
          Promise.resolve(
            failure({
              code: 'unexpected',
              message: 'No fue posible cargar la asistencia.',
            }),
          ),
      }),
    });

    expect(
      await screen.findByText('No fue posible cargar la asistencia.'),
    ).not.toBeNull();
    expect(screen.queryByText('Sin registrar')).toBeNull();
  });

  it.each([
    ['present', 'Presente', 'Corregir a Ausente'],
    ['absent', 'Ausente', 'Corregir a Presente'],
  ] as const)(
    'renders %s with its available correction action',
    async (status, label, correction) => {
      await renderSection(createGateway(), {
        activityStatus: 'completed',
        attendanceGateway: createAttendanceGateway({
          listAttendances: () =>
            Promise.resolve(success([{ ...attendance, status }])),
        }),
      });

      expect(await screen.findByText(label)).not.toBeNull();
      expect(screen.getByRole('button', { name: correction })).not.toBeNull();
    },
  );

  it('records with null, corrects with current status and blocks duplicate submit', async () => {
    const user = userEvent.setup();
    let resolveSet:
      | ((value: ReturnType<typeof success<ProjectActivityAttendance>>) => void)
      | undefined;
    const setAttendance = vi
      .fn<ProjectActivityAttendanceGateway['setAttendance']>()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSet = resolve;
          }),
      );
    await renderSection(createGateway(), {
      activityStatus: 'completed',
      attendanceGateway: createAttendanceGateway({ setAttendance }),
    });

    await screen.findByText('Sin registrar');
    const markPresent = screen.getByRole('button', {
      name: 'Marcar Presente',
    });
    expect(
      screen.getByRole('button', { name: 'Marcar Ausente' }),
    ).not.toBeNull();
    await user.click(markPresent);
    expect((markPresent as HTMLButtonElement).disabled).toBe(true);
    await user.click(markPresent);
    expect(setAttendance).toHaveBeenCalledOnce();
    expect(setAttendance).toHaveBeenCalledWith(
      projectId,
      activityId,
      participationId,
      null,
      'present',
    );
    resolveSet?.(success(attendance));

    const correctAbsent = await screen.findByRole('button', {
      name: 'Corregir a Ausente',
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(correctAbsent);
    });
    setAttendance.mockResolvedValue(
      success({ ...attendance, status: 'absent' }),
    );
    await user.click(correctAbsent);
    expect(setAttendance).toHaveBeenLastCalledWith(
      projectId,
      activityId,
      participationId,
      'present',
      'absent',
    );
    expect(await screen.findByText('Ausente')).not.toBeNull();
    const correctPresent = screen.getByRole('button', {
      name: 'Corregir a Presente',
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(correctPresent);
    });
  });

  it('refreshes authoritative state after stale conflict without retrying the mutation', async () => {
    const user = userEvent.setup();
    const listAttendances = vi
      .fn<ProjectActivityAttendanceGateway['listAttendances']>()
      .mockResolvedValueOnce(success([attendance]))
      .mockResolvedValueOnce(success([{ ...attendance, status: 'absent' }]));
    const setAttendance = vi
      .fn<ProjectActivityAttendanceGateway['setAttendance']>()
      .mockResolvedValue(
        failure({
          code: 'attendance-stale',
          message: 'La asistencia cambió.',
        }),
      );
    await renderSection(createGateway(), {
      activityStatus: 'completed',
      attendanceGateway: createAttendanceGateway({
        listAttendances,
        setAttendance,
      }),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Corregir a Ausente' }),
    );

    expect(setAttendance).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(
        'La asistencia cambió desde que se cargó. Se muestra el estado actual del servidor.',
      ),
    ).not.toBeNull();
    expect(await screen.findByText('Ausente')).not.toBeNull();
    expect(listAttendances).toHaveBeenCalledTimes(2);
    const correction = screen.getByRole('button', {
      name: 'Corregir a Presente',
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(correction);
    });
  });

  it('restarts a stale refresh invalidated by a newer mutation and clears loading', async () => {
    const user = userEvent.setup();
    let resolveFirstSet:
      ((value: Result<ProjectActivityAttendance>) => void) | undefined;
    let resolveSecondSet:
      ((value: Result<ProjectActivityAttendance>) => void) | undefined;
    let resolveFirstRefresh:
      | ((value: Result<readonly ProjectActivityAttendance[]>) => void)
      | undefined;
    let resolveSecondRefresh:
      | ((value: Result<readonly ProjectActivityAttendance[]>) => void)
      | undefined;
    const listAttendances = vi
      .fn<ProjectActivityAttendanceGateway['listAttendances']>()
      .mockResolvedValueOnce(success([attendance, secondAttendance]))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRefresh = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRefresh = resolve;
          }),
      );
    const setAttendance = vi
      .fn<ProjectActivityAttendanceGateway['setAttendance']>()
      .mockImplementation(
        (_projectId, _activityId, requestedParticipationId) =>
          requestedParticipationId === participationId
            ? new Promise((resolve) => {
                resolveFirstSet = resolve;
              })
            : new Promise((resolve) => {
                resolveSecondSet = resolve;
              }),
      );
    await renderSection(
      createGateway({
        listParticipations: () =>
          Promise.resolve(success([participation, secondParticipation])),
      }),
      {
        activityStatus: 'completed',
        attendanceGateway: createAttendanceGateway({
          listAttendances,
          setAttendance,
        }),
      },
    );

    const firstRow = await screen.findByRole('row', {
      name: /Ana Volunteer/u,
    });
    const secondRow = screen.getByRole('row', { name: /Bea Volunteer/u });
    await user.click(
      within(firstRow).getByRole('button', { name: 'Corregir a Ausente' }),
    );
    await user.click(
      within(secondRow).getByRole('button', { name: 'Corregir a Ausente' }),
    );
    await waitFor(() => {
      expect(resolveFirstSet).toBeDefined();
      expect(resolveSecondSet).toBeDefined();
    });

    resolveFirstSet?.(
      failure({
        code: 'attendance-stale',
        message: 'La asistencia cambió.',
      }),
    );
    await waitFor(() => {
      expect(resolveFirstRefresh).toBeDefined();
    });
    resolveSecondSet?.(success({ ...secondAttendance, status: 'absent' }));
    resolveFirstRefresh?.(
      success([{ ...attendance, status: 'absent' }, secondAttendance]),
    );
    await waitFor(() => {
      expect(resolveSecondRefresh).toBeDefined();
    });
    resolveSecondRefresh?.(
      success([
        { ...attendance, status: 'absent' },
        { ...secondAttendance, status: 'absent' },
      ]),
    );

    expect(await screen.findAllByText('Ausente')).toHaveLength(2);
    expect(
      screen.queryByText('Cargando participantes y asistencia…'),
    ).toBeNull();
    expect(listAttendances).toHaveBeenCalledTimes(3);
    expect(setAttendance).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['scheduled', 'active', true],
    ['cancelled', 'active', true],
    ['completed', 'closed', true],
    ['completed', 'active', false],
  ] as const)(
    'keeps attendance read-only for %s activity in %s project (manage=%s)',
    async (activityStatus, projectStatus, canManage) => {
      await renderSection(createGateway(), {
        activityStatus,
        attendanceGateway: createAttendanceGateway({
          listAttendances: () => Promise.resolve(success([attendance])),
        }),
        canManage,
        projectStatus,
      });

      expect(await screen.findByText('Presente')).not.toBeNull();
      expect(screen.getByText('Asistencia de solo lectura')).not.toBeNull();
      expect(
        screen.queryByRole('button', { name: /Marcar|Corregir/u }),
      ).toBeNull();
    },
  );

  it('keeps a finalized participation eligible for attendance in an active completed activity', async () => {
    await renderSection(
      createGateway({
        listParticipations: () =>
          Promise.resolve(
            success([
              {
                ...participation,
                endedAt: '2026-09-02T15:00:00.000Z',
              },
            ]),
          ),
      }),
      {
        activityStatus: 'completed',
      },
    );

    expect(await screen.findByText('Sin registrar')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Marcar Presente' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Marcar Ausente' }),
    ).not.toBeNull();
  });

  it.each([
    ['scheduled', 'active'],
    ['cancelled', 'active'],
    ['completed', 'closed'],
  ] as const)(
    'keeps missing attendance explicitly unregistered and read-only for %s activity in %s project',
    async (activityStatus, projectStatus) => {
      await renderSection(createGateway(), {
        activityStatus,
        attendanceGateway: createAttendanceGateway(),
        projectStatus,
      });

      expect(await screen.findByText('Sin registrar')).not.toBeNull();
      expect(screen.getByText('Asistencia de solo lectura')).not.toBeNull();
      expect(
        screen.queryByRole('button', { name: /Marcar|Corregir/u }),
      ).toBeNull();
    },
  );

  it('ignores an older attendance read that returns after a newer activity read', async () => {
    const secondActivityId = '20000000-0000-4000-8000-000000000002';
    let resolveFirst:
      | ((
          value: ReturnType<
            typeof success<readonly ProjectActivityAttendance[]>
          >,
        ) => void)
      | undefined;
    const listAttendances = vi
      .fn<ProjectActivityAttendanceGateway['listAttendances']>()
      .mockImplementation((_projectId, requestedActivityId) =>
        requestedActivityId === activityId
          ? new Promise((resolve) => {
              resolveFirst = resolve;
            })
          : Promise.resolve(success([{ ...attendance, status: 'absent' }])),
      );
    const attendanceService = new ProjectActivityAttendanceService(
      authorization,
      createAttendanceGateway({ listAttendances }),
    );
    const participationService = new ProjectActivityParticipationService(
      authorization,
      createGateway(),
    );
    const i18n = await createI18n();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <ProjectActivityParticipantsSection
          activity={{ ...activity, status: 'completed' }}
          attendanceService={attendanceService}
          canManage
          projectId={projectId}
          projectStatus="active"
          service={participationService}
        />
      </I18nextProvider>,
    );

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ProjectActivityParticipantsSection
          activity={{
            ...activity,
            id: secondActivityId,
            status: 'completed',
          }}
          attendanceService={attendanceService}
          canManage
          projectId={projectId}
          projectStatus="active"
          service={participationService}
        />
      </I18nextProvider>,
    );

    expect(await screen.findByText('Ausente')).not.toBeNull();
    resolveFirst?.(success([attendance]));
    await Promise.resolve();
    expect(screen.getByText('Ausente')).not.toBeNull();
    expect(screen.queryByText('Presente')).toBeNull();
  });
});
