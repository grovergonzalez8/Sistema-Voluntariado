import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import type { ProjectActivityService } from '../application/project-activity-service';
import {
  isScheduledProjectActivity,
  type ProjectActivity,
} from '../domain/project-activity';
import type { ProjectStatus } from '../domain/project';
import { ProjectActivityForm } from './project-activity-form';

export function ProjectActivitiesSection({
  canManage,
  projectId,
  projectStatus,
  service,
}: {
  readonly canManage: boolean;
  readonly projectId: string;
  readonly projectStatus: ProjectStatus;
  readonly service: ProjectActivityService;
}) {
  const [activities, setActivities] = useState<readonly ProjectActivity[]>([]);
  const [editing, setEditing] = useState<ProjectActivity | 'create' | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useTranslation();

  const load = useCallback(async () => {
    const result = await service.listProjectActivities(projectId);
    if (result.ok) {
      setActivities(result.value);
      setError(null);
    } else setError(result.error.message);
    setLoading(false);
  }, [projectId, service]);

  useEffect(() => {
    let active = true;
    void service.listProjectActivities(projectId).then((result) => {
      if (!active) return;
      if (result.ok) setActivities(result.value);
      else setError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [projectId, service]);

  const transition = async (
    activity: ProjectActivity,
    target: 'cancelled' | 'completed',
  ) => {
    const confirmation =
      target === 'completed'
        ? t('projects.activities.confirmComplete')
        : t('projects.activities.confirmCancel');
    if (!globalThis.confirm(confirmation)) return;
    setBusy(true);
    setError(null);
    const result =
      target === 'completed'
        ? await service.completeProjectActivity(projectId, activity.id)
        : await service.cancelProjectActivity(projectId, activity.id);
    if (result.ok) {
      setSuccess(
        target === 'completed'
          ? t('projects.activities.completed')
          : t('projects.activities.cancelled'),
      );
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const mutable = canManage && projectStatus === 'active';

  return (
    <section aria-labelledby="project-activities-title">
      <div className="page-heading page-heading--actions">
        <div>
          <h2 id="project-activities-title">
            {t('projects.activities.title')}
          </h2>
          <p className="muted">{t('projects.activities.summary')}</p>
        </div>
        {mutable && editing === null ? (
          <Button
            onClick={() => {
              setEditing('create');
            }}
          >
            {t('projects.activities.createAction')}
          </Button>
        ) : null}
      </div>
      {loading ? <p role="status">{t('common.loading')}</p> : null}
      {error ? <p className="notice notice--error">{error}</p> : null}
      {success ? <p className="notice notice--success">{success}</p> : null}
      {editing ? (
        <ProjectActivityForm
          activity={editing === 'create' ? undefined : editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            setSuccess(t('projects.activities.saved'));
            void load();
          }}
          projectId={projectId}
          service={service}
        />
      ) : null}
      {!loading && activities.length === 0 ? (
        <p className="muted">{t('projects.activities.empty')}</p>
      ) : null}
      {activities.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('projects.activities.name')}</th>
                <th>{t('projects.activities.schedule')}</th>
                <th>{t('common.status')}</th>
                <th>{t('projects.activities.location')}</th>
                <th>{t('projects.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => {
                const canMutate =
                  mutable && isScheduledProjectActivity(activity);
                return (
                  <tr key={activity.id}>
                    <td>{activity.name}</td>
                    <td>
                      {new Date(activity.startsAt).toLocaleString()}
                      {activity.endsAt
                        ? ` – ${new Date(activity.endsAt).toLocaleString()}`
                        : null}
                    </td>
                    <td>
                      {t(`projects.activities.status.${activity.status}`)}
                    </td>
                    <td>{activity.locationText ?? t('common.notProvided')}</td>
                    <td>
                      {canMutate ? (
                        <div className="button-row">
                          <Button
                            disabled={busy}
                            onClick={() => {
                              setEditing(activity);
                            }}
                          >
                            {t('projects.activities.editAction')}
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void transition(activity, 'completed')
                            }
                          >
                            {t('projects.activities.completeAction')}
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void transition(activity, 'cancelled')
                            }
                          >
                            {t('projects.activities.cancelAction')}
                          </Button>
                        </div>
                      ) : (
                        t('projects.activities.readOnly')
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
