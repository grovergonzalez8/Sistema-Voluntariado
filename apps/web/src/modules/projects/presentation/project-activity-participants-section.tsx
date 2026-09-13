import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Field,
  LoadingState,
  Notice,
  StatusBadge,
  TableRegion,
} from '@sistema-voluntariado/ui';

import type { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type { ProjectActivityParticipation } from '../domain/project-activity-participation';
import { isActiveProjectActivityParticipation } from '../domain/project-activity-participation';
import type { ProjectActivity } from '../domain/project-activity';
import { isScheduledProjectActivity } from '../domain/project-activity';
import type { ProjectStatus } from '../domain/project';

export function ProjectActivityParticipantsSection({
  activity,
  canManage,
  projectId,
  projectStatus,
  service,
}: {
  readonly activity: ProjectActivity;
  readonly canManage: boolean;
  readonly projectId: string;
  readonly projectStatus: ProjectStatus;
  readonly service: ProjectActivityParticipationService;
}) {
  const [participations, setParticipations] = useState<
    readonly ProjectActivityParticipation[]
  >([]);
  const [candidates, setCandidates] = useState<
    readonly { volunteerId: string; volunteerName: string }[]
  >([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useTranslation();

  const mutable =
    canManage &&
    projectStatus === 'active' &&
    isScheduledProjectActivity(activity);

  const load = useCallback(async () => {
    const result = await service.listParticipations(projectId, activity.id);
    if (result.ok) {
      setParticipations(result.value);
      setError(null);
    } else setError(result.error.message);
    setLoading(false);
  }, [activity.id, projectId, service]);

  useEffect(() => {
    let active = true;
    void service.listParticipations(projectId, activity.id).then((result) => {
      if (!active) return;
      if (result.ok) setParticipations(result.value);
      else setError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activity.id, projectId, service]);

  const search = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    void service
      .searchEligibleCandidates(projectId, activity.id, query)
      .then((result) => {
        if (result.ok) setCandidates(result.value);
        else setError(result.error.message);
        setBusy(false);
      });
  };

  const add = async (volunteerId: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await service.createParticipation(
      projectId,
      activity.id,
      volunteerId,
    );
    if (result.ok) {
      setCandidates([]);
      setQuery('');
      setSuccess(t('projects.activities.participants.added'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  const finish = async (participationId: string) => {
    if (
      !globalThis.confirm(t('projects.activities.participants.confirmFinish'))
    )
      return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await service.finishParticipation(
      projectId,
      activity.id,
      participationId,
    );
    if (result.ok) {
      setSuccess(t('projects.activities.participants.finished'));
      await load();
    } else setError(result.error.message);
    setBusy(false);
  };

  return (
    <section
      aria-labelledby={`activity-participants-${activity.id}`}
      className="project-subsection activity-participants-section"
      id={`activity-participation-${activity.id}`}
    >
      <h3 id={`activity-participants-${activity.id}`}>
        {t('projects.activities.participants.title', { name: activity.name })}
      </h3>
      <p className="muted">
        {mutable
          ? t('projects.activities.participants.summary')
          : t('projects.activities.participants.readOnly')}
      </p>
      {loading ? <LoadingState>{t('common.loading')}</LoadingState> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}
      {mutable ? (
        <form
          className="search-row search-row--single toolbar-form"
          onSubmit={search}
        >
          <Field
            label={t('projects.activities.participants.search')}
            maxLength={100}
            name={`activityVolunteerSearch-${activity.id}`}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            value={query}
          />
          <Button busy={busy} disabled={busy} type="submit" variant="primary">
            {t('projects.searchAction')}
          </Button>
        </form>
      ) : null}
      {mutable && candidates.length > 0 ? (
        <ul className="candidate-list">
          {candidates.map((candidate) => (
            <li className="inline-item" key={candidate.volunteerId}>
              <span>{candidate.volunteerName}</span>
              <Button
                disabled={busy}
                onClick={() => void add(candidate.volunteerId)}
                variant="primary"
              >
                {t('projects.activities.participants.addAction')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && participations.length === 0 ? (
        <div className="empty-copy" role="status">
          <p>{t('projects.activities.participants.empty')}</p>
        </div>
      ) : null}
      {participations.length > 0 ? (
        <TableRegion
          aria-label={t('projects.activities.participants.title', {
            name: activity.name,
          })}
        >
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
              {participations.map((participation) => {
                const explicitlyActive =
                  isActiveProjectActivityParticipation(participation);
                return (
                  <tr
                    className={
                      explicitlyActive
                        ? undefined
                        : 'data-table__row--historical'
                    }
                    key={participation.participationId}
                  >
                    <td className="table-primary-cell">
                      {participation.volunteerName}
                    </td>
                    <td>
                      {new Date(participation.startedAt).toLocaleString()}
                    </td>
                    <td>
                      {participation.endedAt ? (
                        new Date(participation.endedAt).toLocaleString()
                      ) : mutable ? (
                        <StatusBadge tone="success">
                          {t('projects.activities.participants.current')}
                        </StatusBadge>
                      ) : (
                        t('projects.activities.participants.historicalUnended')
                      )}
                    </td>
                    <td>
                      {mutable && explicitlyActive ? (
                        <Button
                          busy={busy}
                          disabled={busy}
                          onClick={() =>
                            void finish(participation.participationId)
                          }
                          variant="danger"
                        >
                          {t('projects.activities.participants.finishAction')}
                        </Button>
                      ) : (
                        <StatusBadge tone="neutral">
                          {t('projects.activities.readOnly')}
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
    </section>
  );
}
