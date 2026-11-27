import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type { ProjectActivityAttendanceGateway } from '../application/project-activity-attendance-gateway';
import { ProjectActivityAttendanceService } from '../application/project-activity-attendance-service';
import type { ProjectActivityGateway } from '../application/project-activity-gateway';
import type { ProjectActivityParticipationGateway } from '../application/project-activity-participation-gateway';
import { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import { ProjectActivityService } from '../application/project-activity-service';
import type { ProjectActivity } from '../domain/project-activity';
import { ProjectActivitiesSection } from './project-activities-section';
import { instantToLocalDateTime } from './project-activity-date-time';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const activity: ProjectActivity = {
  createdAt: '2026-08-26T14:00:00.000Z',
  description: null,
  endsAt: '2026-08-27T16:00:00.000Z',
  id: activityId,
  locationText: 'Sede vecinal',
  name: 'Actividad Comunitaria',
  projectId,
  startsAt: '2026-08-27T14:00:00.000Z',
  status: 'scheduled',
  statusChangedAt: '2026-08-26T14:00:00.000Z',
  updatedAt: '2026-08-26T14:00:00.000Z',
};
const secondActivity: ProjectActivity = {
  ...activity,
  description: 'Descripción de la segunda actividad',
  endsAt: '2026-08-28T19:00:00.000Z',
  id: '20000000-0000-4000-8000-000000000002',
  locationText: 'Otra sede',
  name: 'Segunda actividad',
  startsAt: '2026-08-28T17:00:00.000Z',
};
const authorization: ProjectAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

const participationGateway: ProjectActivityParticipationGateway = {
  createParticipation: () =>
    Promise.reject(new Error('Unexpected participation mutation')),
  finishParticipation: () =>
    Promise.reject(new Error('Unexpected participation mutation')),
  listParticipations: () => Promise.resolve(success([])),
  searchEligibleCandidates: () => Promise.resolve(success([])),
};
const participationService = new ProjectActivityParticipationService(
  authorization,
  participationGateway,
);
const attendanceGateway: ProjectActivityAttendanceGateway = {
  listAttendances: () => Promise.resolve(success([])),
  setAttendance: () =>
    Promise.reject(new Error('Unexpected attendance mutation')),
};
const attendanceService = new ProjectActivityAttendanceService(
  authorization,
  attendanceGateway,
);

function createGateway(
  overrides: Partial<ProjectActivityGateway> = {},
): ProjectActivityGateway {
  return {
    cancelProjectActivity: () =>
      Promise.resolve(success({ ...activity, status: 'cancelled' })),
    completeProjectActivity: () =>
      Promise.resolve(success({ ...activity, status: 'completed' })),
    createProjectActivity: () => Promise.resolve(success(activity)),
    getProjectActivity: () => Promise.resolve(success(activity)),
    listProjectActivities: () => Promise.resolve(success([activity])),
    updateProjectActivity: () => Promise.resolve(success(activity)),
    ...overrides,
  };
}

async function renderSection(
  gateway: ProjectActivityGateway,
  options: {
    readonly canManage?: boolean;
    readonly closed?: boolean;
    readonly projectId?: string;
    readonly strictMode?: boolean;
  } = {},
) {
  const i18n = await createI18n();
  const service = new ProjectActivityService(authorization, gateway);
  const section = (current: typeof options) => {
    const content = (
      <I18nextProvider i18n={i18n}>
        <ProjectActivitiesSection
          attendanceService={attendanceService}
          canManage={current.canManage ?? true}
          participationService={participationService}
          projectId={current.projectId ?? projectId}
          projectStatus={current.closed ? 'closed' : 'active'}
          service={service}
        />
      </I18nextProvider>
    );
    return current.strictMode ? <StrictMode>{content}</StrictMode> : content;
  };
  const view = render(section(options));
  return {
    ...view,
    rerenderSection: (next: typeof options) => {
      view.rerender(section({ ...options, ...next }));
    },
  };
}

function editActivityButton(name: string) {
  return within(
    screen.getByRole('row', { name: new RegExp(name, 'u') }),
  ).getByRole<HTMLButtonElement>('button', { name: 'Editar' });
}

function expectActivityFields(expected: ProjectActivity) {
  const fields = [
    ['Nombre de la actividad', expected.name],
    ['Descripción (opcional)', expected.description ?? ''],
    ['Inicio', instantToLocalDateTime(expected.startsAt)],
    [
      'Fin (opcional)',
      expected.endsAt ? instantToLocalDateTime(expected.endsAt) : '',
    ],
    ['Ubicación (opcional)', expected.locationText ?? ''],
  ] as const;
  for (const [label, value] of fields) {
    expect(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label)
        .value,
    ).toBe(value);
  }
}

