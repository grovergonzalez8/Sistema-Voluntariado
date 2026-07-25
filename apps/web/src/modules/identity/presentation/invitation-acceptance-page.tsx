import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import type { OnboardingService } from '../application/onboarding-service';
import { useIdentity } from './identity-context';

export function InvitationAcceptancePage({
  service,
}: {
  readonly service: OnboardingService;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const identity = useIdentity();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (identity.account?.status === 'pending_profile') {
    return <Navigate replace to="/app/complete-profile" />;
  }
  if (identity.account?.status === 'active') {
    return <Navigate replace to="/app/profile" />;
  }
  if (identity.account?.status !== 'invited') {
    return <Navigate replace to="/account-blocked" />;
  }

  const accept = async () => {
    setSubmitting(true);
    setError(null);
    const result = await service.acceptCurrentInvitation();
    if (result.ok) {
      await identity.refreshAccountContext();
      await navigate('/app/complete-profile', { replace: true });
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">{t('onboarding.eyebrow')}</p>
        <h1>{t('onboarding.acceptTitle')}</h1>
        <p className="muted">{t('onboarding.acceptDescription')}</p>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className="button--primary"
          disabled={submitting}
          onClick={() => void accept()}
        >
          {submitting ? t('onboarding.accepting') : t('onboarding.accept')}
        </Button>
      </section>
    </main>
  );
}
