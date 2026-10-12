// Fiscal backlog — four steps (five with the merge setting), each started by the admin and each
// waiting for "Next":
//   1. classify   cash/Click-only receipts without marked goods → DISABLED (rule #1); list the rest
//   2. repair     marking codes captured under a Russian layout; products REGOS will reject
//   3. verify     every marking code against asl-belgisi; dead/missing ones → substitute product
//   (group)       merge setting on: sort by tender, merge one day's cash receipts into one
//   4. fiscalize  send what is left to REGOS:VCR
// Every step recomputes from the database in the main process, so nothing here is authoritative:
// leaving the screen mid-run is safe, and the main process refuses a second concurrent run.
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Stepper } from "../../components/common/Stepper";
import type {
  FiscalBacklogClassifyResult,
  FiscalBacklogFiscalizeResult,
  FiscalBacklogGroupResult,
  FiscalBacklogMergeSettings,
  FiscalBacklogProgress,
  FiscalBacklogRepairResult,
  FiscalBacklogStep,
  FiscalBacklogSums,
  FiscalBacklogVerifyResult,
  FiscalQueueStatus,
} from "@shared/types";
import { translateMarkingStatus } from "../POS/markingCirculation";

const STEPS: FiscalBacklogStep[] = ["classify", "repair", "verify", "fiscalize"];
const STEPS_WITH_GROUP: FiscalBacklogStep[] = [
  "classify",
  "repair",
  "verify",
  "group",
  "fiscalize",
];

/** Registry failures share their wording with the Marking Check screen. */
const MARKING_ERRORS = new Set([
  "NO_TOKEN",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "OFFLINE",
  "TIMEOUT",
  "REGISTRY_KEY_MISSING",
  "REGISTRY_KEY_REJECTED",
  "REGISTRY_UNREACHABLE",
  "REGISTRY_BAD_RESPONSE",
]);

/** What products:search hands back (serializeProduct); only the fields shown here. */
interface PickedProduct {
  id: string | number;
  nameRu: string;
  nameUz: string;
  barcode?: string;
  mxik?: string;
  internalCode?: string;
}

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Muted = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding-top: ${({ theme }) => theme.spacing.md};
`;

const StepTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const Line = styled.div<{ $tone?: "ok" | "error" | "warn" }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 14px;
  color: ${({ theme, $tone }) =>
    $tone === "ok"
      ? (theme.colors.success ?? theme.colors.primary)
      : $tone === "error" || $tone === "warn"
        ? theme.colors.error
        : theme.colors.text};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text};
`;

const Pick = styled.button`
  text-align: left;
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Spin = styled(Loader2)`
  animation: backlog-spin 1s linear infinite;
  @keyframes backlog-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const BarOuter = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 999px;
  overflow: hidden;
`;

const BarInner = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.colors.primary};
  transition: width 0.25s ease;
`;

/** First day of the current month, as YYYY-MM-DD in local time. */
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface Props {
  queue: FiscalQueueStatus;
  /** Re-read the queue counters (after a step changed statuses). */
  onChanged: () => void;
}

