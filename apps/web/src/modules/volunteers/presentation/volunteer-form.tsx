import { useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Field, Notice } from '@sistema-voluntariado/ui';

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
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const { t } = useTranslation();

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = async (acceptPotentialDuplicate: boolean) => {
    if (inFlight.current) return;
    const validation = validateVolunteerInput(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = volunteerId
        ? await service.updateVolunteer(
            volunteerId,
            input,
            acceptPotentialDuplicate,
          )
        : await service.createVolunteer(input, acceptPotentialDuplicate);
      if (!mounted.current) return;
      if (result.ok) {
        if (result.value.kind === 'duplicate-warning') {
          setDuplicateMatches(result.value.duplicateMatches);
        } else {
          setDuplicateMatches([]);
          if (volunteerId && result.value.volunteer.id !== volunteerId) {
            setError(t('common.resourceSaveError'));
          } else onSaved(result.value.volunteer.id);
        }
      } else {
        setError(result.error.message);
      }
    } catch {
      if (mounted.current) setError(t('common.resourceSaveError'));
    } finally {
      if (mounted.current) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
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
      {error ? <Notice tone="error">{error}</Notice> : null}
      {duplicateMatches.length > 0 ? (
        <Notice tone="warning" role="alert">
          <strong>{t('volunteers.duplicateTitle')}</strong>
          <p>{t('volunteers.duplicateDescription')}</p>
          <ul>
            {duplicateMatches.map((match) => (
              <li key={match.id}>
                {match.fullName} — {duplicateEvidenceLabel(match.matchedFields)}
              </li>
            ))}
          </ul>
          <Button
            busy={submitting}
            disabled={submitting}
            onClick={() => void save(true)}
          >
            {t('volunteers.saveDuplicate')}
          </Button>
        </Notice>
      ) : null}
      <Button
        busy={submitting}
        disabled={submitting}
        type="submit"
        variant="primary"
      >
        {submitting ? t('common.saving') : t('volunteers.save')}
      </Button>
    </form>
  );
}
