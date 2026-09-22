import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { AlertTriangle, Banknote, ChevronDown, ChevronRight, CreditCard } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { DateInput } from "../../components/common/DateInput";
import { useToast } from "../../context/ToastContext";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import type { DebtLedger, DebtTransaction } from "@shared/types";
import { useAuthStore } from "../../store/auth-store";

/**
 * One debtor: what they owe, how it got there, and taking money off it.
 *
 * The ledger is shown newest-first because the last thing that happened is what a cashier is
 * usually checking. Payments go to the oldest unpaid receipt first regardless of what is on
 * screen — that rule lives in the main process, where it also decides which receipt has just
 * become payable enough to fiscalize.
 */

const Balance = styled.div<{ $owing: boolean }>`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  background: ${({ $owing, theme }) =>
    $owing ? `${theme.colors.error}12` : `${theme.colors.success}12`};
`;

const BalanceLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const BalanceValue = styled.span<{ $owing: boolean }>`
  font-size: 24px;
  font-weight: 800;
  color: ${({ $owing, theme }) => ($owing ? theme.colors.error : theme.colors.success)};
`;

const Drift = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.warning};
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 600;
`;

const PayRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: flex-end;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const AmountField = styled.div`
  flex: 1;
`;

const Tender = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1.5px solid
    ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) =>
    $selected ? `${theme.colors.primary}12` : theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
`;

/**
 * "Fiscalize the receipts?" — asked in place of the payment row rather than in a second modal,
 * for the same reason receipts unfold in place below: this screen is already a dialog.
 */
const FiscalPrompt = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1.5px solid ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => `${theme.colors.primary}12`};
`;

const FiscalQuestion = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const FiscalActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Section = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Ledger = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
`;

const Entry = styled.div<{ $charge: boolean }>`
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ $charge, theme }) =>
    $charge ? `${theme.colors.error}12` : `${theme.colors.success}12`};
`;

/**
 * The ledger row itself, and a button when there is a receipt behind it.
 *
 * Expanding in place rather than opening a second modal: this screen is already a modal, and a
 * dialog stacked on a dialog is a trap on a touch till — the cashier loses track of which Close
 * closes what. Unfolding keeps the ledger on screen as the spine of the thing.
 */
