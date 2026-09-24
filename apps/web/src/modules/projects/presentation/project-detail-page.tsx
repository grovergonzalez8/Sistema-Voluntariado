import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { isActiveProjectAssignment } from '../domain/project-assignment';

import {
  Button,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  TableRegion,
} from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { ProjectActivityService } from '../application/project-activity-service';
import type { ProjectActivityAttendanceService } from '../application/project-activity-attendance-service';
import type { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type {
  ProjectManagerAssignment,
  ProjectManagerCandidate,
  ProjectVolunteerAssignment,
  ProjectVolunteerCandidate,
} from '../domain/project-assignment';
import type { Project } from '../domain/project';
import type { ProjectCapabilities } from '../application/project-authorization-port';
import { ProjectActivitiesSection } from './project-activities-section';
import { getProjectStatusTone } from './project-status-badge-tone';

export function ProjectDetailPage({
  activityAttendanceService,
  activityParticipationService,
  activityService,
  service,
}: {
  readonly activityAttendanceService: ProjectActivityAttendanceService;
  readonly activityParticipationService: ProjectActivityParticipationService;
  readonly activityService: ProjectActivityService;
  readonly service: ProjectManagementService;
}) {
  const { id = '' } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<
    readonly ProjectVolunteerAssignment[]
  >([]);
  const [managerAssignments, setManagerAssignments] = useState<
    readonly ProjectManagerAssignment[]
  >([]);
  const [managerCandidates, setManagerCandidates] = useState<
    readonly ProjectManagerCandidate[]
  >([]);
  const [capabilities, setCapabilities] = useState<ProjectCapabilities | null>(
    null,
  );
  const [managerSearch, setManagerSearch] = useState('');
  const [candidates, setCandidates] = useState<
    readonly ProjectVolunteerCandidate[]
  >([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useTranslation();

  const fetchDetail = useCallback(async () => {
    const capabilitiesResult = await service.getCapabilities();
    if (!capabilitiesResult.ok) {
      return { error: capabilitiesResult.error.message, ok: false } as const;
    }
    const [projectResult, assignmentsResult] = await Promise.all([
      service.getProject(id),
      service.listProjectAssignments(id),
    ]);
    if (!projectResult.ok) {
      return { error: projectResult.error.message, ok: false } as const;
    }
    if (!assignmentsResult.ok) {
      return { error: assignmentsResult.error.message, ok: false } as const;
    }
    const managersResult = capabilitiesResult.value.manage
      ? await service.listManagerAssignments(id)
      : null;
    if (managersResult && !managersResult.ok) {
      return { error: managersResult.error.message, ok: false } as const;
    }
    return {
      assignments: assignmentsResult.value,
      capabilities: capabilitiesResult.value,
      managerAssignments: managersResult?.value ?? [],
      ok: true,
      project: projectResult.value,
    } as const;
  }, [id, service]);

  const load = useCallback(async () => {
    const result = await fetchDetail();
    if (!result.ok) setError(result.error);
    else {
      setProject(result.project);
      setAssignments(result.assignments);
      setCapabilities(result.capabilities);
      setManagerAssignments(result.managerAssignments);
      setError(null);
    }
    setLoading(false);
  }, [fetchDetail]);

  useEffect(() => {
    let active = true;
    void fetchDetail().then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else {
        setProject(result.project);
        setAssignments(result.assignments);
        setCapabilities(result.capabilities);
        setManagerAssignments(result.managerAssignments);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fetchDetail]);

  const searchCandidates = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void service.searchVolunteerCandidates(id, search).then((result) => {
      if (result.ok) setCandidates(result.value);
      else setError(result.error.message);
      setBusy(false);
    });
  };

  const assign = async (volunteerId: string) => {
    setBusy(true);
    setError(null);
    const result = await service.assignVolunteer(id, volunteerId);
    if (result.ok) {
      setCandidates([]);
      setSearch('');
      setSuccess(t('projects.assigned'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const searchManagers = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void service.searchManagerCandidates(id, managerSearch).then((result) => {
      if (result.ok) setManagerCandidates(result.value);
      else setError(result.error.message);
      setBusy(false);
    });
  };

  const assignManager = async (managerAccountId: string) => {
    setBusy(true);
    setError(null);
    const result = await service.assignManager(id, managerAccountId);
    if (result.ok) {
      setManagerCandidates([]);
      setManagerSearch('');
      setSuccess(t('projects.managerAssigned'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const finishManager = async (assignmentId: string) => {
    if (!globalThis.confirm(t('projects.confirmManagerFinish'))) return;
    setBusy(true);
    setError(null);
    const result = await service.endManagerAssignment(assignmentId);
    if (result.ok) {
      setSuccess(t('projects.managerFinished'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const finish = async (assignmentId: string) => {
    if (!globalThis.confirm(t('projects.confirmFinish'))) return;
    setBusy(true);
    setError(null);
    const result = await service.endAssignment(assignmentId);
    if (result.ok) {
      setSuccess(t('projects.finished'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const close = async () => {
    if (!globalThis.confirm(t('projects.confirmClose'))) return;
    setBusy(true);
    setError(null);
    const result = await service.closeProject(id);
    if (result.ok) {
      setSuccess(t('projects.closed'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  if (loading && !project)
    return <LoadingState>{t('common.loading')}</LoadingState>;
  if (error && !project) return <Notice tone="error">{error}</Notice>;
  if (!project) return null;
  const canEditProject = capabilities?.manageAssigned === true;
  const canCloseProject =
    capabilities?.manage === true && project.status === 'active';

  return (
    <section className="admin-page project-detail-page">
      <PageHeader
        actions={
          canEditProject || canCloseProject ? (
            <div className="button-row">
              {canEditProject ? (
                <Link className="button" to={`/app/admin/projects/${id}/edit`}>
                  {t('projects.editAction')}
                </Link>
              ) : null}
              {canCloseProject ? (
                <Button
                  busy={busy}
                  disabled={busy}
                  onClick={() => void close()}
                  variant="danger"
                >
                  {t('projects.closeAction')}
                </Button>
              ) : null}
            </div>
          ) : null
        }
        description={project.description ?? t('common.notProvided')}
        eyebrow={t('admin.eyebrow')}
        title={project.name}
        titleClassName="dynamic-title"
      >
        <dl className="project-summary">
          <div>
            <dt>{t('common.status')}</dt>
            <dd>
              <StatusBadge tone={getProjectStatusTone(project.status)}>
                {t(`projects.status.${project.status}`)}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{t('projects.createdAt')}</dt>
            <dd>{new Date(project.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      </PageHeader>
      <div className="feedback-stack">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}
      </div>
      <ProjectActivitiesSection
        attendanceService={activityAttendanceService}
        canManage={
          capabilities?.manage === true
            ? true
            : capabilities?.manageAssigned === true
        }
        key={id}
        participationService={activityParticipationService}
        projectId={id}
        projectStatus={project.status}
        service={activityService}
      />
      <section
        aria-labelledby="project-participation-title"
        className="project-section"
      >
        <div className="section-heading-content">
          <h2 id="project-participation-title">
            {t('projects.participantsTitle')}
          </h2>
        </div>
        {capabilities?.manageAssigned && project.status === 'active' ? (
          <div className="project-subsection">
            <h3>{t('projects.assignTitle')}</h3>
            <p className="muted">{t('projects.assignDescription')}</p>
            <form
              className="search-row search-row--single toolbar-form"
              onSubmit={searchCandidates}
            >
              <Field
                label={t('projects.volunteerSearch')}
                maxLength={100}
                name="projectVolunteerSearch"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                value={search}
              />
              <Button
                busy={busy}
                disabled={busy}
                type="submit"
                variant="primary"
              >
                {t('projects.searchAction')}
              </Button>
            </form>
            {candidates.length === 0 && search ? (
              <Notice tone="info">{t('projects.noCandidates')}</Notice>
            ) : null}
            <ul className="candidate-list">
              {candidates.map((candidate) => (
                <li className="inline-item" key={candidate.id}>
                  <span>{candidate.fullName}</span>
                  <Button
                    disabled={busy}
                    onClick={() => void assign(candidate.id)}
                    variant="primary"
                  >
                    {t('projects.assignAction')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {assignments.length === 0 ? (
          <div className="empty-copy" role="status">
            <p>{t('projects.noParticipants')}</p>
          </div>
        ) : (
          <TableRegion aria-label={t('projects.participantsTitle')}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('projects.volunteer')}</th>
                  <th>{t('projects.startedAt')}</th>
                  <th>{t('projects.endedAt')}</th>
                  <th>{t('projects.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const active = isActiveProjectAssignment(assignment);
                  return (
                    <tr
                      className={
                        active ? undefined : 'data-table__row--historical'
                      }
                      key={assignment.assignmentId}
                    >
                      <td className="table-primary-cell">
                        {capabilities?.manage ? (
                          <Link
                            to={`/app/admin/volunteers/${assignment.volunteerId}`}
                          >
                            {assignment.volunteerName}
                          </Link>
                        ) : (
                          assignment.volunteerName
                        )}
                      </td>
                      <td>{new Date(assignment.startedAt).toLocaleString()}</td>
                      <td>
                        {assignment.endedAt ? (
                          new Date(assignment.endedAt).toLocaleString()
                        ) : (
                          <StatusBadge tone="success">
                            {t('projects.activeAssignment')}
                          </StatusBadge>
                        )}
                      </td>
                      <td>
                        {capabilities?.manageAssigned && active ? (
                          <Button
                            busy={busy}
                            disabled={busy}
                            onClick={() => void finish(assignment.assignmentId)}
                            variant="danger"
                          >
                            {t('projects.finishAction')}
                          </Button>
                        ) : (
                          <StatusBadge tone="neutral">
                            {t('projects.historical')}
                          </StatusBadge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableRegion>
        )}
      </section>
      {capabilities?.manage ? (
        <section
          aria-labelledby="project-managers-title"
          className="project-section"
        >
          <div className="section-heading-content">
            <h2 id="project-managers-title">{t('projects.managersTitle')}</h2>
            <p className="muted">{t('projects.managersDescription')}</p>
          </div>
          {project.status === 'active' ? (
            <form
              className="search-row search-row--single toolbar-form"
              onSubmit={searchManagers}
            >
              <Field
                label={t('projects.managerSearch')}
                maxLength={100}
                name="projectManagerSearch"
                onChange={(event) => {
                  setManagerSearch(event.target.value);
                }}
                value={managerSearch}
              />
              <Button
                busy={busy}
                disabled={busy}
                type="submit"
                variant="primary"
              >
                {t('projects.searchAction')}
              </Button>
            </form>
          ) : null}
          <ul className="candidate-list">
            {managerCandidates.map((candidate) => (
              <li className="inline-item" key={candidate.managerAccountId}>
                <span>{candidate.displayName}</span>
                <Button
                  disabled={busy}
                  onClick={() => void assignManager(candidate.managerAccountId)}
                  variant="primary"
                >
                  {t('projects.assignManagerAction')}
                </Button>
              </li>
            ))}
          </ul>
          {managerAssignments.length === 0 ? (
            <div className="empty-copy" role="status">
              <p>{t('projects.noManagers')}</p>
            </div>
          ) : (
            <TableRegion aria-label={t('projects.managersTitle')}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('projects.manager')}</th>
                    <th>{t('projects.startedAt')}</th>
                    <th>{t('projects.endedAt')}</th>
                    <th>{t('projects.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {managerAssignments.map((assignment) => {
                    const active = isActiveProjectAssignment(assignment);
                    return (
                      <tr
                        className={
                          active ? undefined : 'data-table__row--historical'
                        }
                        key={assignment.assignmentId}
                      >
                        <td className="table-primary-cell">
                          {assignment.managerDisplayName}
                        </td>
                        <td>
                          {new Date(assignment.startedAt).toLocaleString()}
                        </td>
                        <td>
                          {assignment.endedAt ? (
                            new Date(assignment.endedAt).toLocaleString()
                          ) : (
                            <StatusBadge tone="success">
                              {t('projects.activeAssignment')}
                            </StatusBadge>
                          )}
                        </td>
                        <td>
                          {active ? (
                            <Button
                              busy={busy}
                              disabled={busy}
                              onClick={() =>
                                void finishManager(assignment.assignmentId)
                              }
                              variant="danger"
                            >
                              {t('projects.finishManagerAction')}
                            </Button>
                          ) : (
                            <StatusBadge tone="neutral">
                              {t('projects.historical')}
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableRegion>
          )}
        </section>
      ) : null}
    </section>
  );
}
