import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';
import type { AppErrorCode } from '@sistema-voluntariado/shared-kernel';

import type { OnboardingService } from '../application/onboarding-service';
import {
  AuthorityLoadingPage,
  AuthorityRecoveryPage,
  ForbiddenAccessPage,
} from './account-access-route';
import { useIdentity } from './identity-context';

function invitationChallenge(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return null;
  }
  const challenge = (state as Record<string, unknown>)[
    'invitationAcceptanceChallenge'
  ];
  return typeof challenge === 'string' ? challenge : null;
}

function terminalInvitationMessage(code: AppErrorCode): string | null {
  switch (code) {
    case 'invitation-expired':
      return 'invitationExpired';
    case 'invitation-revoked':
      return 'invitationRevoked';
    case 'invitation-superseded':
      return 'invitationReplaced';
    case 'invitation-used':
      return 'invitationAccepted';
    case 'invitation-invalid':
      return 'invalidChallenge';
    case 'invitation-recovery-required':
      return 'recoveryRequired';
    default:
      return null;
  }
}

export function InvitationAcceptancePage({
  service,
}: {
  readonly service: OnboardingService;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const identity = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [acceptanceChallenge] = useState(() =>
    invitationChallenge(location.state),
  );
  const actorMismatchHandled = useRef(false);

  useEffect(() => {
    if (
      identity.access.kind !== 'invited' ||
      !acceptanceChallenge ||
      location.state === null
    )
      return;
    void navigate(location.pathname, { replace: true, state: null });
  }, [
    acceptanceChallenge,
    identity.access.kind,
    location.pathname,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    if (
      actorMismatchHandled.current ||
      !acceptanceChallenge ||
      identity.access.kind !== 'active'
    ) {
      return;
    }
    actorMismatchHandled.current = true;
    const redirect = () => {
      void navigate('/login', {
        replace: true,
        state: { authCallbackError: 'actorMismatch' },
      });
    };
    void identity.signOut().then(redirect, redirect);
  }, [
    acceptanceChallenge,
    identity,
    identity.access.kind,
    identity.signOut,
    navigate,
  ]);

  switch (identity.access.kind) {
    case 'pending-profile':
      return <Navigate replace to="/app/complete-profile" />;
    case 'active':
      return <Navigate replace to="/app/profile" />;
    case 'invited':
      break;
    case 'suspended':
    case 'archived':
      return <Navigate replace to="/account-blocked" />;
    case 'recoverable-error':
      return <AuthorityRecoveryPage />;
    case 'forbidden':
      return <ForbiddenAccessPage />;
    case 'initializing':
    case 'loading-authority':
    case 'unauthenticated':
      return <AuthorityLoadingPage />;
  }

  const accept = async () => {
    if (!acceptanceChallenge) {
      setError(t('onboarding.invalidInvitationLink'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await service.acceptCurrentInvitation(acceptanceChallenge);
    if (result.ok) {
      await identity.refreshAccountContext();
      await navigate('/app/complete-profile', { replace: true });
    } else {
      const callbackMessage = terminalInvitationMessage(result.error.code);
      if (callbackMessage) {
        await identity.signOut();
        await navigate('/login', {
          replace: true,
          state: { authCallbackError: callbackMessage },
        });
        return;
      }
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
        {error || !acceptanceChallenge ? (
          <p className="notice notice--error" role="alert">
            {error ?? t('onboarding.invalidInvitationLink')}
          </p>
        ) : null}
        <Button
          className="button--primary"
          disabled={submitting || !acceptanceChallenge}
          onClick={() => void accept()}
        >
          {submitting ? t('onboarding.accepting') : t('onboarding.accept')}
        </Button>
      </section>
    </main>
  );
}