export function FiscalBacklogCard({ queue, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [fromDate, setFromDate] = useState(monthStart);
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [running, setRunning] = useState(false);
  /** A run already going in the main process (e.g. started before the screen was reopened). */
  const [busyElsewhere, setBusyElsewhere] = useState<FiscalBacklogStep | null>(null);
  const [progress, setProgress] = useState<FiscalBacklogProgress | null>(null);
  /** Stop was pressed: step 4 ends after the receipt being sent now. */
  const [stopping, setStopping] = useState(false);

  const [classify, setClassify] = useState<FiscalBacklogClassifyResult | null>(null);
  const [repair, setRepair] = useState<FiscalBacklogRepairResult | null>(null);
  const [verify, setVerify] = useState<FiscalBacklogVerifyResult | null>(null);
  const [group, setGroup] = useState<FiscalBacklogGroupResult | null>(null);
  const [fiscalize, setFiscalize] = useState<FiscalBacklogFiscalizeResult | null>(null);

  /** Merge old cash receipts (step "group"). Off until read: the four steps as before. */
  const [merge, setMerge] = useState<FiscalBacklogMergeSettings>({ enabled: false, size: 100 });
  const [sizeDraft, setSizeDraft] = useState("100");
  const steps = merge.enabled ? STEPS_WITH_GROUP : STEPS;

  const [substitute, setSubstitute] = useState<PickedProduct | null>(null);
  const [subQuery, setSubQuery] = useState("");
  const [subResults, setSubResults] = useState<PickedProduct[]>([]);

  const productName = (p: { nameRu: string; nameUz: string }) =>
    i18n.language === "uz" ? p.nameUz || p.nameRu : p.nameRu || p.nameUz;

  const errorText = (code?: string): string => {
    if (!code) return t("common.error");
    if (code.startsWith("UNKNOWN_STATUS:")) {
      return t("fiscalSettings.backlog.errors.UNKNOWN_STATUS", {
        status: code.slice("UNKNOWN_STATUS:".length),
      });
    }
    if (MARKING_ERRORS.has(code)) return t(`markingCheck.errors.${code}`);
    const key = `fiscalSettings.backlog.errors.${code}`;
    const text = t(key);
    return text === key ? code : text;
  };

  // ── Busy state from the main process ────────────────────────────────────────────────────────
  const checkBusy = useCallback(async () => {
    const step = await window.electronAPI.fiscal.backlogBusy().catch(() => null);
    setBusyElsewhere(step);
    return step;
  }, []);

  useEffect(() => {
    void checkBusy();
  }, [checkBusy]);

  // While a run started elsewhere is going, look again every 2 s until it ends.
  useEffect(() => {
    if (!busyElsewhere || running) return;
    const timer = setInterval(() => {
      void checkBusy().then((step) => {
        if (!step) onChanged();
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [busyElsewhere, running, checkBusy, onChanged]);

  useEffect(() => window.electronAPI.fiscal.onBacklogProgress(setProgress), []);

  // ── Merge setting (per till; changing it starts the stepper over, as its steps change) ──────
  useEffect(() => {
    window.electronAPI.fiscal
      .getBacklogMerge()
      .then((m) => {
        setMerge(m);
        setSizeDraft(String(m.size));
      })
      .catch(() => {});
  }, []);

  const saveMerge = async (input: Partial<FiscalBacklogMergeSettings>) => {
    try {
      const m = await window.electronAPI.fiscal.setBacklogMerge(input);
      setMerge(m);
      setSizeDraft(String(m.size));
      reset();
    } catch {
      setSizeDraft(String(merge.size));
    }
  };

  const money = (n: number) =>
    n.toLocaleString(i18n.language === "uz" ? "uz-UZ" : "ru-RU", { maximumFractionDigits: 2 });

  const sumsLine = (s: FiscalBacklogSums) => (
    <Line $tone={s.fiscalizedAmount >= s.totalAmount ? "ok" : undefined}>
      {t("fiscalSettings.backlog.sums", {
        fiscalized: money(s.fiscalizedAmount),
        total: money(s.totalAmount),
        pct: s.totalAmount > 0 ? Math.floor((s.fiscalizedAmount / s.totalAmount) * 100) : 100,
      })}
    </Line>
  );

  // ── Substitute product (saved straight away; it is a fiscal setting of this till) ──────────
  useEffect(() => {
    if (!queue.enabled) return;
    window.electronAPI.fiscal
      .getConfig()
      .then(async (cfg) => {
        if (!cfg.substituteProductId) return;
        // The id is the local DB key, not the store product code.
        const p = (await window.electronAPI.products.getById(String(cfg.substituteProductId), {
          byDbId: true,
        })) as PickedProduct | null;
        if (p) setSubstitute(p);
      })
      .catch(() => {});
  }, [queue.enabled]);

  const searchSeq = useRef(0);
  useEffect(() => {
    const q = subQuery.trim();
    if (q.length < 2) {
      setSubResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      window.electronAPI.products
        .search(q)
        .then((rows) => {
          // A slower earlier search must not overwrite a newer one.
          if (seq === searchSeq.current) setSubResults((rows as PickedProduct[]).slice(0, 8));
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [subQuery]);

  const chooseSubstitute = async (p: PickedProduct) => {
    try {
      await window.electronAPI.fiscal.setConfig({ substituteProductId: Number(p.id) });
      setSubstitute(p);
      setSubQuery("");
      setSubResults([]);
    } catch {
      setSubstitute(null);
    }
  };

  // ── Steps ───────────────────────────────────────────────────────────────────────────────────
  const reset = () => {
    setCurrent(0);
    setFinished(false);
    setClassify(null);
    setRepair(null);
    setVerify(null);
    setGroup(null);
    setFiscalize(null);
    setProgress(null);
  };

  const run = async (step: FiscalBacklogStep) => {
    setRunning(true);
    setStopping(false);
    setProgress(null);
    try {
      const api = window.electronAPI.fiscal;
      if (step === "classify") setClassify(await api.backlogClassify(fromDate));
      if (step === "repair") setRepair(await api.backlogRepair(fromDate));
      if (step === "verify") setVerify(await api.backlogVerify(fromDate));
      if (step === "group") setGroup(await api.backlogGroup(fromDate));
      if (step === "fiscalize") setFiscalize(await api.backlogFiscalize(fromDate));
    } catch {
      const failed = { ok: false, error: "IPC" };
      if (step === "classify") setClassify({ ...failed, skipped: 0, kept: [] });
      if (step === "repair")
        setRepair({
          ...failed,
          labelsRepaired: 0,
          receiptsTouched: 0,
          mxikCleaned: 0,
          mxikFilled: [],
          tasnifUnreachable: 0,
          productIssues: [],
        });
      if (step === "verify") setVerify({ ...failed, checked: 0, disabled: 0, changes: [] });
      if (step === "group") setGroup({ ...failed, groups: [] });
      if (step === "fiscalize") setFiscalize({ ...failed, fiscalized: 0, failed: [] });
    } finally {
      setRunning(false);
      setStopping(false);
      onChanged();
    }
  };

  /** Step 4 only. The receipt being sent finishes and is counted; nothing after it is touched. */
  const stop = async () => {
    setStopping(true);
    const accepted = await window.electronAPI.fiscal.backlogStop().catch(() => false);
    if (!accepted) setStopping(false);
  };

  const stopButton = (
    <Button variant="danger" onClick={() => void stop()} disabled={stopping}>
      {stopping
        ? progress?.currentReceipt
          ? t("fiscalSettings.backlog.stoppingAfter", { receipt: progress.currentReceipt })
          : t("fiscalSettings.backlog.stopping")
        : t("fiscalSettings.backlog.stop")}
    </Button>
  );

  const stepDone: Record<FiscalBacklogStep, boolean> = {
    classify: !!classify?.ok,
    repair: !!repair?.ok,
    verify: !!verify?.ok,
    group: !!group?.ok,
    fiscalize: !!fiscalize && fiscalize.failed.length === 0 && fiscalize.ok,
  };

  const step = steps[current];
  const blocked = running || !!busyElsewhere || !queue.enabled;
  const pct = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  const next = () => {
    if (current < steps.length - 1) setCurrent(current + 1);
    else setFinished(true);
  };

  const errorLine = (r: { ok: boolean; error?: string } | null) =>
    r && !r.ok && r.error ? (
      <Line $tone="error">
        <XCircle size={16} />
        {errorText(r.error)}
      </Line>
    ) : null;

  return (
    <Card>
      <Label>{t("fiscalSettings.queueStatus")}</Label>
      <Muted>
        {t("fiscalSettings.fiscalized")}: {queue.fiscalized} · {t("fiscalSettings.pending")}:{" "}
        {queue.pending} · {t("fiscalSettings.failed")}: {queue.failed}
        {(queue.blocked ?? 0) > 0 &&
          ` (${t("fiscalSettings.blockedByMarking", { count: queue.blocked ?? 0 })})`}
      </Muted>
      <Muted>{t("fiscalSettings.backlog.hint")}</Muted>

      {!queue.enabled && (
        <Line $tone="warn">{t("fiscalSettings.backlog.errors.FISCAL_DISABLED")}</Line>
      )}
      {busyElsewhere && !running && (
        <Line $tone="warn">
          <Spin size={14} />
          {t("fiscalSettings.backlog.busyElsewhere")}
        </Line>
      )}
      {/* A step 4 started before this screen was opened can be stopped from here too. */}
      {busyElsewhere === "fiscalize" && !running && <Row>{stopButton}</Row>}

      <Row>
        <Label htmlFor="backlog-from">{t("fiscalSettings.backlog.fromDate")}</Label>
        <Input
          id="backlog-from"
          type="date"
          value={fromDate}
          disabled={blocked}
          onChange={(e) => {
            setFromDate(e.target.value);
            reset();
          }}
        />
      </Row>

      <Row>
        <Label htmlFor="backlog-merge">
          <input
            id="backlog-merge"
            type="checkbox"
            checked={merge.enabled}
            disabled={blocked}
            onChange={(e) => void saveMerge({ enabled: e.target.checked })}
          />{" "}
          {t("fiscalSettings.backlog.merge")}
        </Label>
        {merge.enabled && (
          <>
            <Label htmlFor="backlog-merge-size">{t("fiscalSettings.backlog.mergeSize")}</Label>
            <Input
              id="backlog-merge-size"
              type="number"
              min={2}
              max={1000}
              style={{ width: 90 }}
              value={sizeDraft}
              disabled={blocked}
              onChange={(e) => setSizeDraft(e.target.value)}
              onBlur={() => {
                if (Number(sizeDraft) !== merge.size) void saveMerge({ size: Number(sizeDraft) });
              }}
            />
          </>
        )}
      </Row>
      {merge.enabled && <Muted>{t("fiscalSettings.backlog.mergeHint")}</Muted>}

      <Stepper
        steps={steps.map((s) => t(`fiscalSettings.backlog.steps.${s}`))}
        current={current}
        finished={finished}
      />

      <Panel>
        <StepTitle>
          {current + 1}. {t(`fiscalSettings.backlog.steps.${step}`)}
        </StepTitle>
        <Muted>{t(`fiscalSettings.backlog.about.${step}`)}</Muted>

        {step === "verify" && (
          <>
            <Label>{t("fiscalSettings.backlog.substitute")}</Label>
            {substitute ? (
              <Line>
                <CheckCircle size={16} />
                {productName(substitute)}
                {substitute.barcode ? ` · ${substitute.barcode}` : ""}
                {substitute.mxik ? ` · ${substitute.mxik}` : ""}
              </Line>
            ) : (
              <Line $tone="warn">
                <AlertTriangle size={16} />
                {t("fiscalSettings.backlog.errors.NO_SUBSTITUTE")}
              </Line>
            )}
            <Input
              value={subQuery}
              disabled={blocked}
              placeholder={t("fiscalSettings.backlog.substituteSearch")}
              onChange={(e) => setSubQuery(e.target.value)}
            />
            {subResults.length > 0 && (
              <List>
                {subResults.map((p) => (
                  <Pick key={String(p.id)} type="button" onClick={() => void chooseSubstitute(p)}>
                    {productName(p)}
                    {p.internalCode ? ` · ${p.internalCode}` : ""}
                    {p.barcode ? ` · ${p.barcode}` : ""}
                    {p.mxik ? ` · ${p.mxik}` : ""}
                  </Pick>
                ))}
              </List>
            )}
            <Muted>{t("fiscalSettings.backlog.substituteHint")}</Muted>
          </>
        )}

        {running && progress && progress.step === step && (
          <>
            <Muted>
              {progress.currentReceipt ? `#${progress.currentReceipt} · ` : ""}
              {progress.processed} / {progress.total}
            </Muted>
            <BarOuter>
              <BarInner $pct={pct} />
            </BarOuter>
            {progress.sums && sumsLine(progress.sums)}
            {step === "fiscalize" && <Row>{stopButton}</Row>}
          </>
        )}

        {/* Results */}
        {step === "classify" && classify && (
          <>
            {errorLine(classify)}
            {classify.ok && (
              <>
                <Line $tone="ok">
                  <CheckCircle size={16} />
                  {t("fiscalSettings.backlog.classifyDone", {
                    skipped: classify.skipped,
                    kept: classify.kept.length,
                  })}
                </Line>
                {classify.kept.length > 0 && (
                  <List>
                    {classify.kept.map((r) => (
                      <div key={r.saleId}>
                        #{r.receiptNumber} · {new Date(r.createdAt).toLocaleString()} ·{" "}
                        {r.finalAmount.toLocaleString()} · {r.paymentMethod}
                        {r.marked ? ` · ${t("fiscalSettings.backlog.marked")}` : ""}
                      </div>
                    ))}
                  </List>
                )}
              </>
            )}
          </>
        )}

        {step === "repair" && repair && (
          <>
            {errorLine(repair)}
            {repair.ok && (
              <>
                <Line $tone="ok">
                  <CheckCircle size={16} />
                  {t("fiscalSettings.backlog.repairDone", {
                    labels: repair.labelsRepaired,
                    receipts: repair.receiptsTouched,
                  })}
                </Line>
                {repair.mxikCleaned > 0 && (
                  <Line $tone="ok">
                    <CheckCircle size={16} />
                    {t("fiscalSettings.backlog.mxikCleaned", { count: repair.mxikCleaned })}
                  </Line>
                )}
                {repair.mxikFilled.length > 0 && (
                  <>
                    <Line $tone="ok">
                      <CheckCircle size={16} />
                      {t("fiscalSettings.backlog.mxikFilled", { count: repair.mxikFilled.length })}
                    </Line>
                    <List>
                      {repair.mxikFilled.map((p) => (
                        <div key={p.productId}>
                          {p.name} · {p.barcode} → {p.mxik}
                        </div>
                      ))}
                    </List>
                  </>
                )}
                {repair.tasnifUnreachable > 0 && (
                  <Line $tone="warn">
                    <AlertTriangle size={16} />
                    {t("fiscalSettings.backlog.tasnifUnreachable", {
                      count: repair.tasnifUnreachable,
                    })}
                  </Line>
                )}
                {repair.productIssues.length > 0 && (
                  <>
                    <Line $tone="warn">
                      <AlertTriangle size={16} />
                      {t("fiscalSettings.backlog.productIssues", {
                        count: repair.productIssues.length,
                      })}
                    </Line>
                    <List>
                      {repair.productIssues.map((p) => (
                        <div key={p.productId}>
                          {p.name} · {p.barcode} —{" "}
                          {t(`fiscalSettings.backlog.problem.${p.problem}`)}
                        </div>
                      ))}
                    </List>
                  </>
                )}
              </>
            )}
          </>
        )}

        {step === "verify" && verify && (
          <>
            {errorLine(verify)}
            {verify.stoppedAt && (
              <Muted>
                {t("fiscalSettings.backlog.stoppedAt", { receipt: verify.stoppedAt.receipt })}
                {verify.stoppedAt.label ? ` · ${verify.stoppedAt.label}` : ""}
              </Muted>
            )}
            {verify.ok && (
              <Line $tone="ok">
                <CheckCircle size={16} />
                {t("fiscalSettings.backlog.verifyDone", {
                  checked: verify.checked,
                  substituted: verify.changes.filter((c) => c.action === "substitute").length,
                  omitted: verify.changes.filter((c) => c.action === "omit").length,
                  disabled: verify.disabled,
                })}
              </Line>
            )}
            {(verify.unknownStatus?.length ?? 0) > 0 && (
              <>
                <Line $tone="warn">
                  <AlertTriangle size={16} />
                  {t("fiscalSettings.backlog.unknownStatusSent", {
                    count: verify.unknownStatus?.length ?? 0,
                  })}
                </Line>
                <List>
                  {verify.unknownStatus?.map((u, i) => (
                    <div key={`unknown-${u.receipt}-${i}`}>
                      #{u.receipt}
                      {u.productName ? ` · ${u.productName}` : ""} — {u.status}
                    </div>
                  ))}
                </List>
              </>
            )}
            {verify.changes.length > 0 && (
              <List>
                {verify.changes.map((c, i) => (
                  <div key={`${c.receipt}-${i}`}>
                    #{c.receipt}
                    {c.productName ? ` · ${c.productName}` : ""} —{" "}
                    {t(`fiscalSettings.backlog.action.${c.action}`)} (
                    {c.reason === "NO_LABEL"
                      ? t("fiscalSettings.backlog.noLabel")
                      : translateMarkingStatus(c.reason, t)}
                    )
                  </div>
                ))}
              </List>
            )}
          </>
        )}

        {step === "group" && group && (
          <>
            {errorLine(group)}
            {group.ok && (
              <>
                <Line $tone="ok">
                  <CheckCircle size={16} />
                  {t("fiscalSettings.backlog.groupDone")}
                </Line>
                <List>
                  {group.groups.map((g) => (
                    <div key={g.tender}>
                      {t("fiscalSettings.backlog.groupLine", {
                        tender: t(`fiscalSettings.backlog.tender.${g.tender}`),
                        receipts: g.receipts,
                        amount: money(g.amount),
                        batches: g.batches,
                        singles: g.singles,
                      })}
                    </div>
                  ))}
                </List>
                {group.sums && sumsLine(group.sums)}
              </>
            )}
          </>
        )}

        {step === "fiscalize" && fiscalize && (
          <>
            {errorLine(fiscalize)}
            <Line $tone={fiscalize.failed.length ? "warn" : "ok"}>
              {fiscalize.failed.length ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
              {t("fiscalSettings.backlog.fiscalizeDone", {
                fiscalized: fiscalize.fiscalized,
                failed: fiscalize.failed.length,
              })}
            </Line>
            {(fiscalize.batches ?? 0) > 0 && (
              <Muted>{t("fiscalSettings.backlog.batchesSent", { count: fiscalize.batches })}</Muted>
            )}
            {fiscalize.sums && sumsLine(fiscalize.sums)}
            {fiscalize.stopped && (
              <Line $tone="warn">
                <AlertTriangle size={16} />
                {t("fiscalSettings.backlog.stoppedLeft", { remaining: fiscalize.remaining ?? 0 })}
              </Line>
            )}
            {fiscalize.failed.length > 0 && (
              <List>
                {fiscalize.failed.map((f) => (
                  <div key={f.receipt}>
                    #{f.receipt} —{" "}
                    {f.error === "NOT_FISCALIZED"
                      ? t("fiscalSettings.backlog.notFiscalized")
                      : f.error}
                  </div>
                ))}
              </List>
            )}
          </>
        )}

        <Row>
          {!finished && (
            <Button variant="secondary" onClick={() => void run(step)} disabled={blocked}>
              {running ? (
                <>
                  <Spin size={14} /> {t("fiscalSettings.backlog.running")}
                </>
              ) : (
                t(`fiscalSettings.backlog.run.${step}`)
              )}
            </Button>
          )}
          {!finished && (
            <Button variant="primary" onClick={next} disabled={running || !stepDone[step]}>
              {current === steps.length - 1
                ? t("fiscalSettings.backlog.finish")
                : t("fiscalSettings.backlog.next")}
            </Button>
          )}
          {(finished || current > 0) && (
            <Button variant="secondary" onClick={reset} disabled={running}>
              {t("fiscalSettings.backlog.restart")}
            </Button>
          )}
        </Row>
      </Panel>
    </Card>
  );
}
