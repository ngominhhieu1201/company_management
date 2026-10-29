import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/** Restrict nested routes to listed roles (backend still enforces). */
export default function RoleRoute({ roles }: { roles: Array<'ADMIN' | 'MANAGER' | 'EMPLOYEE'> }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
