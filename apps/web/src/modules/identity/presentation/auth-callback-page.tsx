import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useIdentity } from './identity-context';

export function AuthCallbackPage() {
  const identity = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (identity.access.kind === 'initializing') return;
    const challenge = new URLSearchParams(location.search).get(
      'invitation_challenge',
    );
    void navigate(identity.user && challenge ? '/invite/accept' : '/login', {
      replace: true,
      state:
        identity.user && challenge
          ? { invitationAcceptanceChallenge: challenge }
          : null,
    });
  }, [identity.access.kind, identity.user, location.search, navigate]);

  return (
    <main className="centered-status" role="status">
      {t('onboarding.validatingLink')}
    </main>
  );
}
