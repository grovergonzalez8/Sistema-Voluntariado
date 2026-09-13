import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  TableRegion,
} from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { VolunteerProjectAssignment } from '../domain/project-assignment';
import { getProjectStatusTone } from './project-status-badge-tone';

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
      <PageHeader
        actions={
          <Link className="button" to={`/app/admin/volunteers/${id}`}>
            {t('projects.backToVolunteer')}
          </Link>
        }
        description={t('projects.volunteerHistoryDescription')}
        eyebrow={t('admin.eyebrow')}
        title={t('projects.volunteerHistoryTitle')}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState>{t('common.loading')}</LoadingState> : null}
      {!loading && assignments.length === 0 ? (
        <EmptyState title={t('projects.noVolunteerProjects')} />
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
                    <Link
                      className="table-primary-cell"
                      to={`/app/admin/projects/${assignment.projectId}`}
                    >
                      {assignment.projectName}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge
                      tone={getProjectStatusTone(assignment.projectStatus)}
                    >
                      {t(`projects.status.${assignment.projectStatus}`)}
                    </StatusBadge>
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
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
    </section>
  );
}
