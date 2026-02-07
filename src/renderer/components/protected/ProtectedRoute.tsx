import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, sessionRestored, restoreSession } = useAuthStore();
  const location = useLocation();
  const [isRestoring, setIsRestoring] = useState(!sessionRestored);

  useEffect(() => {
    const restore = async () => {
      await restoreSession();
      setIsRestoring(false);
    };
    restore();
  }, [restoreSession]);

  // Show nothing while restoring session
  if (isRestoring) {
    return null;
  }

  if (!isAuthenticated) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
