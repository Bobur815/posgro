import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminLocked } from '../../store/mode-store';

interface ModeGuardProps {
  children: React.ReactNode;
}

/**
 * Blocks a route whose data is edited elsewhere — on the web dashboard for a cashier-only store,
 * on the main terminal for a satellite. Mirrors RoleGuard: a silent redirect home, no "forbidden"
 * page.
 *
 * Unlocked is the default, so a terminal that never learned its mode keeps every route it has
 * today. Route-level gating alone is not enough for surfaces opened as modals — those hide their
 * trigger buttons instead.
 */
export function ModeGuard({ children }: ModeGuardProps) {
  const adminLocked = useAdminLocked();

  if (adminLocked) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
