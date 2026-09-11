import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { WifiOff } from 'lucide-react';

/**
 * "Main terminal unreachable" — shown on a satellite while it cannot reach its main
 * (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.9).
 *
 * A satellite refuses to sell in that state rather than selling from its own copy of the stock, so
 * this says so up front — and says what still works — instead of leaving the cashier to find out
 * from a refused sale. Renders nothing on a main terminal, which has no main to lose, and nothing
 * until the first request has actually failed.
 */

type LinkStatus = { reachable: boolean | null; lastContactAt: string | null; superseded?: boolean };

const Bar = styled.div`
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.warning};
  color: #1a1a1a;
  font-weight: 600;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

export function MainLinkBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LinkStatus | null>(null);

  useEffect(() => {
    const lan = window.electronAPI?.lan;
    if (!lan) return;
    let alive = true;
    lan
      .getStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        /* no banner is the right fallback */
      });
    const off = lan.onStatus((s) => setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  // A superseded main answers, so it is not "unreachable" — but this till must not sell through it
  // either, and the fix is different: point the till at the current main (§11.3).
  if (status?.superseded) {
    return (
      <Bar role="alert">
        <WifiOff size={18} />
        {t('errors.mainSupersededBanner')}
      </Bar>
    );
  }
  if (status?.reachable !== false) return null;

  return (
    <Bar role="alert">
      <WifiOff size={18} />
      {t('errors.mainUnreachableBanner')}
    </Bar>
  );
}
