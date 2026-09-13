import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LoadingState } from '@sistema-voluntariado/ui';

import { useIdentity } from './identity-context';
import { callbackFailureMessage, parseAuthCallback } from './auth-callback';
import { SessionCleanupNotice } from './session-cleanup-notice';
import { useSessionCleanup } from './use-session-cleanup';

export function AuthCallbackPage() {
  const identity = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handled = useRef(false);
  const {
    retry: retrySessionCleanup,
    start: startSessionCleanup,
    status: sessionCleanupStatus,
  } = useSessionCleanup(identity.signOut);

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
        startSessionCleanup(redirect);
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
        startSessionCleanup(redirect);
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
    identity.user,
    location.hash,
    location.search,
    navigate,
    startSessionCleanup,
  ]);

  return (
    <main className="centered-status">
      {sessionCleanupStatus === 'idle' ? (
        <LoadingState>{t('onboarding.validatingLink')}</LoadingState>
      ) : (
        <SessionCleanupNotice
          onRetry={retrySessionCleanup}
          status={sessionCleanupStatus}
        />
      )}
    </main>
  );
}
