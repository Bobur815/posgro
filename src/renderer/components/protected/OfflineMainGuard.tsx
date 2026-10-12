import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOfflineMain } from '../../store/mode-store';

/** Opens a route only on an OFFLINE_ONLY main terminal (see `isOfflineMain`); home otherwise. */
export function OfflineMainGuard({ children }: { children: React.ReactNode }) {
  const allowed = useOfflineMain();
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
