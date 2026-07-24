import {
  Navigate,
  createBrowserRouter,
  type RouterProviderProps,
} from 'react-router-dom';

import { LoginPage, ProtectedRoute } from '../../modules/identity';
import type { ApplicationServices } from '../composition/application-services';
import { AppShell } from './app-shell';
import { ProfileRoute } from './profile-route';

export function createAppRouter(
  services: ApplicationServices,
): RouterProviderProps['router'] {
  return createBrowserRouter([
    { element: <LoginPage />, path: '/login' },
    {
      children: [
        {
          children: [
            {
              element: <ProfileRoute profileService={services.profile} />,
              path: 'profile',
            },
            { element: <Navigate replace to="profile" />, index: true },
          ],
          element: <AppShell />,
        },
      ],
      element: <ProtectedRoute />,
      path: '/app',
    },
    { element: <Navigate replace to="/app/profile" />, path: '*' },
  ]);
}
