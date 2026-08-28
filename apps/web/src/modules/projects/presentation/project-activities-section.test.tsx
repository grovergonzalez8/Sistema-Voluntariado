import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type { ProjectActivityGateway } from '../application/project-activity-gateway';
import { ProjectActivityService } from '../application/project-activity-service';
import type { ProjectActivity } from '../domain/project-activity';
import { ProjectActivitiesSection } from './project-activities-section';

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
const authorization: ProjectAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

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
  options: { readonly canManage?: boolean; readonly closed?: boolean } = {},
) {
  const i18n = await createI18n();
  return render(
    <I18nextProvider i18n={i18n}>
      <ProjectActivitiesSection
        canManage={options.canManage ?? true}
        projectId={projectId}
        projectStatus={options.closed ? 'closed' : 'active'}
        service={new ProjectActivityService(authorization, gateway)}
      />
    </I18nextProvider>,
  );
}

describe('ProjectActivitiesSection', () => {
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
    await user.click(screen.getByRole('button', { name: 'Crear actividad' }));
    await user.type(screen.getByLabelText('Nombre de la actividad'), 'Jornada');
    fireEvent.change(screen.getByLabelText('Inicio'), {
      target: { value: '2026-08-27T10:00' },
    });
    fireEvent.change(screen.getByLabelText(/^Fin \(opcional\)/u), {
      target: { value: '2026-08-27T09:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }));
    expect(
      await screen.findByText(
        'La fecha de fin no puede ser anterior al inicio.',
      ),
    ).not.toBeNull();
    expect(createProjectActivity).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Fin \(opcional\)/u), {
      target: { value: '2026-08-27T11:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar actividad' }));
    const form = screen
      .getByRole('heading', { name: 'Crear actividad' })
      .closest('form');
    expect(form).not.toBeNull();
    if (!form) throw new Error('Activity form is missing');
    const savingButton = within(form).getByRole('button', {
      name: 'Guardando…',
    });
    expect((savingButton as HTMLButtonElement).disabled).toBe(true);
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
          canManage
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
