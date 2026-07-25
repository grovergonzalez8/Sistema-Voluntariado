import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { InvitationAdministrationGateway } from '../application/invitation-administration-gateway';
import { InvitationAdministrationService } from '../application/invitation-administration-service';
import { InvitationDetailPage } from './invitation-detail-page';

const invitationId = '00000000-0000-4000-8000-000000000080';
const invitation = {
  accountId: '00000000-0000-4000-8000-000000000081',
  createdAt: '2026-07-24T00:00:00.000Z',
  createdBy: '00000000-0000-4000-8000-000000000004',
  displayName: 'Invitada',
  expiresAt: '2026-07-24T01:00:00.000Z',
  id: invitationId,
  normalizedEmail: 'detail@example.invalid',
  preferredLocale: 'en' as const,
  requestedInitialRoleCode: 'volunteer',
  sentAt: null,
  status: 'pending' as const,
  supersededBy: null,
};

const gateway = (
  getInvitationDetail: InvitationAdministrationGateway['getInvitationDetail'],
): InvitationAdministrationGateway => ({
  createInvitation: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denied.' })),
  getInvitationDetail,
  listInvitations: () => Promise.resolve(success([])),
  replaceInvitation: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denied.' })),
  resendInvitation: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denied.' })),
  revokeInvitation: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denied.' })),
});

async function renderDetail(
  getInvitationDetail: InvitationAdministrationGateway['getInvitationDetail'],
  language = 'es',
) {
  const i18n = await createI18n();
  await i18n.changeLanguage(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/app/admin/invitations/${invitationId}`]}>
        <Routes>
          <Route
            element={
              <InvitationDetailPage
                service={
                  new InvitationAdministrationService(
                    gateway(getInvitationDetail),
                  )
                }
              />
            }
            path="/app/admin/invitations/:id"
          />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('InvitationDetailPage', () => {
  it('loads and renders the authorized detail in English', async () => {
    await renderDetail(() => Promise.resolve(success(invitation)), 'en');

    expect(await screen.findByText('Invitation detail')).not.toBeNull();
    expect(screen.getByText('detail@example.invalid')).not.toBeNull();
    expect(screen.getByText('Pending delivery')).not.toBeNull();
  });

  it('renders a safe detail error', async () => {
    await renderDetail(() =>
      Promise.resolve(
        failure({ code: 'not-found', message: 'No encontrada.' }),
      ),
    );

    expect(await screen.findByText('No encontrada.')).not.toBeNull();
  });
});
