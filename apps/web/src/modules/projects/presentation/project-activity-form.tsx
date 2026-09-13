import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Field, Notice } from '@sistema-voluntariado/ui';

import type { ProjectActivityService } from '../application/project-activity-service';
import {
  validateProjectActivityInput,
  type ProjectActivity,
  type ProjectActivityInput,
  type ProjectActivityValidationErrors,
} from '../domain/project-activity';
import {
  instantToLocalDateTime,
  localDateTimeToInstant,
} from './project-activity-date-time';

function initialInput(activity?: ProjectActivity): ProjectActivityInput {
  return activity
    ? {
        description: activity.description ?? '',
        endsAt: activity.endsAt ? instantToLocalDateTime(activity.endsAt) : '',
        locationText: activity.locationText ?? '',
        name: activity.name,
        startsAt: instantToLocalDateTime(activity.startsAt),
      }
    : {
        description: '',
        endsAt: '',
        locationText: '',
        name: '',
        startsAt: '',
      };
}

function asActivityInput(input: ProjectActivityInput): ProjectActivityInput {
  return {
    ...input,
    endsAt:
      input.endsAt === ''
        ? ''
        : (localDateTimeToInstant(input.endsAt) ?? input.endsAt),
    startsAt: localDateTimeToInstant(input.startsAt) ?? input.startsAt,
  };
}

export function ProjectActivityForm({
  activity,
  onCancel,
  onSaved,
  projectId,
  service,
}: {
  readonly activity?: ProjectActivity | undefined;
  readonly onCancel: () => void;
  readonly onSaved: (activity: ProjectActivity) => void;
  readonly projectId: string;
  readonly service: ProjectActivityService;
}) {
  const [input, setInput] = useState<ProjectActivityInput>(() =>
    initialInput(activity),
  );
  const [errors, setErrors] = useState<ProjectActivityValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const activityInput = asActivityInput(input);
    const validation = validateProjectActivityInput(activityInput);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    setError(null);
    void (
      activity
        ? service.updateProjectActivity(projectId, activity.id, activityInput)
        : service.createProjectActivity(projectId, activityInput)
    ).then((result) => {
      if (result.ok) onSaved(result.value);
      else setError(result.error.message);
      setSubmitting(false);
    });
  };

  return (
    <form
      aria-labelledby="project-activity-form-title"
      className="project-activity-form"
      onSubmit={submit}
    >
      <h3 id="project-activity-form-title">
        {activity
          ? t('projects.activities.editTitle')
          : t('projects.activities.createTitle')}
      </h3>
      <Field
        error={errors.name}
        label={t('projects.activities.name')}
        maxLength={120}
        name="projectActivityName"
        onChange={(event) => {
          const { value } = event.currentTarget;
          setInput((current) => ({ ...current, name: value }));
        }}
        required
        value={input.name}
      />
      <label className="field" htmlFor="projectActivityDescription">
        <span>{t('projects.activities.description')}</span>
        <textarea
          aria-describedby={
            errors.description ? 'projectActivityDescription-error' : undefined
          }
          aria-invalid={errors.description ? true : undefined}
          id="projectActivityDescription"
          maxLength={1000}
          name="projectActivityDescription"
          onChange={(event) => {
            const { value } = event.currentTarget;
            setInput((current) => ({ ...current, description: value }));
          }}
          rows={4}
          value={input.description}
        />
        {errors.description ? (
          <span
            className="field__error"
            id="projectActivityDescription-error"
            role="alert"
          >
            {errors.description}
          </span>
        ) : null}
      </label>
      <div className="project-activity-form__dates">
        <Field
          error={errors.startsAt}
          label={t('projects.activities.startsAt')}
          name="projectActivityStartsAt"
          onChange={(event) => {
            const { value } = event.currentTarget;
            setInput((current) => ({ ...current, startsAt: value }));
          }}
          required
          type="datetime-local"
          value={input.startsAt}
        />
        <Field
          error={errors.endsAt}
          label={t('projects.activities.endsAt')}
          name="projectActivityEndsAt"
          onChange={(event) => {
            const { value } = event.currentTarget;
            setInput((current) => ({ ...current, endsAt: value }));
          }}
          type="datetime-local"
          value={input.endsAt}
        />
      </div>
      <Field
        error={errors.locationText}
        label={t('projects.activities.location')}
        maxLength={200}
        name="projectActivityLocation"
        onChange={(event) => {
          const { value } = event.currentTarget;
          setInput((current) => ({ ...current, locationText: value }));
        }}
        value={input.locationText}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="button-row">
        <Button
          busy={submitting}
          disabled={submitting}
          type="submit"
          variant="primary"
        >
          {submitting ? t('common.saving') : t('projects.activities.save')}
        </Button>
        <Button
          disabled={submitting}
          onClick={onCancel}
          type="button"
          variant="secondary"
        >
          {t('projects.activities.cancelForm')}
        </Button>
      </div>
    </form>
  );
}
