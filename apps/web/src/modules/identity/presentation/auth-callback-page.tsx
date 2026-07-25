import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useIdentity } from './identity-context';

export function AuthCallbackPage() {
  const identity = useIdentity();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (identity.status !== 'ready') return;
    void navigate(identity.user ? '/invite/accept' : '/login', {
      replace: true,
    });
  }, [identity.status, identity.user, navigate]);

  return (
    <main className="centered-status" role="status">
      {t('onboarding.validatingLink')}
    </main>
  );
}
