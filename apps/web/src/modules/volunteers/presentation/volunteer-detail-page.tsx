import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LoadingState, Notice, PageHeader } from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';

export function VolunteerDetailPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const { id = '' } = useParams();
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
        actions={
          <div className="button-row toolbar-actions">
            <Link
              className="button"
              to={`/app/admin/volunteers/${id}/projects`}
            >
              {t('volunteers.projectsAction')}
            </Link>
            <Link
              className="button button--primary"
              to={`/app/admin/volunteers/${id}/edit`}
            >
              {t('volunteers.editAction')}
            </Link>
          </div>
        }
        description={t('volunteers.detailDescription')}
        eyebrow={t('admin.eyebrow')}
        title={volunteer.fullName}
        titleClassName="dynamic-title"
      />
      <dl className="panel volunteer-detail">
        <div>
          <dt>{t('volunteers.email')}</dt>
          <dd>{volunteer.email ?? t('common.notProvided')}</dd>
        </div>
        <div>
          <dt>{t('volunteers.phone')}</dt>
          <dd>{volunteer.phone ?? t('common.notProvided')}</dd>
        </div>
        <div>
          <dt>{t('volunteers.registeredAt')}</dt>
          <dd>{new Date(volunteer.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t('volunteers.updatedAt')}</dt>
          <dd>{new Date(volunteer.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}
