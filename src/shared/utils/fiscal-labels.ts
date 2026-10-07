// Which marking code belongs to which receipt line.
//
// Every scanned marked item is its own cart line (qty 1, never merged — cart-store.ts), and the
// codes are stored in sale.regos_labels as [{barcode, label}]. Two packs of the same drink share a
// barcode but always carry different codes, so a lookup by barcode alone hands both lines the same
// code and REGOS sees one code twice. Codes are dealt out per barcode in order instead: the k-th
// line with barcode X gets the k-th code stored for X.
import type { FiscalLabel } from '../types/fiscal.types';

export function labelsPerLine(
  items: ReadonlyArray<{ barcode: string }>,
  labels: ReadonlyArray<FiscalLabel>,
): Array<string | undefined> {
  const queues = new Map<string, string[]>();
  for (const l of labels) {
    if (!l?.barcode || !l.label) continue;
    const q = queues.get(l.barcode);
    if (q) q.push(l.label);
    else queues.set(l.barcode, [l.label]);
  }
  return items.map((it) => queues.get(String(it.barcode))?.shift());
}

/**
 * The barcodes that, before codes were dealt out per line, went to REGOS with one code for every
 * pack: two or more codes stored for the barcode. The old lookup (a Map built from the list) kept
 * the LAST code, so that is the one sent; the others were never registered.
 */
export function duplicateCodeLines(
  labels: ReadonlyArray<FiscalLabel>,
  items: ReadonlyArray<{ barcode: string; productName: string }>,
): Array<{ barcode: string; productName: string; packs: number; sentCode: string; unsentCodes: string[] }> {
  const byBarcode = new Map<string, string[]>();
  for (const l of labels) {
    if (!l?.barcode || !l.label) continue;
    byBarcode.set(l.barcode, [...(byBarcode.get(l.barcode) ?? []), l.label]);
  }
  const out: ReturnType<typeof duplicateCodeLines> = [];
  for (const [barcode, codes] of byBarcode) {
    // Distinct codes only: the same code stored twice was sent correctly, just twice.
    const distinct = [...new Set(codes)];
    if (codes.length < 2 || distinct.length < 2) continue;
    const sentCode = codes[codes.length - 1];
    out.push({
      barcode,
      productName: items.find((it) => it.barcode === barcode)?.productName ?? barcode,
      packs: codes.length,
      sentCode,
      unsentCodes: distinct.filter((c) => c !== sentCode),
    });
  }
  return out;
}
