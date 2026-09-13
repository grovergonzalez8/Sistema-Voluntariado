import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button, Field, Notice, PageHeader } from '@sistema-voluntariado/ui';

import { useIdentity } from './identity-context';
import { AuthorityLoadingPage } from './account-access-route';

const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
  })
  .strict();

type LoginValues = z.infer<typeof loginSchema>;

const callbackErrorCodes = new Set([
  'actorMismatch',
  'authError',
  'invalidChallenge',
  'invitationAccepted',
  'invitationExpired',
  'invitationReplaced',
  'invitationRevoked',
  'recoveryRequired',
]);

function callbackError(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return null;
  }
  const value = (state as Record<string, unknown>)['authCallbackError'];
  return typeof value === 'string' && callbackErrorCodes.has(value)
    ? value
    : null;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useIdentity();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const callbackErrorCode = callbackError(location.state);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  });

  if (identity.access.kind === 'initializing') return <AuthorityLoadingPage />;

  if (identity.user) {
    return <Navigate replace to="/app/profile" />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmissionError(null);
    const result = await identity.signIn(values);

    if (result.ok) {
      await navigate('/app/profile', { replace: true });
      return;
    }

    setSubmissionError(result.error.message);
  });

  return (
    <main className="auth-layout">
      <section aria-labelledby="login-title" className="auth-card">
        <PageHeader
          description={t('login.description')}
          eyebrow="Sistema-Voluntariado"
          title={t('login.title')}
          titleId="login-title"
        />

        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            void onSubmit(event);
          }}
        >
          <Field
            autoComplete="email"
            error={errors.email ? t('validation.email') : undefined}
            label={t('login.email')}
            type="email"
            {...register('email')}
          />
          <Field
            autoComplete="current-password"
            error={errors.password ? t('validation.password') : undefined}
            label={t('login.password')}
            type="password"
            {...register('password')}
          />
          {submissionError ? (
            <Notice tone="error">{submissionError}</Notice>
          ) : null}
          {callbackErrorCode ? (
            <Notice tone="error">
              {t(`onboarding.callback.${callbackErrorCode}`)}
            </Notice>
          ) : null}
          <Button
            busy={isSubmitting}
            disabled={isSubmitting}
            type="submit"
            variant="primary"
          >
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </section>
    </main>
  );
}
