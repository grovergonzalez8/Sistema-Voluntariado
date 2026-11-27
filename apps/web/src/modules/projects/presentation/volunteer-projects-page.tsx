import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
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
  return (
    <VolunteerProjectsPageForResource id={id} key={id} service={service} />
  );
}

function VolunteerProjectsPageForResource({
  id,
  service,
}: {
  readonly id: string;
  readonly service: ProjectManagementService;
}) {
  const [assignments, setAssignments] = useState<
    readonly VolunteerProjectAssignment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.listVolunteerProjects(id).then(
      (result) => {
        if (!active) return;
        if (result.ok) {
          setAssignments(result.value);
          setError(null);
        } else {
          setAssignments([]);
          setError(result.error.message);
        }
        setLoading(false);
      },
      () => {
        if (!active) return;
        setAssignments([]);
        setError(t('common.resourceLoadError'));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [id, service, loadAttempt, t]);

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
      {error ? (
        <div>
          <Notice tone="error">{error}</Notice>
          <Button
            onClick={() => {
              setError(null);
              setLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
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
