import { useTranslation } from 'react-i18next';

import { Button, LoadingState, Notice } from '@sistema-voluntariado/ui';

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
        <Notice tone="error">{t('onboarding.sessionCleanupFailed')}</Notice>
        <Button onClick={onRetry} variant="primary">
          {t('common.retry')}
        </Button>
      </>
    );
  }

  return <LoadingState>{t('onboarding.signingOut')}</LoadingState>;
}
