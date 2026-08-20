import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import {
  validateVolunteerInput,
  type VolunteerInput,
  type VolunteerValidationErrors,
} from '../domain/registered-volunteer';
import {
  duplicateEvidenceLabel,
  type VolunteerDuplicateMatch,
} from '../domain/volunteer-duplicates';

export function VolunteerForm({
  initialValue,
  onSaved,
  service,
  volunteerId,
}: {
  readonly initialValue?: VolunteerInput;
  readonly onSaved: (volunteerId: string) => void;
  readonly service: VolunteerRegistryService;
  readonly volunteerId?: string;
}) {
  const [input, setInput] = useState<VolunteerInput>(
    initialValue ?? { email: '', fullName: '', phone: '' },
  );
  const [errors, setErrors] = useState<VolunteerValidationErrors>({});
  const [duplicateMatches, setDuplicateMatches] = useState<
    readonly VolunteerDuplicateMatch[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const save = async (acceptPotentialDuplicate: boolean) => {
    const validation = validateVolunteerInput(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = volunteerId
      ? await service.updateVolunteer(
          volunteerId,
          input,
          acceptPotentialDuplicate,
        )
      : await service.createVolunteer(input, acceptPotentialDuplicate);
    if (result.ok) {
      if (result.value.kind === 'duplicate-warning') {
        setDuplicateMatches(result.value.duplicateMatches);
      } else {
        setDuplicateMatches([]);
        onSaved(result.value.volunteer.id);
      }
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <form className="panel volunteer-form" onSubmit={submit}>
      <Field
        autoComplete="name"
        error={errors.fullName}
        label={t('volunteers.fullName')}
        maxLength={100}
        name="volunteerFullName"
        onChange={(event) => {
          setInput({ ...input, fullName: event.target.value });
          setDuplicateMatches([]);
        }}
        value={input.fullName}
      />
      <Field
        autoComplete="email"
        error={errors.email}
        label={t('volunteers.email')}
        maxLength={254}
        name="volunteerEmail"
        onChange={(event) => {
          setInput({ ...input, email: event.target.value });
          setDuplicateMatches([]);
        }}
        type="email"
        value={input.email}
      />
      <Field
        autoComplete="tel"
        error={errors.phone}
        label={t('volunteers.phone')}
        maxLength={40}
        name="volunteerPhone"
        onChange={(event) => {
          setInput({ ...input, phone: event.target.value });
          setDuplicateMatches([]);
        }}
        type="tel"
        value={input.phone}
      />
      {error ? <p className="notice notice--error">{error}</p> : null}
      {duplicateMatches.length > 0 ? (
        <section className="notice notice--warning" role="alert">
          <strong>{t('volunteers.duplicateTitle')}</strong>
          <p>{t('volunteers.duplicateDescription')}</p>
          <ul>
            {duplicateMatches.map((match) => (
              <li key={match.id}>
                {match.fullName} — {duplicateEvidenceLabel(match.matchedFields)}
              </li>
            ))}
          </ul>
          <Button disabled={submitting} onClick={() => void save(true)}>
            {t('volunteers.saveDuplicate')}
          </Button>
        </section>
      ) : null}
      <Button className="button--primary" disabled={submitting} type="submit">
        {submitting ? t('common.saving') : t('volunteers.save')}
      </Button>
    </form>
  );
}
