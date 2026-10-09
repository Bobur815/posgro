import React, { useEffect, useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled, { type DefaultTheme } from "styled-components";
import { useSales } from "../../hooks/useSales";
import { formatCurrency as formatCurrencyBase, summarizeReceipts } from "@shared/utils";
import { CLICK_BRAND_COLOR, UZQR_BRAND_COLOR, type SaleTender } from "@shared/constants";
import { formatDateTime } from "../../utils/formatters";
import { Modal } from "@components/common/Modal";
import { Button } from "@renderer/components/common/Button";
import { Pagination } from "@components/common/Pagination";
import { DateInput } from "@components/common/DateInput";
import { usePagination } from "../../hooks/usePagination";
import { Download, Eraser, FileSpreadsheet } from "lucide-react";
import {
  buildExportSheets,
  exportFileName,
  matchesFiscalFilter,
  type ExportLabels,
  type FiscalFilter,
} from "./receipts-export";
import {
  SubNav,
  useReportsSubNav,
  REPORTS_HIDE_TABS_ON_MOBILE,
} from "../../components/layout/SubNav";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.75rem;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  
`;

const FilterLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const FilterSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ExportPanel = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const ProgressTrack = styled.div`
  flex: 1;
  min-width: 160px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.border};
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  width: ${({ $percent }) => $percent}%;
  height: 100%;
  background-color: ${({ theme }) => theme.colors.primary};
  transition: width 0.15s ease;
`;

const ExportText = styled.span<{ $error?: boolean }>`
  font-size: 14px;
  color: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.textSecondary)};
  white-space: nowrap;
`;

type ExportState =
  | { status: "idle" }
  | { status: "building"; percent: number }
  | { status: "ready"; url: string; fileName: string }
  | { status: "error" };

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const StatValue = styled.div`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
`;

const StatSubtext = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const TableCard = styled.div`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const TableCardHeader = styled.div`
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tr = styled.tr`
  &:last-child td {
    border-bottom: none;
  }
  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

/** Green = drawer, house blue = bank card, navy = the UzQR brand, Click blue = Click. */
function tenderColor(theme: DefaultTheme, method: string) {
  if (method === "uzqr") return UZQR_BRAND_COLOR;
  if (method === "click") return CLICK_BRAND_COLOR;
  return method === "cash" ? theme.colors.success : theme.colors.primary;
}

/** Emoji cue beside the tender label. */
const TENDER_ICONS: Record<string, string> = {
  cash: "💵",
  card: "💳",
  uzqr: "🔳",
  click: "📱",
  mixed: "🔀",
};

const PaymentBadge = styled.span<{ $method: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background-color: ${({ theme, $method }) => tenderColor(theme, $method) + "20"};
  color: ${({ theme, $method }) => tenderColor(theme, $method)};
  font-weight: 500;
`;

const EmptyCell = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ActionBtn = styled.button<{ $variant?: "danger" }>`
  padding: 4px 10px;
  font-size: 13px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === "danger" ? theme.colors.error : theme.colors.border};
  background: none;
  color: ${({ theme, $variant }) =>
    $variant === "danger" ? theme.colors.error : theme.colors.textSecondary};
  cursor: pointer;

  &:hover {
    background-color: ${({ theme, $variant }) =>
      $variant === "danger" ? theme.colors.error + "15" : theme.colors.border};
    color: ${({ theme, $variant }) =>
      $variant === "danger" ? theme.colors.error : theme.colors.text};
  }

  & + & {
    margin-left: 6px;
  }
`;

const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ModalText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ModalBtn = styled.button<{ $variant?: "danger" }>`
  padding: 8px 18px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: none;
  font-size: 14px;
  cursor: pointer;
  background-color: ${({ theme, $variant }) =>
    $variant === "danger" ? theme.colors.error : theme.colors.border};
  color: ${({ theme, $variant }) =>
    $variant === "danger" ? "#fff" : theme.colors.text};

  &:hover {
    opacity: 0.85;
  }
