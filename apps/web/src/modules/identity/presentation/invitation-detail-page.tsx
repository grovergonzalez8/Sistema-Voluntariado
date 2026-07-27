import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { InvitationAdministrationService } from '../application/invitation-administration-service';
import type { InvitationSummary } from '../domain/account-administration';

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
    return <p className="notice notice--error">{result.error}</p>;
  }
  if (result.id !== id || !result.invitation) {
    return <p role="status">{t('common.loading')}</p>;
  }
  const invitation = result.invitation;

  return (
    <section className="admin-page">
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('invitations.detailTitle')}</h1>
        <p className="muted">{invitation.normalizedEmail}</p>
      </header>
      <section className="panel">
        <dl>
          <dt>{t('common.status')}</dt>
          <dd>{t(`invitationStatus.${invitation.status}`)}</dd>
          <dt>{t('invitations.initialRole')}</dt>
          <dd>{t(`roles.${invitation.requestedInitialRoleCode}`)}</dd>
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
