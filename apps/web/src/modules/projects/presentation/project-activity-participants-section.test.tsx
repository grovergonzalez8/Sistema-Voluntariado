import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectActivityParticipationGateway } from '../application/project-activity-participation-gateway';
import { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type { ProjectActivityParticipation } from '../domain/project-activity-participation';
import type { ProjectActivity } from '../domain/project-activity';
import { ProjectActivityParticipantsSection } from './project-activity-participants-section';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const volunteerId = '30000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
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

async function renderSection(
  gateway: ProjectActivityParticipationGateway,
  options: {
    readonly activityStatus?: ProjectActivity['status'];
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
    const i18n = await createI18n();
    const renderParticipants = (activityStatus: ProjectActivity['status']) => (
      <I18nextProvider i18n={i18n}>
        <ProjectActivityParticipantsSection
          activity={{ ...activity, status: activityStatus }}
          canManage
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
});
