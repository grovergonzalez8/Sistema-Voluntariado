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
      <header className="app-header">
        <div>
          <strong>Sistema-Voluntariado</strong>
          <p>{t('shell.activeSession')}</p>
        </div>
        <Button onClick={() => void handleSignOut()}>
          {t('common.signOut')}
        </Button>
      </header>
      <div className="app-body">
        <nav aria-label="Navegación principal" className="app-nav">
          <NavLink to="/app/profile">{t('navigation.profile')}</NavLink>
        </nav>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
