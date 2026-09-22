import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, RefreshCw } from "lucide-react";
import {
  stores,
  siteConfig,
  StoreRecord,
  StoreStats,
  type BalanceTransaction,
  type NextCharge,
  type PlanTerminals,
  type StoreTerminal,
  type SubscriptionPlanPrices,
} from "../../api/client";
import { formatPhone } from "@shared/utils/phone";
import {
  DEFAULT_PLAN_TERMINALS,
  DEFAULT_SUBSCRIPTION_RULES,
  TERMINAL_LIMITS,
  terminalAllowance,
  storeSubscriptionFacts,
  subscriptionStatus,
  type SubscriptionRules,
  type SubscriptionState,
} from "@shared/utils/subscription";
import { StoreBreadcrumb } from "./StoreBreadcrumb";

const Page = styled.div`
  padding: 32px;
  max-width: 900px;

  @media (max-width: 600px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;

const Subtitle = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 4px 0 16px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
`;

const HeaderBtn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid
    ${({ $primary, theme }) => ($primary ? theme.colors.primary : theme.colors.border)};
  background: ${({ $primary, theme }) => ($primary ? theme.colors.primary : "transparent")};
  color: ${({ $primary, theme }) => ($primary ? "#fff" : theme.colors.text)};

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Ledger = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 12px;

  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
  th {
    color: ${({ theme }) => theme.colors.textSecondary};
    font-weight: 600;
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;

const LedgerScroll = styled.div`
  overflow-x: auto;
`;

const Amount = styled.span<{ $in: boolean }>`
  color: ${({ $in, theme }) => ($in ? theme.colors.success ?? "#16a34a" : theme.colors.error)};
  font-weight: 600;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 20px 0 10px;
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
`;

const StatCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 12px 16px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const PlanCard = styled.div<{ $pro?: boolean }>`
  border: 2px solid
    ${({ $pro, theme }) => ($pro ? theme.colors.primary : theme.colors.border)};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const PlanRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const PlanLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const PlanBadge = styled.span<{ $pro?: boolean }>`
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  background: ${({ $pro, theme }) =>
    $pro ? theme.colors.primary : theme.colors.border};
  color: ${({ $pro, theme }) => ($pro ? "#fff" : theme.colors.textSecondary)};
`;

const PlanNote = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 12px;
  line-height: 1.5;
`;

const PlanToggleRow = styled.div`
  display: flex;
  gap: 8px;
`;

const PlanBtn = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary : "transparent"};
  color: ${({ $active }) => ($active ? "#fff" : "inherit")};
  &:hover {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const STATE_LOOK: Record<SubscriptionState, { label: string; color: string }> = {
  unlimited: { label: "Unlimited", color: "#6b7280" },
  active: { label: "Active", color: "#16a34a" },
  warning: { label: "Expiring soon", color: "#d97706" },
  grace: { label: "Expired — in grace", color: "#ef4444" },
  blocked: { label: "Blocked", color: "#ef4444" },
};

const StateBadge = styled.span<{ $color: string }>`
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: ${({ $color }) => $color};
`;

const moment = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  margin-top: 8px;
`;

const uzs = (n: number) => `${Math.round(n).toLocaleString("ru-UZ")} so'm`;

const LEDGER_LABEL: Record<BalanceTransaction["type"], string> = {
  TOPUP: "Top-up",
  SUBSCRIPTION: "Subscription",
  AI_SCAN: "AI scan",
  ADJUSTMENT: "Adjustment",
};

/**
 * One store (/admin/stores/:id). Loads it by the id in the URL, so a reload or a shared link opens
 * the same store.
 */
export function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    stores
      .getById(id)
      .then(setStore)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  return (
    <Page>
      <Header>
        <StoreBreadcrumb items={[{ label: store?.name ?? "…" }]} />
        {store && (
          <HeaderActions>
            <HeaderBtn type="button" onClick={load}>
              <RefreshCw size={16} />
              Refresh
            </HeaderBtn>
            <HeaderBtn type="button" $primary onClick={() => navigate(`/admin/stores/${store.id}/edit`)}>
              <Pencil size={16} />
              Edit
            </HeaderBtn>
          </HeaderActions>
        )}
      </Header>
      {store?.address && <Subtitle>{store.address}</Subtitle>}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {!store && !error && (
        <div style={{ display: "flex", gap: 8, color: "#6b7280", fontSize: 14, marginTop: 16 }}>
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
        </div>
      )}
      {store && <StoreDetails store={store} onUpdated={load} />}
    </Page>
  );
}

