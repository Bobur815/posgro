import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Landmark, RefreshCw } from "lucide-react";
import { Button } from "@components/common/Button";
import { DateInput } from "@components/common/DateInput";
import { EmptyPlaceholder } from "@components/common/EmptyPlaceholder";
import { SubNav, useStockSubNav } from "../../components/layout/SubNav";
import { uztDaysAgoString, uztEndOf, uztStartOf, uztTodayString } from "../../utils/uzt-date";
import { BankTurnoverSection } from "./BankTurnoverSection";

/**
 * Bank turnover: card + UzQR + fiscalised cash, and the fiscalised cash still to take to the bank.
 *
 * Its own page in the Stock section, beside Reconciliation — on mobile it is reached through the
 * section's tab strip like every sibling page. The figures and the deposit form live in
 * BankTurnoverSection; this page owns the period, which loads on open and on Refresh only, so a
 * date typed half-way never fires a request.
 */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Toolbar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

type Range = { from: string; to: string };

export function BankTurnoverPage() {
  const { t } = useTranslation();
  const subNav = useStockSubNav();

  const [from, setFrom] = useState(uztDaysAgoString(30));
  const [to, setTo] = useState(uztTodayString());
  const [range, setRange] = useState<Range | null>(null);

  // Real instants, not bare "YYYY-MM-DD": the server reads a date-only string as UTC midnight,
  // which would cut a Tashkent day short (see ReconciliationPage.load).
  const refresh = useCallback(() => {
    setRange({ from: uztStartOf(from).toISOString(), to: uztEndOf(to).toISOString() });
  }, [from, to]);

  useEffect(() => {
    refresh();
    // Deliberately on mount only — the date inputs drive an explicit Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container>
      <SubNav items={subNav} />
      <Title>
        <Landmark size={22} />
        {t("reconciliation.bank.title", "Банк")}
      </Title>

      <Toolbar>
        <DateInput label={t("reconciliation.from", "С")} value={from} onChange={setFrom} />
        <DateInput label={t("reconciliation.to", "По")} value={to} onChange={setTo} />
        <Button type="button" onClick={refresh}>
          <RefreshCw size={16} />
          {t("reconciliation.refresh", "Обновить")}
        </Button>
      </Toolbar>

      <BankTurnoverSection
        range={range}
        whenUnavailable={
          <EmptyPlaceholder
            icon={<Landmark size={40} />}
            title={t("reconciliation.bank.off", "Учёт оборота по банку выключен на этом сервере.")}
            description={t(
              "reconciliation.bank.offHint",
              "Его включает переменная BANK_TURNOVER_ENABLED на сервере.",
            )}
          />
        }
      />
    </Container>
  );
}

export default BankTurnoverPage;
