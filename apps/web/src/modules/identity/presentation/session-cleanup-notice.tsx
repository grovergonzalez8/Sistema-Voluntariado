import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import type { SessionCleanupStatus } from './use-session-cleanup';

export function SessionCleanupNotice({
  onRetry,
  status,
}: {
  readonly onRetry: () => void;
  readonly status: SessionCleanupStatus;
}) {
  const { t } = useTranslation();

  if (status === 'failed') {
    return (
      <>
        <p className="notice notice--error" role="alert">
          {t('onboarding.sessionCleanupFailed')}
        </p>
        <Button className="button--primary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </>
    );
  }

  return <p className="muted">{t('onboarding.signingOut')}</p>;
}