interface Props {
  store: StoreRecord;
  onUpdated: () => void;
}

function StoreDetails({ store, onUpdated }: Props) {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // AI plan
  const [currentAiPlan, setCurrentAiPlan] = useState(store.aiPlan);
  const [savingAiPlan, setSavingAiPlan] = useState(false);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);

  // Subscription plan
  const [currentSubPlan, setCurrentSubPlan] = useState<string | null>(store.subscriptionPlan);
  const [subExpiresAt, setSubExpiresAt] = useState(
    store.subscriptionExpiresAt ? store.subscriptionExpiresAt.slice(0, 10) : ""
  );
  const [savingSub, setSavingSub] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [rules, setRules] = useState<SubscriptionRules>(DEFAULT_SUBSCRIPTION_RULES);

  useEffect(() => {
    siteConfig
      .getSubscriptionRules()
      .then(setRules)
      .catch(() => {});
  }, []);

  // Terminals: the plan's own (site config) plus the extras bought here, and who holds a slot.
  const [extraTerminals, setExtraTerminals] = useState(store.extraTerminals ?? 0);
  const [planTerminals, setPlanTerminals] = useState<PlanTerminals>(DEFAULT_PLAN_TERMINALS);
  const [prices, setPrices] = useState<SubscriptionPlanPrices | null>(null);
  const [terminalList, setTerminalList] = useState<StoreTerminal[] | null>(null);
  const [savingTerminals, setSavingTerminals] = useState(false);
  const [terminalsError, setTerminalsError] = useState<string | null>(null);

  const loadTerminals = () => {
    stores
      .listTerminals(store.id)
      .then(setTerminalList)
      .catch(() => setTerminalList(null));
  };

  useEffect(() => {
    siteConfig.getPlanTerminals().then(setPlanTerminals).catch(() => {});
    siteConfig.getSubscriptionPlans().then(setPrices).catch(() => {});
  }, []);

  useEffect(() => {
    setExtraTerminals(store.extraTerminals ?? 0);
    loadTerminals();
  }, [store]);

  // Judged on the plan picked above, so choosing a plan previews what it would allow.
  const includedTerminals = currentSubPlan ? terminalAllowance(currentSubPlan, 0, planTerminals) : null;
  const allowedTerminals = currentSubPlan
    ? terminalAllowance(currentSubPlan, extraTerminals, planTerminals)
    : null;
  const planPrice =
    prices && currentSubPlan && currentSubPlan !== "TRIAL"
      ? prices[currentSubPlan.toLowerCase() as "starter" | "pro" | "vip"]
      : 0;
  const extrasPrice = (prices?.extraTerminal ?? 0) * extraTerminals;

  const handleTerminalsSave = async () => {
    setSavingTerminals(true);
    setTerminalsError(null);
    try {
      await stores.update(store.id, { extraTerminals });
      onUpdated();
    } catch (e) {
      setTerminalsError((e as Error).message);
    } finally {
      setSavingTerminals(false);
    }
  };

  const handleFreeSlot = async (terminalId: string) => {
    if (
      !window.confirm(
        `Free ${terminalId}'s slot? The next terminal waiting takes it. If ${terminalId} is still in use, it registers again as the newest.`,
      )
    ) {
      return;
    }
    setTerminalsError(null);
    try {
      await stores.removeTerminal(store.id, terminalId);
      loadTerminals();
      onUpdated();
    } catch (e) {
      setTerminalsError((e as Error).message);
    }
  };

  // Where the saved plan and date stand today — the same rule the server blocks by.
  const subStatus = subscriptionStatus(storeSubscriptionFacts(store), rules);

  // Balance: it pays the subscription and AI scans. The next charge and the ledger come with it.
  const [nextCharge, setNextCharge] = useState<NextCharge | null>(null);
  const [ledger, setLedger] = useState<BalanceTransaction[] | null>(null);
  const [creditNote, setCreditNote] = useState("");
  const loadBilling = () => {
    stores
      .getBilling(store.id)
      .then((b) => {
        setNextCharge(b.nextCharge);
        setLedger(b.transactions);
      })
      .catch(() => setLedger(null));
  };
  useEffect(loadBilling, [store]);

  // Credit top-up
  const [creditAmount, setCreditAmount] = useState("");
  const [addingCredit, setAddingCredit] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);

  const loadStats = () => {
    setLoadingStats(true);
    stores
      .getStats(store.id)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  };

  useEffect(() => {
    setCurrentAiPlan(store.aiPlan);
    setCurrentSubPlan(store.subscriptionPlan);
    setSubExpiresAt(store.subscriptionExpiresAt ? store.subscriptionExpiresAt.slice(0, 10) : "");
    loadStats();
  }, [store]);

  const handleAiPlanChange = async (plan: "free" | "paid") => {
    if (plan === currentAiPlan) return;
    setSavingAiPlan(true);
    setAiPlanError(null);
    try {
      await stores.update(store.id, { aiPlan: plan });
      setCurrentAiPlan(plan);
      onUpdated();
    } catch (e) {
      setAiPlanError((e as Error).message);
    } finally {
      setSavingAiPlan(false);
    }
  };

  const handleSubPlanSave = async () => {
    if (!currentSubPlan) return;
    setSavingSub(true);
    setSubError(null);
    try {
      const expiresAt = currentSubPlan === "VIP"
        ? null
        : subExpiresAt
          ? new Date(subExpiresAt).toISOString()
          : null;
      await stores.update(store.id, {
        subscriptionPlan: currentSubPlan,
        subscriptionExpiresAt: expiresAt,
      });
      onUpdated();
    } catch (e) {
      setSubError((e as Error).message);
    } finally {
      setSavingSub(false);
    }
  };

  const handleAddCredit = async () => {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return;
    setAddingCredit(true);
    setCreditError(null);
    try {
      await stores.addCredits(store.id, amount, creditNote.trim() || undefined);
      setCreditAmount("");
      setCreditNote("");
      loadBilling();
      loadStats();
      onUpdated();
    } catch (e) {
      setCreditError((e as Error).message);
    } finally {
      setAddingCredit(false);
    }
  };

  const revenue = stats?.stats.totalRevenue ?? 0;
  const balance = nextCharge?.balanceUzs ?? ledger?.[0]?.balanceAfter ?? stats?.store.balance ?? 0;

  return (
    <>

        {/* Stats */}
        <SectionTitle>Statistics</SectionTitle>
        {loadingStats ? (
          <div
            style={{ display: "flex", gap: 8, color: "#6b7280", fontSize: 14 }}
          >
            <RefreshCw
              size={14}
              style={{ animation: "spin 1s linear infinite" }}
            />{" "}
            Loading…
          </div>
        ) : (
          <StatGrid>
            <StatCard>
              <StatLabel>Total Sales</StatLabel>
              <StatValue>
                {stats?.stats.totalSales?.toLocaleString() ?? "—"}
              </StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Revenue (UZS)</StatLabel>
              <StatValue>
                {revenue
                  ? revenue.toLocaleString("ru-UZ", {
                      maximumFractionDigits: 0,
                    })
                  : "—"}
              </StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Products</StatLabel>
              <StatValue>{stats?.stats.productsCount ?? "—"}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Users</StatLabel>
              <StatValue>{stats?.stats.usersCount ?? "—"}</StatValue>
            </StatCard>
          </StatGrid>
        )}

        {/* Terminal mode — edited in the store form, shown here for reference */}
        <SectionTitle>Terminal Mode</SectionTitle>
        <PlanCard $pro={store.posAdminLocked}>
          <PlanRow>
            <PlanLabel>Mode</PlanLabel>
            <PlanBadge $pro={store.mode === "ONLINE"}>
              {store.mode === "ONLINE" ? "Online" : "Offline only"}
            </PlanBadge>
          </PlanRow>
          <PlanRow>
            <PlanLabel>Cashier-only POS</PlanLabel>
            <PlanBadge $pro={store.posAdminLocked}>
              {store.posAdminLocked ? "On" : "Off"}
            </PlanBadge>
          </PlanRow>
          <PlanNote>
            {store.mode === "OFFLINE_ONLY"
              ? "This store never syncs. All management stays on the terminal."
              : store.posAdminLocked
                ? "The Electron app is restricted to cashier operation; management happens here. It uploads only sales, shifts, heartbeats and logs."
                : "The Electron app still has full local management and uploads its own product, user, supplier, arrival and settings changes."}
          </PlanNote>
        </PlanCard>

        {/* Subscription Plan */}
        <SectionTitle>Subscription Plan</SectionTitle>
        <PlanCard $pro={!!currentSubPlan}>
          <PlanRow>
            <PlanLabel>Plan</PlanLabel>
            <PlanBadge $pro={!!currentSubPlan}>
              {currentSubPlan ?? "No Plan"}
            </PlanBadge>
          </PlanRow>
          <PlanRow>
            <PlanLabel>Status</PlanLabel>
            <StateBadge $color={STATE_LOOK[subStatus.state].color}>
              {STATE_LOOK[subStatus.state].label}
            </StateBadge>
          </PlanRow>
          {subStatus.warnFrom && (
            <PlanNote>
              Warns from {moment(subStatus.warnFrom)} · blocks on {moment(subStatus.blockAt)}
              {store.subscriptionGraceFrom &&
                " — its grace days count from the day enforcement shipped, since it had already expired then."}
            </PlanNote>
          )}
          {subStatus.state === "blocked" && !subStatus.blockAt && (
            <PlanNote>
              A new store with no plan: blocked on the dashboard and the POS until you set one.
            </PlanNote>
          )}
          <PlanToggleRow style={{ marginBottom: 10 }}>
            {(["TRIAL", "STARTER", "PRO", "VIP"] as const).map((p) => (
              <PlanBtn
                key={p}
                $active={currentSubPlan === p}
                onClick={() => setCurrentSubPlan(p)}
                disabled={savingSub}
              >
                {p}
              </PlanBtn>
            ))}
          </PlanToggleRow>
          {currentSubPlan && currentSubPlan !== "VIP" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Expiry date</div>
              <input
                type="date"
                value={subExpiresAt}
                onChange={(e) => setSubExpiresAt(e.target.value)}
                style={{
                  padding: "7px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 14,
                  background: "transparent",
                  color: "inherit",
                  width: "100%",
                }}
              />
            </div>
          )}
          {currentSubPlan === "VIP" && (
            <PlanNote>VIP is a perpetual license — no expiry date.</PlanNote>
          )}
          <PlanBtn
            $active
            onClick={handleSubPlanSave}
            disabled={savingSub || !currentSubPlan}
            style={{ flex: "none", width: "100%" }}
          >
            {savingSub ? "Saving…" : "Save Subscription"}
          </PlanBtn>
          {subError && <ErrorMsg>{subError}</ErrorMsg>}
        </PlanCard>

        {/* Terminals */}
        <SectionTitle>Terminals</SectionTitle>
        <PlanCard $pro={allowedTerminals === null || extraTerminals > 0}>
          <PlanRow>
            <PlanLabel>Included in {currentSubPlan ?? "plan"}</PlanLabel>
            <PlanBadge>{includedTerminals ?? "Unlimited"}</PlanBadge>
          </PlanRow>
          <PlanRow>
            <PlanLabel>Extra terminals</PlanLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PlanBtn
                type="button"
                style={{ flex: "none", padding: "4px 12px" }}
                disabled={savingTerminals || extraTerminals <= TERMINAL_LIMITS.extra.min}
                onClick={() => setExtraTerminals((n) => Math.max(TERMINAL_LIMITS.extra.min, n - 1))}
              >
                −
              </PlanBtn>
              <strong style={{ minWidth: 24, textAlign: "center" }}>{extraTerminals}</strong>
              <PlanBtn
                type="button"
                style={{ flex: "none", padding: "4px 12px" }}
                disabled={savingTerminals || extraTerminals >= TERMINAL_LIMITS.extra.max}
                onClick={() => setExtraTerminals((n) => Math.min(TERMINAL_LIMITS.extra.max, n + 1))}
              >
                +
              </PlanBtn>
            </div>
          </PlanRow>
          <PlanRow>
            <PlanLabel>Allowed / registered</PlanLabel>
            <PlanBadge
              $pro={allowedTerminals === null || (terminalList?.length ?? 0) <= allowedTerminals}
            >
              {allowedTerminals ?? "∞"} / {terminalList?.length ?? "…"}
            </PlanBadge>
          </PlanRow>
          {prices && (
            <PlanNote>
              {currentSubPlan === "VIP"
                ? `Extras: ${extraTerminals} × ${prices.extraTerminal.toLocaleString("ru-UZ")} = ${extrasPrice.toLocaleString("ru-UZ")} so'm/month`
                : `Monthly: ${planPrice.toLocaleString("ru-UZ")} + ${extraTerminals} × ${prices.extraTerminal.toLocaleString("ru-UZ")} = ${(planPrice + extrasPrice).toLocaleString("ru-UZ")} so'm`}
              {allowedTerminals === null && extraTerminals > 0 && " — this plan is unlimited, so extras change nothing."}
            </PlanNote>
          )}
          {prices && extraTerminals > 0 && prices.extraTerminal <= 0 && (
            <PlanNote style={{ color: "#dc2626" }}>
              No extra-terminal price is set, so these extras are charged 0. Set it on the
              Subscription Plans page.
            </PlanNote>
          )}
          <PlanBtn
            $active
            onClick={handleTerminalsSave}
            disabled={savingTerminals || extraTerminals === (store.extraTerminals ?? 0)}
            style={{ flex: "none", width: "100%", marginBottom: 12 }}
          >
            {savingTerminals ? "Saving…" : "Save Terminals"}
          </PlanBtn>

          {terminalList && terminalList.length === 0 && (
            <PlanNote>No terminal has registered yet — a till registers when it next renews its license.</PlanNote>
          )}
          {terminalList?.map((t, i) => {
            const holds = allowedTerminals === null || i < allowedTerminals;
            return (
              <PlanRow key={t.terminalId}>
                <div>
                  <strong>{t.terminalId}</strong>{" "}
                  <StateBadge $color={holds ? "#16a34a" : "#dc2626"}>
                    {holds ? "Has a slot" : "Waiting"}
                  </StateBadge>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    First seen {moment(t.firstSeenAt)} · last {moment(t.lastSeenAt)}
                  </div>
                </div>
                <PlanBtn
                  type="button"
                  style={{ flex: "none", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => handleFreeSlot(t.terminalId)}
                >
                  Free slot
                </PlanBtn>
              </PlanRow>
            );
          })}
          {terminalsError && <ErrorMsg>{terminalsError}</ErrorMsg>}
        </PlanCard>

        {/* AI Invoice Scanning Plan */}
        <SectionTitle>AI Invoice Scanning</SectionTitle>
        <PlanCard $pro={currentAiPlan === "paid"}>
          <PlanRow>
            <PlanLabel>AI Scan Tier</PlanLabel>
            <PlanBadge $pro={currentAiPlan === "paid"}>
              {currentAiPlan === "paid" ? "Pro" : "Free"}
            </PlanBadge>
          </PlanRow>

          {currentAiPlan === "free" ? (
            <PlanNote>
              Free tier uses PaddleOCR (open-source, $0/scan). Limited accuracy
              on complex Uzbekistan invoices. Upgrade to Pro for Claude Vision.
            </PlanNote>
          ) : (
            <PlanNote>
              Pro tier uses Claude Vision AI. Billed at{" "}
              <strong>$0.052 / scan</strong> (Anthropic cost + 30% margin).
              Accurate parsing of SoliqServis e-invoices with MXIK codes.
            </PlanNote>
          )}

          <PlanToggleRow>
            <PlanBtn
              $active={currentAiPlan === "free"}
              onClick={() => handleAiPlanChange("free")}
              disabled={savingAiPlan}
            >
              Free (PaddleOCR)
            </PlanBtn>
            <PlanBtn
              $active={currentAiPlan === "paid"}
              onClick={() => handleAiPlanChange("paid")}
              disabled={savingAiPlan}
            >
              Pro (Claude Vision)
            </PlanBtn>
          </PlanToggleRow>

          {aiPlanError && <ErrorMsg>{aiPlanError}</ErrorMsg>}
        </PlanCard>

        {/* Balance — pays the subscription and paid AI scans */}
        <SectionTitle>Balance</SectionTitle>
        <PlanCard $pro={balance >= 0}>
          <PlanRow>
            <PlanLabel>Current balance</PlanLabel>
            <StateBadge $color={balance < 0 ? "#dc2626" : balance > 0 ? "#16a34a" : "#6b7280"}>
              {uzs(balance)}
            </StateBadge>
          </PlanRow>
          {nextCharge ? (
            <>
              <PlanRow>
                <PlanLabel>Next charge</PlanLabel>
                <strong>
                  {uzs(nextCharge.amountUzs)} · {moment(nextCharge.at)}
                </strong>
              </PlanRow>
              {nextCharge.owedUzs > 0 && (
                <PlanNote style={{ color: "#dc2626" }}>
                  The last charge left the balance negative: {uzs(nextCharge.owedUzs)} is owed.
                  The month renews as soon as a top-up covers it; until then the grace days run,
                  then the store is blocked.
                </PlanNote>
              )}
            </>
          ) : (
            <PlanNote>
              {currentSubPlan === "VIP"
                ? "VIP is not billed monthly."
                : currentSubPlan === "TRIAL"
                  ? "TRIAL is free; it simply runs out."
                  : "Not billed: give the store a STARTER or PRO plan with an expiry date."}
            </PlanNote>
          )}
          <PlanNote style={{ marginBottom: 12 }}>
            The subscription is charged from here on its expiry date — into the negative if need
            be — and paid AI scans too. When a client transfers payment (card, cash, etc.), enter
            the amount in UZS.
          </PlanNote>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Amount in UZS (so'm)"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCredit()}
              style={{
                flex: 1,
                padding: "8px 10px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                background: "transparent",
                color: "inherit",
              }}
            />
            <PlanBtn
              $active
              onClick={handleAddCredit}
              disabled={addingCredit || !creditAmount || parseFloat(creditAmount) <= 0}
              style={{ flex: "0 0 auto", padding: "8px 16px" }}
            >
              {addingCredit ? "Adding…" : "Add Credit"}
            </PlanBtn>
          </div>
          <input
            type="text"
            maxLength={200}
            placeholder="Note (optional) — e.g. Click payment #1234"
            value={creditNote}
            onChange={(e) => setCreditNote(e.target.value)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              background: "transparent",
              color: "inherit",
              boxSizing: "border-box",
            }}
          />
          {creditError && <ErrorMsg style={{ marginTop: 6 }}>{creditError}</ErrorMsg>}

          {ledger && ledger.length > 0 && (
            <LedgerScroll>
              <Ledger>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th className="num">Amount</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td>{moment(row.createdAt)}</td>
                      <td>
                        {LEDGER_LABEL[row.type] ?? row.type}
                        {row.type === "SUBSCRIPTION" && row.periodStart && (
                          <> — from {new Date(row.periodStart).toLocaleDateString()}</>
                        )}
                        {row.note && (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{row.note}</div>
                        )}
                      </td>
                      <td className="num">
                        <Amount $in={row.amount >= 0}>
                          {row.amount >= 0 ? "+" : "−"}
                          {uzs(Math.abs(row.amount))}
                        </Amount>
                      </td>
                      <td className="num">{uzs(row.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </Ledger>
            </LedgerScroll>
          )}
          {ledger && ledger.length === 0 && (
            <PlanNote style={{ marginTop: 12 }}>No balance movements yet.</PlanNote>
          )}
        </PlanCard>

        {/* Info */}
        <SectionTitle>Store Info</SectionTitle>
        <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.8 }}>
          <div>
            <strong>ID:</strong> {store.id}
          </div>
          <div>
            <strong>Phone:</strong> {store.phone ? formatPhone(store.phone) : "—"}
          </div>
          <div>
            <strong>Status:</strong> {store.active ? "Active" : "Inactive"}
          </div>
          <div>
            <strong>Created:</strong>{" "}
            {new Date(store.createdAt).toLocaleDateString()}
          </div>
        </div>
    </>
  );
}
