import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { TableRegion } from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { VolunteerProjectAssignment } from '../domain/project-assignment';

export function VolunteerProjectsPage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const { id = '' } = useParams();
  const [assignments, setAssignments] = useState<
    readonly VolunteerProjectAssignment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.listVolunteerProjects(id).then((result) => {
      if (!active) return;
      if (result.ok) setAssignments(result.value);
      else setError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id, service]);

  return (
    <section className="admin-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h1>{t('projects.volunteerHistoryTitle')}</h1>
          <p className="muted">{t('projects.volunteerHistoryDescription')}</p>
        </div>
        <Link className="button" to={`/app/admin/volunteers/${id}`}>
          {t('projects.backToVolunteer')}
        </Link>
      </header>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading ? <p role="status">{t('common.loading')}</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">{t('projects.noVolunteerProjects')}</p>
      ) : null}
      {!loading && assignments.length > 0 ? (
        <TableRegion aria-label={t('projects.volunteerHistoryTitle')}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('projects.name')}</th>
                <th>{t('common.status')}</th>
                <th>{t('projects.startedAt')}</th>
                <th>{t('projects.endedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.assignmentId}>
                  <td>
                    <Link to={`/app/admin/projects/${assignment.projectId}`}>
                      {assignment.projectName}
                    </Link>
                  </td>
                  <td>{t(`projects.status.${assignment.projectStatus}`)}</td>
                  <td>{new Date(assignment.startedAt).toLocaleString()}</td>
                  <td>
                    {assignment.endedAt
                      ? new Date(assignment.endedAt).toLocaleString()
                      : t('projects.activeAssignment')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
    </section>
  );
}