const EntryRow = styled.button<{ $expandable: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  cursor: ${({ $expandable }) => ($expandable ? "pointer" : "default")};
`;

/** What was actually bought on that receipt. */
const Lines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 12px 10px 30px;
`;

const Line = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const LineTotal = styled(Line)`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const Loading = styled.div`
  padding: 6px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EntryWhat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const EntryWhen = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EntryAmount = styled.span<{ $charge: boolean }>`
  font-weight: 700;
  white-space: nowrap;
  color: ${({ $charge, theme }) => ($charge ? theme.colors.error : theme.colors.success)};
`;

const Empty = styled.div`
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/**
 * The slice of a sale this section shows.
 *
 * sales:getById hands back the row with its items; only these fields are read here, and they
 * are widened to string|number because Decimals cross the IPC boundary serialized.
 */
interface SaleDetail {
  id: string;
  receiptNumber: string;
  finalAmount: number | string;
  paidAmount: number | string;
  items: {
    productName: string;
    quantity: number | string;
    unitPrice: number | string;
    subtotal: number | string;
  }[];
}

interface Props {
  debtorId: string;
  onClose: () => void;
}

export function DebtorDetails({ debtorId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [ledger, setLedger] = useState<DebtLedger | null>(null);
  const [amount, setAmount] = useState("");
  const [tender, setTender] = useState<"cash" | "card">("cash");
  const [busy, setBusy] = useState(false);
  /** Which credit sale is unfolded, and the ones already fetched — one request per receipt. */
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);
  const [sales, setSales] = useState<Record<string, SaleDetail>>({});
  const [dueDate, setDueDate] = useState("");
  // A cashier takes payments; changing when a debt is due is an admin's (debtors:update).
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  /** Fiscalization is switched on for this till — the payoff question only means something then. */
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  /** A payment that clears the whole balance, waiting on "fiscalize or not". */
  const [confirmPayoff, setConfirmPayoff] = useState(false);

  const formatCurrency = (value: number) =>
    formatCurrencyBase(value, i18n.language as "ru" | "uz");

  const load = useCallback(async () => {
    try {
      setLedger(await window.electronAPI.debtors.getLedger(debtorId));
    } catch {
      toast.error(t("common.error"));
    }
  }, [debtorId, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    window.electronAPI.fiscal
      .getConfig()
      .then((cfg) => setFiscalEnabled(cfg.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const due = ledger?.debtor.debtDueDate;
    setDueDate(due ? new Date(due).toISOString().slice(0, 10) : "");
  }, [ledger?.debtor.debtDueDate]);

  /**
   * Unfold a charge, fetching its receipt the first time.
   *
   * Lazily rather than with the ledger: most rows are never opened, and a debtor with a hundred
   * charges would otherwise pull a hundred receipts to show one.
   */
  const toggleSale = async (saleId: string | null) => {
    if (!saleId) return;
    if (openSaleId === saleId) {
      setOpenSaleId(null);
      return;
    }
    setOpenSaleId(saleId);
    if (sales[saleId]) return;
    try {
      // Through the debtor's own book: on a satellite a receipt rung up elsewhere is only on the
      // main, and this asks it.
      const sale = (await window.electronAPI.debtors.getSale(debtorId, saleId)) as SaleDetail | null;
      if (sale) setSales((prev) => ({ ...prev, [saleId]: sale }));
    } catch {
      // A receipt that has since been deleted simply stays unopened; the ledger row is the
      // record that matters and it is still right.
      toast.error(t("common.error"));
    }
  };

  const saveDueDate = async (value: string) => {
    setDueDate(value);
    try {
      await window.electronAPI.debtors.update(debtorId, { debtDueDate: value || null });
      await load();
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handlePay = () => {
    const value = Number(amount) || 0;
    if (value <= 0) {
      toast.error(t("debtors.amountRequired", "Укажите сумму"));
      return;
    }

    // Paying the whole debt off closes every receipt still on the tab, so this is where the shop
    // decides whether they get fiscalized. A partial payment keeps the old behaviour: whatever it
    // finishes paying for is fiscalized straight away.
    const paysOff = ledger != null && ledger.balance > 0 && value >= ledger.balance - 0.005;
    // The book's own device decides — on a satellite, its main's.
    if ((ledger?.fiscalEnabled ?? fiscalEnabled) && paysOff) {
      setConfirmPayoff(true);
      return;
    }
    void submitPayment(value, true);
  };

  const submitPayment = async (value: number, fiscalize: boolean) => {
    setConfirmPayoff(false);
    setBusy(true);
    try {
      const { settledSales } = await window.electronAPI.debtors.recordPayment({
        userId: debtorId,
        amount: value,
        paymentMethod: tender,
        fiscalize,
      });
      setAmount("");
      await load();
      toast.success(
        settledSales.length > 0
          ? t("debtors.paymentSettled", {
              defaultValue: "Оплата принята — закрыто чеков: {{count}}",
              count: settledSales.length,
            })
          : t("debtors.paymentTaken", "Оплата принята"),
      );
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const name = ledger
    ? i18n.language === "uz"
      ? ledger.debtor.nameUz
      : ledger.debtor.nameRu
    : "";

  // Written together and never expected to differ; shown side by side when they do, because a
  // silently wrong balance is the one failure a debt ledger must not have.
  const drifted =
    ledger != null && Math.abs(ledger.balance - ledger.ledgerBalance) > 0.01;

  const describe = (txn: DebtTransaction) => {
    if (txn.type === "CHARGE") return t("debtors.entryCharge", "Покупка в долг");
    if (txn.type === "PAYMENT") return t("debtors.entryPayment", "Оплата");
    return t("debtors.entryAdjustment", "Корректировка");
  };

  return (
    <Modal title={name || t("debtors.title", "Должники")} onClose={onClose} width="600px">
      {ledger && (
        <>
          <Balance $owing={ledger.balance > 0}>
            <BalanceLabel>
              {ledger.balance >= 0
                ? t("debtors.debt", "Долг")
                : t("debtors.prepaidLabel", "Аванс")}
              {ledger.debtor.debtDueDate && (
                <>
                  {" · "}
                  {t("debtors.dueDate", "Срок")}:{" "}
                  {new Date(ledger.debtor.debtDueDate).toLocaleDateString(
                    i18n.language === "uz" ? "uz-UZ" : "ru-RU",
                  )}
                </>
              )}
            </BalanceLabel>
            <BalanceValue $owing={ledger.balance > 0}>
              {formatCurrency(Math.abs(ledger.balance))}
            </BalanceValue>
          </Balance>

          {drifted && (
            <Drift>
              <AlertTriangle size={16} />
              {t("debtors.ledgerDrift", {
                defaultValue: "Баланс расходится с историей: по истории {{amount}}",
                amount: formatCurrency(ledger.ledgerBalance),
              })}
            </Drift>
          )}

          {isAdmin && (
            <DateInput
              label={t("debtors.dueDateOptional", "Срок оплаты (необязательно)")}
              value={dueDate}
              onChange={saveDueDate}
              style={{ marginBottom: 16 }}
            />
          )}

          <Section>{t("debtors.takePayment", "Принять оплату")}</Section>
          {confirmPayoff ? (
            <FiscalPrompt>
              <FiscalQuestion>
                {t("debtors.payoffFiscalizeQuestion", {
                  defaultValue: "Долг будет погашен полностью ({{amount}}). Фискализировать чеки?",
                  amount: formatCurrency(Number(amount) || 0),
                })}
              </FiscalQuestion>
              <FiscalActions>
                <Button variant="secondary" onClick={() => setConfirmPayoff(false)} disabled={busy}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => submitPayment(Number(amount) || 0, false)}
                  disabled={busy}
                >
                  {t("debtors.payoffWithoutFiscal", "Без фискализации")}
                </Button>
                <Button onClick={() => submitPayment(Number(amount) || 0, true)} disabled={busy}>
                  {t("debtors.payoffFiscalize", "Фискализировать")}
                </Button>
              </FiscalActions>
            </FiscalPrompt>
          ) : (
            <PayRow>
              <AmountField>
                <Input
                  value={amount}
                  inputMode="numeric"
                  placeholder={String(Math.max(0, Math.round(ledger.balance)))}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                />
              </AmountField>
              <Tender type="button" $selected={tender === "cash"} onClick={() => setTender("cash")}>
                <Banknote size={16} /> {t("pos.cash")}
              </Tender>
              <Tender type="button" $selected={tender === "card"} onClick={() => setTender("card")}>
                <CreditCard size={16} /> {t("pos.card")}
              </Tender>
              <Button onClick={handlePay} disabled={busy}>
                {t("debtors.acceptPayment", "Принять")}
              </Button>
            </PayRow>
          )}

          <Section>{t("debtors.history", "История")}</Section>
          <Ledger>
            {ledger.transactions.length === 0 ? (
              <Empty>{t("debtors.noHistory", "Пока ничего не было")}</Empty>
            ) : (
              ledger.transactions.map((txn) => {
                const charge = txn.amount > 0;
                // Only a purchase has a receipt to show; a payment is just money.
                const expandable = Boolean(txn.saleId);
                const expanded = expandable && openSaleId === txn.saleId;
                const sale = txn.saleId ? sales[txn.saleId] : undefined;
                return (
                  <Entry key={txn.id} $charge={charge}>
                    <EntryRow
                      type="button"
                      $expandable={expandable}
                      onClick={() => toggleSale(txn.saleId)}
                      title={
                        expandable
                          ? t("debtors.showSaleDetails", "Показать состав чека")
                          : undefined
                      }
                    >
                      <EntryWhat>
                        <span>
                          {expandable &&
                            (expanded ? (
                              <ChevronDown size={13} style={{ verticalAlign: "middle" }} />
                            ) : (
                              <ChevronRight size={13} style={{ verticalAlign: "middle" }} />
                            ))}{" "}
                          {describe(txn)}
                          {sale ? ` · №${sale.receiptNumber}` : ""}
                          {txn.settledAt && ` · ${t("debtors.settled", "закрыт")}`}
                        </span>
                        <EntryWhen>
                          {new Date(txn.createdAt).toLocaleString(
                            i18n.language === "uz" ? "uz-UZ" : "ru-RU",
                            { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
                          )}
                          {txn.dueDate
                            ? ` · ${t("debtors.dueDate", "Срок")}: ${new Date(
                                txn.dueDate,
                              ).toLocaleDateString(i18n.language === "uz" ? "uz-UZ" : "ru-RU")}`
                            : ""}
                          {txn.note ? ` · ${txn.note}` : ""}
                        </EntryWhen>
                      </EntryWhat>
                      <EntryAmount $charge={charge}>
                        {charge ? "+" : "−"}
                        {formatCurrency(Math.abs(txn.amount))}
                      </EntryAmount>
                    </EntryRow>

                    {expanded &&
                      (sale ? (
                        <Lines>
                          {sale.items.map((item, i) => (
                            <Line key={`${sale.id}-${i}`}>
                              <span>
                                {item.productName} × {Number(item.quantity)}
                              </span>
                              <span>{formatCurrency(Number(item.subtotal))}</span>
                            </Line>
                          ))}
                          <LineTotal>
                            <span>{t("debtors.saleTotal", "Итого по чеку")}</span>
                            <span>{formatCurrency(Number(sale.finalAmount))}</span>
                          </LineTotal>
                          {Number(sale.paidAmount) > 0 && (
                            <Line>
                              <span>{t("debtors.paidAtCounter", "Оплачено на кассе")}</span>
                              <span>{formatCurrency(Number(sale.paidAmount))}</span>
                            </Line>
                          )}
                        </Lines>
                      ) : (
                        <Lines>
                          <Loading>{t("common.loading", "Загрузка…")}</Loading>
                        </Lines>
                      ))}
                  </Entry>
                );
              })
            )}
          </Ledger>
        </>
      )}
    </Modal>
  );
}
