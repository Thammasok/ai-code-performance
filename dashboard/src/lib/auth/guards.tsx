import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type Role } from './auth-context';

/**
 * Layout-route guard: renders the nested routes only for authenticated users;
 * otherwise redirects to /sign-in, preserving the attempted location so the
 * sign-in screen can return the user there.
 */
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

/**
 * Layout-route guard: renders nested routes only when the current user's role
 * is in `roles`. Unauthenticated users go to /sign-in; authenticated users
 * lacking the role are sent home (client-side defense-in-depth; the server
 * remains the authorization authority).
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
