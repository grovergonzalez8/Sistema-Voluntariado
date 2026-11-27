import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  LoadingState,
  Notice,
  PageHeader,
} from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';

export function VolunteerDetailPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const { id = '' } = useParams();
  return <VolunteerDetailPageForResource id={id} key={id} service={service} />;
}

function VolunteerDetailPageForResource({
  id,
  service,
}: {
  readonly id: string;
  readonly service: VolunteerRegistryService;
}) {
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
