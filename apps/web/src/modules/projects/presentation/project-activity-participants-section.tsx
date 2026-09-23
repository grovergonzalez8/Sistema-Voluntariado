import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  Field,
  LoadingState,
  Notice,
  StatusBadge,
  TableRegion,
} from '@sistema-voluntariado/ui';

import type { ProjectActivityAttendanceService } from '../application/project-activity-attendance-service';
import type { ProjectActivityParticipationService } from '../application/project-activity-participation-service';
import type {
  ProjectActivityAttendance,
  ProjectActivityAttendanceStatus,
} from '../domain/project-activity-attendance';
import type { ProjectActivityParticipation } from '../domain/project-activity-participation';
import { isActiveProjectActivityParticipation } from '../domain/project-activity-participation';
import type { ProjectActivity } from '../domain/project-activity';
import { isScheduledProjectActivity } from '../domain/project-activity';
import type { ProjectStatus } from '../domain/project';

interface ParticipantAttendanceSnapshot {
  readonly attendances: readonly ProjectActivityAttendance[];
  readonly participations: readonly ProjectActivityParticipation[];
}

export function ProjectActivityParticipantsSection({
  activity,
  attendanceService,
  canManage,
  projectId,
  projectStatus,
  service,
}: {
  readonly activity: ProjectActivity;
  readonly attendanceService: ProjectActivityAttendanceService;
  readonly canManage: boolean;
  readonly projectId: string;
  readonly projectStatus: ProjectStatus;
  readonly service: ProjectActivityParticipationService;
}) {
  const [snapshot, setSnapshot] =
    useState<ParticipantAttendanceSnapshot | null>(null);
  const [candidates, setCandidates] = useState<
    readonly { volunteerId: string; volunteerName: string }[]
  >([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyAttendanceIds, setBusyAttendanceIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const attendanceRevision = useRef(0);
  const pendingAttendanceFocus = useRef<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { t } = useTranslation();

  const participationMutable =
    canManage &&
    projectStatus === 'active' &&
    isScheduledProjectActivity(activity);
  const attendanceMutable =
    canManage && projectStatus === 'active' && activity.status === 'completed';

  const load = useCallback(
    async (clearFeedback = true) => {
      const generation = ++requestGeneration.current;
      let revision = attendanceRevision.current;
      setLoading(true);
      while (generation === requestGeneration.current) {
        const [participationsResult, attendancesResult] = await Promise.all([
          service.listParticipations(projectId, activity.id),
          attendanceService.listAttendances(projectId, activity.id),
        ]);
        if (generation !== requestGeneration.current) return;
        if (revision !== attendanceRevision.current) {
          revision = attendanceRevision.current;
          continue;
        }
        if (!participationsResult.ok) {
          setSnapshot(null);
          setError(participationsResult.error.message);
        } else if (!attendancesResult.ok) {
          setSnapshot(null);
          setError(attendancesResult.error.message);
        } else {
          setSnapshot({
            attendances: attendancesResult.value,
            participations: participationsResult.value,
          });
          if (clearFeedback) setError(null);
        }
        setLoading(false);
        return;
      }
    },
    [activity.id, attendanceService, projectId, service],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      requestGeneration.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const participationId = pendingAttendanceFocus.current;
    if (!participationId || busyAttendanceIds.has(participationId)) return;
    const target = sectionRef.current?.querySelector<HTMLButtonElement>(
      `button[data-attendance-participation-id="${participationId}"]`,
    );
    target?.focus();
    pendingAttendanceFocus.current = null;
  }, [busyAttendanceIds, snapshot]);

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
      await load(false);
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
      await load(false);
    } else setError(result.error.message);
    setBusy(false);
  };

  const setAttendance = async (
    participationId: string,
    expectedStatus: ProjectActivityAttendanceStatus | null,
    status: ProjectActivityAttendanceStatus,
  ) => {
    setBusyAttendanceIds((current) => new Set(current).add(participationId));
    setError(null);
    setSuccess(null);
    const result = await attendanceService.setAttendance(
      projectId,
      activity.id,
      participationId,
      expectedStatus,
      status,
    );
    if (result.ok) {
      pendingAttendanceFocus.current = participationId;
      attendanceRevision.current += 1;
      setSnapshot((current) =>
        current
          ? {
              ...current,
              attendances: [
                ...current.attendances.filter(
                  (attendance) =>
                    attendance.participationId !== participationId,
                ),
                result.value,
              ],
            }
          : current,
      );
      setSuccess(t('projects.activities.participants.attendance.saved'));
    } else if (result.error.code === 'attendance-stale') {
      pendingAttendanceFocus.current = participationId;
      setError(t('projects.activities.participants.attendance.stale'));
      await load(false);
    } else setError(result.error.message);
    setBusyAttendanceIds((current) => {
      const next = new Set(current);
      next.delete(participationId);
      return next;
    });
  };

  const renderAttendance = (participationId: string) => {
    const attendance = snapshot?.attendances.find(
      (item) => item.participationId === participationId,
    );
    const attendanceBusy = busyAttendanceIds.has(participationId);
    const status = attendance?.status ?? null;
    return (
      <div className="attendance-cell">
        <StatusBadge
          tone={
            status === 'present'
              ? 'success'
              : status === 'absent'
                ? 'danger'
                : 'neutral'
          }
        >
          {status
            ? t(`projects.activities.participants.attendance.status.${status}`)
            : t(
                'projects.activities.participants.attendance.status.unregistered',
              )}
        </StatusBadge>
        {attendanceMutable ? (
          <div className="attendance-actions">
            {status !== 'present' ? (
              <Button
                busy={attendanceBusy}
                data-attendance-participation-id={participationId}
                disabled={attendanceBusy}
                onClick={() =>
                  void setAttendance(participationId, status, 'present')
                }
                variant="primary"
              >
                {status === null
                  ? t('projects.activities.participants.attendance.markPresent')
                  : t(
                      'projects.activities.participants.attendance.correctPresent',
                    )}
              </Button>
            ) : null}
            {status !== 'absent' ? (
              <Button
                busy={attendanceBusy}
                data-attendance-participation-id={participationId}
                disabled={attendanceBusy}
                onClick={() =>
                  void setAttendance(participationId, status, 'absent')
                }
                variant={status === null ? 'secondary' : 'danger'}
              >
                {status === null
                  ? t('projects.activities.participants.attendance.markAbsent')
                  : t(
                      'projects.activities.participants.attendance.correctAbsent',
                    )}
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="attendance-read-only">
            {t('projects.activities.participants.attendance.readOnly')}
          </span>
        )}
      </div>
    );
  };

  const participations = snapshot?.participations ?? [];
  const ready = !loading && snapshot !== null;

  return (
    <section
      aria-labelledby={`activity-participants-${activity.id}`}
      className="project-subsection activity-participants-section"
      id={`activity-participation-${activity.id}`}
      ref={sectionRef}
    >
      <h3 id={`activity-participants-${activity.id}`}>
        {t('projects.activities.participants.title', { name: activity.name })}
      </h3>
      <p className="muted">
        {participationMutable
          ? t('projects.activities.participants.summary')
          : t('projects.activities.participants.readOnly')}
      </p>
      {loading ? (
        <LoadingState>
          {t('projects.activities.participants.attendance.loading')}
        </LoadingState>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}
      {participationMutable ? (
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
      {participationMutable && candidates.length > 0 ? (
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
      {ready && participations.length === 0 ? (
        <EmptyState
          description={t('projects.activities.participants.emptyDescription')}
          title={t('projects.activities.participants.empty')}
        />
      ) : null}
      {ready && participations.length > 0 ? (
        <TableRegion
          aria-label={t('projects.activities.participants.title', {
            name: activity.name,
          })}
        >
          <table className="data-table activity-participants-table">
            <thead>
              <tr>
                <th>{t('projects.volunteer')}</th>
                <th>{t('projects.startedAt')}</th>
                <th>{t('projects.endedAt')}</th>
                <th>
                  {t('projects.activities.participants.attendance.title')}
                </th>
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
                      ) : participationMutable ? (
                        <StatusBadge tone="success">
                          {t('projects.activities.participants.current')}
                        </StatusBadge>
                      ) : (
                        t('projects.activities.participants.historicalUnended')
                      )}
                    </td>
                    <td>{renderAttendance(participation.participationId)}</td>
                    <td>
                      {participationMutable && explicitlyActive ? (
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
