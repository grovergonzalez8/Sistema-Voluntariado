import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import type { AccountContext } from '../domain/account-administration';
import { useIdentity } from './identity-context';

function operationalHome(account: AccountContext): string {
  if (account.permissions.includes('invitation.read')) {
    return '/app/admin/invitations';
  }
  if (account.permissions.includes('account.read')) {
    return '/app/admin/accounts';
  }
  return '/app/profile';
}

export function AuthorityLoadingPage() {
  const { t } = useTranslation();
  return (
    <main className="centered-status" role="status">
      {t('access.loadingAuthority')}
    </main>
  );
}

export function AuthorityRecoveryPage() {
  const identity = useIdentity();
  const { t } = useTranslation();
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">{t('access.eyebrow')}</p>
        <h1>{t('access.recoveryTitle')}</h1>
        <p className="muted">{t('access.recoveryDescription')}</p>
        <Button
          className="button--primary"
          onClick={() => void identity.refreshAccountContext()}
        >
          {t('common.retry')}
        </Button>
      </section>
    </main>
  );
}

export function ForbiddenAccessPage() {
  const { t } = useTranslation();
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">{t('access.eyebrow')}</p>
        <h1>{t('access.forbiddenTitle')}</h1>
        <p className="muted">{t('access.forbiddenDescription')}</p>
      </section>
    </main>
  );
}

export function OperationalAccountRoute() {
  const identity = useIdentity();
  switch (identity.access.kind) {
    case 'active':
      return <Outlet />;
    case 'loading-authority':
      return identity.access.account?.status === 'active' ? (
        <Outlet />
      ) : (
        <AuthorityLoadingPage />
      );
    case 'pending-profile':
      return <Navigate replace to="/app/complete-profile" />;
    case 'invited':
      return <Navigate replace to="/invite/accept" />;
    case 'suspended':
    case 'archived':
      return <Navigate replace to="/account-blocked" />;
    case 'forbidden':
      return <ForbiddenAccessPage />;
    case 'recoverable-error':
      return <AuthorityRecoveryPage />;
    case 'initializing':
    case 'unauthenticated':
      return <AuthorityLoadingPage />;
  }
}

export function PermissionRoute({
  permission,
}: {
  readonly permission: string;
}) {
  const identity = useIdentity();
  const account = identity.account;
  if (
    (identity.access.kind === 'active' ||
      identity.access.kind === 'loading-authority') &&
    account?.status === 'active'
  ) {
    return account.permissions.includes(permission) ? (
      <Outlet
        key={`${identity.user?.id ?? 'anonymous'}:${account.authorityVersion}`}
      />
    ) : (
      <ForbiddenAccessPage />
    );
  }
  if (identity.access.kind === 'recoverable-error') {
    return <AuthorityRecoveryPage />;
  }
  if (
    identity.access.kind === 'suspended' ||
    identity.access.kind === 'archived'
  ) {
    return <Navigate replace to="/account-blocked" />;
  }
  return <ForbiddenAccessPage />;
}

export function AccountBlockedPage() {
  const { t } = useTranslation();
  const identity = useIdentity();
  switch (identity.access.kind) {
    case 'suspended':
    case 'archived':
      return (
        <main className="auth-layout">
          <section className="auth-card">
            <p className="eyebrow">{t('access.eyebrow')}</p>
            <h1>{t('access.blockedTitle')}</h1>
            <p className="muted">
              {t(`access.${identity.access.account.status}`)}
            </p>
          </section>
        </main>
      );
    case 'active':
      return <Navigate replace to={operationalHome(identity.access.account)} />;
    case 'pending-profile':
      return <Navigate replace to="/app/complete-profile" />;
    case 'invited':
      return <Navigate replace to="/invite/accept" />;
    case 'recoverable-error':
      return <AuthorityRecoveryPage />;
    case 'forbidden':
      return <ForbiddenAccessPage />;
    case 'initializing':
    case 'loading-authority':
    case 'unauthenticated':
      return <AuthorityLoadingPage />;
  }
}
