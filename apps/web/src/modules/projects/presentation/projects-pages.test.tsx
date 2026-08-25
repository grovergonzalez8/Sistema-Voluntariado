import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { ProjectAuthorizationPort } from '../application/project-authorization-port';
import type { ProjectManagementGateway } from '../application/project-management-gateway';
import { ProjectManagementService } from '../application/project-management-service';
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

async function renderWithI18n(node: ReactNode) {
  const i18n = await createI18n();
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe('project administration pages', () => {
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
            element={<ProjectDetailPage service={service} />}
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
    await user.click(
      within(volunteerForm as HTMLFormElement).getByRole('button', {
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
            element={<ProjectDetailPage service={service} />}
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
    await user.click(
      within(managerForm as HTMLFormElement).getByRole('button', {
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
