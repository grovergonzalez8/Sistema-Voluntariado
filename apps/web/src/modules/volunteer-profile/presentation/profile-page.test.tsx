import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type {
  CurrentActorPort,
  ProfileRepository,
} from '../application/profile-ports';
import { ProfileService } from '../application/profile-service';
import type { Profile } from '../domain/profile';
import { ProfilePage } from './profile-page';

const actorId = '00000000-0000-4000-8000-000000000001';
const initialProfile: Profile = {
  createdAt: '2026-07-24T00:00:00.000Z',
  displayName: 'Perfil inicial',
  preferredLocale: 'es',
  updatedAt: '2026-07-24T00:00:00.000Z',
  userId: actorId,
};

const actor: CurrentActorPort = {
  getCurrentUserId: () => Promise.resolve(success(actorId)),
};

interface ServiceFixture {
  readonly service: ProfileService;
  readonly updateByUserId: ReturnType<
    typeof vi.fn<ProfileRepository['updateByUserId']>
  >;
}

const createService = (
  profileResult: Promise<Result<Profile | null>>,
  updateResult: Result<Profile> = success(initialProfile),
): ServiceFixture => {
  const updateByUserId = vi.fn<ProfileRepository['updateByUserId']>(() =>
    Promise.resolve(updateResult),
  );
  const repository: ProfileRepository = {
    getByUserId: () => profileResult,
    updateByUserId,
  };

  return {
    service: new ProfileService(actor, repository),
    updateByUserId,
  };
};

const renderProfile = async (service: ProfileService) => {
  const i18n = await createI18n();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ProfilePage actorId={actorId} service={service} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

describe('ProfilePage', () => {
  it('shows a loading state while the profile is pending', async () => {
    const pending = new Promise<Result<Profile | null>>(() => undefined);
    const { service } = createService(pending);

    await renderProfile(service);

    expect(screen.getByRole('status').textContent).toContain('Cargando perfil');
  });

  it('shows a typed error when loading fails', async () => {
    const { service } = createService(
      Promise.resolve(
        failure({ code: 'unexpected', message: 'Fallo controlado de carga.' }),
      ),
    );

    await renderProfile(service);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Fallo controlado de carga.',
    );
  });

  it('shows an empty state for an unprovisioned profile', async () => {
    const { service } = createService(Promise.resolve(success(null)));

    await renderProfile(service);

    expect(
      await screen.findByRole('heading', { name: 'Perfil no disponible' }),
    ).not.toBeNull();
  });

  it('loads and updates the editable profile fields', async () => {
    const user = userEvent.setup();
    const updatedProfile: Profile = {
      ...initialProfile,
      displayName: 'Perfil actualizado',
      preferredLocale: 'en',
    };
    const { service, updateByUserId } = createService(
      Promise.resolve(success(initialProfile)),
      success(updatedProfile),
    );

    await renderProfile(service);
    const displayName = await screen.findByLabelText('Nombre visible');
    await user.clear(displayName);
    await user.type(displayName, '  Perfil   actualizado  ');
    await user.selectOptions(screen.getByLabelText('Idioma preferido'), 'en');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByText('Profile updated.')).textContent).toBe(
      'Profile updated.',
    );
    expect(updateByUserId).toHaveBeenCalledWith(actorId, {
      displayName: 'Perfil actualizado',
      preferredLocale: 'en',
    });
  });

  it('renders an update failure without leaking a rejected promise', async () => {
    const user = userEvent.setup();
    const { service } = createService(
      Promise.resolve(success(initialProfile)),
      failure({ code: 'forbidden', message: 'Actualización denegada.' }),
    );

    await renderProfile(service);
    const displayName = await screen.findByLabelText('Nombre visible');
    await user.clear(displayName);
    await user.type(displayName, 'Otro nombre');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Actualización denegada.',
    );
  });
});
