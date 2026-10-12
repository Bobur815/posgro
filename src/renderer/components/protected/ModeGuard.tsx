import React from 'react';
import { Navigate } from 'react-router-dom';
import { blocksRoute, useModeStore } from '../../store/mode-store';

interface ModeGuardProps {
  children: React.ReactNode;
  /**
   * The page stays open on a cashier-only store, which shows it read-only (users, suppliers).
   * A satellite is still turned away.
   */
  allowCashierOnly?: boolean;
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
export function ModeGuard({ children, allowCashierOnly = false }: ModeGuardProps) {
  const blocked = useModeStore((s) => blocksRoute(s, allowCashierOnly));

  if (blocked) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
