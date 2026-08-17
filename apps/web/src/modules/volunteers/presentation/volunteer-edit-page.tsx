import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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

  if (error) return <p className="notice notice--error">{error}</p>;
  if (!volunteer) return <p role="status">{t('common.loading')}</p>;

  return (
    <section className="admin-page">
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('volunteers.editTitle')}</h1>
        <p className="muted">{volunteer.fullName}</p>
      </header>
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
