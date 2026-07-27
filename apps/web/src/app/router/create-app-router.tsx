import {
  Navigate,
  createBrowserRouter,
  type RouterProviderProps,
} from 'react-router-dom';

import {
  AccountBlockedPage,
  AccountDetailPage,
  AccountsPage,
  AuthCallbackPage,
  CompleteProfilePage,
  InvitationAcceptancePage,
  InvitationDetailPage,
  InvitationsPage,
  LoginPage,
  OperationalAccountRoute,
  PermissionRoute,
  ProtectedRoute,
} from '../../modules/identity';
import type { ApplicationServices } from '../composition/application-services';
import { AppShell } from './app-shell';
import { ProfileRoute } from './profile-route';

export function createAppRouter(
  services: ApplicationServices,
): RouterProviderProps['router'] {
  return createBrowserRouter([
    { element: <LoginPage />, path: '/login' },
    { element: <AuthCallbackPage />, path: '/auth/callback' },
    {
      children: [
        {
          element: <InvitationAcceptancePage service={services.onboarding} />,
          path: '/invite/accept',
        },
        { element: <AccountBlockedPage />, path: '/account-blocked' },
        {
          children: [
            {
              element: <CompleteProfilePage service={services.onboarding} />,
              path: 'complete-profile',
            },
            {
              children: [
                {
                  children: [
                    {
                      element: (
                        <ProfileRoute profileService={services.profile} />
                      ),
                      path: 'profile',
                    },
                    {
                      children: [
                        {
                          element: (
                            <InvitationsPage service={services.invitations} />
                          ),
                          path: 'admin/invitations',
                        },
                        {
                          element: (
                            <InvitationDetailPage
                              service={services.invitations}
                            />
                          ),
                          path: 'admin/invitations/:id',
                        },
                      ],
                      element: <PermissionRoute permission="invitation.read" />,
                    },
                    {
                      children: [
                        {
                          element: (
                            <AccountsPage
                              service={services.accountAdministration}
                            />
                          ),
                          path: 'admin/accounts',
                        },
                        {
                          element: (
                            <AccountDetailPage
                              service={services.accountAdministration}
                            />
                          ),
                          path: 'admin/accounts/:id',
                        },
                      ],
                      element: <PermissionRoute permission="account.read" />,
                    },
                    { element: <Navigate replace to="profile" />, index: true },
                  ],
                  element: <AppShell />,
                },
              ],
              element: <OperationalAccountRoute />,
            },
          ],
          path: '/app',
        },
      ],
      element: <ProtectedRoute />,
    },
    { element: <Navigate replace to="/app/profile" />, path: '*' },
  ]);
}
