import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useIdentity } from './identity-context';

export function ProtectedRoute() {
  const identity = useIdentity();
  const location = useLocation();

  if (identity.status === 'loading') {
    return (
      <main className="centered-status" role="status">
        Verificando sesión…
      </main>
    );
  }

  if (!identity.user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return <Outlet />;
}
