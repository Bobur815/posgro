import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { RefreshCw, Search, Wallet } from "lucide-react";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { useToast } from "../../context/ToastContext";
import { formatCurrency as formatCurrencyBase } from "@shared/utils";
import { roleLabelKey, USER_ROLES } from "@shared/constants";
import type { Debtor } from "@shared/types";
import { DebtorDetails } from "./DebtorDetails";

/**
 * Nasiya: who owes the shop money.
 *
 * Sorted by what is owed rather than by name, because the question this screen answers is "who
 * should I be chasing" — a list of every customer alphabetically would bury it. A row opens the
 * ledger, which is also where a payment is taken.
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
  padding-left: 25px;
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
  background: ${({ theme }) => theme.colors.error}18;
  color: ${({ theme }) => theme.colors.error};
  white-space: nowrap;
`;

const Toolbar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
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

const LastSync = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const Owed = styled.span<{ $owing: boolean }>`
  font-weight: 700;
  color: ${({ $owing, theme }) => ($owing ? theme.colors.error : theme.colors.textSecondary)};
`;

/** Marks a member of staff running a tab, as the POS picker does. */
const StaffTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.primary}18;
  color: ${({ theme }) => theme.colors.primary};
`;

const Overdue = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
`;

export function DebtorList() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [search, setSearch] = useState("");
  const [withDebtOnly, setWithDebtOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDebtors(await window.electronAPI.debtors.list({ search, withDebtOnly }));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [search, withDebtOnly, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    window.electronAPI.debtors
      .lastSync()
      .then(setLastSync)
      .catch(() => {});
  }, []);

  // Nasiya only, now: push this till's customers and ledger rows, pull every till's, re-derive
  // balances. The automatic cycle does the same; this is for "I just took a payment on the other
  // till". Rows merge by id, so a failure part-way leaves nothing half-written to undo.
  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await window.electronAPI.debtors.syncNow();
      if (res.ok) {
        setLastSync(res.at);
        toast.success(t("debtors.sync.done"));
        await load();
      } else {
        toast.error(t(`debtors.sync.${res.reason}`));
      }
    } catch {
      toast.error(t("debtors.sync.error"));
    } finally {
      setSyncing(false);
    }
  };

  const outstanding = debtors.reduce((sum, d) => sum + Math.max(0, d.debt), 0);

  const columns = [
    {
      key: "name",
      header: t("debtors.client", "Клиент"),
      render: (d: Debtor) => (
        <>
          {i18n.language === "uz" ? d.nameUz : d.nameRu}
          {d.role !== USER_ROLES.CLIENT && (
            <StaffTag>{t(roleLabelKey(d.role), { defaultValue: d.role })}</StaffTag>
          )}
        </>
      ),
    },
    { key: "phone", header: t("debtors.phone", "Телефон"), render: (d: Debtor) => d.phone },
    {
      key: "due",
      header: t("debtors.dueDate", "Срок"),
      render: (d: Debtor) => {
        if (!d.debtDueDate) return "—";
        const due = new Date(d.debtDueDate);
        const late = d.debt > 0 && due.getTime() < Date.now();
        return (
          <>
            {due.toLocaleDateString(i18n.language === "uz" ? "uz-UZ" : "ru-RU")}
            {late && <Overdue>{t("debtors.overdue", "просрочен")}</Overdue>}
          </>
        );
      },
    },
    {
      key: "debt",
      header: t("debtors.debt", "Долг"),
      render: (d: Debtor) => (
        <Owed $owing={d.debt > 0}>
          {/* A negative balance is money paid ahead, not a debt — it must not read as one. */}
          {d.debt < 0
            ? t("debtors.prepaid", { defaultValue: "аванс {{amount}}", amount: formatCurrency(-d.debt) })
            : formatCurrency(d.debt)}
        </Owed>
      ),
    },
  ];

  return (
    <Container>
      <Header>
        <Title>{t("debtors.title", "Должники")}</Title>
        <Totals>
          <Wallet size={16} />
          {t("debtors.totalOutstanding", "Всего долгов")}: {formatCurrency(outstanding)}
        </Totals>
      </Header>

      <Toolbar>
        <SearchWrap>
          <Search size={16} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("debtors.searchPlaceholder", "Имя или телефон")}
          />
        </SearchWrap>
        {/* "Show all" means every customer, not every person on the till — a roster of staff
            who owe nothing is noise on the screen for chasing debts. Staff who DO owe are in the
            list either way: the filter is on debt, and never on role (see debtors:list). */}
        <Button variant="secondary" onClick={() => setWithDebtOnly((v) => !v)}>
          {withDebtOnly
            ? t("debtors.showAll", "Показать всех")
            : t("debtors.showOwingOnly", "Только с долгом")}
        </Button>
        <Button variant="secondary" onClick={syncNow} disabled={syncing}>
          <RefreshCw size={16} /> {syncing ? t("debtors.sync.running") : t("debtors.sync.button")}
        </Button>
        <LastSync>
          {t("debtors.sync.last")}:{" "}
          {lastSync
            ? new Date(lastSync).toLocaleString(i18n.language === "uz" ? "uz-UZ" : "ru-RU")
            : "—"}
        </LastSync>
      </Toolbar>

      <Table
        columns={columns}
        data={debtors}
        loading={loading}
        emptyMessage={t("debtors.noneYet", "Клиентов пока нет — добавьте первого")}
        onRowClick={(d: Debtor) => setOpenId(d.id)}
      />

      {openId && (
        <DebtorDetails
          debtorId={openId}
          onClose={() => {
            setOpenId(null);
            // The balance has probably moved — a payment is taken from inside that modal.
            void load();
          }}
        />
      )}
    </Container>
  );
}
