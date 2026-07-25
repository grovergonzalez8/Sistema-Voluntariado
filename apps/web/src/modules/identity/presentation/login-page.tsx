import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button, Field } from '@sistema-voluntariado/ui';

import { useIdentity } from './identity-context';
import { AuthorityLoadingPage } from './account-access-route';

const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
  })
  .strict();

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
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
        <p className="eyebrow">Sistema-Voluntariado</p>
        <h1 id="login-title">{t('login.title')}</h1>
        <p className="muted">{t('login.description')}</p>

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
            <p className="notice notice--error" role="alert">
              {submissionError}
            </p>
          ) : null}
          <Button
            className="button--primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </section>
    </main>
  );
}