`;

export function DailySummary() {
  const { t, i18n } = useTranslation();
  const { loadSales, deleteSale, sales, debtPayments, isLoading } = useSales();

  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [paymentFilter, setPaymentFilter] = useState<"all" | SaleTender | "mixed">(
    "all",
  );
  const [fiscalFilter, setFiscalFilter] = useState<FiscalFilter>("all");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  // Bumped whenever the list behind a file changes: a build still running for the old list is
  // dropped, and a finished file's URL is released.
  const exportRun = useRef(0);
  const exportUrl = useRef<string | null>(null);

  const formatCurrency = (amount: number) =>
    formatCurrencyBase(amount, i18n.language as "ru" | "uz");


  useEffect(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    loadSales({ startDate: start.toISOString(), endDate: end.toISOString() });
  }, [startDate, endDate]);

  const filteredSales = useMemo(
    () =>
      sales.filter(
        (s) =>
          (paymentFilter === "all" || s.paymentMethod === paymentFilter) &&
          matchesFiscalFilter(s, fiscalFilter),
      ),
    [sales, paymentFilter, fiscalFilter],
  );

  const {
    pageData: pagedSales,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    pageSizeOptions,
    goToPage,
    setPageSize,
  } = usePagination(filteredSales);

  // Nasiya paid back in the period counts in the tender it arrived in — so a tender filter keeps
  // only payments in that tender, and "mixed" (a receipt shape, not a tender) keeps none. A
  // repayment is no receipt and has no fiscal status, so a fiscal filter keeps none either.
  const filteredDebtPayments = useMemo(
    () =>
      fiscalFilter !== "all"
        ? []
        : paymentFilter === "all"
          ? debtPayments
          : debtPayments.filter(
              (p) => (p.paymentMethod ?? "").toLowerCase() === paymentFilter,
            ),
    [debtPayments, paymentFilter, fiscalFilter],
  );

  const summary = useMemo(
    () =>
      filteredSales.length || filteredDebtPayments.length
        ? summarizeReceipts(filteredSales, filteredDebtPayments)
        : null,
    [filteredSales, filteredDebtPayments],
  );

  const handleDeleteExecute = async () => {
    if (!deleteTargetId) return;
    await deleteSale(deleteTargetId);
    setDeleteTargetId(null);
  };

  const handleReset = () => {
    setStartDate(todayStr);
    setEndDate(todayStr);
    setPaymentFilter("all");
    setFiscalFilter("all");
  };

  const discardExport = () => {
    exportRun.current++;
    if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
    exportUrl.current = null;
  };

  // A file describes the list it was built from; any change to that list makes it stale.
  useEffect(() => {
    discardExport();
    setExportState({ status: "idle" });
  }, [filteredSales, startDate, endDate]);

  useEffect(() => discardExport, []);

  const handleExport = async () => {
    discardExport();
    const run = exportRun.current;
    setExportState({ status: "building", percent: 0 });
    try {
      const labels: ExportLabels = {
        receiptHeader: [
          t("reports.exportCol.terminalId"),
          t("reports.exportCol.receiptNo"),
          t("reports.exportCol.dateTime"),
          t("reports.exportCol.type"),
          t("reports.exportCol.amount"),
          t("reports.exportCol.zReport"),
        ],
        itemHeader: [
          t("reports.exportCol.terminalId"),
          t("reports.exportCol.receiptNo"),
          t("reports.exportCol.dateTime"),
          t("reports.exportCol.zReport"),
          t("reports.exportCol.product"),
          t("reports.exportCol.barcode"),
          t("reports.exportCol.quantity"),
          t("reports.exportCol.unitPrice"),
          t("reports.exportCol.subtotal"),
        ],
        type: {
          sale: t("reports.receiptType.sale"),
          refund: t("reports.receiptType.refund"),
          nasiya: t("reports.receiptType.nasiya"),
        },
        formatDateTime,
      };
      // Loaded on first use: most visits to this page never export.
      const [XLSX, sheets] = await Promise.all([
        import("xlsx"),
        buildExportSheets(filteredSales, labels, (f) => {
          if (run === exportRun.current) {
            setExportState({ status: "building", percent: Math.round(f * 100) });
          }
        }),
      ]);
      if (run !== exportRun.current) return;

      const book = XLSX.utils.book_new();
      const receiptsSheet = XLSX.utils.aoa_to_sheet(sheets.receipts);
      receiptsSheet["!cols"] = [10, 14, 20, 12, 14, 12].map((wch) => ({ wch }));
      const itemsSheet = XLSX.utils.aoa_to_sheet(sheets.items);
      itemsSheet["!cols"] = [10, 14, 20, 12, 36, 16, 10, 12, 14].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(book, receiptsSheet, t("reports.exportSheetReceipts"));
      XLSX.utils.book_append_sheet(book, itemsSheet, t("reports.exportSheetItems"));
      const bytes: ArrayBuffer = XLSX.write(book, { bookType: "xlsx", type: "array" });

      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      exportUrl.current = url;
      setExportState({ status: "ready", url, fileName: exportFileName(startDate, endDate) });
    } catch (err) {
      console.error("Receipts export failed", err);
      if (run === exportRun.current) setExportState({ status: "error" });
    }
  };

  const handleDownload = (url: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const subNav = useReportsSubNav();

  return (
    <Container>
      {/* Section tabs — the mobile bar carries sections only, so a section's sibling
          pages live here. See components/layout/SubNav.tsx. */}
      <SubNav items={subNav} hideOnMobile={REPORTS_HIDE_TABS_ON_MOBILE} />
      <HeaderRow>
        <Title>{t("reports.receipts")}</Title>
      </HeaderRow>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>{t("reports.startDate")}</FilterLabel>
          <DateInput
            value={startDate}
            onChange={(val) => setStartDate(val)}
          />
        </FilterGroup>
        <FilterGroup>
          <FilterLabel>{t("reports.endDate")}</FilterLabel>
          <DateInput
            value={endDate}
            onChange={(val) => setEndDate(val)}
          />
        </FilterGroup>
        <FilterGroup>
          <FilterLabel>{t("reports.payment")}</FilterLabel>
          <FilterSelect
            value={paymentFilter}
            onChange={(e) =>
              setPaymentFilter(e.target.value as "all" | SaleTender | "mixed")
            }
          >
            <option value="all">{t("reports.allPayments")}</option>
            <option value="cash">{t("pos.cash")}</option>
            <option value="card">{t("pos.card")}</option>
            <option value="uzqr">{t("pos.uzqr")}</option>
            <option value="click">{t("pos.click")}</option>
            <option value="mixed">{t("pos.mixed")}</option>
          </FilterSelect>
        </FilterGroup>
        <FilterGroup>
          <FilterLabel>{t("reports.fiscalFilter")}</FilterLabel>
          <FilterSelect
            value={fiscalFilter}
            onChange={(e) => setFiscalFilter(e.target.value as FiscalFilter)}
          >
            <option value="all">{t("reports.allPayments")}</option>
            <option value="fiscalised">{t("reports.fiscalised")}</option>
            <option value="unfiscalised">{t("reports.unfiscalised")}</option>
          </FilterSelect>
        </FilterGroup>
        <Button variant="secondary" size="medium" onClick={handleReset}>
          <Eraser size={18} /> {t("common.refresh")}
        </Button>
        <Button
          variant="primary"
          size="medium"
          onClick={handleExport}
          disabled={isLoading || !filteredSales.length || exportState.status === "building"}
        >
          <FileSpreadsheet size={18} /> {t("reports.exportExcel")}
        </Button>
      </FilterBar>

      {exportState.status !== "idle" && (
        <ExportPanel>
          {exportState.status === "building" && (
            <>
              <ProgressTrack
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={exportState.percent}
              >
                <ProgressFill $percent={exportState.percent} />
              </ProgressTrack>
              <ExportText>
                {t("reports.exportPreparing", { percent: exportState.percent })}
              </ExportText>
            </>
          )}
          {exportState.status === "ready" && (
            <Button
              variant="primary"
              size="medium"
              onClick={() => handleDownload(exportState.url, exportState.fileName)}
            >
              <Download size={18} /> {t("reports.exportDownload", { file: exportState.fileName })}
            </Button>
          )}
          {exportState.status === "error" && (
            <ExportText $error>{t("reports.exportFailed")}</ExportText>
          )}
        </ExportPanel>
      )}

      {summary && (
        <StatsGrid>
          <StatCard>
            <StatLabel>{t("reports.salesAmount")}</StatLabel>
            <StatValue>{formatCurrency(summary.total)}</StatValue>
            <StatSubtext>
              {startDate === endDate ? startDate : `${startDate} – ${endDate}`}
            </StatSubtext>
          </StatCard>

          <StatCard>
            <StatLabel>{t("reports.avgMargin")}</StatLabel>
            <StatValue>{summary.margin.toFixed(1)}%</StatValue>
          </StatCard>

          <StatCard>
            <StatLabel>{t("reports.debtTaken")}</StatLabel>
            <StatValue>{formatCurrency(summary.debt)}</StatValue>
            {summary.debtPaidBack > 0 && (
              <StatSubtext>
                {t("reports.debtPaidBack", {
                  amount: formatCurrency(summary.debtPaidBack),
                })}
              </StatSubtext>
            )}
          </StatCard>

          <StatCard>
            <StatLabel>{t("reports.cashPayments")}</StatLabel>
            <StatValue>{formatCurrency(summary.tenders.cash)}</StatValue>
          </StatCard>

          <StatCard>
            <StatLabel>{t("reports.cardPayments")}</StatLabel>
            <StatValue>{formatCurrency(summary.tenders.card)}</StatValue>
          </StatCard>

          {/* Only worth a tile once the store actually takes UzQR / Click. */}
          {summary.tenders.uzqr > 0 && (
            <StatCard>
              <StatLabel>{t("reports.uzqrPayments")}</StatLabel>
              <StatValue>{formatCurrency(summary.tenders.uzqr)}</StatValue>
            </StatCard>
          )}

          {summary.tenders.click > 0 && (
            <StatCard>
              <StatLabel>{t("reports.clickPayments")}</StatLabel>
              <StatValue>{formatCurrency(summary.tenders.click)}</StatValue>
            </StatCard>
          )}
        </StatsGrid>
      )}

      <TableCard>
        <TableCardHeader>
          <SectionTitle>{t("reports.receipts")}</SectionTitle>
        </TableCardHeader>

        {isLoading && !filteredSales.length ? (
          <EmptyCell>{t("common.loading")}</EmptyCell>
        ) : !filteredSales.length ? (
          <EmptyCell>{t("reports.noReceipts")}</EmptyCell>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("reports.dateTime")}</Th>
                <Th>{t("pos.receiptNumber")}</Th>
                <Th>{t("reports.cashier")}</Th>
                <Th style={{ textAlign: "center" }}>{t("pos.items")}</Th>
                <Th>{t("reports.payment")}</Th>
                <Th style={{ textAlign: "right" }}>{t("reports.amount")}</Th>
                <Th style={{ textAlign: "right" }}>{t("reports.cost")}</Th>
                <Th style={{ textAlign: "right" }}>{t("reports.margin")}</Th>
                <Th style={{ textAlign: "center" }}>{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {pagedSales.map((sale) => (
                <Tr key={sale.id}>
                  <Td style={{ whiteSpace: "nowrap" }}>
                    {formatDateTime(sale.createdAt)}
                  </Td>
                  <Td style={{ fontFamily: "monospace" }}>
                    #{sale.receiptNumber}
                  </Td>
                  <Td>{sale.cashierName}</Td>
                  <Td style={{ textAlign: "center" }}>{sale.items.length}</Td>
                  <Td>
                    <PaymentBadge $method={sale.paymentMethod}>
                      {TENDER_ICONS[sale.paymentMethod] ?? "💳"}{" "}
                      {t(`pos.${sale.paymentMethod}`)}
                    </PaymentBadge>
                  </Td>
                  <Td style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatCurrency(Number(sale.finalAmount))}
                  </Td>
                  <Td
                    style={{
                      textAlign: "right",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {sale.totalCost != null
                      ? formatCurrency(sale.totalCost)
                      : "—"}
                  </Td>
                  <Td style={{ textAlign: "right", fontWeight: 600 }}>
                    {sale.margin != null ? `${sale.margin.toFixed(1)}%` : "—"}
                  </Td>
                  <Td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    <ActionBtn
                      $variant="danger"
                      onClick={() => setDeleteTargetId(sale.id)}
                    >
                      {t("common.delete")}
                    </ActionBtn>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {filteredSales.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </TableCard>

      {deleteTargetId && (
        <Modal
          title={t("common.delete")}
          onClose={() => setDeleteTargetId(null)}
        >
          <ModalBody>
            <ModalText>{t("common.confirmDelete")}</ModalText>
            <ModalActions>
              <ModalBtn onClick={() => setDeleteTargetId(null)}>
                {t("common.no")}
              </ModalBtn>
              <ModalBtn $variant="danger" onClick={handleDeleteExecute}>
                {t("common.yes")}
              </ModalBtn>
            </ModalActions>
          </ModalBody>
        </Modal>
      )}
    </Container>
  );
}
