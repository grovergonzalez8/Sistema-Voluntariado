import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@sistema-voluntariado/ui';

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
      <PageHeader
        description={t('volunteers.createDescription')}
        eyebrow={t('admin.eyebrow')}
        title={t('volunteers.createTitle')}
      />
      <VolunteerForm
        onSaved={(id) => void navigate(`/app/admin/volunteers/${id}`)}
        service={service}
      />
    </section>
  );
}
