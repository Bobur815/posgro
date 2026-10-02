import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Table } from "@components/common/Table";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { DateInput } from "@components/common/DateInput";
import { ConfirmDialog } from "@components/common/ConfirmDialog";
import { useToast } from "@context/ToastContext";
import { formatCurrency } from "@shared/utils";
import { formatDateTime } from "../../utils/formatters";
import { uztStartOf, uztTodayString } from "../../utils/uzt-date";
import { reconciliation, type BankDeposit, type BankTurnover } from "../../api/client";

/**
 * Bank turnover on the Reconciliation page: card + UzQR + fiscalised cash, and the fiscalised cash
 * the owner still has to take to the bank.
 *
 * Fiscalised cash is money the tax office has on record as received, so it is expected at the
 * bank. Each trip to the bank is recorded here and subtracted; a mistaken entry is voided — kept,
 * struck through — never deleted.
 *
 * Hidden entirely when the server says the feature is off (BANK_TURNOVER_ENABLED), or when the
 * request fails — a dashboard served by a terminal on the shop's LAN has no such endpoint.
 *
 * Fetched once per period, and only then. It used to refetch whenever `toast` changed identity,
 * which it does on every toast shown; a failure showed a toast, which refetched, which failed — a
 * loop of 200+ requests a minute that got the owner's IP banned by fail2ban. The axios interceptor
 * strips `response` from errors, so the old "is it a 404?" check never matched.
 */

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.div<{ $accent?: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid
    ${({ theme, $accent }) => ($accent ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
`;

const CardLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const CardValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.text};
`;

const CardNote = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const Banner = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.warning}10;
  border: 1px solid ${({ theme }) => theme.colors.warning}50;
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;

const Form = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Field = styled.div<{ $grow?: boolean }>`
  flex: ${({ $grow }) => ($grow ? "1 1 220px" : "0 1 180px")};
  min-width: 0;
`;

const Struck = styled.span<{ $voided: boolean }>`
  text-decoration: ${({ $voided }) => ($voided ? "line-through" : "none")};
  opacity: ${({ $voided }) => ($voided ? 0.6 : 1)};
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.error};
    background: ${({ theme }) => theme.colors.error}12;
  }
`;

const money = (value: string | number) => formatCurrency(Number(value));

interface Props {
  /** The page's period as real instants (see BankTurnoverPage). Null before the first load. */
  range: { from: string; to: string } | null;
  /** Shown instead of the figures when the feature is off or the server has no such endpoint. */
  whenUnavailable?: React.ReactNode;
}

export function BankTurnoverSection({ range, whenUnavailable }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [data, setData] = useState<BankTurnover | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(uztTodayString());
  const [note, setNote] = useState("");
  const [startDay, setStartDay] = useState(uztTodayString());
  const [busy, setBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState<BankDeposit | null>(null);

  /** One fetch for the current period. Refetches after a write; never retries on its own. */
  const load = useCallback(async () => {
    if (!range) return;
    try {
      const res = await reconciliation.bank(range);
      setData(res.enabled ? res : null);
      setUnavailable(!res.enabled);
    } catch {
      // No such endpoint here (terminal-served dashboard, older server) or it failed.
      setData(null);
      setUnavailable(true);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return unavailable ? <>{whenUnavailable ?? null}</> : null;

  const addDeposit = async () => {
    const value = amount.replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      toast.error(t("reconciliation.bank.amountRequired", "Укажите сумму"));
      return;
    }
    setBusy(true);
    try {
      await reconciliation.addDeposit({
        amount: value,
        depositedAt: uztStartOf(day).toISOString(),
        note: note.trim() || undefined,
      });
      setAmount("");
      setNote("");
      toast.success(t("reconciliation.bank.depositSaved", "Сдача в банк записана"));
      await load();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const voidDeposit = async (deposit: BankDeposit) => {
    setConfirmVoid(null);
    setBusy(true);
    try {
      await reconciliation.voidDeposit(deposit.id);
      await load();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const saveStartDate = async () => {
    setBusy(true);
    try {
      await reconciliation.setBankStartDate(uztStartOf(startDay).toISOString());
      await load();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Cards>
        <Card>
          <CardLabel>{t("reconciliation.bank.card", "Карта")}</CardLabel>
          <CardValue>{money(data.card)}</CardValue>
          <CardNote>
            {t("reconciliation.bank.cardNote", "На кассе и оплаты долгов картой")}
          </CardNote>
        </Card>
        <Card>
          <CardLabel>{t("reconciliation.bank.uzqr", "UzQR")}</CardLabel>
          <CardValue>{money(data.uzqr)}</CardValue>
        </Card>
        <Card>
          <CardLabel>{t("reconciliation.bank.fiscalCash", "Фискализированные наличные")}</CardLabel>
          <CardValue>{money(data.fiscalCash)}</CardValue>
        </Card>
        <Card>
          <CardLabel>{t("reconciliation.bank.fiscalClick", "Фискализированный Click")}</CardLabel>
          <CardValue>{money(data.fiscalClick ?? "0")}</CardValue>
          <CardNote>
            {t("reconciliation.bank.fiscalClickNote", "В чеке как наличные")}
          </CardNote>
        </Card>
        <Card $accent>
          <CardLabel>{t("reconciliation.bank.turnover", "Оборот по банку")}</CardLabel>
          <CardValue>{money(data.bankTurnover)}</CardValue>
          <CardNote>
            {t("reconciliation.bank.turnoverNote", "Карта + UzQR + фискализированные наличные и Click")}
          </CardNote>
        </Card>
        <Card>
          <CardLabel>
            {t("reconciliation.bank.depositedInPeriod", "Сдано в банк за период")}
          </CardLabel>
          <CardValue>{money(data.deposited)}</CardValue>
        </Card>
      </Cards>

      {data.unreported.count > 0 && (
        <Banner>
          <AlertTriangle size={18} />
          <span>
            {t("reconciliation.bank.unreported", {
              defaultValue:
                "{{count}} чеков наличными на {{amount}} без данных о фискализации (старая версия кассы или ещё не синхронизированы) — они не входят в фискализированные наличные.",
              count: data.unreported.count,
              amount: money(data.unreported.amount),
            })}
          </span>
        </Banner>
      )}

      {data.running ? (
        <Cards>
          <Card $accent>
            <CardLabel>{t("reconciliation.bank.toDeposit", "Осталось сдать в банк")}</CardLabel>
            <CardValue>{money(data.running.toDeposit)}</CardValue>
            <CardNote>
              {t("reconciliation.bank.toDepositNote", {
                defaultValue:
                  "С {{date}}: фискализировано {{cash}} наличными и {{click}} Click, сдано {{deposited}}",
                date: formatDateTime(data.running.startDate),
                cash: money(data.running.fiscalCash),
                click: money(data.running.fiscalClick ?? "0"),
                deposited: money(data.running.deposited),
              })}
            </CardNote>
          </Card>
        </Cards>
      ) : (
        <Banner>
          <AlertTriangle size={18} />
          <span>
            {t(
              "reconciliation.bank.noStartDate",
              "Укажите, с какой даты считать наличные, которые нужно сдать в банк.",
            )}
          </span>
          <DateInput value={startDay} onChange={setStartDay} />
          <Button type="button" onClick={saveStartDate} disabled={busy}>
            {t("common.save", "Сохранить")}
          </Button>
        </Banner>
      )}

      <Form>
        <Field>
          <Input
            label={t("reconciliation.bank.amount", "Сумма, сум")}
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ""))}
          />
        </Field>
        <Field>
          <DateInput label={t("reconciliation.bank.date", "Дата")} value={day} onChange={setDay} />
        </Field>
        <Field $grow>
          <Input
            label={t("reconciliation.bank.note", "Комментарий (необязательно)")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Button type="button" onClick={addDeposit} disabled={busy}>
          {t("reconciliation.bank.addDeposit", "Записать сдачу в банк")}
        </Button>
      </Form>

      {data.deposits.length > 0 && (
        <Table
          data={data.deposits}
          columns={[
            {
              key: "depositedAt",
              header: t("reconciliation.bank.date", "Дата"),
              render: (d: BankDeposit) => (
                <Struck $voided={Boolean(d.voidedAt)}>{formatDateTime(d.depositedAt)}</Struck>
              ),
            },
            {
              key: "amount",
              header: t("reconciliation.amount", "Сумма"),
              render: (d: BankDeposit) => (
                <Struck $voided={Boolean(d.voidedAt)}>{money(d.amount)}</Struck>
              ),
            },
            {
              key: "note",
              header: t("reconciliation.bank.note", "Комментарий (необязательно)"),
              render: (d: BankDeposit) => (
                <Struck $voided={Boolean(d.voidedAt)}>
                  {d.voidedAt ? `${t("reconciliation.bank.voided", "отменено")} · ` : ""}
                  {d.note ?? ""}
                </Struck>
              ),
            },
            {
              key: "actions",
              header: "",
              render: (d: BankDeposit) =>
                d.voidedAt ? null : (
                  <IconButton
                    type="button"
                    title={t("reconciliation.bank.void", "Отменить запись")}
                    aria-label={t("reconciliation.bank.void", "Отменить запись")}
                    onClick={() => setConfirmVoid(d)}
                    disabled={busy}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                ),
            },
          ]}
        />
      )}

      {confirmVoid && (
        <ConfirmDialog
          title={t("reconciliation.bank.void", "Отменить запись")}
          message={t("reconciliation.bank.voidConfirm", {
            defaultValue:
              "Сдача {{amount}} останется в списке зачёркнутой и перестанет вычитаться из наличных к сдаче.",
            amount: money(confirmVoid.amount),
          })}
          variant="danger"
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => voidDeposit(confirmVoid)}
          onCancel={() => setConfirmVoid(null)}
        />
      )}
    </>
  );
}
