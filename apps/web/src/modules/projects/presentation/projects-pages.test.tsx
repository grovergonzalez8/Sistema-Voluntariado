import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type {
  ProjectManagementGateway,
  ProjectPage,
} from '../application/project-management-gateway';
import { ProjectManagementService } from '../application/project-management-service';
import type { ProjectActivityGateway } from '../application/project-activity-gateway';
import type { ProjectActivityParticipationGateway } from '../application/project-activity-participation-gateway';
import { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type { ProjectActivityAttendanceGateway } from '../application/project-activity-attendance-gateway';
import { ProjectActivityAttendanceService } from '../application/project-activity-attendance-service';
import { ProjectActivityService } from '../application/project-activity-service';
import type { ProjectVolunteerAssignment } from '../domain/project-assignment';
import type { Project } from '../domain/project';
import { ProjectCreatePage } from './project-create-page';
import { ProjectDetailPage } from './project-detail-page';
import { ProjectsPage } from './projects-page';
import { VolunteerProjectsPage } from './volunteer-projects-page';

const projectId = '10000000-0000-4000-8000-000000000001';
const volunteerId = '20000000-0000-4000-8000-000000000001';
const assignmentId = '30000000-0000-4000-8000-000000000001';
const managerAssignmentId = '40000000-0000-4000-8000-000000000001';
const managerAccountId = '50000000-0000-4000-8000-000000000001';
const project: Project = {
  createdAt: '2026-08-24T10:00:00Z',
  description: 'Apoyo local',
  id: projectId,
  name: 'Proyecto Comunitario',
  status: 'active',
  updatedAt: '2026-08-24T10:00:00Z',
};
const assignment: ProjectVolunteerAssignment = {
  assignmentId,
  createdAt: '2026-08-24T10:00:00Z',
  endedAt: null,
  projectId,
  startedAt: '2026-08-24T10:00:00Z',
  updatedAt: '2026-08-24T10:00:00Z',
  volunteerId,
  volunteerName: 'Persona Registrada',
};

const authorization: ProjectAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function createGateway(
  overrides: Partial<ProjectManagementGateway> = {},
): ProjectManagementGateway {
  return {
    assignManager: () =>
      Promise.resolve(
        success({
          assignmentId: '40000000-0000-4000-8000-000000000001',
          createdAt: assignment.createdAt,
          endedAt: null,
          managerAccountId: '50000000-0000-4000-8000-000000000001',
          managerDisplayName: 'Responsable Uno',
          projectId,
          startedAt: assignment.startedAt,
          updatedAt: assignment.updatedAt,
        }),
      ),
    assignVolunteer: () => Promise.resolve(success(assignment)),
    closeProject: () =>
      Promise.resolve(success({ ...project, status: 'closed' })),
    createProject: () => Promise.resolve(success(project)),
    endAssignment: () =>
      Promise.resolve(
        success({ ...assignment, endedAt: '2026-08-24T11:00:00Z' }),
      ),
    endManagerAssignment: () =>
      Promise.resolve(
        success({
          assignmentId: '40000000-0000-4000-8000-000000000001',
          createdAt: assignment.createdAt,
          endedAt: '2026-08-24T11:00:00Z',
          managerAccountId: '50000000-0000-4000-8000-000000000001',
          managerDisplayName: 'Responsable Uno',
          projectId,
          startedAt: assignment.startedAt,
          updatedAt: '2026-08-24T11:00:00Z',
        }),
      ),
    getProject: () => Promise.resolve(success(project)),
    listProjectAssignments: () => Promise.resolve(success([assignment])),
    listProjectManagerAssignments: () => Promise.resolve(success([])),
    listProjects: (query) =>
      Promise.resolve(
        success({
          items: [project],
          limit: query.limit,
          offset: query.offset,
          total: 1,
        }),
      ),
    listVolunteerProjects: () =>
      Promise.resolve(
        success([
          {
            assignmentId,
            endedAt: null,
            projectId,
            projectName: project.name,
            projectStatus: project.status,
            startedAt: assignment.startedAt,
          },
        ]),
      ),
    searchVolunteerCandidates: () =>
      Promise.resolve(
        success([{ fullName: 'Persona Registrada', id: volunteerId }]),
      ),
    searchManagerCandidates: () => Promise.resolve(success([])),
    updateProject: () => Promise.resolve(success(project)),
    ...overrides,
  };
}

function createActivityService(): ProjectActivityService {
  const gateway: ProjectActivityGateway = {
    cancelProjectActivity: () =>
      Promise.reject(new Error('Unexpected activity mutation')),
    completeProjectActivity: () =>
      Promise.reject(new Error('Unexpected activity mutation')),
    createProjectActivity: () =>
      Promise.reject(new Error('Unexpected activity mutation')),
    getProjectActivity: () =>
      Promise.reject(new Error('Unexpected activity detail')),
    listProjectActivities: () => Promise.resolve(success([])),
    updateProjectActivity: () =>
      Promise.reject(new Error('Unexpected activity mutation')),
  };
  return new ProjectActivityService(authorization, gateway);
}

function createActivityParticipationService(): ProjectActivityParticipationService {
  const gateway: ProjectActivityParticipationGateway = {
    createParticipation: () =>
      Promise.reject(new Error('Unexpected participation mutation')),
    finishParticipation: () =>
      Promise.reject(new Error('Unexpected participation mutation')),
    listParticipations: () => Promise.resolve(success([])),
    searchEligibleCandidates: () => Promise.resolve(success([])),
  };
  return new ProjectActivityParticipationService(authorization, gateway);
}

function createActivityAttendanceService(): ProjectActivityAttendanceService {
  const gateway: ProjectActivityAttendanceGateway = {
    listAttendances: () => Promise.resolve(success([])),
    setAttendance: () =>
      Promise.reject(new Error('Unexpected attendance mutation')),
  };
  return new ProjectActivityAttendanceService(authorization, gateway);
}

const initialListPage: ProjectPage = {
  items: [project],
  limit: 25,
  offset: 0,
  total: 60,
};

function pendingListPage() {
  let resolvePage: ((value: Result<ProjectPage>) => void) | undefined;
  let rejectPage: ((reason: Error) => void) | undefined;
  const promise = new Promise<Result<ProjectPage>>((resolve, reject) => {
    resolvePage = resolve;
    rejectPage = reject;
  });
  return {
    promise,
    resolve(value: Result<ProjectPage>) {
      if (!resolvePage) throw new Error('Missing list resolver');
      resolvePage(value);
    },
    reject(reason: Error) {
      if (!rejectPage) throw new Error('Missing list rejecter');
      rejectPage(reason);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderWithI18n(node: ReactNode) {
  const i18n = await createI18n();
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

async function renderProjectList(
  gateway: ProjectManagementGateway,
  strictMode = false,
) {
  const service = new ProjectManagementService(authorization, gateway);
  const content = (
    <MemoryRouter>
      <ProjectsPage service={service} />
    </MemoryRouter>
  );
  return renderWithI18n(
    strictMode ? <StrictMode>{content}</StrictMode> : content,
  );
}

describe('project administration pages', () => {
  it('coalesces identical pending searches and finishes the original request', async () => {
    const user = userEvent.setup();
    const pending = pendingListPage();
    const list = vi
      .fn<ProjectManagementGateway['listProjects']>()
      .mockReturnValue(pending.promise);
    await renderProjectList(createGateway({ listProjects: list }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledOnce();
    });
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.change(screen.getByLabelText('Buscar proyectos por nombre'), {
      target: { value: '   ' },
    });
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(list).toHaveBeenCalledOnce();
    expect(screen.getByText('Cargando…')).not.toBeNull();
    await act(async () => {
      pending.resolve(success(initialListPage));
      await pending.promise;
    });
    expect(await screen.findByText(project.name)).not.toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('searches from page two with one offset-zero request and preserves filters when paging', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<ProjectManagementGateway['listProjects']>()
      .mockImplementation((query) =>
        Promise.resolve(success({ ...initialListPage, offset: query.offset })),
      );
    await renderProjectList(createGateway({ listProjects: list }));
    await screen.findByText(project.name);
    await user.type(
      screen.getByLabelText('Buscar proyectos por nombre'),
      '  vigente  ',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(project.name);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 3');
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 25,
      search: 'vigente',
    });
    const before = list.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Página 1 de 3');
    expect(list).toHaveBeenCalledTimes(before + 1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'vigente',
    });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 3');
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Página 1 de 3');
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'vigente',
    });
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it.each([
    ['success', 'old-first'],
    ['failure', 'old-first'],
    ['rejection', 'old-first'],
    ['success', 'new-first'],
    ['failure', 'new-first'],
    ['rejection', 'new-first'],
  ] as const)(
    'ignores old %s results in %s order, including loading and totals',
    async (outcome, order) => {
      const user = userEvent.setup();
      const previous = pendingListPage();
      const current = pendingListPage();
      const list = vi
        .fn<ProjectManagementGateway['listProjects']>()
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
      await renderProjectList(createGateway({ listProjects: list }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      await user.type(
        screen.getByLabelText('Buscar proyectos por nombre'),
        'vigente',
      );
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledTimes(2);
      });
      expect(list).toHaveBeenLastCalledWith({
        limit: 25,
        offset: 0,
        search: 'vigente',
      });
      const finishCurrent = async () => {
        await act(async () => {
          current.resolve(
            success({
              ...initialListPage,
              items: [{ ...project, name: 'Resultado vigente' }],
              total: 2,
            }),
          );
          await current.promise;
        });
      };
      const finishPrevious = async () => {
        await act(async () => {
          if (outcome === 'rejection') {
            previous.reject(new Error('Detalle antiguo simulado'));
            await previous.promise.catch(() => undefined);
          } else {
            previous.resolve(
              outcome === 'success'
                ? success({
                    ...initialListPage,
                    items: [{ ...project, name: 'Resultado anterior' }],
                    total: 99,
                  })
                : failure({ code: 'network', message: 'Error anterior' }),
            );
            await previous.promise;
          }
        });
      };
      if (order === 'new-first') {
        await finishCurrent();
        await finishPrevious();
      } else {
        await finishPrevious();
        expect(screen.getByText('Cargando…')).not.toBeNull();
        expect(screen.queryByText('Resultado anterior')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        await finishCurrent();
      }
      expect(await screen.findByText('Resultado vigente')).not.toBeNull();
      expect(screen.getByText('2 resultado(s)')).not.toBeNull();
      expect(screen.getByText('Página 1 de 1')).not.toBeNull();
      expect(screen.queryByText('Resultado anterior')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it.each(['failure', 'rejection'] as const)(
    'finishes a current %s and recovers with the same search',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingListPage();
      const list = vi
        .fn<ProjectManagementGateway['listProjects']>()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(success(initialListPage));
      await renderProjectList(createGateway({ listProjects: list }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Detalle interno simulado'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            failure({ code: 'network', message: 'Error recuperable' }),
          );
          await pending.promise;
        }
      });
      expect(await screen.findByRole('alert')).not.toBeNull();
      expect(screen.getByRole('alert').textContent).toBe(
        outcome === 'rejection'
          ? 'No fue posible cargar los proyectos. Reintenta la búsqueda.'
          : 'Error recuperable',
      );
      expect(screen.queryByText('Detalle interno simulado')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      expect(await screen.findByText(project.name)).not.toBeNull();
      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it('ignores a rejected request after unmount', async () => {
    const pending = pendingListPage();
    const list = vi
      .fn<ProjectManagementGateway['listProjects']>()
      .mockReturnValue(pending.promise);
    const view = await renderProjectList(createGateway({ listProjects: list }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledOnce();
    });
    view.unmount();
    await act(async () => {
      pending.reject(new Error('Rechazo después de desmontaje'));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
    expect(list).toHaveBeenCalledOnce();
  });

  it('refreshes identical searches under StrictMode without an effect loop', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<ProjectManagementGateway['listProjects']>()
      .mockResolvedValue(success(initialListPage));
    await renderProjectList(createGateway({ listProjects: list }), true);
    await screen.findByText(project.name);
    const before = list.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(before + 1);
    });
    expect(await screen.findByText(project.name)).not.toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it.each([
    { applied: '', submitted: '' },
    { applied: '', submitted: '   ' },
    { applied: 'Comunitario', submitted: 'Comunitario' },
    { applied: 'Comunitario', submitted: '  Comunitario  ' },
  ])(
    'refreshes a settled project search $applied with $submitted and finishes loading',
    async ({ applied, submitted }) => {
      const user = userEvent.setup();
      const listProjects = vi
        .fn<ProjectManagementGateway['listProjects']>()
        .mockImplementation((query) =>
          Promise.resolve(
            success({
              items: [project],
              limit: query.limit,
              offset: query.offset,
              total: 1,
            }),
          ),
        );
      await renderProjectList(createGateway({ listProjects }));
      await screen.findByText(project.name);
      const input = screen.getByLabelText('Buscar proyectos por nombre');
      if (applied) {
        await user.type(input, applied);
        await user.click(screen.getByRole('button', { name: 'Buscar' }));
        await waitFor(() => {
          expect(listProjects).toHaveBeenCalledTimes(2);
        });
        await screen.findByText(project.name);
      }
      await user.clear(input);
      if (submitted) await user.type(input, submitted);
      const previousCalls = listProjects.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => {
        expect(listProjects).toHaveBeenCalledTimes(previousCalls + 1);
      });
      expect(listProjects).toHaveBeenLastCalledWith({
        limit: 25,
        offset: 0,
        search: submitted.trim(),
      });
      expect(await screen.findByText(project.name)).not.toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      expect(
        screen.getByRole('link', { name: 'Ver detalle' }).getAttribute('href'),
      ).toBe(`/app/admin/projects/${projectId}`);
    },
  );

  it('lists and searches projects through server pagination', async () => {
    const user = userEvent.setup();
    const listProjects = vi
      .fn<ProjectManagementGateway['listProjects']>()
      .mockImplementation((query) =>
        Promise.resolve(
          success({
            items: [project],
            limit: query.limit,
            offset: query.offset,
            total: 1,
          }),
        ),
      );
    const service = new ProjectManagementService(
      authorization,
      createGateway({ listProjects }),
    );
    await renderWithI18n(
      <MemoryRouter>
        <ProjectsPage service={service} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(project.name)).not.toBeNull();
    await user.type(
      screen.getByLabelText('Buscar proyectos por nombre'),
      'comunitario',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(listProjects).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'comunitario',
    });
  });

  it('validates and creates the minimal project', async () => {
    const user = userEvent.setup();
    const createProject = vi
      .fn<ProjectManagementGateway['createProject']>()
      .mockResolvedValue(success(project));
    const service = new ProjectManagementService(
      authorization,
      createGateway({ createProject }),
    );
    await renderWithI18n(
      <MemoryRouter initialEntries={['/projects/new']}>
        <Routes>
          <Route
            element={<ProjectCreatePage service={service} />}
            path="/projects/new"
          />
          <Route
            element={<p>Proyecto guardado</p>}
            path="/app/admin/projects/:id"
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));
    expect(
      await screen.findByText('Escribe un nombre de 1 a 120 caracteres.'),
    ).not.toBeNull();
    await user.type(
      screen.getByRole('textbox', { name: /^Nombre/u }),
      '  Proyecto Comunitario ',
    );
    await user.type(
      screen.getByLabelText('Descripción (opcional)'),
      ' Apoyo local ',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));

    expect(await screen.findByText('Proyecto guardado')).not.toBeNull();
    expect(createProject).toHaveBeenCalledWith({
      description: 'Apoyo local',
      name: 'Proyecto Comunitario',
    });
  });

  it('searches, assigns and finishes a registry volunteer from project detail', async () => {
    const user = userEvent.setup();
    const assignVolunteer = vi
      .fn<ProjectManagementGateway['assignVolunteer']>()
      .mockResolvedValue(success(assignment));
    const endAssignment = vi
      .fn<ProjectManagementGateway['endAssignment']>()
      .mockResolvedValue(
        success({ ...assignment, endedAt: '2026-08-24T11:00:00Z' }),
      );
    const service = new ProjectManagementService(
      authorization,
      createGateway({ assignVolunteer, endAssignment }),
    );
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await renderWithI18n(
      <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
        <Routes>
          <Route
            element={
              <ProjectDetailPage
                activityAttendanceService={createActivityAttendanceService()}
                activityParticipationService={createActivityParticipationService()}
                activityService={createActivityService()}
                service={service}
              />
            }
            path="/projects/:id"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(project.name)).not.toBeNull();
    const volunteerSearch = screen.getByLabelText(
      'Buscar voluntario por nombre',
    );
    await user.type(volunteerSearch, 'Persona');
    const volunteerForm = volunteerSearch.closest('form');
    expect(volunteerForm).not.toBeNull();
    if (!volunteerForm) throw new Error('Volunteer search form is missing');
    await user.click(
      within(volunteerForm).getByRole('button', {
        name: 'Buscar',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Asignar' }));
    expect(assignVolunteer).toHaveBeenCalledWith(projectId, volunteerId);
    await user.click(
      screen.getByRole('button', { name: 'Finalizar asignación' }),
    );
    expect(endAssignment).toHaveBeenCalledWith(assignmentId);
  });

  it('shows the project history associated with a volunteer', async () => {
    const service = new ProjectManagementService(
      authorization,
      createGateway(),
    );
    await renderWithI18n(
      <MemoryRouter initialEntries={[`/volunteers/${volunteerId}/projects`]}>
        <Routes>
          <Route
            element={<VolunteerProjectsPage service={service} />}
            path="/volunteers/:id/projects"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(project.name)).not.toBeNull();
    expect(screen.getByText('Activa')).not.toBeNull();
  });

  it('lets an administrator assign and finish a project manager scope', async () => {
    const user = userEvent.setup();
    const managerAssignment = {
      assignmentId: managerAssignmentId,
      createdAt: assignment.createdAt,
      endedAt: null,
      managerAccountId,
      managerDisplayName: 'Responsable Uno',
      projectId,
      startedAt: assignment.startedAt,
      updatedAt: assignment.updatedAt,
    };
    const assignManager = vi
      .fn<ProjectManagementGateway['assignManager']>()
      .mockResolvedValue(success(managerAssignment));
    const endManagerAssignment = vi
      .fn<ProjectManagementGateway['endManagerAssignment']>()
      .mockResolvedValue(
        success({
          ...managerAssignment,
          endedAt: '2026-08-24T11:00:00Z',
        }),
      );
    const service = new ProjectManagementService(
      authorization,
      createGateway({
        assignManager,
        endManagerAssignment,
        listProjectManagerAssignments: () =>
          Promise.resolve(success([managerAssignment])),
        searchManagerCandidates: () =>
          Promise.resolve(
            success([{ displayName: 'Responsable Uno', managerAccountId }]),
          ),
      }),
    );
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await renderWithI18n(
      <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
        <Routes>
          <Route
            element={
              <ProjectDetailPage
                activityAttendanceService={createActivityAttendanceService()}
                activityParticipationService={createActivityParticipationService()}
                activityService={createActivityService()}
                service={service}
              />
            }
            path="/projects/:id"
          />
        </Routes>
      </MemoryRouter>,
    );

    const managerSearch = await screen.findByLabelText(
      'Buscar responsable de proyecto por nombre',
    );
    await user.type(managerSearch, 'Responsable');
    const managerForm = managerSearch.closest('form');
    expect(managerForm).not.toBeNull();
    if (!managerForm) throw new Error('Manager search form is missing');
    await user.click(
      within(managerForm).getByRole('button', {
        name: 'Buscar',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Asignar responsable' }),
    );
    expect(assignManager).toHaveBeenCalledWith(projectId, managerAccountId);
    await user.click(
      await screen.findByRole('button', { name: 'Finalizar responsable' }),
    );
    expect(endManagerAssignment).toHaveBeenCalledWith(managerAssignmentId);
  });
});
