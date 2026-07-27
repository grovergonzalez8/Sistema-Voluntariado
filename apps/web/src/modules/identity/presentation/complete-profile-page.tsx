import { useState, type SyntheticEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { OnboardingService } from '../application/onboarding-service';
import {
  AuthorityLoadingPage,
  AuthorityRecoveryPage,
  ForbiddenAccessPage,
} from './account-access-route';
import { useIdentity } from './identity-context';

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
  preferredLocale: z.enum(['es', 'en']),
});

export function CompleteProfilePage({
  service,
}: {
  readonly service: OnboardingService;
}) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLocale, setPreferredLocale] = useState('es');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const identity = useIdentity();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = profileSchema.safeParse({
      displayName,
      password,
      preferredLocale,
    });
    if (!parsed.success) {
      setError(t('onboarding.validation'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await service.completeProfile(parsed.data);
    if (result.ok) {
      await i18n.changeLanguage(parsed.data.preferredLocale);
      await identity.refreshAccountContext();
      await navigate('/app/profile', { replace: true });
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  switch (identity.access.kind) {
    case 'active':
      return <NavigateAfterActivation />;
    case 'pending-profile':
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
    case 'invited':
      return <Navigate replace to="/invite/accept" />;
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">{t('onboarding.eyebrow')}</p>
        <h1>{t('onboarding.profileTitle')}</h1>
        <p className="muted">{t('onboarding.profileDescription')}</p>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <Field
            autoComplete="name"
            label={t('profile.displayName')}
            maxLength={100}
            name="displayName"
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            required
            value={displayName}
          />
          <Field
            autoComplete="new-password"
            label={t('login.password')}
            minLength={8}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            required
            type="password"
            value={password}
          />
          <label className="field">
            <span>{t('profile.preferredLocale')}</span>
            <select
              onChange={(event) => {
                setPreferredLocale(event.target.value);
              }}
              value={preferredLocale}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          {error ? <p className="notice notice--error">{error}</p> : null}
          <Button
            className="button--primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t('onboarding.activating') : t('onboarding.activate')}
          </Button>
        </form>
      </section>
    </main>
  );
}

function NavigateAfterActivation() {
  return <Navigate replace to="/app/profile" />;
}
