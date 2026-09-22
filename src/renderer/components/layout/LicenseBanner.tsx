import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import type { TillLicenseStatus } from '../../../shared/types/store.types';

/**
 * The subscription as this till's license has it, when there is something to say: it runs out
 * soon, it has run out and the store is in its days to pay, the till has no license yet, or the
 * clock is set wrong. In the app bar of every page, and compact on the login screen.
 *
 * A blocked till does not get past the login screen, whose own panel says so
 * (pages/Login/LicenseBlockPanel.tsx); this covers a block that lands mid-session.
 *
 * Split into a hook and a presentational bar because the app bar needs to know whether there is
 * a notice *before* it renders one — it gives the bar the row's spare width when there is, and
 * falls back to a spacer when there is not. One subscription either way: the caller that owns
 * the layout decision owns the hook, and hands the notice down.
 */

/** The state moves by the day; a look every ten minutes is plenty between pushes from main. */
const REFRESH_MS = 10 * 60_000;
/** A till with no license yet is only told in its last week — until then a sync fixes it. */
const UNLICENSED_NOTICE_DAYS = 7;

const Bar = styled.div<{ $urgent: boolean; $compact?: boolean; $inline?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme, $compact, $inline }) =>
    $inline ? '0' : $compact ? theme.spacing.md : theme.spacing.xs};
  padding: ${({ theme, $inline }) =>
    $inline ? '4px 12px' : `${theme.spacing.sm} ${theme.spacing.md}`};
  border-radius: ${({ theme, $inline }) => ($inline ? '20px' : theme.borderRadius)};
  background: ${({ theme, $urgent }) => ($urgent ? theme.colors.error : theme.colors.warning)};
  color: ${({ $urgent }) => ($urgent ? '#fff' : '#1a1a1a')};
  font-weight: 600;
  font-size: ${({ $compact, $inline }) => ($compact || $inline ? '13px' : '14px')};
  line-height: 1.4;
  text-align: left;

  /* In the app bar it takes the row's spare width in place of the spacer, and gives it back by
     truncating rather than pushing the user chip and its buttons off the end. */
  ${({ $inline }) =>
    $inline &&
    `
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      display: block;
      line-height: 28px;
    `}

  svg {
    flex-shrink: 0;
    ${({ $inline }) => $inline && 'vertical-align: middle; margin-right: 6px;'}
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
  if (status.state === 'terminal-limit') return { text: t('auth.errors.terminal_limit'), urgent: true };
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

export interface LicenseNotice {
  text: string;
  urgent: boolean;
}

/** This till's licence notice, or null while there is nothing worth saying. */
export function useLicenseNotice(): LicenseNotice | null {
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
  return licenseNotice(status, t, i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU');
}

interface BarProps {
  notice: LicenseNotice;
  /** Tighter type for the login screen. */
  compact?: boolean;
  /** A pill sized for a row of app-bar controls rather than a band above the page. */
  inline?: boolean;
}

/** The notice itself. Takes one so a caller that already asked for it does not ask twice. */
export function LicenseNoticeBar({ notice, compact, inline }: BarProps) {
  return (
    <Bar
      role="alert"
      $urgent={notice.urgent}
      $compact={compact}
      $inline={inline}
      // Truncated in the app bar — the full sentence stays one hover away.
      title={inline ? notice.text : undefined}
    >
      <AlertTriangle size={compact || inline ? 16 : 18} />
      {notice.text}
    </Bar>
  );
}

export function LicenseBanner({ compact }: { compact?: boolean }) {
  const notice = useLicenseNotice();
  if (!notice) return null;
  return <LicenseNoticeBar notice={notice} compact={compact} />;
}
