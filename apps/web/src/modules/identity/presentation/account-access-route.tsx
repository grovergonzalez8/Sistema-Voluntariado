import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useIdentity } from './identity-context';

export function OperationalAccountRoute() {
  const identity = useIdentity();
  if (identity.account?.status === 'active') return <Outlet />;
  if (identity.account?.status === 'pending_profile') {
    return <Navigate replace to="/app/complete-profile" />;
  }
  return <Navigate replace to="/account-blocked" />;
}

export function PermissionRoute({
  permission,
}: {
  readonly permission: string;
}) {
  const identity = useIdentity();
  return identity.account?.permissions.includes(permission) ? (
    <Outlet
      key={`${identity.user?.id ?? 'anonymous'}:${identity.account.authorityVersion}`}
    />
  ) : (
    <Navigate replace to="/app/profile" />
  );
}

export function AccountBlockedPage() {
  const { t } = useTranslation();
  const identity = useIdentity();
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">{t('access.eyebrow')}</p>
        <h1>{t('access.blockedTitle')}</h1>
        <p className="muted">
          {identity.account
            ? t(`access.${identity.account.status}`)
            : t('access.unavailable')}
        </p>
      </section>
    </main>
  );
}
