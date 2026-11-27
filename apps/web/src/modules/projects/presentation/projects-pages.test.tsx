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
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
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
import type {
  ProjectVolunteerAssignment,
  ProjectManagerAssignment,
  ProjectVolunteerCandidate,
  ProjectManagerCandidate,
  VolunteerProjectAssignment,
} from '../domain/project-assignment';
import type { Project } from '../domain/project';
import { ProjectCreatePage } from './project-create-page';
import { ProjectEditPage } from './project-edit-page';
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

const otherResourceId = '10000000-0000-4000-8000-000000000099';
const otherResource = {
  ...project,
  id: otherResourceId,
  name: 'Entidad B',
  description: 'Descripción B',
};

function pendingResource<T>() {
  let resolveResult: ((value: Result<T>) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;
  const promise = new Promise<Result<T>>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  return {
    promise,
    resolve(value: Result<T>) {
      if (!resolveResult) throw new Error('Missing resolver');
      resolveResult(value);
    },
    reject(error: Error) {
      if (!rejectResult) throw new Error('Missing rejecter');
      rejectResult(error);
    },
  };
}

function ResourceNavigation({ mode }: { readonly mode: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav aria-label="Navegación de prueba">
      <Link to={`/resources/${projectId}/${mode}`}>Recurso A</Link>
      <Link to={`/resources/${otherResourceId}/${mode}`}>Recurso B</Link>
      <button
        onClick={() => {
          void navigate(-1);
        }}
      >
        Atrás de prueba
      </button>
      <button
        onClick={() => {
          void navigate(1);
        }}
      >
        Adelante de prueba
      </button>
      <output aria-label="Ruta actual">{location.pathname}</output>
    </nav>
  );
}

async function renderResourcePage(
  mode: 'edit' | 'detail' | 'history',
  overrides: Partial<ProjectManagementGateway> = {},
  strictMode = false,
  resourceAuthorization: ProjectAuthorizationPort = authorization,
) {
  const gateway = createGateway({
    getProject: (id) =>
      Promise.resolve(
        success(id === otherResourceId ? otherResource : project),
      ),
    listProjectAssignments: (id) =>
      Promise.resolve(success([{ ...assignment, projectId: id }])),
    listVolunteerProjects: (id) =>
      Promise.resolve(
        success([
          {
            assignmentId,
            projectId: id,
            projectName:
              id === otherResourceId ? otherResource.name : project.name,
            projectStatus: 'active',
            startedAt: assignment.startedAt,
            endedAt: null,
          },
        ]),
      ),
    updateProject: (input) =>
      Promise.resolve(success({ ...project, ...input })),
    ...overrides,
  });
  const service = new ProjectManagementService(resourceAuthorization, gateway);
  const content = (
    <MemoryRouter initialEntries={[`/resources/${projectId}/${mode}`]}>
      <ResourceNavigation mode={mode} />
      <Routes>
        <Route
          path={`/resources/:id/${mode}`}
          element={
            mode === 'edit' ? (
              <ProjectEditPage service={service} />
            ) : mode === 'detail' ? (
              <ProjectDetailPage
                service={service}
                activityService={createActivityService()}
                activityParticipationService={createActivityParticipationService()}
                activityAttendanceService={createActivityAttendanceService()}
              />
            ) : (
              <VolunteerProjectsPage service={service} />
            )
          }
        />
        <Route path="*" element={<p>Destino de guardado</p>} />
      </Routes>
    </MemoryRouter>
  );
  return renderWithI18n(
    strictMode ? <StrictMode>{content}</StrictMode> : content,
  );
}

describe('project detail resource operations', () => {
  it('preserves descriptive editing of a closed project', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn<ProjectManagementGateway['updateProject']>()
      .mockResolvedValue(success({ ...project, status: 'closed' }));
    await renderResourcePage('edit', {
      getProject: () =>
        Promise.resolve(success({ ...project, status: 'closed' })),
      updateProject: update,
    });
    await screen.findByText(project.name);
    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));
    await screen.findByText('Destino de guardado');
    expect(update).toHaveBeenCalledExactlyOnceWith({
      id: projectId,
      name: project.name,
      description: project.description,
    });
  });

  it.each([
    ['search-volunteer', 'success'],
    ['search-volunteer', 'failure'],
    ['search-volunteer', 'rejection'],
    ['assign-volunteer', 'success'],
    ['assign-volunteer', 'failure'],
    ['assign-volunteer', 'rejection'],
    ['finish-volunteer', 'success'],
    ['finish-volunteer', 'failure'],
    ['finish-volunteer', 'rejection'],
    ['search-manager', 'success'],
    ['search-manager', 'failure'],
    ['search-manager', 'rejection'],
    ['assign-manager', 'success'],
    ['assign-manager', 'failure'],
    ['assign-manager', 'rejection'],
    ['finish-manager', 'success'],
    ['finish-manager', 'failure'],
    ['finish-manager', 'rejection'],
    ['close', 'success'],
    ['close', 'failure'],
    ['close', 'rejection'],
  ] as const)(
    'isolates old %s %s, including duplicate invocation and follow-up reads',
    async (operation, outcome) => {
      const user = userEvent.setup();
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      const assignmentResult = pendingResource<ProjectVolunteerAssignment>();
      const managerResult = pendingResource<ProjectManagerAssignment>();
      const closeResult = pendingResource<Project>();
      const volunteerCandidates =
        pendingResource<readonly ProjectVolunteerCandidate[]>();
      const managerCandidates =
        pendingResource<readonly ProjectManagerCandidate[]>();
      const manager: ProjectManagerAssignment = {
        assignmentId: managerAssignmentId,
        projectId,
        managerAccountId,
        managerDisplayName: 'Manager asignado A',
        startedAt: assignment.startedAt,
        endedAt: null,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      };
      const read = vi
        .fn<ProjectManagementGateway['getProject']>()
        .mockImplementation((id) =>
          Promise.resolve(success(id === projectId ? project : otherResource)),
        );
      const assignVolunteer = vi
        .fn<ProjectManagementGateway['assignVolunteer']>()
        .mockReturnValue(assignmentResult.promise);
      const endAssignment = vi
        .fn<ProjectManagementGateway['endAssignment']>()
        .mockReturnValue(assignmentResult.promise);
      const assignManager = vi
        .fn<ProjectManagementGateway['assignManager']>()
        .mockReturnValue(managerResult.promise);
      const endManagerAssignment = vi
        .fn<ProjectManagementGateway['endManagerAssignment']>()
        .mockReturnValue(managerResult.promise);
      const closeProject = vi
        .fn<ProjectManagementGateway['closeProject']>()
        .mockReturnValue(closeResult.promise);
      const searchVolunteerCandidates = vi
        .fn<ProjectManagementGateway['searchVolunteerCandidates']>()
        .mockImplementation(() =>
          operation === 'search-volunteer'
            ? volunteerCandidates.promise
            : Promise.resolve(
                success([
                  { id: volunteerId, fullName: 'Candidato disponible' },
                ]),
              ),
        );
      const searchManagerCandidates = vi
        .fn<ProjectManagementGateway['searchManagerCandidates']>()
        .mockImplementation(() =>
          operation === 'search-manager'
            ? managerCandidates.promise
            : Promise.resolve(
                success([
                  { managerAccountId, displayName: 'Manager disponible' },
                ]),
              ),
        );
      await renderResourcePage('detail', {
        getProject: read,
        assignVolunteer,
        endAssignment,
        assignManager,
        endManagerAssignment,
        closeProject,
        searchVolunteerCandidates,
        searchManagerCandidates,
        listProjectManagerAssignments: (id) =>
          Promise.resolve(success([{ ...manager, projectId: id }])),
      });
      await screen.findByText(project.name);
      const isManager = operation.includes('manager');
      if (operation.startsWith('search') || operation.startsWith('assign')) {
        const input = screen.getByLabelText(
          isManager
            ? 'Buscar responsable de proyecto por nombre'
            : 'Buscar voluntario por nombre',
        );
        await user.type(input, 'Consulta A');
        const form = input.closest('form');
        if (!form) throw new Error('Missing candidate form');
        if (operation.startsWith('search')) {
          act(() => {
            fireEvent.submit(form);
            fireEvent.submit(form);
          });
        } else {
          fireEvent.submit(form);
          const button = await screen.findByRole('button', {
            name: isManager ? 'Asignar responsable' : 'Asignar',
          });
          act(() => {
            fireEvent.click(button);
            fireEvent.click(button);
          });
        }
      } else {
        const button = screen.getByRole('button', {
          name:
            operation === 'close'
              ? 'Cerrar proyecto'
              : isManager
                ? 'Finalizar responsable'
                : 'Finalizar asignación',
        });
        act(() => {
          fireEvent.click(button);
          fireEvent.click(button);
        });
      }
      const called =
        operation === 'close'
          ? closeProject
          : operation === 'assign-volunteer'
            ? assignVolunteer
            : operation === 'finish-volunteer'
              ? endAssignment
              : operation === 'assign-manager'
                ? assignManager
                : operation === 'finish-manager'
                  ? endManagerAssignment
                  : isManager
                    ? searchManagerCandidates
                    : searchVolunteerCandidates;
      await waitFor(() => {
        expect(called).toHaveBeenCalledOnce();
      });
      if (operation === 'close')
        expect(closeProject).toHaveBeenCalledWith(projectId);
      else if (operation === 'assign-volunteer')
        expect(assignVolunteer).toHaveBeenCalledWith(projectId, volunteerId);
      else if (operation === 'assign-manager')
        expect(assignManager).toHaveBeenCalledWith(projectId, managerAccountId);
      else if (operation === 'finish-volunteer')
        expect(endAssignment).toHaveBeenCalledWith(assignmentId);
      else if (operation === 'finish-manager')
        expect(endManagerAssignment).toHaveBeenCalledWith(managerAssignmentId);
      else if (isManager)
        expect(searchManagerCandidates).toHaveBeenCalledWith(
          projectId,
          'Consulta A',
        );
      else
        expect(searchVolunteerCandidates).toHaveBeenCalledWith(
          projectId,
          'Consulta A',
        );
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.name);
      const readsBefore = read.mock.calls.length;
      const pending =
        operation === 'close'
          ? closeResult
          : operation.endsWith('volunteer')
            ? operation.startsWith('search')
              ? volunteerCandidates
              : assignmentResult
            : operation.startsWith('search')
              ? managerCandidates
              : managerResult;
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Rechazo antiguo de operación'));
          await pending.promise.catch(() => undefined);
        } else if (outcome === 'failure') {
          pending.resolve(
            failure({ code: 'network', message: 'Error antiguo de operación' }),
          );
          await pending.promise;
        } else {
          if (operation === 'close')
            closeResult.resolve(success({ ...project, status: 'closed' }));
          else if (operation === 'search-volunteer')
            volunteerCandidates.resolve(
              success([{ id: volunteerId, fullName: 'Candidato antiguo' }]),
            );
          else if (operation === 'search-manager')
            managerCandidates.resolve(
              success([{ managerAccountId, displayName: 'Manager antiguo' }]),
            );
          else if (isManager) managerResult.resolve(success(manager));
          else assignmentResult.resolve(success(assignment));
          await pending.promise;
        }
      });
      expect(screen.getByText(otherResource.name)).not.toBeNull();
      expect(screen.queryByText(project.name)).toBeNull();
      expect(screen.queryByText('Candidato antiguo')).toBeNull();
      expect(screen.queryByText('Manager antiguo')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(read).toHaveBeenCalledTimes(readsBefore);
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Cerrar proyecto',
        }).disabled,
      ).toBe(false);
    },
  );

  it.each(['project', 'assignment', 'manager'] as const)(
    'rejects a mismatched %s snapshot before allowing actions',
    async (kind) => {
      await renderResourcePage('detail', {
        getProject: () =>
          Promise.resolve(
            success(kind === 'project' ? otherResource : project),
          ),
        listProjectAssignments: () =>
          Promise.resolve(
            success(
              kind === 'assignment'
                ? [{ ...assignment, projectId: otherResourceId }]
                : [],
            ),
          ),
        listProjectManagerAssignments: () =>
          Promise.resolve(
            success(
              kind === 'manager'
                ? [
                    {
                      assignmentId: managerAssignmentId,
                      projectId: otherResourceId,
                      managerAccountId,
                      managerDisplayName: 'Incorrecto',
                      startedAt: assignment.startedAt,
                      endedAt: null,
                      createdAt: assignment.createdAt,
                      updatedAt: assignment.updatedAt,
                    },
                  ]
                : [],
            ),
          ),
      });
      await screen.findByRole('alert');
      expect(
        screen.queryByRole('button', { name: 'Cerrar proyecto' }),
      ).toBeNull();
      expect(screen.queryByText('Incorrecto')).toBeNull();
      expect(screen.queryByText(project.name)).toBeNull();
    },
  );

  it('finishes a current search rejection and allows a safe retry', async () => {
    const user = userEvent.setup();
    const searchVolunteerCandidates = vi
      .fn<ProjectManagementGateway['searchVolunteerCandidates']>()
      .mockRejectedValueOnce(new Error('Detalle interno simulado'))
      .mockResolvedValue(
        success([{ id: volunteerId, fullName: 'Candidato recuperado' }]),
      );
    await renderResourcePage('detail', { searchVolunteerCandidates });
    const input = await screen.findByLabelText('Buscar voluntario por nombre');
    await user.type(input, 'Persona');
    const form = input.closest('form');
    if (!form) throw new Error('Missing search form');
    fireEvent.submit(form);
    await screen.findByRole('alert');
    expect(screen.queryByText('Detalle interno simulado')).toBeNull();
    fireEvent.submit(form);
    await screen.findByText('Candidato recuperado');
    expect(searchVolunteerCandidates).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes actions if the post-mutation snapshot reload rejects', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const read = vi
      .fn<ProjectManagementGateway['getProject']>()
      .mockResolvedValueOnce(success(project))
      .mockRejectedValueOnce(new Error('Reload privado'))
      .mockResolvedValue(success({ ...project, status: 'closed' }));
    await renderResourcePage('detail', {
      getProject: read,
      listProjectAssignments: () => Promise.resolve(success([])),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Cerrar proyecto' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Cerrar proyecto' }),
    ).toBeNull();
    expect(screen.queryByText(project.name)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText(project.name);
    expect(
      screen.queryByRole('button', { name: 'Cerrar proyecto' }),
    ).toBeNull();
  });

  it('preserves read-only authority and closed-project restrictions', async () => {
    await renderResourcePage(
      'detail',
      {
        getProject: () =>
          Promise.resolve(success({ ...project, status: 'closed' })),
        listProjectAssignments: () => Promise.resolve(success([])),
      },
      false,
      {
        hasPermission: (permission) =>
          Promise.resolve(success(permission === 'project.read_assigned')),
      },
    );
    await screen.findByText(project.name);
    expect(screen.queryByRole('link', { name: 'Editar proyecto' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cerrar proyecto' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Crear actividad' }),
    ).toBeNull();
    expect(screen.queryByLabelText('Buscar voluntario por nombre')).toBeNull();
    expect(
      screen.queryByLabelText('Buscar responsable de proyecto por nombre'),
    ).toBeNull();
  });
});

