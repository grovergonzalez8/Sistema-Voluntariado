import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  AppResultError,
  unwrapResult,
} from '@sistema-voluntariado/shared-kernel';
import {
  Button,
  Field,
  LoadingState,
  Notice,
  PageHeader,
} from '@sistema-voluntariado/ui';

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
  readonly authorityVersion: string;
  readonly service: ProfileService;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof AppResultError
    ? error.appError.message
    : 'Ocurrió un error inesperado.';

export function ProfilePage({
  actorId,
  authorityVersion,
  service,
}: ProfilePageProps) {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const identityScope = `${actorId}:${authorityVersion}`;
  const currentIdentityScope = useRef(identityScope);
  const operationGeneration = useRef(0);
  const profileQueryKey = getProfileQueryKey(actorId, authorityVersion);
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
    mutationFn: (input: {
      readonly actorId: string;
      readonly authorityVersion: string;
      readonly generation: number;
      readonly identityScope: string;
      readonly values: ProfileFormValues;
    }) => unwrapResult(service.updateOwnProfile(input.values)),
    onSuccess: (profile, input) => {
      if (
        input.generation !== operationGeneration.current ||
        input.identityScope !== currentIdentityScope.current
      ) {
        return;
      }
      queryClient.setQueryData(
        getProfileQueryKey(input.actorId, input.authorityVersion),
        profile,
      );
      reset({
        displayName: profile.displayName ?? '',
        preferredLocale: profile.preferredLocale,
      });
      void i18n.changeLanguage(profile.preferredLocale);
    },
  });

  useLayoutEffect(() => {
    currentIdentityScope.current = identityScope;
    operationGeneration.current += 1;

    return () => {
      operationGeneration.current += 1;
    };
  }, [identityScope]);

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
    return <LoadingState>{t('profile.loading')}</LoadingState>;
  }

  if (profileQuery.isError) {
    return (
      <section aria-labelledby="profile-error-title" className="panel">
        <PageHeader
          title={t('profile.errorTitle')}
          titleId="profile-error-title"
        />
        <Notice tone="error">{getErrorMessage(profileQuery.error)}</Notice>
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

  return (
    <section aria-labelledby="profile-title" className="panel profile-panel">
      <PageHeader
        description={t('profile.description')}
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        titleId="profile-title"
      />

      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          const submit = handleSubmit((values) => {
            updateProfile.mutate({
              actorId,
              authorityVersion,
              generation: operationGeneration.current,
              identityScope,
              values,
            });
          });
          void submit(event);
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
          <Notice tone="error">{getErrorMessage(updateProfile.error)}</Notice>
        ) : null}
        {updateProfile.isSuccess ? (
          <Notice tone="success">{t('profile.saved')}</Notice>
        ) : null}

        <Button
          busy={updateProfile.isPending}
          disabled={!isDirty || updateProfile.isPending}
          type="submit"
          variant="primary"
        >
          {updateProfile.isPending ? t('profile.saving') : t('profile.save')}
        </Button>
      </form>
    </section>
  );
}
