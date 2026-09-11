import { useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import {
  CreditCard,
  ExternalLink,
  Settings,
  Smartphone,
  X,
} from "lucide-react";
import { formatCurrency } from "../../../shared/utils/transformers";
import { useToast } from "../../context/ToastContext";
import type { StoreSubscription } from "../../../shared/types/store.types";
import {
  ActionButton,
  Actions,
  CloseButton,
  Dialog,
  DialogHeader,
  DialogTitle,
  ErrorText,
  Hint,
  Label,
  Overlay,
  TextInput,
  WideDialog,
} from "./terminalDialog.styles";
import { settingsErrorKey } from "./terminalDialog.helpers";
import { TerminalRolePanel } from "./TerminalRolePanel";

/**
 * The terminal-level controls at the bottom of the login screen.
 *
 * Settings edits the API URL this terminal talks to, and its role on the shop's LAN (main or
 * satellite — `TerminalRolePanel`). Because the login screen is unauthenticated, the URL would
 * otherwise let anyone repoint the terminal at a server of their choosing, so the dialog is gated
 * on the store PIN (or an admin password on a terminal with no PIN). Changing the role asks for
 * the super-admin password on top of that, act by act (§11.2).
 *
 * The phone button shows the web admin dashboard address as a QR, and the card button shows the
 * store's subscription status with a way to pay for it. Neither is hidden for an OFFLINE_ONLY
 * store: such a store still has a subscription with the vendor, and its dashboard is served by
 * this terminal on the shop's own network. What changes offline is only what the terminal can
 * reach — so the subscription button checks for a connection first and says plainly when there
 * is none, rather than the button disappearing.
 */

const Bar = styled.div`
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 22px;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

/* The QR must stay on white regardless of theme — a dark ground breaks scanner contrast. */
const QrFrame = styled.div`
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  justify-content: center;
`;

const QrImage = styled.img`
  width: 240px;
  height: 240px;
  display: block;
`;

const UrlText = styled.p`
  font-size: 13px;
  text-align: center;
  word-break: break-all;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 14px 0 0;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:last-of-type {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span<{ $muted?: boolean; $warn?: boolean }>`
  font-size: 15px;
  font-weight: 600;
  text-align: right;
  color: ${({ $muted, $warn, theme }) =>
    $warn
      ? theme.colors.error
      : $muted
        ? theme.colors.textSecondary
        : theme.colors.text};
`;

const LinkButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 16px;
  margin-top: 16px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;

  &:hover {
    opacity: 0.9;
  }
`;

const SupportPhone = styled.p`
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  margin: 12px 0 0;
`;

type DialogKind = "none" | "unlock" | "server" | "qr" | "subscription" | "pay";

/** Renders an ISO timestamp as a plain date, or a dash when the plan has no expiry. */
function formatExpiry(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === "uz" ? "uz-UZ" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function TerminalAccessBar() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind>("none");

  const [secret, setSecret] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  // Who this terminal is on the shop's LAN, read when the settings dialog is unlocked.
  const [terminal, setTerminal] = useState<{
    terminalId: string;
    isMain: boolean;
    mainTerminalUrl: string | null;
  } | null>(null);
  const [qr, setQr] = useState<{
    url: string;
    qrDataUrl: string | null;
    local: boolean;
    error: string | null;
  } | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [subscription, setSubscription] = useState<StoreSubscription | null>(
    null,
  );
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setDialog("none");
    setSecret("");
    setError(null);
  };

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await window.electronAPI.auth.verifyTerminalAccess(secret);
      if (!ok) {
        setError(t("settings.terminalAccessDenied"));
        return;
      }
      const cfg = await window.electronAPI.config.getLocalConfig();
      setApiUrl(cfg?.apiUrl ?? "");
      setTerminal(
        cfg
          ? {
              terminalId: cfg.terminalId,
              isMain: cfg.isMain !== false,
              mainTerminalUrl: cfg.mainTerminalUrl ?? null,
            }
          : null,
      );
      setSecret("");
      setDialog("server");
    } catch {
      setError(t("settings.terminalAccessDenied"));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUrl = async () => {
    const trimmed = apiUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError(t("settings.apiUrlInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.config.updateLocalConfig({ apiUrl: trimmed });
      close();
    } catch (e) {
      // The main process throws a translation key, wrapped by Electron (see settingsErrorKey).
      const key = settingsErrorKey(e);
      setError(key ? t(key) : t("settings.apiUrlInvalid"));
    } finally {
      setBusy(false);
    }
  };

  const openQr = async () => {
    setDialog("qr");
    setQrLoaded(false);
    setQr(await window.electronAPI.config.getWebAdminQr().catch(() => null));
    setQrLoaded(true);
  };

  const openSubscription = async () => {
    // Subscription state only exists on the vendor's server, so there is nothing worth opening
    // without a connection — a dialog of dashes helps nobody. Probe the server this terminal is
    // actually configured against, so a staging terminal is judged against staging.
    const cfg = await window.electronAPI.config
      .getLocalConfig()
      .catch(() => null);
    if (!(await window.electronAPI.app.isOnline(cfg?.apiUrl))) {
      toast.error(t("errors.noInternet"));
      return;
    }

    setDialog("subscription");
    // Kept separate from `busy`: this read can take seconds against a slow VPS, and it must not
    // leave the unlock dialog's confirm button disabled if the user closes and reopens.
    setLoadingSubscription(true);
    // A failed read still returns the cached snapshot, so the dialog only ever goes empty on a
    // terminal that has never reached the server.
    setSubscription(
      await window.electronAPI.subscription.get().catch(() => null),
    );
    setLoadingSubscription(false);
  };

  const openPaymentLink = () => {
    const url = subscription?.payment.paymentUrl;
    if (url) void window.electronAPI.subscription.openPaymentLink(url);
  };

  const expired =
    !!subscription?.expiresAt &&
    new Date(subscription.expiresAt).getTime() < Date.now();

  // Nothing to pay with until the operator has configured a QR payload or a pay link, so the
  // button stays disabled rather than opening an empty dialog.
  const canPay = !!(
    subscription?.payment.qrDataUrl || subscription?.payment.paymentUrl
  );

  return (
    <>
      <Bar>
        <IconButton
          type="button"
          onClick={() => setDialog("unlock")}
          title={t("settings.terminalAccessTitle")}
          aria-label={t("settings.terminalAccessTitle")}
        >
          <Settings size={19} />
        </IconButton>

        <IconButton
          type="button"
          onClick={openQr}
          title={t("settings.webAdminOnPhone")}
          aria-label={t("settings.webAdminOnPhone")}
        >
          <Smartphone size={19} />
        </IconButton>

        <IconButton
          type="button"
          onClick={openSubscription}
          title={t("subscription.statusTitle")}
          aria-label={t("subscription.statusTitle")}
        >
          <CreditCard size={19} />
        </IconButton>
      </Bar>

      {dialog === "unlock" && (
        <Overlay onClick={(e) => e.target === e.currentTarget && close()}>
          <Dialog>
            <DialogHeader>
              <DialogTitle>{t("settings.terminalAccessTitle")}</DialogTitle>
              <CloseButton onClick={close}>
                <X size={18} />
              </CloseButton>
            </DialogHeader>
            <Label>{t("settings.terminalAccessSecret")}</Label>
            <TextInput
              type="password"
              value={secret}
              autoFocus
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            />
            <Hint>{t("settings.terminalAccessHint")}</Hint>
            {error && <ErrorText>{error}</ErrorText>}
            <Actions>
              <ActionButton type="button" onClick={close}>
                {t("common.cancel")}
              </ActionButton>
              <ActionButton
                type="button"
                $primary
                disabled={busy || !secret}
                onClick={handleUnlock}
              >
                {t("common.confirm")}
              </ActionButton>
            </Actions>
          </Dialog>
        </Overlay>
      )}

      {dialog === "server" && (
        <Overlay onClick={(e) => e.target === e.currentTarget && close()}>
          <WideDialog>
            <DialogHeader>
              <DialogTitle>{t("settings.terminalAccessTitle")}</DialogTitle>
              <CloseButton onClick={close}>
                <X size={18} />
              </CloseButton>
            </DialogHeader>
            {/* A satellite never talks to the VPS (LAN plan §1), so an API URL field there would be
                a setting that does nothing. Its server is its main, shown in the role panel. */}
            {terminal?.isMain === false ? (
              <Hint>{t("settings.lanRole.noApiUrlOnSatellite")}</Hint>
            ) : (
              <>
                <Label>{t("settings.apiUrl")}</Label>
                <TextInput
                  value={apiUrl}
                  autoFocus
                  spellCheck={false}
                  placeholder="https://pos.bobur-dev.uz/api"
                  onChange={(e) => setApiUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
                />
                <Hint>{t("settings.apiUrlHint")}</Hint>
                {error && <ErrorText>{error}</ErrorText>}
                <Actions>
                  <ActionButton type="button" onClick={close}>
                    {t("common.cancel")}
                  </ActionButton>
                  <ActionButton
                    type="button"
                    $primary
                    disabled={busy}
                    onClick={handleSaveUrl}
                  >
                    {t("common.save")}
                  </ActionButton>
                </Actions>
              </>
            )}
            {terminal && <TerminalRolePanel config={terminal} />}
          </WideDialog>
        </Overlay>
      )}

      {dialog === "qr" && (
        <Overlay onClick={(e) => e.target === e.currentTarget && close()}>
          <Dialog>
            <DialogHeader>
              <DialogTitle>{t("settings.webAdminOnPhone")}</DialogTitle>
              <CloseButton onClick={close}>
                <X size={18} />
              </CloseButton>
            </DialogHeader>
            {qr?.qrDataUrl && (
              <QrFrame>
                <QrImage
                  src={qr.qrDataUrl}
                  alt={t("settings.webAdminOnPhone")}
                />
              </QrFrame>
            )}
            {/* A local dashboard is reached over the shop's own Wi-Fi, not the internet, so it
                needs different instructions from the hosted one. A null reply means there is no
                address to hand out — no LAN address locally, or no server configured. */}
            <Hint>
              {!qr && qrLoaded
                ? t("settings.webAdminUnavailable")
                : qr?.local
                  ? t("settings.webAdminLocalHint")
                  : t("settings.webAdminHint")}
            </Hint>
            {qr?.url && <UrlText>{qr.url}</UrlText>}
            {qr?.error && <ErrorText>{qr.error}</ErrorText>}
            <Actions>
              <ActionButton type="button" $primary onClick={close}>
                {t("common.close")}
              </ActionButton>
            </Actions>
          </Dialog>
        </Overlay>
      )}

      {dialog === "subscription" && (
        <Overlay onClick={(e) => e.target === e.currentTarget && close()}>
          <Dialog>
            <DialogHeader>
              <DialogTitle>{t("subscription.statusTitle")}</DialogTitle>
              <CloseButton onClick={close}>
                <X size={18} />
              </CloseButton>
            </DialogHeader>

            {loadingSubscription && !subscription ? (
              <Hint>{t("common.loading")}</Hint>
            ) : (
              <>
                <InfoRow>
                  <InfoLabel>{t("subscription.store")}</InfoLabel>
                  <InfoValue $muted={!subscription?.storeName}>
                    {subscription?.storeName ??
                      subscription?.storeId ??
                      t("subscription.unknownStore")}
                  </InfoValue>
                </InfoRow>

                <InfoRow>
                  <InfoLabel>{t("subscription.title")}</InfoLabel>
                  <InfoValue $muted={!subscription?.plan}>
                    {subscription?.plan ?? t("subscription.noplan")}
                  </InfoValue>
                </InfoRow>

                <InfoRow>
                  <InfoLabel>{t("subscription.expiresAt")}</InfoLabel>
                  <InfoValue $muted={!subscription?.plan} $warn={expired}>
                    {!subscription?.plan
                      ? "—"
                      : (formatExpiry(subscription.expiresAt, i18n.language) ??
                        t("subscription.perpetual"))}
                  </InfoValue>
                </InfoRow>

                <InfoRow>
                  <InfoLabel>{t("subscription.aiPlan")}</InfoLabel>
                  <InfoValue>
                    {subscription?.aiPlan === "paid"
                      ? t("subscription.aiPlanPaid")
                      : t("subscription.aiPlanFree")}
                  </InfoValue>
                </InfoRow>

                <InfoRow>
                  <InfoLabel>{t("subscription.storeBalance")}</InfoLabel>
                  <InfoValue $muted={subscription?.balanceUzs == null}>
                    {subscription?.balanceUzs == null
                      ? "—"
                      : formatCurrency(
                          subscription.balanceUzs,
                          i18n.language === "uz" ? "uz" : "ru",
                        )}
                  </InfoValue>
                </InfoRow>

                {/* Say so rather than passing off a cached snapshot as the live state — and say
                    WHICH failure it was, because each one has a different fix. Dashes with no
                    explanation are indistinguishable from a store that has no plan. */}
                {subscription?.stale && (
                  <Hint>
                    {subscription.reason === "offline-only-store"
                      ? t("subscription.offlineOnlyStoreHint", {
                          phone:
                            subscription.payment.supportPhone ||
                            t("subscription.supportUnknown"),
                        })
                      : subscription.reason === "no-credential"
                        ? t("subscription.noCredentialHint")
                        : subscription.reason === "server-error"
                          ? t("subscription.serverErrorHint")
                          : t("subscription.offlineHint")}
                  </Hint>
                )}
              </>
            )}

            <Actions>
              <ActionButton type="button" onClick={close}>
                {t("common.close")}
              </ActionButton>
              <ActionButton
                type="button"
                $primary
                disabled={!canPay}
                onClick={() => {
                  setError(null);
                  setDialog("pay");
                }}
              >
                {t("subscription.payAction")}
              </ActionButton>
            </Actions>
          </Dialog>
        </Overlay>
      )}

      {dialog === "pay" && (
        <Overlay onClick={(e) => e.target === e.currentTarget && close()}>
          <WideDialog>
            <DialogHeader>
              <DialogTitle>{t("subscription.payTitle")}</DialogTitle>
              <CloseButton onClick={close}>
                <X size={18} />
              </CloseButton>
            </DialogHeader>

            {subscription?.payment.qrDataUrl && (
              <>
                <Hint style={{ margin: "0 0 14px" }}>
                  {t("subscription.payScanHint")}
                </Hint>
                <QrFrame>
                  <QrImage
                    src={subscription.payment.qrDataUrl}
                    alt={t("subscription.payTitle")}
                  />
                </QrFrame>
                <Hint>{t("subscription.payCallHint")}</Hint>
                {subscription.payment.supportPhone && (
                  <SupportPhone>
                    {subscription.payment.supportPhone}
                  </SupportPhone>
                )}
              </>
            )}

            {subscription?.payment.paymentUrl && (
              <>
                <Hint>{t("subscription.payLinkHint")}</Hint>
                <LinkButton type="button" onClick={openPaymentLink}>
                  <ExternalLink size={17} />
                  {t("subscription.payOnline")}
                </LinkButton>
              </>
            )}

            <Actions>
              <ActionButton type="button" $primary onClick={close}>
                {t("common.close")}
              </ActionButton>
            </Actions>
          </WideDialog>
        </Overlay>
      )}
    </>
  );
}
