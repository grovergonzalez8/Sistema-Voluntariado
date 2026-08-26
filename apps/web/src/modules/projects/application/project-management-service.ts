import {
  failure,
  success,
  type AppError,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectManagerAssignment,
  ProjectManagerCandidate,
  ProjectVolunteerAssignment,
  ProjectVolunteerCandidate,
  VolunteerProjectAssignment,
} from '../domain/project-assignment';
import {
  validateProjectInput,
  type Project,
  type ProjectInput,
} from '../domain/project';
import {
  projectPermissions,
  type ProjectCapabilities,
  type ProjectAuthorizationPort,
  type ProjectPermission,
} from './project-authorization-port';
import type {
  ProjectManagementGateway,
  ProjectPage,
} from './project-management-gateway';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ProjectManagementService {
  public constructor(
    private readonly authorization: ProjectAuthorizationPort,
    private readonly gateway: ProjectManagementGateway,
  ) {}

  private async authorize(
    permission: ProjectPermission,
  ): Promise<Result<true>> {
    const result = await this.authorization.hasPermission(permission);
    if (!result.ok) return result;
    return result.value
      ? success(true)
      : failure({
          code: 'forbidden',
          message:
            'No tienes permiso para realizar esta operación de proyectos.',
        });
  }

  private invalidIdError(
    id: string,
    entity: 'account' | 'assignment' | 'project' | 'volunteer',
  ): AppError | undefined {
    if (uuidPattern.test(id)) return undefined;
    const labels = {
      account: 'La cuenta solicitada no es válida.',
      assignment: 'La asignación solicitada no es válida.',
      project: 'El proyecto solicitado no es válido.',
      volunteer: 'El voluntario solicitado no es válido.',
    } as const;
    return { code: 'validation', message: labels[entity] };
  }

  public async createProject(input: ProjectInput): Promise<Result<Project>> {
    const canonical = validateProjectInput(input);
    if (!canonical.ok) {
      return failure({
        code: 'validation',
        message: 'Revisa los datos del proyecto.',
      });
    }
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.createProject(canonical.value)
      : authorized;
  }

  public async updateProject(
    id: string,
    input: ProjectInput,
  ): Promise<Result<Project>> {
    const invalidId = this.invalidIdError(id, 'project');
    if (invalidId) return failure(invalidId);
    const canonical = validateProjectInput(input);
    if (!canonical.ok) {
      return failure({
        code: 'validation',
        message: 'Revisa los datos del proyecto.',
      });
    }
    const authorized = await this.authorize(projectPermissions.manageAssigned);
    return authorized.ok
      ? this.gateway.updateProject({ id, ...canonical.value })
      : authorized;
  }

  public async closeProject(id: string): Promise<Result<Project>> {
    const invalidId = this.invalidIdError(id, 'project');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok ? this.gateway.closeProject(id) : authorized;
  }

  public async getProject(id: string): Promise<Result<Project>> {
    const invalidId = this.invalidIdError(id, 'project');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.readAssigned);
    return authorized.ok ? this.gateway.getProject(id) : authorized;
  }

  public async listProjects(
    input: {
      readonly limit?: number;
      readonly offset?: number;
      readonly search?: string;
    } = {},
  ): Promise<Result<ProjectPage>> {
    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    const search = input.search?.trim() ?? '';
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      search.length > 120
    ) {
      return failure({
        code: 'validation',
        message: 'Los filtros de proyectos no son válidos.',
      });
    }
    const authorized = await this.authorize(projectPermissions.readAssigned);
    return authorized.ok
      ? this.gateway.listProjects({ limit, offset, search })
      : authorized;
  }

  public async listProjectAssignments(
    projectId: string,
  ): Promise<Result<readonly ProjectVolunteerAssignment[]>> {
    const invalidId = this.invalidIdError(projectId, 'project');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.readAssigned);
    return authorized.ok
      ? this.gateway.listProjectAssignments(projectId)
      : authorized;
  }

  public async searchVolunteerCandidates(
    projectId: string,
    search: string,
  ): Promise<Result<readonly ProjectVolunteerCandidate[]>> {
    const invalidId = this.invalidIdError(projectId, 'project');
    if (invalidId) return failure(invalidId);
    const normalizedSearch = search.trim();
    if (normalizedSearch.length > 100) {
      return failure({
        code: 'validation',
        message: 'La búsqueda de voluntarios no es válida.',
      });
    }
    const authorized = await this.authorize(projectPermissions.manageAssigned);
    return authorized.ok
      ? this.gateway.searchVolunteerCandidates(projectId, normalizedSearch)
      : authorized;
  }

  public async assignVolunteer(
    projectId: string,
    volunteerId: string,
  ): Promise<Result<ProjectVolunteerAssignment>> {
    const invalidProject = this.invalidIdError(projectId, 'project');
    if (invalidProject) return failure(invalidProject);
    const invalidVolunteer = this.invalidIdError(volunteerId, 'volunteer');
    if (invalidVolunteer) return failure(invalidVolunteer);
    const authorized = await this.authorize(projectPermissions.manageAssigned);
    return authorized.ok
      ? this.gateway.assignVolunteer(projectId, volunteerId)
      : authorized;
  }

  public async endAssignment(
    id: string,
  ): Promise<Result<ProjectVolunteerAssignment>> {
    const invalidId = this.invalidIdError(id, 'assignment');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.manageAssigned);
    return authorized.ok ? this.gateway.endAssignment(id) : authorized;
  }

  public async listVolunteerProjects(
    volunteerId: string,
  ): Promise<Result<readonly VolunteerProjectAssignment[]>> {
    const invalidId = this.invalidIdError(volunteerId, 'volunteer');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.listVolunteerProjects(volunteerId)
      : authorized;
  }

  public async getCapabilities(): Promise<Result<ProjectCapabilities>> {
    const [manage, manageAssigned, readAssigned] = await Promise.all([
      this.authorization.hasPermission(projectPermissions.manage),
      this.authorization.hasPermission(projectPermissions.manageAssigned),
      this.authorization.hasPermission(projectPermissions.readAssigned),
    ]);
    if (!manage.ok) return manage;
    if (!manageAssigned.ok) return manageAssigned;
    if (!readAssigned.ok) return readAssigned;
    return success({
      manage: manage.value,
      manageAssigned: manageAssigned.value,
      readAssigned: readAssigned.value,
    });
  }

  public async listManagerAssignments(
    projectId: string,
  ): Promise<Result<readonly ProjectManagerAssignment[]>> {
    const invalidId = this.invalidIdError(projectId, 'project');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.listProjectManagerAssignments(projectId)
      : authorized;
  }

  public async searchManagerCandidates(
    projectId: string,
    search: string,
  ): Promise<Result<readonly ProjectManagerCandidate[]>> {
    const invalidId = this.invalidIdError(projectId, 'project');
    if (invalidId) return failure(invalidId);
    const normalizedSearch = search.trim();
    if (normalizedSearch.length > 100) {
      return failure({
        code: 'validation',
        message: 'La búsqueda de responsables no es válida.',
      });
    }
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.searchManagerCandidates(projectId, normalizedSearch)
      : authorized;
  }

  public async assignManager(
    projectId: string,
    managerAccountId: string,
  ): Promise<Result<ProjectManagerAssignment>> {
    const invalidProject = this.invalidIdError(projectId, 'project');
    if (invalidProject) return failure(invalidProject);
    const invalidAccount = this.invalidIdError(managerAccountId, 'account');
    if (invalidAccount) return failure(invalidAccount);
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.assignManager(projectId, managerAccountId)
      : authorized;
  }

  public async endManagerAssignment(
    assignmentId: string,
  ): Promise<Result<ProjectManagerAssignment>> {
    const invalidId = this.invalidIdError(assignmentId, 'assignment');
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorize(projectPermissions.manage);
    return authorized.ok
      ? this.gateway.endManagerAssignment(assignmentId)
      : authorized;
  }
}
