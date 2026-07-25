import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { AuthGateway } from '../application/auth-gateway';
import { AccountContextService } from '../application/account-context-service';
import { IdentityService } from '../application/identity-service';
import { IdentityProvider } from './identity-provider';
import { LoginPage } from './login-page';

const gateway: AuthGateway = {
  getCurrentUser: () => Promise.resolve(success(null)),
  onAuthStateChange: () => () => undefined,
  signIn: () =>
    Promise.resolve(
      success({ email: 'volunteer@example.invalid', id: 'local-user' }),
    ),
  signOut: () => Promise.resolve(success(undefined)),
};

describe('LoginPage', () => {
  it('shows accessible validation without calling infrastructure', async () => {
    const user = userEvent.setup();
    const i18n = await createI18n();

    render(
      <I18nextProvider i18n={i18n}>
        <IdentityProvider
          accountService={
            new AccountContextService({
              getCurrentAccountContext: () => Promise.resolve(success(null)),
            })
          }
          service={new IdentityService(gateway)}
        >
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </IdentityProvider>
      </I18nextProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Iniciar sesión' }),
    );

    expect(screen.queryByText('Escribe un correo válido.')).not.toBeNull();
    expect(
      screen.queryByText('La contraseña debe tener al menos 8 caracteres.'),
    ).not.toBeNull();
  });
});
