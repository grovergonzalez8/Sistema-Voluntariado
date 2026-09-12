import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import { useIdentity } from '../../modules/identity';

export function AppShell() {
  const { t } = useTranslation();
  const identity = useIdentity();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    const result = await identity.signOut();
    if (result.ok) {
      await navigate('/login', { replace: true });
    }
  };

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        {t('navigation.skipToContent')}
      </a>
      <header className="app-header">
        <div>
          <strong className="app-brand">Sistema-Voluntariado</strong>
          <p>{t('shell.activeSession')}</p>
        </div>
        <Button onClick={() => void handleSignOut()}>
          {t('common.signOut')}
        </Button>
      </header>
      <div className="app-body">
        <nav aria-label={t('navigation.mainLabel')} className="app-nav">
          <NavLink to="/app/profile">{t('navigation.profile')}</NavLink>
          {identity.account?.permissions.includes('invitation.read') ? (
            <NavLink to="/app/admin/invitations">
              {t('navigation.invitations')}
            </NavLink>
          ) : null}
          {identity.account?.permissions.includes('account.read') ? (
            <NavLink to="/app/admin/accounts">
              {t('navigation.accounts')}
            </NavLink>
          ) : null}
          {identity.account?.permissions.includes('volunteer_registry.read') ? (
            <NavLink to="/app/admin/volunteers">
              {t('navigation.volunteers')}
            </NavLink>
          ) : null}
          {identity.account?.permissions.includes('project.read_assigned') ? (
            <NavLink to="/app/admin/projects">
              {t('navigation.projects')}
            </NavLink>
          ) : null}
        </nav>
        <main className="app-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
