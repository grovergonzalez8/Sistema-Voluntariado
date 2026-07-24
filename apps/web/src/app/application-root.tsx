import type { i18n } from 'i18next';
import { RouterProvider } from 'react-router-dom';

import type { ApplicationServices } from './composition/application-services';
import { AppProviders } from './providers/app-providers';
import { createAppRouter } from './router/create-app-router';

interface ApplicationRootProps {
  readonly i18n: i18n;
  readonly services: ApplicationServices;
}

export function ApplicationRoot({ i18n, services }: ApplicationRootProps) {
  const router = createAppRouter(services);

  return (
    <AppProviders i18n={i18n} services={services}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
