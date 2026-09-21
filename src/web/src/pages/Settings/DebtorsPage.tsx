import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ChevronDown, ChevronRight, Search, Wallet } from "lucide-react";
import { Table } from "@components/common/Table";
import { Button } from "@components/common/Button";
import { Input } from "@components/common/Input";
import { useToast } from "@context/ToastContext";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { roleLabelKey, USER_ROLES } from "@shared/constants";
import {
  debtors as debtorsApi,
  type DashboardDebtor,
  type DashboardDebtorLedger,
} from "../../api/client";

/**
 * Nasiya on the dashboard — read-only, deliberately.
 *
 * A debt is taken on and settled at a till, where the customer, the drawer and the fiscal device
 * are. Taking a payment here would produce a balance no terminal agrees with, and the terminal
 * would win the next time it synced. So this screen answers "who owes me what, and what have
 * they been buying" and stops there.
 *
 * What it shows is what the terminals have mirrored up: a shop whose tills are offline sees a
 * stale balance and a short history rather than a wrong one.
 */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const Title = styled.h1`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Totals = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 20px;
  font-weight: 700;
  white-space: nowrap;
  background: ${({ theme }) => theme.colors.error}18;
  color: ${({ theme }) => theme.colors.error};
`;

const ReadOnlyNote = styled.div`
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
`;

const SearchWrap = styled.div`
  position: relative;
  max-width: 320px;
  flex: 1;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.textSecondary};
    pointer-events: none;
  }

  input {
    padding-left: 34px;
  }
`;

const Owed = styled.span<{ $owing: boolean }>`
  font-weight: 700;
  color: ${({ $owing, theme }) => ($owing ? theme.colors.error : theme.colors.textSecondary)};
`;

const Tag = styled.span<{ $tone: "staff" | "late" }>`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ $tone, theme }) =>
    $tone === "late" ? theme.colors.error : `${theme.colors.primary}18`};
  color: ${({ $tone, theme }) => ($tone === "late" ? "#fff" : theme.colors.primary)};
`;

const Panel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.md};
`;

const PanelHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const Entry = styled.div<{ $charge: boolean }>`
  border-radius: ${({ theme }) => theme.borderRadius};
  margin-bottom: 4px;
  background: ${({ $charge, theme }) =>
    $charge ? `${theme.colors.error}12` : `${theme.colors.success}12`};
`;

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

const EntryWhat = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const EntryWhen = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Amount = styled.span<{ $charge: boolean }>`
  font-weight: 700;
  white-space: nowrap;
  color: ${({ $charge, theme }) => ($charge ? theme.colors.error : theme.colors.success)};
