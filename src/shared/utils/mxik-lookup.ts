// Barcode → MXIK lookup against tasnif's `elasticsearch/search` endpoint.
//
// That endpoint is FUZZY: searching a barcode that is not in the registry still returns
// near-miss digit variants. Searching 4780136191983 (Bio Life 1.5 L) returns 4780036191083
// (Пиво АЗИЯ 2,3 л) as the first row. Falling back to `data[0]` therefore imports a
// completely different product's MXIK, names and package codes — so a lookup by barcode
// must match `internationalCode` exactly, and report "not found" when nothing matches.

/**
 * An MXIK as REGOS and tasnif want it: whitespace (incl. NBSP and zero-width) removed, null when
 * nothing is left. A code pasted as "01905007001000000 " is stored as typed and failed every
 * 17-digit check — and was sent to REGOS as icps with the space.
 */
export function normalizeMxik(raw: string | null | undefined): string | null {
  const code = (raw ?? '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  return code || null;
}

/** GTIN-14 / EAN-13 / UPC-12 differ only by leading zeros — compare on the significant digits. */
function normalizeGtin(code: string | null | undefined): string {
  return (code ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/** The row whose `internationalCode` is the given barcode, or undefined when tasnif has no exact match. */
export function findBarcodeMatch<T extends { internationalCode?: string | null }>(
  rows: T[] | null | undefined,
  barcode: string,
): T | undefined {
  const target = normalizeGtin(barcode);
  if (!target || !rows?.length) return undefined;
  return rows.find((r) => normalizeGtin(r.internationalCode) === target);
}