function pendingActivityResult() {
  let complete: ((result: Result<ProjectActivity>) => void) | undefined;
  const promise = new Promise<Result<ProjectActivity>>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve: (result: Result<ProjectActivity>) => {
      if (!complete) throw new Error('Missing pending activity resolver');
      complete(result);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectActivitiesSection', () => {
  it('replaces every field when selecting B after editing A and saves only B', async () => {
    const user = userEvent.setup();
    const createProjectActivity =
      vi.fn<ProjectActivityGateway['createProjectActivity']>();
    const updateProjectActivity = vi
      .fn<ProjectActivityGateway['updateProjectActivity']>()
      .mockResolvedValue(success(secondActivity));
    await renderSection(
      createGateway({
        createProjectActivity,
        listProjectActivities: () =>
          Promise.resolve(success([activity, secondActivity])),
        updateProjectActivity,
      }),
    );
    await screen.findByText(secondActivity.name);
    await user.click(editActivityButton(activity.name));
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        'Nombre de la actividad',
      ),
      {
        target: { value: 'Borrador exclusivo A' },
      },
    );
    await user.click(editActivityButton(secondActivity.name));
    expectActivityFields(secondActivity);
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    await waitFor(() => {
      expect(updateProjectActivity).toHaveBeenCalledExactlyOnceWith({
        activityId: secondActivity.id,
        description: secondActivity.description,
        endsAt: secondActivity.endsAt,
        locationText: secondActivity.locationText,
        name: secondActivity.name,
        projectId,
        startsAt: secondActivity.startsAt,
      });
    });
    expect(createProjectActivity).not.toHaveBeenCalled();
  });

  it.each(['create', 'edit'] as const)(
    'discards a %s draft and validation errors when selecting B',
    async (mode) => {
      const user = userEvent.setup();
      await renderSection(
        createGateway({
          listProjectActivities: () =>
            Promise.resolve(success([activity, secondActivity])),
        }),
      );
      await screen.findByText(secondActivity.name);
      await user.click(
        mode === 'create'
          ? screen.getByRole<HTMLButtonElement>('button', {
              name: 'Crear actividad',
            })
          : editActivityButton(activity.name),
      );
      fireEvent.change(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
          'Nombre de la actividad',
        ),
        {
          target: { value: 'Borrador sin guardar' },
        },
      );
      fireEvent.change(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>('Inicio'),
        {
          target: { value: '' },
        },
      );
      const form = screen.getByRole('form', {
        name: mode === 'create' ? 'Crear actividad' : 'Editar actividad',
      });
      fireEvent.submit(form);
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      await user.click(editActivityButton(secondActivity.name));
      expectActivityFields(secondActivity);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('starts a clean creation after cancelling an edit and uses create', async () => {
    const user = userEvent.setup();
    const createProjectActivity = vi
      .fn<ProjectActivityGateway['createProjectActivity']>()
      .mockResolvedValue(success(secondActivity));
    const updateProjectActivity =
      vi.fn<ProjectActivityGateway['updateProjectActivity']>();
    await renderSection(
      createGateway({ createProjectActivity, updateProjectActivity }),
    );
    await screen.findByText(activity.name);
    await user.click(editActivityButton(activity.name));
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Volver' }),
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Crear actividad',
      }),
    );
    for (const label of [
      'Nombre de la actividad',
      'Descripción (opcional)',
      'Inicio',
      'Fin (opcional)',
      'Ubicación (opcional)',
    ]) {
      expect(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label)
          .value,
      ).toBe('');
    }
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        'Nombre de la actividad',
      ),
      {
        target: { value: 'Nueva actividad' },
      },
    );
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>('Inicio'),
      {
        target: { value: instantToLocalDateTime(secondActivity.startsAt) },
      },
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    await waitFor(() => {
      expect(createProjectActivity).toHaveBeenCalledExactlyOnceWith({
        description: null,
        endsAt: null,
        locationText: null,
        name: 'Nueva actividad',
        projectId,
        startsAt: secondActivity.startsAt,
      });
    });
    expect(updateProjectActivity).not.toHaveBeenCalled();
  });

  it('does not inherit a server error when changing from A to B', async () => {
    const user = userEvent.setup();
    const updateProjectActivity = vi
      .fn<ProjectActivityGateway['updateProjectActivity']>()
      .mockResolvedValue(
        failure({ code: 'conflict', message: 'Error exclusivo A' }),
      );
    await renderSection(
      createGateway({
        listProjectActivities: () =>
          Promise.resolve(success([activity, secondActivity])),
        updateProjectActivity,
      }),
    );
    await screen.findByText(secondActivity.name);
    await user.click(editActivityButton(activity.name));
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    await screen.findByText('Error exclusivo A');
    await user.click(editActivityButton(secondActivity.name));
    expectActivityFields(secondActivity);
    expect(screen.queryByText('Error exclusivo A')).toBeNull();
  });

  it.each(['success', 'failure'] as const)(
    'ignores a late %s from A without closing or changing B',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingActivityResult();
      const updateProjectActivity = vi
        .fn<ProjectActivityGateway['updateProjectActivity']>()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(success(secondActivity));
      const listProjectActivities = vi
        .fn<ProjectActivityGateway['listProjectActivities']>()
        .mockResolvedValue(success([activity, secondActivity]));
      await renderSection(
        createGateway({ listProjectActivities, updateProjectActivity }),
      );
      await screen.findByText(secondActivity.name);
      await user.click(editActivityButton(activity.name));
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }),
      );
      await waitFor(() => {
        expect(updateProjectActivity).toHaveBeenCalledOnce();
      });
      await user.click(editActivityButton(secondActivity.name));
      expectActivityFields(secondActivity);
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }).disabled,
      ).toBe(false);
      fireEvent.change(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
          'Nombre de la actividad',
        ),
        {
          target: { value: 'Borrador B vigente' },
        },
      );
      const loadsBefore = listProjectActivities.mock.calls.length;
      await act(async () => {
        pending.resolve(
          outcome === 'success'
            ? success(activity)
            : failure({ code: 'conflict', message: 'Respuesta antigua A' }),
        );
        await pending.promise;
      });
      expect(
        screen.getByRole('form', { name: 'Editar actividad' }),
      ).not.toBeNull();
      expect(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
          'Nombre de la actividad',
        ).value,
      ).toBe('Borrador B vigente');
      expect(screen.queryByText('Respuesta antigua A')).toBeNull();
      expect(screen.queryByText('Actividad guardada.')).toBeNull();
      expect(listProjectActivities).toHaveBeenCalledTimes(loadsBefore);
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }),
      );
      await waitFor(() => {
        expect(updateProjectActivity).toHaveBeenCalledTimes(2);
      });
      expect(updateProjectActivity.mock.calls[0]?.[0].activityId).toBe(
        activity.id,
      );
      expect(updateProjectActivity.mock.calls[1]?.[0].activityId).toBe(
        secondActivity.id,
      );
      expect(updateProjectActivity.mock.calls[1]?.[0].name).toBe(
        'Borrador B vigente',
      );
    },
  );

  it('discards edits when cancelling and reopening the same activity', async () => {
    const user = userEvent.setup();
    await renderSection(createGateway());
    await screen.findByText(activity.name);
    await user.click(editActivityButton(activity.name));
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        'Nombre de la actividad',
      ),
      {
        target: { value: 'Borrador descartado' },
      },
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Volver' }),
    );
    await user.click(editActivityButton(activity.name));
    expectActivityFields(activity);
  });

  it.each(['success', 'failure'] as const)(
    'ignores an old %s after returning to the same activity',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingActivityResult();
      const currentPending = pendingActivityResult();
      const updateProjectActivity = vi
        .fn<ProjectActivityGateway['updateProjectActivity']>()
        .mockReturnValueOnce(pending.promise)
        .mockReturnValueOnce(currentPending.promise);
      const listProjectActivities = vi
        .fn<ProjectActivityGateway['listProjectActivities']>()
        .mockResolvedValue(success([activity, secondActivity]));
      await renderSection(
        createGateway({ listProjectActivities, updateProjectActivity }),
      );
      await screen.findByText(secondActivity.name);
      await user.click(editActivityButton(activity.name));
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }),
      );
      await waitFor(() => {
        expect(updateProjectActivity).toHaveBeenCalledOnce();
      });
      await user.click(editActivityButton(secondActivity.name));
      await user.click(editActivityButton(activity.name));
      fireEvent.change(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
          'Nombre de la actividad',
        ),
        {
          target: { value: 'Nueva edición A' },
        },
      );
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }).disabled,
      ).toBe(false);
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }),
      );
      await waitFor(() => {
        expect(updateProjectActivity).toHaveBeenCalledTimes(2);
      });
      const loadsBefore = listProjectActivities.mock.calls.length;
      await act(async () => {
        pending.resolve(
          outcome === 'success'
            ? success(activity)
            : failure({
                code: 'conflict',
                message: 'Error de edición anterior',
              }),
        );
        await pending.promise;
      });
      expect(
        screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
          'Nombre de la actividad',
        ).value,
      ).toBe('Nueva edición A');
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardando…',
        }).disabled,
      ).toBe(true);
      expect(screen.queryByText('Error de edición anterior')).toBeNull();
      expect(screen.queryByText('Actividad guardada.')).toBeNull();
      expect(listProjectActivities).toHaveBeenCalledTimes(loadsBefore);
      expect(updateProjectActivity.mock.calls[1]?.[0]).toMatchObject({
        activityId: activity.id,
        name: 'Nueva edición A',
        projectId,
      });
      await act(async () => {
        currentPending.resolve(
          success({ ...activity, name: 'Nueva edición A' }),
        );
        await currentPending.promise;
      });
      expect(await screen.findByText('Actividad guardada.')).not.toBeNull();
    },
  );

  it('keeps editor lifecycle guards working in StrictMode', async () => {
    const user = userEvent.setup();
    const updateProjectActivity = vi
      .fn<ProjectActivityGateway['updateProjectActivity']>()
      .mockResolvedValue(success(secondActivity));
    await renderSection(
      createGateway({
        listProjectActivities: () =>
          Promise.resolve(success([activity, secondActivity])),
        updateProjectActivity,
      }),
      { strictMode: true },
    );
    await screen.findByText(secondActivity.name);
    await user.click(editActivityButton(activity.name));
    await user.click(editActivityButton(secondActivity.name));
    expectActivityFields(secondActivity);
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    expect(await screen.findByText('Actividad guardada.')).not.toBeNull();
    expect(updateProjectActivity).toHaveBeenCalledOnce();
    expect(updateProjectActivity.mock.calls[0]?.[0].activityId).toBe(
      secondActivity.id,
    );
  });

  it('prevents duplicate synchronous submissions from the same editor', async () => {
    const user = userEvent.setup();
    const pending = pendingActivityResult();
    const updateProjectActivity = vi
      .fn<ProjectActivityGateway['updateProjectActivity']>()
      .mockReturnValue(pending.promise);
    await renderSection(createGateway({ updateProjectActivity }));
    await screen.findByText(activity.name);
    await user.click(editActivityButton(activity.name));
    const form = screen.getByRole('form', { name: 'Editar actividad' });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(updateProjectActivity).toHaveBeenCalledOnce();
    });
    await act(async () => {
      pending.resolve(success(activity));
      await pending.promise;
    });
  });

  it.each(['success', 'failure'] as const)(
    'isolates another project from an old %s response',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingActivityResult();
      const otherProjectId = '10000000-0000-4000-8000-000000000002';
      const otherActivity = { ...secondActivity, projectId: otherProjectId };
      const updateProjectActivity = vi
        .fn<ProjectActivityGateway['updateProjectActivity']>()
        .mockReturnValue(pending.promise);
      const { rerenderSection } = await renderSection(
        createGateway({
          listProjectActivities: (requestedId) =>
            Promise.resolve(
              success(requestedId === projectId ? [activity] : [otherActivity]),
            ),
          updateProjectActivity,
        }),
      );
      await screen.findByText(activity.name);
      await user.click(editActivityButton(activity.name));
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Guardar actividad',
        }),
      );
      await waitFor(() => {
        expect(updateProjectActivity).toHaveBeenCalledOnce();
      });
      rerenderSection({ projectId: otherProjectId });
      await screen.findByText(otherActivity.name);
      expect(
        screen.queryByRole('form', { name: 'Editar actividad' }),
      ).toBeNull();
      await user.click(editActivityButton(otherActivity.name));
      expectActivityFields(otherActivity);
      await act(async () => {
        pending.resolve(
          outcome === 'success'
            ? success(activity)
            : failure({ code: 'conflict', message: 'Error de otro proyecto' }),
        );
        await pending.promise;
      });
      expectActivityFields(otherActivity);
      expect(screen.queryByText('Error de otro proyecto')).toBeNull();
      expect(screen.queryByText('Actividad guardada.')).toBeNull();
    },
  );

  it.each([{ closed: true }, { canManage: false }])(
    'removes an open editor when access changes to %j',
    async (next) => {
      const user = userEvent.setup();
      const updateProjectActivity =
        vi.fn<ProjectActivityGateway['updateProjectActivity']>();
      const { rerenderSection } = await renderSection(
        createGateway({ updateProjectActivity }),
      );
      await screen.findByText(activity.name);
      await user.click(editActivityButton(activity.name));
      rerenderSection(next);
      expect(
        screen.queryByRole('form', { name: 'Editar actividad' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar actividad' }),
      ).toBeNull();
      expect(updateProjectActivity).not.toHaveBeenCalled();
    },
  );

  it.each(['completed', 'cancelled'] as const)(
    'removes the editor when its activity becomes %s',
    async (status) => {
      const user = userEvent.setup();
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      const listProjectActivities = vi
        .fn<ProjectActivityGateway['listProjectActivities']>()
        .mockResolvedValueOnce(success([activity]))
        .mockResolvedValue(success([{ ...activity, status }]));
      await renderSection(createGateway({ listProjectActivities }));
      await screen.findByText(activity.name);
      await user.click(editActivityButton(activity.name));
      await user.click(
        screen.getByRole<HTMLButtonElement>('button', {
          name: status === 'completed' ? 'Completar' : 'Cancelar',
        }),
      );
      await screen.findByText('Histórico de solo lectura');
      expect(
        screen.queryByRole('form', { name: 'Editar actividad' }),
      ).toBeNull();
    },
  );

  it('renders loading then an accessible empty state', async () => {
    await renderSection(
      createGateway({
        listProjectActivities: () => Promise.resolve(success([])),
      }),
    );

    expect(screen.getByRole('status')).not.toBeNull();
    expect(
      await screen.findByText(
        'No existen actividades registradas para este proyecto.',
      ),
    ).not.toBeNull();
  });

  it('shows a bounded error instead of malformed project content', async () => {
    await renderSection(
      createGateway({
        listProjectActivities: () =>
          Promise.resolve(
            failure({
              code: 'unexpected',
              message: 'No fue posible cargar las actividades.',
            }),
          ),
      }),
    );

    expect(
      await screen.findByText('No fue posible cargar las actividades.'),
    ).not.toBeNull();
  });

  it('validates dates, prevents duplicate submit and creates through application', async () => {
    const user = userEvent.setup();
    let resolveCreate:
      | ((value: ReturnType<typeof success<ProjectActivity>>) => void)
      | undefined;
    const createProjectActivity = vi
      .fn<ProjectActivityGateway['createProjectActivity']>()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );
    await renderSection(
      createGateway({
        createProjectActivity,
        listProjectActivities: () => Promise.resolve(success([])),
      }),
    );
    await screen.findByText(
      'No existen actividades registradas para este proyecto.',
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Crear actividad',
      }),
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        'Nombre de la actividad',
      ),
      'Jornada',
    );
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>('Inicio'),
      {
        target: { value: '2026-08-27T10:00' },
      },
    );
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        /^Fin \(opcional\)/u,
      ),
      {
        target: { value: '2026-08-27T09:00' },
      },
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    expect(
      await screen.findByText(
        'La fecha de fin no puede ser anterior al inicio.',
      ),
    ).not.toBeNull();
    expect(createProjectActivity).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(
        /^Fin \(opcional\)/u,
      ),
      {
        target: { value: '2026-08-27T11:00' },
      },
    );
    await user.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar actividad',
      }),
    );
    const form = screen
      .getByRole('heading', { name: 'Crear actividad' })
      .closest('form');
    expect(form).not.toBeNull();
    if (!form) throw new Error('Activity form is missing');
    const savingButton = within(form).getByRole<HTMLButtonElement>('button', {
      name: 'Guardando…',
    });
    expect(savingButton.disabled).toBe(true);
    fireEvent.submit(form);
    expect(createProjectActivity).toHaveBeenCalledOnce();
    resolveCreate?.(success(activity));
    expect(await screen.findByText('Actividad guardada.')).not.toBeNull();
  });

  it('keeps terminal and closed project activities read-only', async () => {
    const { rerender } = await renderSection(
      createGateway({
        listProjectActivities: () =>
          Promise.resolve(success([{ ...activity, status: 'completed' }])),
      }),
    );
    expect(await screen.findByText('Completada')).not.toBeNull();
    expect(screen.getByText('Histórico de solo lectura')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull();

    const i18n = await createI18n();
    rerender(
      <I18nextProvider i18n={i18n}>
        <ProjectActivitiesSection
          attendanceService={attendanceService}
          canManage
          participationService={participationService}
          projectId={projectId}
          projectStatus="closed"
          service={
            new ProjectActivityService(
              authorization,
              createGateway({
                listProjectActivities: () =>
                  Promise.resolve(success([activity])),
              }),
            )
          }
        />
      </I18nextProvider>,
    );
    expect(await screen.findByText('Programada')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Crear actividad' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});
