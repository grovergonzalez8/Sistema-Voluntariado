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
import {
  ProjectCreatePage,
  ProjectDetailPage,
  ProjectEditPage,
  ProjectsPage,
  VolunteerProjectsPage,
} from '../../modules/projects';
import {
  VolunteerCreatePage,
  VolunteerDetailPage,
  VolunteerEditPage,
  VolunteerImportPage,
  VolunteersPage,
} from '../../modules/volunteers';
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
                    {
                      children: [
                        {
                          element: (
                            <VolunteersPage service={services.volunteers} />
                          ),
                          path: 'admin/volunteers',
                        },
                        {
                          element: (
                            <VolunteerDetailPage
                              service={services.volunteers}
                            />
                          ),
                          path: 'admin/volunteers/:id',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="volunteer_registry.read" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: (
                            <VolunteerCreatePage
                              service={services.volunteers}
                            />
                          ),
                          path: 'admin/volunteers/new',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="volunteer_registry.create" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: (
                            <VolunteerEditPage service={services.volunteers} />
                          ),
                          path: 'admin/volunteers/:id/edit',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="volunteer_registry.update" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: (
                            <VolunteerImportPage
                              service={services.volunteers}
                            />
                          ),
                          path: 'admin/volunteers/import',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="volunteer_registry.import" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: <ProjectsPage service={services.projects} />,
                          path: 'admin/projects',
                        },
                        {
                          element: (
                            <ProjectDetailPage service={services.projects} />
                          ),
                          path: 'admin/projects/:id',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="project.read_assigned" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: (
                            <ProjectEditPage service={services.projects} />
                          ),
                          path: 'admin/projects/:id/edit',
                        },
                      ],
                      element: (
                        <PermissionRoute permission="project.manage_assigned" />
                      ),
                    },
                    {
                      children: [
                        {
                          element: (
                            <ProjectCreatePage service={services.projects} />
                          ),
                          path: 'admin/projects/new',
                        },
                        {
                          element: (
                            <VolunteerProjectsPage
                              service={services.projects}
                            />
                          ),
                          path: 'admin/volunteers/:id/projects',
                        },
                      ],
                      element: <PermissionRoute permission="project.manage" />,
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
