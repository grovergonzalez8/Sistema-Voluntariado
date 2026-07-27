import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useIdentity } from './identity-context';
import {
  AuthorityLoadingPage,
  AuthorityRecoveryPage,
} from './account-access-route';

export function ProtectedRoute() {
  const identity = useIdentity();
  const location = useLocation();

  if (identity.access.kind === 'initializing') return <AuthorityLoadingPage />;

  if (identity.access.kind === 'recoverable-error' && !identity.user) {
    return <AuthorityRecoveryPage />;
  }

  if (identity.access.kind === 'unauthenticated' || !identity.user) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return <Outlet />;
}
