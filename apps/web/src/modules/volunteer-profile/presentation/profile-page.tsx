import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  AppResultError,
  unwrapResult,
} from '@sistema-voluntariado/shared-kernel';
import { Button, Field } from '@sistema-voluntariado/ui';

import type { ProfileService } from '../application/profile-service';
import { getProfileQueryKey } from './profile-query-cache';

const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    preferredLocale: z.enum(['es', 'en']),
  })
  .strict();

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfilePageProps {
  readonly actorId: string;
  readonly service: ProfileService;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof AppResultError
    ? error.appError.message
    : 'Ocurrió un error inesperado.';

export function ProfilePage({ actorId, service }: ProfilePageProps) {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const profileQueryKey = getProfileQueryKey(actorId);
  const profileQuery = useQuery({
    queryFn: () => unwrapResult(service.getOwnProfile()),
    queryKey: profileQueryKey,
  });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<ProfileFormValues>({
    defaultValues: { displayName: '', preferredLocale: 'es' },
    resolver: zodResolver(profileSchema),
  });
  const updateProfile = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      unwrapResult(service.updateOwnProfile(values)),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey, profile);
      reset({
        displayName: profile.displayName ?? '',
        preferredLocale: profile.preferredLocale,
      });
      void i18n.changeLanguage(profile.preferredLocale);
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      reset({
        displayName: profileQuery.data.displayName ?? '',
        preferredLocale: profileQuery.data.preferredLocale,
      });
      void i18n.changeLanguage(profileQuery.data.preferredLocale);
    }
  }, [i18n, profileQuery.data, reset]);

  if (profileQuery.isPending) {
    return <p role="status">{t('profile.loading')}</p>;
  }

  if (profileQuery.isError) {
    return (
      <section aria-labelledby="profile-error-title" className="panel">
        <h1 id="profile-error-title">{t('profile.errorTitle')}</h1>
        <p className="notice notice--error" role="alert">
          {getErrorMessage(profileQuery.error)}
        </p>
        <Button onClick={() => void profileQuery.refetch()}>
          {t('common.retry')}
        </Button>
      </section>
    );
  }

  if (!profileQuery.data) {
    return (
      <section aria-labelledby="profile-empty-title" className="panel">
        <h1 id="profile-empty-title">{t('profile.emptyTitle')}</h1>
        <p>{t('profile.emptyDescription')}</p>
      </section>
    );
  }

  const onSubmit = handleSubmit((values) => {
    updateProfile.mutate(values);
  });

  return (
    <section aria-labelledby="profile-title" className="panel profile-panel">
      <div>
        <p className="eyebrow">{t('profile.eyebrow')}</p>
        <h1 id="profile-title">{t('profile.title')}</h1>
        <p className="muted">{t('profile.description')}</p>
      </div>

      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <Field
          autoComplete="name"
          error={errors.displayName ? t('validation.displayName') : undefined}
          label={t('profile.displayName')}
          maxLength={100}
          {...register('displayName')}
        />

        <label className="field" htmlFor="preferred-locale">
          <span>{t('profile.preferredLocale')}</span>
          <select id="preferred-locale" {...register('preferredLocale')}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          {errors.preferredLocale ? (
            <span className="field__error" role="alert">
              {t('validation.locale')}
            </span>
          ) : null}
        </label>

        {updateProfile.isError ? (
          <p className="notice notice--error" role="alert">
            {getErrorMessage(updateProfile.error)}
          </p>
        ) : null}
        {updateProfile.isSuccess ? (
          <p className="notice notice--success" role="status">
            {t('profile.saved')}
          </p>
        ) : null}

        <Button
          className="button--primary"
          disabled={!isDirty || updateProfile.isPending}
          type="submit"
        >
          {updateProfile.isPending ? t('profile.saving') : t('profile.save')}
        </Button>
      </form>
    </section>
  );
}
