import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  LoadingState,
  Notice,
  PageHeader,
} from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';
import { VolunteerForm } from './volunteer-form';

export function VolunteerEditPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const { id = '' } = useParams();
  return <VolunteerEditPageForResource id={id} key={id} service={service} />;
}

function VolunteerEditPageForResource({
  id,
  service,
}: {
  readonly id: string;
  readonly service: VolunteerRegistryService;
}) {
  const navigate = useNavigate();
  const [volunteer, setVolunteer] = useState<RegisteredVolunteer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.getVolunteer(id).then(
      (result) => {
        if (!active) return;
        if (result.ok && result.value.id === id) {
          setVolunteer(result.value);
          setError(null);
        } else {
          setVolunteer(null);
          setError(
            result.ok ? t('common.resourceLoadError') : result.error.message,
          );
        }
      },
      () => {
        if (!active) return;
        setVolunteer(null);
        setError(t('common.resourceLoadError'));
      },
    );
    return () => {
      active = false;
    };
  }, [id, service, loadAttempt, t]);

  if (error)
    return (
      <section>
        <Notice tone="error">{error}</Notice>
        <Button
          onClick={() => {
            setError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          {t('common.retry')}
        </Button>
      </section>
    );
  if (!volunteer) return <LoadingState>{t('common.loading')}</LoadingState>;

  return (
    <section className="admin-page">
      <PageHeader
        description={volunteer.fullName}
        eyebrow={t('admin.eyebrow')}
        title={t('volunteers.editTitle')}
      />
      <VolunteerForm
        initialValue={{
          email: volunteer.email ?? '',
          fullName: volunteer.fullName,
          phone: volunteer.phone ?? '',
        }}
        onSaved={() => void navigate(`/app/admin/volunteers/${id}`)}
        service={service}
        volunteerId={volunteer.id}
      />
    </section>
  );
}
