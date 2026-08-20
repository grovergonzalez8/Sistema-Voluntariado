import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import { VolunteerForm } from './volunteer-form';

export function VolunteerCreatePage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <section className="admin-page">
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('volunteers.createTitle')}</h1>
        <p className="muted">{t('volunteers.createDescription')}</p>
      </header>
      <VolunteerForm
        onSaved={(id) => void navigate(`/app/admin/volunteers/${id}`)}
        service={service}
      />
    </section>
  );
}
