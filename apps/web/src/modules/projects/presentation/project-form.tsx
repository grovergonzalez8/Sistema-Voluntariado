import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Field, Notice } from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import {
  validateProjectInput,
  type ProjectInput,
  type ProjectValidationErrors,
} from '../domain/project';

export function ProjectForm({
  initialValue,
  onSaved,
  projectId,
  service,
}: {
  readonly initialValue?: ProjectInput;
  readonly onSaved: (projectId: string) => void;
  readonly projectId?: string;
  readonly service: ProjectManagementService;
}) {
  const [input, setInput] = useState<ProjectInput>(
    initialValue ?? { description: '', name: '' },
  );
  const [errors, setErrors] = useState<ProjectValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateProjectInput(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setSubmitting(true);
    setError(null);
    void (
      projectId
        ? service.updateProject(projectId, input)
        : service.createProject(input)
    ).then((result) => {
      if (result.ok) onSaved(result.value.id);
      else setError(result.error.message);
      setSubmitting(false);
    });
  };

  return (
    <form className="panel volunteer-form project-form" onSubmit={submit}>
      <Field
        error={errors.name}
        label={t('projects.name')}
        maxLength={120}
        name="projectName"
        onChange={(event) => {
          const { value } = event.currentTarget;
          setInput((current) => ({ ...current, name: value }));
        }}
        value={input.name}
      />
      <label className="field">
        <span>{t('projects.descriptionField')}</span>
        <textarea
          maxLength={1000}
          name="projectDescription"
          onChange={(event) => {
            const { value } = event.currentTarget;
            setInput((current) => ({
              ...current,
              description: value,
            }));
          }}
          rows={6}
          value={input.description}
        />
        {errors.description ? (
          <span className="field__error">{errors.description}</span>
        ) : null}
      </label>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        busy={submitting}
        disabled={submitting}
        type="submit"
        variant="primary"
      >
        {submitting ? t('common.saving') : t('projects.save')}
      </Button>
    </form>
  );
}
