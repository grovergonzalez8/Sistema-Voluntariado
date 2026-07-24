import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n } from 'i18next';

import { IdentityProvider } from '../../modules/identity';
import type { ApplicationServices } from '../composition/application-services';
import { PersonalDataCacheGuard } from './personal-data-cache-guard';

interface AppProvidersProps extends PropsWithChildren {
  readonly i18n: i18n;
  readonly services: ApplicationServices;
}

export function AppProviders({ children, i18n, services }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <IdentityProvider service={services.identity}>
          <PersonalDataCacheGuard>{children}</PersonalDataCacheGuard>
        </IdentityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
