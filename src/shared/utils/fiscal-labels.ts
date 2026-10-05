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
