import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import {
  ActionButton,
  Actions,
  AddressText,
  CheckboxRow,
  CodeDisplay,
  ErrorText,
  Field,
  Hint,
  Label,
  ListMain,
  ListRow,
  Notice,
  RoleLine,
  Section,
  SectionTitle,
  SmallButton,
  TextButton,
  TextInput,
} from "./terminalDialog.styles";
import { formatCountdown, formatLastSeen, settingsErrorKey } from "./terminalDialog.helpers";

/**
 * This terminal's role on the shop's LAN — main or satellite — inside the login-screen gear
 * dialog (tasks/LAN_MAIN_TERMINAL_PLAN.md §11).
 *
 * On the login screen on purpose: a terminal being repaired or repointed is exactly the case where
 * nobody can sign in (§11.1). What protects it is that every act here asks for the super-admin
 * password and the main process checks it each time (§11.2) — the PIN that unlocked the dialog is
 * not enough to hand the shop's stock to another machine.
 *
 * A role change restarts the app. Joining or leaving changes what the terminal *is*: the session
 * signed in a moment ago was not issued by the new main, and services started for the old role are
 * still running. A restart is the one way to be sure none of that carries over.
 */

interface Config {
  terminalId: string;
  isMain: boolean;
  mainTerminalUrl: string | null;
}

interface Satellite {
  terminalId: string;
  name: string | null;
  lastSeenAt: string | null;
}

interface LiveCode {
  code: string;
  expiresAt: number;
  mainTerminalUrl: string | null;
  serverError: string | null;
}

type Mode =
  | { kind: "idle" }
  | { kind: "issue" }
  | { kind: "code" }
  | { kind: "remove"; terminalId: string }
  | { kind: "join" }
  | { kind: "leave" };

/** How long the app waits after a role change before restarting, so the toast can be read. */
const RELAUNCH_DELAY_MS = 1800;
/** How often a shown pairing code is checked for having been used. */
const CODE_POLL_MS = 2000;