`;

const Lines = styled.div`
  padding: 0 12px 10px 30px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const Line = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Empty = styled.div`
  padding: 18px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function DebtorsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [rows, setRows] = useState<DashboardDebtor[]>([]);
  const [search, setSearch] = useState("");
  const [withDebtOnly, setWithDebtOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<DashboardDebtorLedger | null>(null);
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);

  const formatCurrency = (value: number) =>
    formatCurrencyBase(value, i18n.language as "ru" | "uz");
  const locale = i18n.language === "uz" ? "uz-UZ" : "ru-RU";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await debtorsApi.list({ search, withDebtOnly }));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [search, withDebtOnly, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openLedger = async (id: string) => {
    try {
      setLedger(await debtorsApi.get(id));
      setOpenSaleId(null);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const outstanding = rows.reduce((sum, d) => sum + Math.max(0, Number(d.debt)), 0);

  const columns = [
    {
      key: "name",
      header: t("debtors.client", "Клиент"),
      render: (d: DashboardDebtor) => (
        <>
          {i18n.language === "uz" ? d.nameUz : d.nameRu}
          {d.role !== USER_ROLES.CLIENT && (
            <Tag $tone="staff">{t(roleLabelKey(d.role), { defaultValue: d.role })}</Tag>
          )}
        </>
      ),
    },
    { key: "phone", header: t("debtors.phone", "Телефон"), render: (d: DashboardDebtor) => d.phone },
    {
      key: "due",
      header: t("debtors.dueDate", "Срок"),
      render: (d: DashboardDebtor) => {
        if (!d.debtDueDate) return "—";
        const due = new Date(d.debtDueDate);
        const late = Number(d.debt) > 0 && due.getTime() < Date.now();
        return (
          <>
            {due.toLocaleDateString(locale)}
            {late && <Tag $tone="late">{t("debtors.overdue", "просрочен")}</Tag>}
          </>
        );
      },
    },
    {
      key: "debt",
      header: t("debtors.debt", "Долг"),
      render: (d: DashboardDebtor) => {
        const debt = Number(d.debt);
        return (
          <Owed $owing={debt > 0}>
            {debt < 0
              ? t("debtors.prepaid", {
                  defaultValue: "аванс {{amount}}",
                  amount: formatCurrency(-debt),
                })
              : formatCurrency(debt)}
          </Owed>
        );
      },
    },
  ];

  const saleFor = (saleId: string | null) =>
    saleId ? (ledger?.sales.find((s) => s.id === saleId) ?? null) : null;

  return (
    <Container>
      <Header>
        <Title>{t("debtors.title", "Должники")}</Title>
        <Totals>
          <Wallet size={16} />
          {t("debtors.totalOutstanding", "Всего долгов")}: {formatCurrency(outstanding)}
        </Totals>
      </Header>

      <ReadOnlyNote>
        {t(
          "debtors.readOnlyNote",
          "Только просмотр. Долги принимаются и погашаются на кассе — там, где покупатель, деньги и фискальный модуль.",
        )}
      </ReadOnlyNote>

      <Toolbar>
        <SearchWrap>
          <Search size={16} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("debtors.searchPlaceholder", "Имя или телефон")}
          />
        </SearchWrap>
        <Button variant="secondary" onClick={() => setWithDebtOnly((v) => !v)}>
          {withDebtOnly
            ? t("debtors.showAll", "Показать всех")
            : t("debtors.showOwingOnly", "Только с долгом")}
        </Button>
      </Toolbar>

      <Table
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage={t("debtors.noneYet", "Клиентов пока нет — добавьте первого")}
        onRowClick={(d: DashboardDebtor) => openLedger(d.id)}
      />

      {ledger && (
        <Panel>
          <PanelHead>
            <PanelTitle>
              {i18n.language === "uz" ? ledger.debtor.nameUz : ledger.debtor.nameRu}
            </PanelTitle>
            <Owed $owing={Number(ledger.debtor.debt) > 0}>
              {formatCurrency(Math.abs(Number(ledger.debtor.debt)))}
            </Owed>
          </PanelHead>

          {ledger.transactions.length === 0 ? (
            <Empty>{t("debtors.noHistory", "Пока ничего не было")}</Empty>
          ) : (
            ledger.transactions.map((txn) => {
              const charge = Number(txn.amount) > 0;
              const sale = saleFor(txn.saleId);
              const expandable = Boolean(sale);
              const expanded = expandable && openSaleId === txn.saleId;
              return (
                <Entry key={txn.id} $charge={charge}>
                  <EntryRow
                    type="button"
                    $expandable={expandable}
                    onClick={() =>
                      expandable && setOpenSaleId(expanded ? null : txn.saleId)
                    }
                  >
                    <EntryWhat>
                      {/* Only a charge has a receipt behind it to open. */}
                      {expandable &&
                        (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      <span>
                        {txn.type === "CHARGE"
                          ? t("debtors.entryCharge", "Покупка в долг")
                          : txn.type === "PAYMENT"
                            ? t("debtors.entryPayment", "Оплата")
                            : t("debtors.entryAdjustment", "Корректировка")}
                        {sale ? ` · №${sale.receiptNumber}` : ""}
                        {txn.settledAt ? ` · ${t("debtors.settled", "закрыт")}` : ""}
                        <EntryWhen>
                          {" "}
                          {new Date(txn.createdAt).toLocaleString(locale, {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </EntryWhen>
                      </span>
                    </EntryWhat>
                    <Amount $charge={charge}>
                      {charge ? "+" : "−"}
                      {formatCurrency(Math.abs(Number(txn.amount)))}
                    </Amount>
                  </EntryRow>

                  {expanded && sale && (
                    <Lines>
                      {sale.items.map((item, i) => (
                        <Line key={`${sale.id}-${i}`}>
                          <span>
                            {item.productName} × {Number(item.quantity)}
                          </span>
                          <span>{formatCurrency(Number(item.subtotal))}</span>
                        </Line>
                      ))}
                      <Line style={{ fontWeight: 700 }}>
                        <span>{t("debtors.saleTotal", "Итого по чеку")}</span>
                        <span>{formatCurrency(Number(sale.finalAmount))}</span>
                      </Line>
                    </Lines>
                  )}
                </Entry>
              );
            })
          )}
        </Panel>
      )}
    </Container>
  );
}
