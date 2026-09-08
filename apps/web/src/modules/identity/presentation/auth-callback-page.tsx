import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useIdentity } from './identity-context';
import { callbackFailureMessage, parseAuthCallback } from './auth-callback';

export function AuthCallbackPage() {
  const identity = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const callback = parseAuthCallback(location.search, location.hash);
    if (callback.failure && identity.access.kind === 'initializing') {
      return;
    }
    if (callback.failure) {
      handled.current = true;
      const state = {
        authCallbackError: callbackFailureMessage(callback.failure),
      };
      const redirect = () => {
        void navigate('/login', { replace: true, state });
      };
      if (identity.user) {
        void identity.signOut().then(redirect, redirect);
      } else {
        redirect();
      }
      return;
    }

    if (
      identity.access.kind === 'initializing' ||
      identity.access.kind === 'loading-authority'
    ) {
      return;
    }

    handled.current = true;
    if (callback.challenge) {
      if (
        identity.user &&
        (identity.access.kind === 'invited' ||
          identity.access.kind === 'pending-profile')
      ) {
        void navigate('/invite/accept', {
          replace: true,
          state: { invitationAcceptanceChallenge: callback.challenge },
        });
        return;
      }

      const state = { authCallbackError: 'actorMismatch' };
      const redirect = () => {
        void navigate('/login', { replace: true, state });
      };
      if (identity.user) {
        void identity.signOut().then(redirect, redirect);
      } else {
        redirect();
      }
      return;
    }

    void navigate(identity.user ? '/app/profile' : '/login', {
      replace: true,
    });
  }, [
    identity,
    identity.access.kind,
    identity.signOut,
    identity.user,
    location.hash,
    location.search,
    navigate,
  ]);

  return (
    <main className="centered-status" role="status">
      {t('onboarding.validatingLink')}
    </main>
  );
}
