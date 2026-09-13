import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import {
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@sistema-voluntariado/ui';

import type { InvitationAdministrationService } from '../application/invitation-administration-service';
import type { InvitationSummary } from '../domain/account-administration';
import { getInvitationStatusTone } from './status-badge-tone';

export function InvitationDetailPage({
  service,
}: {
  readonly service: InvitationAdministrationService;
}) {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [result, setResult] = useState<{
    readonly error: string | null;
    readonly id: string;
    readonly invitation: InvitationSummary | null;
  }>({ error: null, id: '', invitation: null });

  useEffect(() => {
    let active = true;
    void service.getInvitationDetail(id).then((detail) => {
      if (!active) return;
      setResult(
        detail.ok
          ? { error: null, id, invitation: detail.value }
          : { error: detail.error.message, id, invitation: null },
      );
    });
    return () => {
      active = false;
    };
  }, [id, service]);

  if (result.id === id && result.error) {
    return <Notice tone="error">{result.error}</Notice>;
  }
  if (result.id !== id || !result.invitation) {
    return <LoadingState>{t('common.loading')}</LoadingState>;
  }
  const invitation = result.invitation;

  return (
    <section className="admin-page">
      <PageHeader
        description={invitation.normalizedEmail}
        eyebrow={t('admin.eyebrow')}
        title={t('invitations.detailTitle')}
      />
      <section className="panel detail-panel">
        <dl className="detail-list">
          <dt>{t('common.status')}</dt>
          <dd>
            <StatusBadge tone={getInvitationStatusTone(invitation.status)}>
              {t(`invitationStatus.${invitation.status}`)}
            </StatusBadge>
          </dd>
          <dt>{t('invitations.initialRole')}</dt>
          <dd>
            <StatusBadge>
              {t(`roles.${invitation.requestedInitialRoleCode}`)}
            </StatusBadge>
          </dd>
          <dt>{t('invitations.locale')}</dt>
          <dd>{invitation.preferredLocale}</dd>
          <dt>{t('invitations.createdAt')}</dt>
          <dd>{new Date(invitation.createdAt).toLocaleString()}</dd>
          <dt>{t('invitations.sentAt')}</dt>
          <dd>
            {invitation.sentAt
              ? new Date(invitation.sentAt).toLocaleString()
              : t('common.notAvailable')}
          </dd>
          <dt>{t('invitations.expires')}</dt>
          <dd>{new Date(invitation.expiresAt).toLocaleString()}</dd>
        </dl>
      </section>
    </section>
  );
}
