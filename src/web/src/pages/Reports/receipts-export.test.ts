import type { Sale } from "@shared/types/sale.types";
import {
  buildExportSheets,
  exportFileName,
  matchesFiscalFilter,
  receiptType,
  type ExportLabels,
} from "./receipts-export";

const LABELS: ExportLabels = {
  receiptHeader: ["T", "No", "When", "Type", "Amount", "Z"],
  itemHeader: ["T", "No", "When", "Z", "Product", "Barcode", "Qty", "Price", "Sum"],
  type: { sale: "Sale", refund: "Refund", nasiya: "Nasiya" },
  formatDateTime: (iso) => `@${iso}`,
};

const sale = (over: Partial<Sale>): Sale => ({
  id: "s",
  receiptNumber: "R1",
  totalAmount: 10000,
  discountAmount: 0,
  finalAmount: 10000,
  paymentMethod: "cash",
  cashierId: "u",
  cashierName: "C",
  terminalId: "T1",
  synced: true,
  createdAt: "2026-10-09T10:00:00.000Z",
  items: [],
  ...over,
});

describe("matchesFiscalFilter", () => {
  it.each([
    ["FISCALIZED", true, false],
    ["PENDING", false, true],
    ["FAILED", false, true],
    ["DISABLED", false, true],
    ["DEFERRED_DEBT", false, true],
    [null, false, true],
  ])("%s → fiscalised %s, unfiscalised %s", (status, fiscalised, unfiscalised) => {
    expect(matchesFiscalFilter({ fiscalStatus: status }, "fiscalised")).toBe(fiscalised);
    expect(matchesFiscalFilter({ fiscalStatus: status }, "unfiscalised")).toBe(unfiscalised);
    expect(matchesFiscalFilter({ fiscalStatus: status }, "all")).toBe(true);
  });

  it("treats a missing status as unfiscalised", () => {
    expect(matchesFiscalFilter({}, "unfiscalised")).toBe(true);
  });
});

describe("receiptType", () => {
  it("refund wins over nasiya; a Decimal string debt counts", () => {
    expect(receiptType({ refunded: true, debtAmount: "500.00" })).toBe("refund");
    expect(receiptType({ debtAmount: "500.00" })).toBe("nasiya");
    expect(receiptType({ debtAmount: "0.00" })).toBe("sale");
    expect(receiptType({})).toBe("sale");
  });
});

describe("exportFileName", () => {
  it("names the file after the filter's dates", () => {
    expect(exportFileName("2026-10-09", "2026-10-09")).toBe("cheklar_2026-10-09.xlsx");
    expect(exportFileName("2026-10-01", "2026-10-09")).toBe("cheklar_2026-10-01_2026-10-09.xlsx");
  });
});

describe("buildExportSheets", () => {
  it("builds one receipt row per sale and one item row per line, amounts as numbers", async () => {
    const sales = [
      sale({
        // The server sends Decimals as strings.
        finalAmount: "12500.50" as unknown as number,
        zReportNumber: 17,
        items: [
          {
            productId: "1",
            productName: "Suv",
            barcode: "478",
            quantity: "1.500" as unknown as number,
            unitPrice: 5000,
            subtotal: 7500,
          },
          {
            productId: "2",
            productName: "Non",
            barcode: "479",
            quantity: 1,
            unitPrice: 5000.5,
            subtotal: 5000.5,
          },
        ],
      }),
      sale({ receiptNumber: "R2", terminalId: "T2", refunded: true, zReportNumber: null }),
    ];

    const { receipts, items } = await buildExportSheets(sales, LABELS, () => undefined);

    expect(receipts).toEqual([
      LABELS.receiptHeader,
      ["T1", "R1", "@2026-10-09T10:00:00.000Z", "Sale", 12500.5, 17],
      ["T2", "R2", "@2026-10-09T10:00:00.000Z", "Refund", 10000, null],
    ]);
    expect(items).toEqual([
      LABELS.itemHeader,
      ["T1", "R1", "@2026-10-09T10:00:00.000Z", 17, "Suv", "478", 1.5, 5000, 7500],
      ["T1", "R1", "@2026-10-09T10:00:00.000Z", 17, "Non", "479", 1, 5000.5, 5000.5],
    ]);
  });

  it("reports progress per chunk and ends at 1", async () => {
    const steps: number[] = [];
    const sales = Array.from({ length: 5 }, (_, i) => sale({ receiptNumber: `R${i}` }));
    await buildExportSheets(sales, LABELS, (f) => steps.push(f), 2);
    expect(steps).toEqual([0.4, 0.8, 1, 1]);
  });

  it("an empty list gives header-only sheets", async () => {
    const { receipts, items } = await buildExportSheets([], LABELS, () => undefined);
    expect(receipts).toEqual([LABELS.receiptHeader]);
    expect(items).toEqual([LABELS.itemHeader]);
  });
});
