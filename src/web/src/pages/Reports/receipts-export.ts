import type { Sale } from "@shared/types/sale.types";

/** The receipts page's fiscal filter. Unfiscalised = anything not FISCALIZED, an empty status included. */
export type FiscalFilter = "all" | "fiscalised" | "unfiscalised";

export function matchesFiscalFilter(
  sale: Pick<Sale, "fiscalStatus">,
  filter: FiscalFilter,
): boolean {
  if (filter === "all") return true;
  const fiscalised = sale.fiscalStatus === "FISCALIZED";
  return filter === "fiscalised" ? fiscalised : !fiscalised;
}

export type ReceiptType = "sale" | "refund" | "nasiya";

/** Refund = a fiscal full refund was issued (known on the till only); nasiya = debt left on a tab. */
export function receiptType(sale: Pick<Sale, "refunded" | "debtAmount">): ReceiptType {
  if (sale.refunded) return "refund";
  return Number(sale.debtAmount ?? 0) > 0 ? "nasiya" : "sale";
}

/** cheklar_2026-10-01_2026-10-09.xlsx, or cheklar_2026-10-09.xlsx for one day. */
export function exportFileName(startDate: string, endDate: string): string {
  return startDate === endDate
    ? `cheklar_${startDate}.xlsx`
    : `cheklar_${startDate}_${endDate}.xlsx`;
}

export type Cell = string | number | null;

export interface ExportLabels {
  receiptHeader: string[];
  itemHeader: string[];
  type: Record<ReceiptType, string>;
  formatDateTime: (iso: string) => string;
}

export interface ExportSheets {
  receipts: Cell[][];
  items: Cell[][];
}

/**
 * Both sheets as rows, built `chunk` receipts at a time with a yield in between, so the progress
 * bar reports real work and a month of receipts doesn't freeze the page. Amounts stay numbers —
 * Excel sums them; the server sends Decimals as strings.
 */
export async function buildExportSheets(
  sales: Sale[],
  labels: ExportLabels,
  onProgress: (fraction: number) => void,
  chunk = 500,
): Promise<ExportSheets> {
  const receipts: Cell[][] = [labels.receiptHeader];
  const items: Cell[][] = [labels.itemHeader];
  for (let i = 0; i < sales.length; i += chunk) {
    for (const s of sales.slice(i, i + chunk)) {
      const when = labels.formatDateTime(String(s.createdAt));
      const z = s.zReportNumber ?? null;
      receipts.push([
        s.terminalId,
        s.receiptNumber,
        when,
        labels.type[receiptType(s)],
        Number(s.finalAmount),
        z,
      ]);
      for (const it of s.items ?? []) {
        items.push([
          s.terminalId,
          s.receiptNumber,
          when,
          z,
          it.productName,
          it.barcode,
          Number(it.quantity),
          Number(it.unitPrice),
          Number(it.subtotal),
        ]);
      }
    }
    onProgress(Math.min(1, (i + chunk) / sales.length));
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(1);
  return { receipts, items };
}
