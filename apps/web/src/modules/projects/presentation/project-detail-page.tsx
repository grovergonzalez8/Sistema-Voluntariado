import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { isActiveProjectAssignment } from '../domain/project-assignment';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type {
  ProjectVolunteerAssignment,
  ProjectVolunteerCandidate,
} from '../domain/project-assignment';
import type { Project } from '../domain/project';

export function ProjectDetailPage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const { id = '' } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<
    readonly ProjectVolunteerAssignment[]
  >([]);
  const [candidates, setCandidates] = useState<
    readonly ProjectVolunteerCandidate[]
  >([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useTranslation();

  const load = useCallback(async () => {
    const [projectResult, assignmentsResult] = await Promise.all([
      service.getProject(id),
      service.listProjectAssignments(id),
    ]);
    if (!projectResult.ok) setError(projectResult.error.message);
    else if (!assignmentsResult.ok) setError(assignmentsResult.error.message);
    else {
      setProject(projectResult.value);
      setAssignments(assignmentsResult.value);
      setError(null);
    }
    setLoading(false);
  }, [id, service]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      service.getProject(id),
      service.listProjectAssignments(id),
    ]).then(([projectResult, assignmentsResult]) => {
      if (!active) return;
      if (!projectResult.ok) setError(projectResult.error.message);
      else if (!assignmentsResult.ok) setError(assignmentsResult.error.message);
      else {
        setProject(projectResult.value);
        setAssignments(assignmentsResult.value);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id, service]);

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

  if (loading && !project) return <p role="status">{t('common.loading')}</p>;
  if (error && !project) return <p className="notice notice--error">{error}</p>;
  if (!project) return null;

  return (
    <section className="admin-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h1>{project.name}</h1>
          <p className="muted">
            {project.description ?? t('common.notProvided')}
          </p>
        </div>
        <div className="button-row">
          <Link className="button" to={`/app/admin/projects/${id}/edit`}>
            {t('projects.editAction')}
          </Link>
          {project.status === 'active' ? (
            <Button disabled={busy} onClick={() => void close()}>
              {t('projects.closeAction')}
            </Button>
          ) : null}
        </div>
      </header>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {success ? <p className="notice notice--success">{success}</p> : null}
      <dl className="panel volunteer-detail">
        <div>
          <dt>{t('common.status')}</dt>
          <dd>{t(`projects.status.${project.status}`)}</dd>
        </div>
        <div>
          <dt>{t('projects.createdAt')}</dt>
          <dd>{new Date(project.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
      {project.status === 'active' ? (
        <section className="panel project-assignment-panel">
          <h2>{t('projects.assignTitle')}</h2>
          <p className="muted">{t('projects.assignDescription')}</p>
          <form
            className="search-row search-row--single"
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
            <Button disabled={busy} type="submit">
              {t('projects.searchAction')}
            </Button>
          </form>
          {candidates.length === 0 && search ? (
            <p>{t('projects.noCandidates')}</p>
          ) : null}
          <ul className="candidate-list">
            {candidates.map((candidate) => (
              <li className="inline-item" key={candidate.id}>
                <span>{candidate.fullName}</span>
                <Button
                  disabled={busy}
                  onClick={() => void assign(candidate.id)}
                >
                  {t('projects.assignAction')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>{t('projects.participantsTitle')}</h2>
        {assignments.length === 0 ? (
          <p className="muted">{t('projects.noParticipants')}</p>
        ) : (
          <div className="table-scroll">
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
                {assignments.map((assignment) => (
                  <tr key={assignment.assignmentId}>
                    <td>
                      <Link
                        to={`/app/admin/volunteers/${assignment.volunteerId}`}
                      >
                        {assignment.volunteerName}
                      </Link>
                    </td>
                    <td>{new Date(assignment.startedAt).toLocaleString()}</td>
                    <td>
                      {assignment.endedAt
                        ? new Date(assignment.endedAt).toLocaleString()
                        : t('projects.activeAssignment')}
                    </td>
                    <td>
                      {isActiveProjectAssignment(assignment) ? (
                        <Button
                          disabled={busy}
                          onClick={() => void finish(assignment.assignmentId)}
                        >
                          {t('projects.finishAction')}
                        </Button>
                      ) : (
                        t('projects.historical')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
