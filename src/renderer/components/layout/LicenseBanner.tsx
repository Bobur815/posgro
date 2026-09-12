import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import type { TillLicenseStatus } from '../../../shared/types/store.types';

/**
 * The subscription as this till's license has it, when there is something to say: it runs out
 * soon, it has run out and the store is in its days to pay, the till has no license yet, or the
 * clock is set wrong. Above every page, and compact on the login screen.
 *
 * A blocked till does not get past the login screen, whose own panel says so
 * (pages/Login/LicenseBlockPanel.tsx); this covers a block that lands mid-session.
 */

/** The state moves by the day; a look every ten minutes is plenty between pushes from main. */
const REFRESH_MS = 10 * 60_000;
/** A till with no license yet is only told in its last week — until then a sync fixes it. */
const UNLICENSED_NOTICE_DAYS = 7;

const Bar = styled.div<{ $urgent: boolean; $compact?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme, $compact }) => ($compact ? theme.spacing.md : theme.spacing.xs)};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $urgent }) => ($urgent ? theme.colors.error : theme.colors.warning)};
  color: ${({ $urgent }) => ($urgent ? '#fff' : '#1a1a1a')};
  font-weight: 600;
  font-size: ${({ $compact }) => ($compact ? '13px' : '14px')};
  line-height: 1.4;
  text-align: left;

  svg {
    flex-shrink: 0;
  }
`;

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** What to say for `status`, or null for nothing. */
export function licenseNotice(
  status: TillLicenseStatus,
  t: Translate,
  locale: string,
): { text: string; urgent: boolean } | null {
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : '');
  // With the time: "pay by the 23rd" would read as the whole of the 23rd.
  const moment = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '';

  if (status.state === 'blocked') return { text: t('auth.errors.subscription_blocked'), urgent: true };
  if (status.state === 'checkin-required') {
    return { text: t('auth.errors.license_checkin_required'), urgent: true };
  }
  if (status.clockBehind) return { text: t('license.clockBehind'), urgent: true };
  if (status.state === 'grace') {
    return {
      text: t('subscription.bannerGrace', { date: day(status.expiresAt), blockDate: moment(status.blockAt) }),
      urgent: true,
    };
  }
  if (status.state === 'warning') {
    return {
      text: t(status.plan === 'TRIAL' ? 'subscription.bannerTrialWarning' : 'subscription.bannerWarning', {
        date: day(status.expiresAt),
        count: status.daysLeft ?? 0,
      }),
      urgent: false,
    };
  }
  if (status.state === 'unlicensed' && (status.daysLeft ?? 0) <= UNLICENSED_NOTICE_DAYS) {
    return { text: t('license.unlicensed', { count: status.daysLeft ?? 0 }), urgent: false };
  }
  return null;
}

export function LicenseBanner({ compact }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<TillLicenseStatus | null>(null);

  useEffect(() => {
    const license = window.electronAPI?.license;
    if (!license) return;
    let alive = true;
    const load = () =>
      license
        .getStatus()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {
          /* no banner is the right fallback */
        });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    const off = license.onChanged((s) => setStatus(s));
    return () => {
      alive = false;
      clearInterval(timer);
      off();
    };
  }, []);

  if (!status) return null;
  const notice = licenseNotice(status, t, i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU');
  if (!notice) return null;

  return (
    <Bar role="alert" $urgent={notice.urgent} $compact={compact}>
      <AlertTriangle size={compact ? 16 : 18} />
      {notice.text}
    </Bar>
  );
}
