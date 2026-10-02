import React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { NumberPad } from "../../components/common/NumberPad";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { remainingFor, splitState, type SplitTender } from "@shared/utils/split-payment";

/**
 * The right-hand side of the checkout while a payment is split: the numpad and banknote buttons
 * type into the selected line (the tender tiles on the left are the lines), "remaining" fills it
 * with whatever is still to pay, and the summary says what is paid, short, or due back in change.
 *
 * Example: 100 000 → select cash, type 55 000 → select card, press "remaining" → 45 000.
 */

const DENOMINATIONS = [20000, 50000, 100000, 200000];

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ActiveRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.primary + "0d"};
`;

const ActiveLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const ActiveAmount = styled.span`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const ButtonRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SmallButton = styled.button<{ $accent?: boolean }>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.xs}`};
  border: 1.5px solid
    ${({ theme, $accent }) => ($accent ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme, $accent }) =>
    $accent ? theme.colors.primary + "12" : theme.colors.surface};
  color: ${({ theme, $accent }) => ($accent ? theme.colors.primary : theme.colors.text)};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:active {
    transform: scale(0.96);
  }
`;

const RemainingButton = styled(SmallButton)`
  font-size: 15px;
  padding: ${({ theme }) => theme.spacing.sm};
`;

const Summary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
`;

const SummaryRow = styled.div<{ $tone?: "ok" | "bad" }>`
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  font-weight: ${({ $tone }) => ($tone ? 700 : 500)};
  color: ${({ theme, $tone }) =>
    $tone === "ok"
      ? theme.colors.success
      : $tone === "bad"
        ? theme.colors.error
        : theme.colors.text};
`;

const Problem = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
`;

interface SplitPaymentPanelProps {
  total: number;
  /** Amount per tender as entered (cash may include change). */
  amounts: Record<SplitTender, number>;
  /** Tenders this till offers (Click only with its setting on). */
  methods: SplitTender[];
  active: SplitTender;
  labelOf: (method: SplitTender) => string;
  onChange: (method: SplitTender, amount: number) => void;
}

export function SplitPaymentPanel({
  total,
  amounts,
  methods,
  active,
  labelOf,
  onChange,
}: SplitPaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const formatCurrency = (n: number) => formatCurrencyBase(n, i18n.language as "ru" | "uz");

  const lines = methods.map((method) => ({ method, amount: amounts[method] || 0 }));
  const state = splitState(total, lines);
  const current = amounts[active] || 0;

  // The pad edits the selected line in place: digits append, backspace drops the last one.
  const digits = current > 0 ? String(Math.round(current)) : "";
  const setDigits = (next: string) => onChange(active, next ? Number(next) : 0);

  return (
    <Panel>
      <ActiveRow>
        <ActiveLabel>{labelOf(active)}</ActiveLabel>
        <ActiveAmount>{formatCurrency(current)}</ActiveAmount>
      </ActiveRow>

      <RemainingButton
        type="button"
        $accent
        title={t("pos.splitRemainingHint")}
        onClick={() => onChange(active, remainingFor(total, lines, active))}
      >
        {t("pos.splitRemaining")}: {formatCurrency(remainingFor(total, lines, active))}
      </RemainingButton>

      {active === "cash" && (
        <ButtonRow>
          {DENOMINATIONS.map((d) => (
            <SmallButton key={d} type="button" onClick={() => onChange(active, current + d)}>
              {(d / 1000).toLocaleString()}K
            </SmallButton>
          ))}
        </ButtonRow>
      )}

      <NumberPad
        onDigit={(d) => {
          if (d === ".") return; // so'm, whole numbers at the counter
          if ((d === "0" || d === "00") && digits === "") return;
          setDigits(digits + d);
        }}
        onBackspace={() => setDigits(digits.slice(0, -1))}
        onClear={() => onChange(active, 0)}
        onEnter={() => onChange(active, current)}
      />

      <Summary>
        <SummaryRow>
          <span>{t("pos.totalToPay")}</span>
          <span>{formatCurrency(total)}</span>
        </SummaryRow>
        <SummaryRow>
          <span>{t("pos.splitPaid")}</span>
          <span>{formatCurrency(state.entered)}</span>
        </SummaryRow>
        {state.problem === "short" && (
          <SummaryRow $tone="bad">
            <span>{t("pos.splitShort", { amount: formatCurrency(state.remaining) })}</span>
          </SummaryRow>
        )}
        {state.canPay && state.change > 0 && (
          <SummaryRow $tone="ok">
            <span>{t("pos.splitChange")}</span>
            <span>{formatCurrency(state.change)}</span>
          </SummaryRow>
        )}
        {state.problem === "nonCashOver" && <Problem>{t("pos.splitNonCashOver")}</Problem>}
        {state.problem === "empty" && <Problem>{t("pos.splitEmpty")}</Problem>}
      </Summary>
    </Panel>
  );
}
