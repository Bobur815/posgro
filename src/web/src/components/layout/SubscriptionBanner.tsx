import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { AlertTriangle } from "lucide-react";
import { storeConfig, type StoreSubscription } from "../../api/client";
import { useAuthStore } from "../../store/auth-store";

/**
 * A strip under the top bar while the store's subscription is running out or has run out — from
 * `warnDays` before the expiry date to the end of the grace days (shared/utils/subscription.ts).
 * Past that the dashboard does not open at all, so nothing here has to cover it.
 */

/** The state changes by the day, so a check every ten minutes is plenty. */
const REFRESH_MS = 10 * 60_000;

const Strip = styled.div<{ $urgent: boolean }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ $urgent }) =>
    $urgent ? "rgba(220, 38, 38, 0.12)" : "rgba(245, 158, 11, 0.14)"};
  border-bottom: 1px solid ${({ $urgent }) => ($urgent ? "#dc2626" : "#f59e0b")};

  svg {
    flex-shrink: 0;
    color: ${({ $urgent }) => ($urgent ? "#dc2626" : "#d97706")};
  }
`;

const Message = styled.span`
  flex: 1;
  min-width: 200px;
`;

const PayLink = styled.a`
  padding: 6px 14px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    opacity: 0.85;
  }
`;

export function SubscriptionBanner() {
  const { t, i18n } = useTranslation();
  const storeId = useAuthStore((s) => s.user?.storeId);
  const [status, setStatus] = useState<StoreSubscription | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!storeId) return; // a super admin has nothing to pay for
    let cancelled = false;
    const load = () =>
      storeConfig
        .getSubscription()
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          /* keep what it had */
        });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [storeId]);

  if (!status || (status.state !== "warning" && status.state !== "grace")) return null;

  const locale = i18n.language?.startsWith("uz") ? "uz-UZ" : "ru-RU";
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : "");
  // With the time: "pay by the 23rd" would read as the whole of the 23rd.
  const moment = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "";

  const message =
    status.state === "grace"
      ? t("subscription.bannerGrace", { date: day(status.expiresAt), blockDate: moment(status.blockAt) })
      : t(status.plan === "TRIAL" ? "subscription.bannerTrialWarning" : "subscription.bannerWarning", {
          date: day(status.expiresAt),
          count: status.daysLeft ?? 0,
        });

  return (
    <Strip $urgent={status.state === "grace"} role="status">
      <AlertTriangle size={18} />
      <Message>{message}</Message>
      {status.paymentUrl && (
        <PayLink href={status.paymentUrl} target="_blank" rel="noopener noreferrer">
          {t("subscription.payOnline")}
        </PayLink>
      )}
    </Strip>
  );
}
