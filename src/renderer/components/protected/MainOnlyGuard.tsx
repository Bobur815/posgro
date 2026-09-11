import React from 'react';
import { Navigate } from 'react-router-dom';
import { useModeStore } from '../../store/mode-store';

/**
 * Blocks a route that has nothing to do on a satellite (tasks/LAN_MAIN_TERMINAL_PLAN.md §4): store
 * settings and receipt layout (its main's), fiscal settings (no VCR here), VPS sync diagnostics and
 * the terminal list (the main talks to the VPS), and shop-wide reports (a satellite holds only its
 * own sales). Mirrors ModeGuard: a silent redirect home.
 *
 * The buttons that lead here are hidden too; this covers the route itself, and the main process
 * refuses the writes behind it either way.
 */
export function MainOnlyGuard({ children }: { children: React.ReactNode }) {
  const isSatellite = useModeStore((s) => s.isSatellite);
  if (isSatellite) return <Navigate to="/" replace />;
  return <>{children}</>;
}