describe('project administration pages', () => {
  it.each(['edit'] as const)(
    'refuses a mismatched %s resource response without exposing old data',
    async (mode) => {
      await renderResourcePage(mode, {
        getProject: () => Promise.resolve(success(otherResource)),
      });
      await screen.findByRole('alert');
      expect(screen.queryByText(otherResource.name)).toBeNull();
      expect(screen.queryByDisplayValue(otherResource.name)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar proyecto' }),
      ).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it('does not navigate on a mismatched edit response', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn<ProjectManagementGateway['updateProject']>()
      .mockResolvedValue(success(otherResource));
    await renderResourcePage('edit', { updateProject: update });
    await screen.findByText(project.name);
    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Ruta actual').textContent).toBe(
      `/resources/${projectId}/edit`,
    );
    expect(screen.queryByText('Destino de guardado')).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar proyecto',
      }).disabled,
    ).toBe(false);
  });

  it('ends a rejected save and retries the current resource without leaking details', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn<ProjectManagementGateway['updateProject']>()
      .mockRejectedValueOnce(new Error('Detalle privado de guardado'))
      .mockResolvedValue(success(project));
    await renderResourcePage('edit', { updateProject: update });
    await screen.findByText(project.name);
    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Detalle privado de guardado')).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar proyecto',
      }).disabled,
    ).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Guardar proyecto' }));
    await screen.findByText('Destino de guardado');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it.each(['edit', 'detail', 'history'] as const)(
    'supports successful %s A-B-A navigation and browser history in StrictMode',
    async (mode) => {
      const user = userEvent.setup();
      await renderResourcePage(mode, {}, true);
      await screen.findByText(project.name);
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.name);
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      await screen.findByText(project.name);
      await user.click(
        screen.getByRole('button', { name: 'Adelante de prueba' }),
      );
      await screen.findByText(otherResource.name);
      expect(screen.queryByText(project.name)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    ['edit', 'failure'],
    ['edit', 'rejection'],
    ['detail', 'failure'],
    ['detail', 'rejection'],
    ['history', 'failure'],
    ['history', 'rejection'],
  ] as const)(
    'isolates %s load %s and recovers the requested resource',
    async (mode, outcome) => {
      const user = userEvent.setup();
      const pending = pendingResource<Project>();
      const history = pendingResource<readonly VolunteerProjectAssignment[]>();
      let failed = false;
      const read = vi
        .fn<ProjectManagementGateway['getProject']>()
        .mockImplementation((id) => {
          if (id === otherResourceId && !failed) {
            failed = true;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === otherResourceId ? otherResource : project),
          );
        });
      await renderResourcePage(mode, {
        getProject: read,
        listVolunteerProjects: (id) => {
          if (id === otherResourceId && !failed) {
            failed = true;
            return history.promise;
          }
          return Promise.resolve(
            success([
              {
                assignmentId,
                projectId: id,
                projectName:
                  id === otherResourceId ? otherResource.name : project.name,
                projectStatus: 'active',
                startedAt: assignment.startedAt,
                endedAt: null,
              },
            ]),
          );
        },
      });
      await screen.findByText(project.name);
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await act(async () => {
        const request = mode === 'history' ? history : pending;
        if (outcome === 'rejection') {
          request.reject(new Error('Detalle privado simulado'));
          await request.promise.catch(() => undefined);
        } else {
          request.resolve(
            failure({ code: 'forbidden', message: 'Carga denegada' }),
          );
          await request.promise;
        }
      });
      await screen.findByRole('alert');
      expect(screen.queryByText(project.name)).toBeNull();
      expect(screen.queryByDisplayValue(project.name)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar proyecto' }),
      ).toBeNull();
      expect(screen.queryByText('Detalle privado simulado')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await screen.findByText(otherResource.name);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    ['edit', 'success'],
    ['edit', 'failure'],
    ['edit', 'rejection'],
    ['detail', 'success'],
    ['detail', 'failure'],
    ['detail', 'rejection'],
    ['history', 'success'],
    ['history', 'failure'],
    ['history', 'rejection'],
  ] as const)(
    'ignores a late %s read with %s after B and a new A instance',
    async (mode, outcome) => {
      const user = userEvent.setup();
      const pending = pendingResource<Project>();
      const history = pendingResource<readonly VolunteerProjectAssignment[]>();
      let firstA = true;
      const read = vi
        .fn<ProjectManagementGateway['getProject']>()
        .mockImplementation((id) => {
          if (id === projectId && firstA) {
            firstA = false;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === otherResourceId ? otherResource : project),
          );
        });
      const historyRead = vi
        .fn<ProjectManagementGateway['listVolunteerProjects']>()
        .mockImplementation((id) => {
          if (id === projectId && firstA) {
            firstA = false;
            return history.promise;
          }
          return Promise.resolve(
            success([
              {
                assignmentId,
                projectId: id,
                projectName:
                  id === otherResourceId ? otherResource.name : project.name,
                projectStatus: 'active',
                startedAt: assignment.startedAt,
                endedAt: null,
              },
            ]),
          );
        });
      await renderResourcePage(mode, {
        getProject: read,
        listVolunteerProjects: historyRead,
      });
      await waitFor(() => {
        expect(mode === 'history' ? historyRead : read).toHaveBeenCalledOnce();
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.name);
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      await screen.findByText(project.name);
      await act(async () => {
        if (outcome === 'rejection') {
          const request = mode === 'history' ? history : pending;
          request.reject(new Error('Rechazo antiguo'));
          await request.promise.catch(() => undefined);
        } else if (mode === 'history') {
          history.resolve(
            outcome === 'success'
              ? success([
                  {
                    assignmentId,
                    projectId,
                    projectName: 'Respuesta antigua',
                    projectStatus: 'active',
                    startedAt: assignment.startedAt,
                    endedAt: null,
                  },
                ])
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await history.promise;
        } else {
          pending.resolve(
            outcome === 'success'
              ? success({ ...project, name: 'Respuesta antigua' })
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await pending.promise;
        }
      });
      expect(screen.getByText(project.name)).not.toBeNull();
      expect(screen.queryByText('Respuesta antigua')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('saves B with only its own fields after leaving a dirty A form and blocks duplicate submit', async () => {
    const user = userEvent.setup();
    const pending = pendingResource<Project>();
    const update = vi
      .fn<ProjectManagementGateway['updateProject']>()
      .mockReturnValue(pending.promise);
    await renderResourcePage('edit', { updateProject: update });
    await screen.findByText(project.name);
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Borrador A' },
    });
    await user.click(screen.getByRole('link', { name: 'Recurso B' }));
    await screen.findByText(otherResource.name);
    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe(
      otherResource.name,
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Descripción (opcional)')
        .value,
    ).toBe(otherResource.description);
    const form = screen.getByLabelText('Nombre').closest('form');
    if (!form) throw new Error('Missing edit form');
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenCalledWith({
      id: otherResourceId,
      name: otherResource.name,
      description: otherResource.description,
    });
    await act(async () => {
      pending.resolve(success(otherResource));
      await pending.promise;
    });
    expect(await screen.findByText('Destino de guardado')).not.toBeNull();
  });

  it.each([
    ['success', false],
    ['success', true],
    ['failure', false],
    ['failure', true],
    ['rejection', false],
    ['rejection', true],
  ] as const)(
    'isolates a pending edit %s across navigation (return to A: %s)',
    async (outcome, returnToA) => {
      const user = userEvent.setup();
      const previous = pendingResource<Project>();
      const current = pendingResource<Project>();

      const update = vi
        .fn<ProjectManagementGateway['updateProject']>()
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);

      await renderResourcePage('edit', {
        updateProject: update,
      });
      await screen.findByText(project.name);
      await user.click(
        screen.getByRole('button', { name: 'Guardar proyecto' }),
      );
      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.name);
      if (returnToA) {
        await user.click(
          screen.getByRole('button', { name: 'Atrás de prueba' }),
        );
        await screen.findByText(project.name);
      }
      fireEvent.change(screen.getByLabelText('Nombre'), {
        target: { value: 'Edición vigente' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Guardar proyecto' }),
      );
      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        if (outcome === 'rejection') {
          previous.reject(new Error('Rechazo antiguo'));
          await previous.promise.catch(() => undefined);
        } else {
          previous.resolve(
            outcome === 'success'
              ? success(project)
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await previous.promise;
        }
      });
      expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe(
        'Edición vigente',
      );
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Guardando…' })
          .disabled,
      ).toBe(true);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Duplicado antiguo')).toBeNull();
      expect(screen.getByLabelText('Ruta actual').textContent).toBe(
        `/resources/${returnToA ? projectId : otherResourceId}/edit`,
      );
      const latest = update.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({
        id: returnToA ? projectId : otherResourceId,
        name: 'Edición vigente',
      });
      await act(async () => {
        current.resolve(
          success({
            ...(returnToA ? project : otherResource),
            name: 'Edición vigente',
          }),
        );
        await current.promise;
      });
      expect(await screen.findByText('Destino de guardado')).not.toBeNull();
    },
  );

  it.each(['edit', 'detail', 'history'] as const)(
    'isolates %s while the next route resource is loading',
    async (mode) => {
      const user = userEvent.setup();
      const pending = pendingResource<Project>();
      const history = pendingResource<readonly VolunteerProjectAssignment[]>();
      await renderResourcePage(mode, {
        getProject: (id) =>
          id === otherResourceId
            ? pending.promise
            : Promise.resolve(success(project)),
        listVolunteerProjects: (id) =>
          id === otherResourceId
            ? history.promise
            : Promise.resolve(
                success([
                  {
                    assignmentId,
                    projectId,
                    projectName: project.name,
                    projectStatus: 'active',
                    startedAt: assignment.startedAt,
                    endedAt: null,
                  },
                ]),
              ),
      });
      await screen.findByText(project.name);
      if (mode === 'edit') {
        fireEvent.change(screen.getByLabelText('Nombre'), {
          target: { value: 'Borrador exclusivo A' },
        });
      }
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      expect(screen.queryByText(project.name)).toBeNull();
      expect(screen.queryByDisplayValue('Borrador exclusivo A')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar proyecto' }),
      ).toBeNull();
      expect(screen.getByText('Cargando…')).not.toBeNull();
      await act(async () => {
        pending.resolve(success(otherResource));
        history.resolve(
          success([
            {
              assignmentId,
              projectId: otherResourceId,
              projectName: otherResource.name,
              projectStatus: 'active',
              startedAt: assignment.startedAt,
              endedAt: null,
            },
          ]),
        );
        await pending.promise;
      });
      expect(await screen.findByText(otherResource.name)).not.toBeNull();
    },
  );

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
