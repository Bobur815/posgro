import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Printer,
  X,
  Check,
  Eye,
} from "lucide-react";
import { useSmena } from "../../hooks/useSmena";
import type { Smena, SmenaStats, SmenaMovement } from "../../hooks/useSmena";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { VirtualKeyboard } from "../../components/common/VirtualKeyboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Russian ──────────────────────────────────────────────────────────────────
const RU_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const RU_TENS     = ['', 'десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const RU_TEENS    = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const RU_ONES_M   = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_ONES_F   = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];

function chunkRu(num: number, fem: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rest = num % 100;
  if (h) parts.push(RU_HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    parts.push(RU_TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(RU_TENS[t]);
    if (o) parts.push(fem ? RU_ONES_F[o] : RU_ONES_M[o]);
  }
  return parts.join(' ');
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const last2 = n % 100;
  const last  = n % 10;
  if (last2 >= 11 && last2 <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function numberToWordsRu(n: number): string {
  if (!n || n <= 0) return '';
  n = Math.round(n);
  const parts: string[] = [];
  const billions  = Math.floor(n / 1_000_000_000);
  const millions  = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (billions)  { parts.push(chunkRu(billions,  false)); parts.push(pluralRu(billions,  'миллиард',  'миллиарда',  'миллиардов')); }
  if (millions)  { parts.push(chunkRu(millions,  false)); parts.push(pluralRu(millions,  'миллион',   'миллиона',   'миллионов'));  }
  if (thousands) { parts.push(chunkRu(thousands, true));  parts.push(pluralRu(thousands, 'тысяча',    'тысячи',     'тысяч'));      }
  if (remainder || !parts.length) parts.push(chunkRu(remainder, false));
  return parts.filter(Boolean).join(' ');
}

// ── Uzbek ─────────────────────────────────────────────────────────────────────
const UZ_ONES  = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS  = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
const UZ_TEENS = ["o'n", "o'n bir", "o'n ikki", "o'n uch", "o'n to'rt", "o'n besh", "o'n olti", "o'n yetti", "o'n sakkiz", "o'n to'qqiz"];

function chunkUz(num: number): string {
  if (!num) return '';
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rest = num % 100;
  if (h === 1) parts.push('yuz');
  else if (h > 1) parts.push(`${UZ_ONES[h]} yuz`);
  if (rest >= 10 && rest <= 19) {
    parts.push(UZ_TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(UZ_TENS[t]);
    if (o) parts.push(UZ_ONES[o]);
  }
  return parts.join(' ');
}

function numberToWordsUz(n: number): string {
  if (!n || n <= 0) return '';
  n = Math.round(n);
  const parts: string[] = [];
  const billions  = Math.floor(n / 1_000_000_000);
  const millions  = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (billions)  { parts.push(chunkUz(billions));  parts.push('milliard'); }
  if (millions)  { parts.push(chunkUz(millions));  parts.push('million');  }
  if (thousands === 1) { parts.push('ming'); }
  else if (thousands > 1) { parts.push(chunkUz(thousands)); parts.push('ming'); }
  if (remainder || !parts.length) parts.push(chunkUz(remainder));
  return parts.filter(Boolean).join(' ');
}

// ── Shared hint ───────────────────────────────────────────────────────────────
function amountHint(raw: string, lang: string): string {
  const n = parseFloat(raw.replace(/\s/g, '')) || 0;
  if (!n) return '';
  const words = lang === 'uz' ? numberToWordsUz(n) : numberToWordsRu(n);
  return `${n.toLocaleString('ru-RU')} so'm${words ? ` — ${words}` : ''}`;
}

// ─── Styled ────────────────────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding-left: 4px;
`;

const TabRow = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 24px;
  background: none;
  border: none;
  border-bottom: 2px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary : "transparent")};
  margin-bottom: -2px;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  cursor: pointer;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div<{ $accent?: string }>`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid
    ${({ $accent, theme }) => $accent || theme.colors.primary};
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-top: 4px;
`;

const StatSub = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const SectionTitle = styled.h3`
  margin: ${({ theme }) => theme.spacing.lg} 0
    ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const MovementsRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-start;
`;

const MovementForm = styled.form`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: flex-end;
  flex: 1;
`;

const MovementInput = styled.input`
  flex: 1;
  padding: 8px 12px;
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

const MovementList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
`;

const MovementItem = styled.div<{ $type: string }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ $type, theme }) =>
    $type === "PAY_IN"
      ? theme.colors.success + "18"
      : theme.colors.error + "18"};
  font-size: 13px;
`;

const MovementAmount = styled.span<{ $type: string }>`
  font-weight: 600;
  color: ${({ $type, theme }) =>
    $type === "PAY_IN" ? theme.colors.success : theme.colors.error};
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const OpenCard = styled.div`
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const NumberInput = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
  font-weight: 600;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const AmountHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
  min-height: 16px;
  margin-top: 2px;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.sm} 0;
`;

const CloseCalc = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: ${({ theme }) => theme.spacing.md} 0;
`;

const CloseRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

const DiffRow = styled.div<{ $positive: boolean }>`
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 700;
  color: ${({ $positive, theme }) =>
    $positive ? theme.colors.success : theme.colors.error};
`;

// ─── Receipt-detail modal ──────────────────────────────────────────────────────

const Receipt = styled.div`
  font-family: "Courier New", Courier, monospace;
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 20px 24px;
  max-width: 380px;
  margin: 0 auto;
`;

const ReceiptCenter = styled.div`
  text-align: center;
  margin-bottom: 4px;
`;

const ReceiptTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text};
`;

const ReceiptSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const ReceiptDash = styled.div`
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  margin: 10px 0;
`;

const ReceiptRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  line-height: 1.9;
  color: ${({ theme }) => theme.colors.text};
`;

const ReceiptLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ReceiptBold = styled(ReceiptRow)`
  font-weight: 700;
  font-size: 14px;
`;

const ReceiptMovItem = styled.div<{ $type: string }>`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  line-height: 1.7;
  color: ${({ $type, theme }) =>
    $type === "PAY_IN" ? theme.colors.success : theme.colors.error};
`;

const ReceiptFooter = styled.div`
  text-align: center;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
  letter-spacing: 1px;
`;

// History table
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Td = styled.td`
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
`;

const StatusBadge = styled.span<{ $open: boolean }>`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $open, theme }) =>
    $open ? theme.colors.success + "30" : theme.colors.textSecondary + "20"};
  color: ${({ $open, theme }) =>
    $open ? theme.colors.success : theme.colors.textSecondary};
`;

const ErrorMsg = styled.div`
  background: ${({ theme }) => theme.colors.error + "18"};
  color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  font-size: 13px;
`;

// ─── Component ─────────────────────────────────────────────────────────────────

type ActiveField =
  | "initialCash"
  | "payInAmount"
  | "payInNote"
  | "payOutAmount"
  | "payOutNote"
  | "finalCash";
const KEYBOARD_HEIGHT = 360;

export function SmenaPage({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const {
    currentSmena,
    history,
    isLoading,
    error,
    loadCurrent,
    openSmena,
    closeSmena,
    addMovement,
    loadHistory,
    printXReport,
    printZReport,
  } = useSmena();

  const [tab, setTab] = useState<"current" | "history">("current");
  const [initialCash, setInitialCash] = useState("");
  const [payInAmount, setPayInAmount] = useState("");
  const [payInNote, setPayInNote] = useState("");
  const [payOutAmount, setPayOutAmount] = useState("");
  const [payOutNote, setPayOutNote] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [finalCash, setFinalCash] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewSmena, setViewSmena] = useState<
    (Smena & { stats?: SmenaStats; movements?: SmenaMovement[] }) | null
  >(null);

  const [activeField, setActiveField] = useState<ActiveField | null>(null);

  const fieldValues: Record<ActiveField, string> = {
    initialCash,
    payInAmount,
    payInNote,
    payOutAmount,
    payOutNote,
    finalCash,
  };
  const fieldSetters: Record<
    ActiveField,
    React.Dispatch<React.SetStateAction<string>>
  > = {
    initialCash: setInitialCash,
    payInAmount: setPayInAmount,
    payInNote: setPayInNote,
    payOutAmount: setPayOutAmount,
    payOutNote: setPayOutNote,
    finalCash: setFinalCash,
  };

  function handleVirtualKey(key: string) {
    if (!activeField) return;
    const current = fieldValues[activeField];
    const set = fieldSetters[activeField];
    if (key === "BACKSPACE") set(current.slice(0, -1));
    else if (key === "ENTER") setActiveField(null);
    else set(current + key);
  }

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    if (!activeField) return;
    const timer = setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [activeField]);

  const smena = currentSmena;
  const stats: SmenaStats | undefined = smena?.stats;
  const movements: SmenaMovement[] = smena?.movements ?? [];

  const expectedCash =
    smena && stats
      ? Number(smena.initialCash) +
        stats.cashSalesAmount +
        stats.payInTotal -
        stats.payOutTotal -
        stats.returnAmount
      : 0;

  const finalCashNum = parseFloat(finalCash.replace(/\s/g, "")) || 0;
  const diff = finalCashNum - expectedCash;

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const val = parseFloat(initialCash.replace(/\s/g, "")) || 0;
    try {
      await openSmena(val);
      setInitialCash("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePayIn(e: React.FormEvent) {
    e.preventDefault();
    if (!smena) return;
    setLocalError(null);
    const val = parseFloat(payInAmount.replace(/\s/g, "")) || 0;
    if (!val) return;
    try {
      await addMovement(smena.id, "PAY_IN", val, payInNote || undefined);
      setPayInAmount("");
      setPayInNote("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePayOut(e: React.FormEvent) {
    e.preventDefault();
    if (!smena) return;
    setLocalError(null);
    const val = parseFloat(payOutAmount.replace(/\s/g, "")) || 0;
    if (!val) return;
    try {
      await addMovement(smena.id, "PAY_OUT", val, payOutNote || undefined);
      setPayOutAmount("");
      setPayOutNote("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleClose() {
    if (!smena) return;
    setLocalError(null);
    try {
      await closeSmena(smena.id, finalCashNum);
      setShowCloseModal(false);
      setFinalCash("");
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal title={t("smena.title")} onClose={onClose} width="860px">
      <Container>
        <TabRow>
          <Tab $active={tab === "current"} onClick={() => setTab("current")}>
            {t("smena.currentShift")}
          </Tab>
          <Tab $active={tab === "history"} onClick={() => setTab("history")}>
            {t("smena.history")}
          </Tab>
        </TabRow>

        {(error || localError) && <ErrorMsg>{error || localError}</ErrorMsg>}

        {tab === "current" && (
          <>
            {!smena ? (
              <Card>
                <OpenCard>
                  <p style={{ margin: 0, color: "inherit" }}>
                    {t("smena.noOpenSmena")}
                  </p>
                  <form
                    onSubmit={handleOpen}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <Label>
                      {t("smena.initialCash")}
                      <NumberInput
                        type="text"
                        inputMode="numeric"
                        value={initialCash}
                        onChange={(e) => setInitialCash(e.target.value)}
                        onFocus={() => setActiveField("initialCash")}
                        placeholder="0"
                      />
                      <AmountHint>{amountHint(initialCash, i18n.language)}</AmountHint>
                    </Label>
                    <Button type="submit" disabled={isLoading}>
                      {t("smena.openSmena")}
                    </Button>
                  </form>
                </OpenCard>
              </Card>
            ) : (
              <>
                <Card>
                  <InfoGrid>
                    <InfoItem>
                      <InfoLabel>{t("smena.openedAt")}</InfoLabel>
                      <InfoValue>{fmtDate(smena.openedAt)}</InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>{t("smena.cashier")}</InfoLabel>
                      <InfoValue>{smena.cashierName}</InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>{t("smena.terminal")}</InfoLabel>
                      <InfoValue>{smena.terminalId}</InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>{t("smena.zReportNumber")}</InfoLabel>
                      <InfoValue>№{smena.zReportNumber}</InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>{t("smena.initialCash")}</InfoLabel>
                      <InfoValue>{fmt(smena.initialCash)} so'm</InfoValue>
                    </InfoItem>
                  </InfoGrid>

                  {stats && (
                    <StatsGrid>
                      <StatCard $accent="#22c55e">
                        <StatLabel>{t("smena.cashSales")}</StatLabel>
                        <StatValue>{fmt(stats.cashSalesAmount)}</StatValue>
                        <StatSub>
                          {stats.cashSalesCount} {t("smena.receipts")}
                        </StatSub>
                      </StatCard>
                      <StatCard $accent="#3b82f6">
                        <StatLabel>{t("smena.cardSales")}</StatLabel>
                        <StatValue>{fmt(stats.cardSalesAmount)}</StatValue>
                        <StatSub>
                          {stats.cardSalesCount} {t("smena.receipts")}
                        </StatSub>
                      </StatCard>
                      <StatCard $accent="#f59e0b">
                        <StatLabel>{t("smena.returns")}</StatLabel>
                        <StatValue>{fmt(stats.returnAmount)}</StatValue>
                        <StatSub>
                          {stats.returnCount} {t("smena.receipts")}
                        </StatSub>
                      </StatCard>
                      <StatCard $accent="#8b5cf6">
                        <StatLabel>{t("smena.discounts")}</StatLabel>
                        <StatValue>{fmt(stats.totalDiscounts)}</StatValue>
                      </StatCard>
                      <StatCard>
                        <StatLabel>{t("smena.totalRevenue")}</StatLabel>
                        <StatValue>{fmt(stats.totalRevenue)}</StatValue>
                      </StatCard>
                      <StatCard $accent="#06b6d4">
                        <StatLabel>
                          {t("smena.payIn")} / {t("smena.payOut")}
                        </StatLabel>
                        <StatValue>
                          +{fmt(stats.payInTotal)} / -{fmt(stats.payOutTotal)}
                        </StatValue>
                      </StatCard>
                    </StatsGrid>
                  )}
                </Card>

                <Card>
                  <SectionTitle>{t("smena.movements")}</SectionTitle>

                  <MovementsRow>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        <ArrowDownCircle
                          size={16}
                          style={{
                            marginRight: 4,
                            verticalAlign: "middle",
                            color: "#22c55e",
                          }}
                        />
                        {t("smena.payInTitle")}
                      </div>
                      <MovementForm onSubmit={handlePayIn}>
                        <MovementInput
                          type="text"
                          inputMode="numeric"
                          placeholder={t("smena.amount")}
                          value={payInAmount}
                          onChange={(e) => setPayInAmount(e.target.value)}
                          onFocus={() => setActiveField("payInAmount")}
                        />
                        <MovementInput
                          type="text"
                          placeholder={t("smena.note")}
                          value={payInNote}
                          onChange={(e) => setPayInNote(e.target.value)}
                          onFocus={() => setActiveField("payInNote")}
                          style={{ maxWidth: 150 }}
                        />
                        <Button
                          type="submit"
                          size="medium"
                          disabled={isLoading || !payInAmount}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          <Check size={16} /> {t("smena.payIn")}
                        </Button>
                      </MovementForm>
                      <AmountHint>{amountHint(payInAmount, i18n.language)}</AmountHint>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        <ArrowUpCircle
                          size={16}
                          style={{
                            marginRight: 4,
                            verticalAlign: "middle",
                            color: "#ef4444",
                          }}
                        />
                        {t("smena.payOutTitle")}
                      </div>
                      <MovementForm onSubmit={handlePayOut}>
                        <MovementInput
                          type="text"
                          inputMode="numeric"
                          placeholder={t("smena.amount")}
                          value={payOutAmount}
                          onChange={(e) => setPayOutAmount(e.target.value)}
                          onFocus={() => setActiveField("payOutAmount")}
                        />
                        <MovementInput
                          type="text"
                          placeholder={t("smena.note")}
                          value={payOutNote}
                          onChange={(e) => setPayOutNote(e.target.value)}
                          onFocus={() => setActiveField("payOutNote")}
                          style={{ maxWidth: 150 }}
                        />
                        <Button
                          type="submit"
                          size="medium"
                          disabled={isLoading || !payOutAmount}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          <Check size={16} /> {t("smena.payOut")}
                        </Button>
                      </MovementForm>
                      <AmountHint>{amountHint(payOutAmount, i18n.language)}</AmountHint>
                    </div>
                  </MovementsRow>

                  {movements.length > 0 ? (
                    <MovementList style={{ marginTop: 12 }}>
                      {movements.map((m: SmenaMovement) => (
                        <MovementItem key={m.id} $type={m.type}>
                          <span>
                            {fmtDate(m.createdAt)} {m.note ? `— ${m.note}` : ""}
                          </span>
                          <MovementAmount $type={m.type}>
                            {m.type === "PAY_IN" ? "+" : "-"}
                            {fmt(m.amount)}
                          </MovementAmount>
                        </MovementItem>
                      ))}
                    </MovementList>
                  ) : (
                    <p style={{ color: "gray", fontSize: 13, marginTop: 8 }}>
                      {t("smena.noMovements")}
                    </p>
                  )}
                </Card>

                <ActionRow>
                  <Button
                    onClick={() => printXReport(smena.id)}
                    disabled={isLoading}
                  >
                    <Printer size={14} /> {t("smena.printXReport")}
                  </Button>
                  <Button
                    onClick={() => setShowCloseModal(true)}
                    disabled={isLoading}
                    style={{
                      backgroundColor: "#ef4444",
                      borderColor: "#ef4444",
                      color: "#fff",
                    }}
                  >
                    <X size={14} /> {t("smena.closeSmena")}
                  </Button>
                </ActionRow>
              </>
            )}
          </>
        )}

        {tab === "history" && (
          <Card>
            {isLoading ? (
              <p>{t("common.loading", "Loading...")}</p>
            ) : history.length === 0 ? (
              <p style={{ color: "gray", fontSize: 13 }}>
                {t("smena.noHistory")}
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Z#</Th>
                    <Th>{t("smena.openedAt")}</Th>
                    <Th>{t("smena.closedAt")}</Th>
                    <Th>{t("smena.cashier")}</Th>
                    <Th>{t("smena.totalRevenue")}</Th>
                    <Th>{t("smena.status")}</Th>
                    <Th>{t("smena.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {(history as (Smena & { stats?: SmenaStats })[]).map((s) => (
                    <tr key={s.id}>
                      <Td>№{s.zReportNumber}</Td>
                      <Td>{fmtDate(s.openedAt)}</Td>
                      <Td>{s.closedAt ? fmtDate(s.closedAt) : "—"}</Td>
                      <Td>{s.cashierName}</Td>
                      <Td>
                        {s.stats ? fmt(s.stats.totalRevenue) + " so'm" : "—"}
                      </Td>
                      <Td>
                        <StatusBadge $open={s.status === "OPEN"}>
                          {s.status === "OPEN"
                            ? t("smena.statusOpen")
                            : t("smena.statusClosed")}
                        </StatusBadge>
                      </Td>
                      <Td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            variant="primary"
                            size="small"
                            tooltip={t("smena.viewDetails")}
                            onClick={() => setViewSmena(s)}
                          >
                            <Eye size={16} />
                          </Button>

                          <Button
                            onClick={() => printZReport(s.id)}
                            style={{ padding: "4px 10px", fontSize: 12 }}
                          >
                            <Printer size={16} /> {t("smena.printZReport")}
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

        {activeField !== null && <div style={{ height: KEYBOARD_HEIGHT }} />}

        {showCloseModal && smena && (
          <Modal
            onClose={() => setShowCloseModal(false)}
            title={t("smena.confirmClose")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Label>
                {t("smena.finalCash")}
                <NumberInput
                  type="text"
                  inputMode="numeric"
                  value={finalCash}
                  onChange={(e) => setFinalCash(e.target.value)}
                  onFocus={() => setActiveField("finalCash")}
                  placeholder="0"
                  autoFocus
                />
                <AmountHint>{amountHint(finalCash, i18n.language)}</AmountHint>
              </Label>

              <CloseCalc>
                <CloseRow>
                  <span>{t("smena.initialCash")}</span>
                  <span>{fmt(smena.initialCash)} so'm</span>
                </CloseRow>
                {stats && (
                  <>
                    <CloseRow>
                      <span>{t("smena.cashSales")}</span>
                      <span>+{fmt(stats.cashSalesAmount)}</span>
                    </CloseRow>
                    <CloseRow>
                      <span>{t("smena.payIn")}</span>
                      <span>+{fmt(stats.payInTotal)}</span>
                    </CloseRow>
                    <CloseRow>
                      <span>{t("smena.payOut")}</span>
                      <span>-{fmt(stats.payOutTotal)}</span>
                    </CloseRow>
                    <CloseRow>
                      <span>{t("smena.returns")}</span>
                      <span>-{fmt(stats.returnAmount)}</span>
                    </CloseRow>
                  </>
                )}
                <Divider />
                <CloseRow>
                  <span style={{ fontWeight: 600 }}>
                    {t("smena.expectedCash")}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {fmt(expectedCash)} so'm
                  </span>
                </CloseRow>
                {finalCash && (
                  <DiffRow $positive={diff >= 0}>
                    <span>
                      {diff >= 0 ? t("smena.overage") : t("smena.shortage")}
                    </span>
                    <span>
                      {diff >= 0 ? "+" : ""}
                      {fmt(diff)} so'm
                    </span>
                  </DiffRow>
                )}
              </CloseCalc>

              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <Button onClick={() => setShowCloseModal(false)}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  onClick={handleClose}
                  disabled={isLoading}
                  style={{
                    backgroundColor: "#ef4444",
                    borderColor: "#ef4444",
                    color: "#fff",
                  }}
                >
                  {t("smena.closeSmena")}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Container>

      {viewSmena && (
        <Modal
          onClose={() => setViewSmena(null)}
          title={t("smena.viewDetails")}
          width="440px"
        >
          <Receipt>
            <ReceiptCenter>
              <ReceiptTitle>
                {viewSmena.status === "OPEN"
                  ? t("smena.statusOpen")
                  : "Z-" + t("smena.zReportNumber") + viewSmena.zReportNumber}
              </ReceiptTitle>
              <ReceiptSub>
                №{viewSmena.zReportNumber} · {viewSmena.terminalId}
              </ReceiptSub>
            </ReceiptCenter>

            <ReceiptDash />

            <ReceiptRow>
              <ReceiptLabel>{t("smena.cashier")}</ReceiptLabel>
              <span>{viewSmena.cashierName}</span>
            </ReceiptRow>
            <ReceiptRow>
              <ReceiptLabel>{t("smena.openedAt")}</ReceiptLabel>
              <span>{fmtDate(viewSmena.openedAt)}</span>
            </ReceiptRow>
            {viewSmena.closedAt && (
              <ReceiptRow>
                <ReceiptLabel>{t("smena.closedAt")}</ReceiptLabel>
                <span>{fmtDate(viewSmena.closedAt)}</span>
              </ReceiptRow>
            )}

            <ReceiptDash />

            {viewSmena.stats && (
              <>
                <ReceiptRow>
                  <ReceiptLabel>{t("smena.cashSales")}</ReceiptLabel>
                  <span>
                    {viewSmena.stats.cashSalesCount} ×{" "}
                    {fmt(viewSmena.stats.cashSalesAmount)} so'm
                  </span>
                </ReceiptRow>
                <ReceiptRow>
                  <ReceiptLabel>{t("smena.cardSales")}</ReceiptLabel>
                  <span>
                    {viewSmena.stats.cardSalesCount} ×{" "}
                    {fmt(viewSmena.stats.cardSalesAmount)} so'm
                  </span>
                </ReceiptRow>
                {viewSmena.stats.returnCount > 0 && (
                  <ReceiptRow>
                    <ReceiptLabel>{t("smena.returns")}</ReceiptLabel>
                    <span style={{ color: "#ef4444" }}>
                      -{viewSmena.stats.returnCount} ×{" "}
                      {fmt(viewSmena.stats.returnAmount)} so'm
                    </span>
                  </ReceiptRow>
                )}
                {viewSmena.stats.totalDiscounts > 0 && (
                  <ReceiptRow>
                    <ReceiptLabel>{t("smena.discounts")}</ReceiptLabel>
                    <span>-{fmt(viewSmena.stats.totalDiscounts)} so'm</span>
                  </ReceiptRow>
                )}
                <ReceiptDash />
                <ReceiptBold>
                  <ReceiptLabel>{t("smena.totalRevenue")}</ReceiptLabel>
                  <span>{fmt(viewSmena.stats.totalRevenue)} so'm</span>
                </ReceiptBold>

                <ReceiptDash />

                <ReceiptRow>
                  <ReceiptLabel>{t("smena.initialCash")}</ReceiptLabel>
                  <span>{fmt(viewSmena.initialCash)} so'm</span>
                </ReceiptRow>
                {viewSmena.stats.payInTotal > 0 && (
                  <ReceiptRow>
                    <ReceiptLabel>{t("smena.payIn")}</ReceiptLabel>
                    <span style={{ color: "#22c55e" }}>
                      +{fmt(viewSmena.stats.payInTotal)} so'm
                    </span>
                  </ReceiptRow>
                )}
                {viewSmena.stats.payOutTotal > 0 && (
                  <ReceiptRow>
                    <ReceiptLabel>{t("smena.payOut")}</ReceiptLabel>
                    <span style={{ color: "#ef4444" }}>
                      -{fmt(viewSmena.stats.payOutTotal)} so'm
                    </span>
                  </ReceiptRow>
                )}
                {viewSmena.finalCash != null && (
                  <>
                    {(() => {
                      const expected =
                        Number(viewSmena.initialCash) +
                        viewSmena.stats!.cashSalesAmount +
                        viewSmena.stats!.payInTotal -
                        viewSmena.stats!.payOutTotal -
                        viewSmena.stats!.returnAmount;
                      const diff = viewSmena.finalCash! - expected;
                      return (
                        <>
                          <ReceiptRow>
                            <ReceiptLabel>
                              {t("smena.expectedCash")}
                            </ReceiptLabel>
                            <span>{fmt(expected)} so'm</span>
                          </ReceiptRow>
                          <ReceiptRow>
                            <ReceiptLabel>{t("smena.finalCash")}</ReceiptLabel>
                            <span>{fmt(viewSmena.finalCash!)} so'm</span>
                          </ReceiptRow>
                          <ReceiptBold
                            style={{ color: diff >= 0 ? "#22c55e" : "#ef4444" }}
                          >
                            <span>
                              {diff >= 0
                                ? t("smena.overage")
                                : t("smena.shortage")}
                            </span>
                            <span>
                              {diff >= 0 ? "+" : ""}
                              {fmt(diff)} so'm
                            </span>
                          </ReceiptBold>
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            )}

            {viewSmena.movements && viewSmena.movements.length > 0 && (
              <>
                <ReceiptDash />
                <ReceiptSub style={{ marginBottom: 4 }}>
                  {t("smena.movements")}
                </ReceiptSub>
                {viewSmena.movements.map((m) => (
                  <ReceiptMovItem key={m.id} $type={m.type}>
                    <span>
                      {m.type === "PAY_IN" ? "▲" : "▼"} {fmtDate(m.createdAt)}
                      {m.note ? ` — ${m.note}` : ""}
                    </span>
                    <span>
                      {m.type === "PAY_IN" ? "+" : "-"}
                      {fmt(m.amount)}
                    </span>
                  </ReceiptMovItem>
                ))}
              </>
            )}

            <ReceiptDash />
            <ReceiptFooter>
              {viewSmena.status === "CLOSED"
                ? t("smena.closedSuccess").toUpperCase()
                : t("smena.statusOpen").toUpperCase()}
            </ReceiptFooter>
          </Receipt>
        </Modal>
      )}

      {activeField !== null && (
        <VirtualKeyboard
          fixed
          zIndex={1100}
          numbersOnly={
            activeField !== "payInNote" && activeField !== "payOutNote"
          }
          onKeyPress={handleVirtualKey}
          onClose={() => setActiveField(null)}
        />
      )}
    </Modal>
  );
}
