import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LoadingState, Notice, PageHeader } from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';
import { VolunteerForm } from './volunteer-form';

export function VolunteerEditPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [volunteer, setVolunteer] = useState<RegisteredVolunteer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.getVolunteer(id).then((result) => {
      if (!active) return;
      if (result.ok) setVolunteer(result.value);
      else setError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [id, service]);

  if (error) return <Notice tone="error">{error}</Notice>;
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
        volunteerId={id}
      />
    </section>
  );
}