export function TerminalRolePanel({ config }: { config: Config }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [hasSuperAdmin, setHasSuperAdmin] = useState<boolean | null>(null);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [code, setCode] = useState<LiveCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [codeOutcome, setCodeOutcome] = useState<"used" | "expired" | null>(null);

  const [password, setPassword] = useState("");
  const [mainUrl, setMainUrl] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [tillName, setTillName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pairing = window.electronAPI.pairing;

  const loadSatellites = useCallback(async () => {
    if (!config.isMain) return [];
    const rows = await pairing.list().catch(() => []);
    setSatellites(rows);
    return rows;
  }, [config.isMain, pairing]);

  useEffect(() => {
    void window.electronAPI.auth
      .hasSuperAdminPassword()
      .then(setHasSuperAdmin)
      .catch(() => setHasSuperAdmin(false));
    void loadSatellites();
    // A code issued earlier and still live is shown again rather than a second one minted.
    if (config.isMain) {
      void pairing
        .getCode()
        .then((live) => {
          if (live) {
            setCode(live);
            setMode({ kind: "code" });
          }
        })
        .catch(() => undefined);
    }
  }, [config.isMain, loadSatellites, pairing]);

  // While a code is on screen: tick the countdown, and notice when it has been used or has lapsed.
  useEffect(() => {
    if (mode.kind !== "code") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const live = await pairing.getCode().catch(() => null);
      if (live) return;
      const before = satellites.length;
      const rows = await loadSatellites();
      setCodeOutcome(rows.length > before ? "used" : "expired");
      setCode(null);
      setMode({ kind: "idle" });
    }, CODE_POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [mode.kind, pairing, loadSatellites, satellites.length]);

  const reset = (next: Mode = { kind: "idle" }) => {
    setMode(next);
    setPassword("");
    setPairingCode("");
    setTillName("");
    setAcknowledged(false);
    setError(null);
  };

  /** Run a role act, turning a thrown `settings.*` key into a message on screen. */
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const key = settingsErrorKey(e);
      setError(key ? t(key) : t("settings.pairingFailed"));
    } finally {
      setBusy(false);
    }
  };

  const relaunchSoon = (message: string) => {
    toast.success(message, RELAUNCH_DELAY_MS);
    setTimeout(() => void window.electronAPI.app.relaunch(), RELAUNCH_DELAY_MS);
  };

  const issueCode = () =>
    act(async () => {
      const issued = await pairing.issueCode(password);
      setCode(issued);
      setCodeOutcome(null);
      setNow(Date.now());
      reset({ kind: "code" });
    });

  const cancelCode = () =>
    act(async () => {
      await pairing.cancelCode();
      setCode(null);
      reset();
    });

  const removeSatellite = (terminalId: string) =>
    act(async () => {
      await pairing.remove(password, terminalId);
      await loadSatellites();
      reset();
    });

  const join = () =>
    act(async () => {
      const result = await pairing.joinAsSatellite(password, {
        mainTerminalUrl: mainUrl.trim(),
        code: pairingCode.trim(),
        name: tillName.trim() || undefined,
      });
      relaunchSoon(t("settings.lanRole.joined", { store: result.storeName }));
    });

  const leave = () =>
    act(async () => {
      await pairing.leave(password);
      relaunchSoon(t("settings.lanRole.left"));
    });

  const passwordField = (onEnter: () => void) => (
    <Field>
      <Label>{t("settings.lanRole.superAdminPassword")}</Label>
      <TextInput
        type="password"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && password && !busy && onEnter()}
      />
    </Field>
  );

  const cancelButton = (
    <ActionButton type="button" onClick={() => reset()} disabled={busy}>
      {t("common.cancel")}
    </ActionButton>
  );

  // ── The forms ──────────────────────────────────────────────────────────────────────────────

  const joinForm = (
    <>
      <Notice>{t("settings.lanRole.becomeSatelliteWarning")}</Notice>
      <Field>
        <Label>{t("settings.lanRole.mainAddress")}</Label>
        <TextInput
          value={mainUrl}
          autoFocus
          spellCheck={false}
          placeholder="http://192.168.1.10:5173/api"
          onChange={(e) => setMainUrl(e.target.value)}
        />
      </Field>
      <Field>
        <Label>{t("settings.lanRole.pairingCode")}</Label>
        <TextInput
          value={pairingCode}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Field>
        <Label>{t("settings.lanRole.tillName")}</Label>
        <TextInput value={tillName} onChange={(e) => setTillName(e.target.value)} />
      </Field>
      <Field>
        <Label>{t("settings.lanRole.superAdminPassword")}</Label>
        <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {/* So a cloned disk image shows up here, before it pairs under a number already in use. */}
      <Hint>{t("settings.lanRole.joinsAs", { id: config.terminalId })}</Hint>
      {error && <ErrorText>{error}</ErrorText>}
      <Actions>
        {cancelButton}
        <ActionButton
          type="button"
          $primary
          disabled={busy || !mainUrl.trim() || pairingCode.length !== 6 || !password}
          onClick={join}
        >
          {t("settings.lanRole.join")}
        </ActionButton>
      </Actions>
    </>
  );

  const leaveForm = (
    <>
      <Notice $danger>{t("settings.lanRole.leaveWarning")}</Notice>
      <CheckboxRow>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        {t("settings.lanRole.leaveAck")}
      </CheckboxRow>
      {passwordField(() => acknowledged && leave())}
      {error && <ErrorText>{error}</ErrorText>}
      <Actions>
        {cancelButton}
        <ActionButton
          type="button"
          $danger
          disabled={busy || !acknowledged || !password}
          onClick={leave}
        >
          {t("settings.lanRole.leaveConfirm")}
        </ActionButton>
      </Actions>
    </>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────────────────────

  const canAct = hasSuperAdmin === true;

  return (
    <Section>
      <SectionTitle>{t("settings.lanRole.title")}</SectionTitle>
      <RoleLine>
        {config.isMain
          ? t("settings.lanRole.isMain", { id: config.terminalId })
          : t("settings.lanRole.isSatellite", { id: config.terminalId })}
      </RoleLine>
      {!config.isMain && config.mainTerminalUrl && (
        <Hint>{t("settings.lanRole.satelliteOf", { url: config.mainTerminalUrl })}</Hint>
      )}

      {/* §11.2: with no super-admin password configured there is no gate strong enough, so the
          role cannot be changed at all — rather than falling back to the PIN that opened this. */}
      {hasSuperAdmin === false && <Notice>{t("settings.pairingNeedsSuperAdmin")}</Notice>}

      {config.isMain && (
        <>
          <Field>
            <Label>{t("settings.lanRole.satellitesTitle")}</Label>
            {satellites.length === 0 ? (
              <Hint>{t("settings.lanRole.noSatellites")}</Hint>
            ) : (
              satellites.map((s) => (
                <ListRow key={s.terminalId}>
                  <ListMain>
                    {s.terminalId}
                    {s.name ? ` · ${s.name}` : ""}
                    <small>
                      {formatLastSeen(s.lastSeenAt, i18n.language)
                        ? t("settings.lanRole.lastSeen", {
                            time: formatLastSeen(s.lastSeenAt, i18n.language),
                          })
                        : t("settings.lanRole.neverSeen")}
                    </small>
                  </ListMain>
                  {canAct && mode.kind === "idle" && (
                    <SmallButton
                      type="button"
                      $danger
                      onClick={() => reset({ kind: "remove", terminalId: s.terminalId })}
                    >
                      {t("settings.lanRole.remove")}
                    </SmallButton>
                  )}
                </ListRow>
              ))
            )}
          </Field>

          {mode.kind === "remove" && (
            <>
              <Notice $danger>
                {t("settings.lanRole.removeConfirm", { id: mode.terminalId })}
              </Notice>
              {passwordField(() => removeSatellite(mode.terminalId))}
              {error && <ErrorText>{error}</ErrorText>}
              <Actions>
                {cancelButton}
                <ActionButton
                  type="button"
                  $danger
                  disabled={busy || !password}
                  onClick={() => removeSatellite(mode.terminalId)}
                >
                  {t("settings.lanRole.remove")}
                </ActionButton>
              </Actions>
            </>
          )}

          {mode.kind === "code" && code && (
            <Field>
              <Hint>{t("settings.lanRole.codeTitle")}</Hint>
              <CodeDisplay>{code.code}</CodeDisplay>
              {code.mainTerminalUrl ? (
                <>
                  <Hint style={{ textAlign: "center" }}>{t("settings.lanRole.codeAddressLabel")}</Hint>
                  <AddressText>{code.mainTerminalUrl}</AddressText>
                </>
              ) : (
                <ErrorText>
                  {t("settings.lanRole.codeNoAddress")} {code.serverError ?? ""}
                </ErrorText>
              )}
              <Hint style={{ textAlign: "center" }}>
                {t("settings.lanRole.codeExpires", { time: formatCountdown(code.expiresAt - now) })}
              </Hint>
              {error && <ErrorText>{error}</ErrorText>}
              <Actions>
                <ActionButton type="button" onClick={cancelCode} disabled={busy}>
                  {t("settings.lanRole.cancelCode")}
                </ActionButton>
              </Actions>
            </Field>
          )}

          {mode.kind === "issue" && (
            <>
              {passwordField(issueCode)}
              {error && <ErrorText>{error}</ErrorText>}
              <Actions>
                {cancelButton}
                <ActionButton type="button" $primary disabled={busy || !password} onClick={issueCode}>
                  {t("settings.lanRole.addSatellite")}
                </ActionButton>
              </Actions>
            </>
          )}

          {mode.kind === "join" && joinForm}

          {mode.kind === "idle" && (
            <>
              {codeOutcome && (
                <Hint>
                  {codeOutcome === "used"
                    ? t("settings.lanRole.codeUsed")
                    : t("settings.lanRole.codeExpired")}
                </Hint>
              )}
              {canAct && (
                <>
                  <Actions style={{ justifyContent: "flex-start" }}>
                    <ActionButton type="button" $primary onClick={() => reset({ kind: "issue" })}>
                      {t("settings.lanRole.addSatellite")}
                    </ActionButton>
                  </Actions>
                  <TextButton type="button" onClick={() => reset({ kind: "join" })}>
                    {t("settings.lanRole.becomeSatellite")}
                  </TextButton>
                </>
              )}
            </>
          )}
        </>
      )}

      {!config.isMain && (
        <>
          {mode.kind === "join" && joinForm}
          {mode.kind === "leave" && leaveForm}
          {mode.kind === "idle" && canAct && (
            <>
              <TextButton type="button" onClick={() => reset({ kind: "join" })}>
                {t("settings.lanRole.joinOther")}
              </TextButton>
              <TextButton type="button" $danger onClick={() => reset({ kind: "leave" })}>
                {t("settings.lanRole.leave")}
              </TextButton>
            </>
          )}
        </>
      )}
    </Section>
  );
}
