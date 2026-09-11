/**
 * Builds a PLU file for the Rongta RLS1000 "PLU manager" (C:\RLS\RTPLU.exe → Import from TXP file).
 *
 * Format: one product per line, 58 tab-separated columns, CRLF. The template below is the row the
 * PLU manager itself writes (it re-saved C:\RLS\rtPLU_EN.TXP in this layout on 2026-09-11); only the
 * columns we own are substituted. Column meanings, and how each is known:
 *   col 0 PLU no.   col 1 name   col 2 LF code   col 3 item code (goes into the label barcode)
 *   col 4 barcode type — read back as "Barcode" in the PLU manager after an import
 *   col 5 unit price in 1/100 — the PLU manager showed 23000 written as-is as 230,00
 *   col 6 weigh unit (4 = Kg in RLS1000.db WeighUnitTable)
 *   col 7 unconfirmed (probably department); the sample's 21 is kept
 *   col 8 tare   col 9 shelf-life days
 * The sample file holds one value per column in 4 and 6–9, so a capture of it cannot tell those
 * columns apart — only a PLU-manager import can.
 *
 * Deliberate departures from the sample rows: barcode type 15 (the store's label format) and
 * shelf life 0 (the sample's 15 days would print an invented expiry).
 *
 * LF code is the product's internalCode. The item code (and PLU no.) is the one the till resolves
 * a scanned label with — `products:getById` tries storeProductCode first, then the global id — so
 * it is storeProductCode, or the id for older products that never got one.
 *
 * Names are nameUz as Latin ASCII: the file encoding the PLU manager reads non-ASCII in is
 * unverified (the Chinese sample is GBK), and the names hold Uzbek Cyrillic (ғ қ ҳ ў) that neither
 * GBK nor cp1251 can carry — so Cyrillic is transliterated rather than written as-is.
 */

const TEMPLATE_ROW: readonly string[] = [
  "1", "", "1", "1", "15", "0", "4", "21", "0.000", "0", "0", "0.000", "0", "0", "0", "0", "D0",
  "0", "0", "", "", "0", "0", "0.0", "0", "0", "", "0.0000", "0", "", "", "", "", "", "", "", "",
  "", "3", "0", "0", "0", "0", "0", "0", "0.00", "0", "0.000", "0.000", "0", "", "0", "0.00", "0",
  "0", "0", "0.00", "0",
];

const COL_PLU = 0;
const COL_NAME = 1;
const COL_LF_CODE = 2;
const COL_ITEM_CODE = 3;
const COL_PRICE = 5;

/** LF code is 3 BCD bytes on the wire and the label barcode carries 6 digits. */
export const TXP_MAX_CODE = 999_999;
/** The name field is 72 bytes on the wire; leave room for a terminator. */
export const TXP_NAME_MAX = 71;

export interface TxpSourceProduct {
  id: number;
  storeProductCode: number | null;
  internalCode: string | null;
  nameUz: string;
  price: number;
}

export type TxpSkipReason =
  | "no_name"
  | "no_internal_code"
  | "code_too_long"
  | "duplicate_code"
  | "code_taken";

export interface TxpSkipped {
  id: number;
  name: string;
  reason: TxpSkipReason;
}

export interface TxpBuild {
  text: string;
  exported: number;
  skipped: TxpSkipped[];
}

export interface TxpExportResult {
  path: string;
  exported: number;
  skipped: TxpSkipped[];
}

const APOSTROPHES = /[\u2018\u2019\u02BB\u02BC\u0060\u00B4]/g;

/** Uzbek Latin spelling of Uzbek and Russian Cyrillic letters. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

function cyrillicToLatin(ch: string): string {
  const lower = ch.toLowerCase();
  const latin = CYRILLIC_TO_LATIN[lower];
  if (latin === undefined) return ch;
  return ch === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
}

/**
 * Printable ASCII for the scale: Cyrillic transliterated to Uzbek Latin (many nameUz values are
 * typed in Cyrillic), oʻ/o‘ → o', accents dropped, tabs and runs of spaces collapsed.
 */
export function toScaleName(name: string): string {
  return name
    .replace(/\p{Script=Cyrillic}/gu, cyrillicToLatin)
    .replace(APOSTROPHES, "'")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TXP_NAME_MAX)
    .trim();
}

/** The code a label must carry for the till to find this product. */
export function scaleCode(p: Pick<TxpSourceProduct, "id" | "storeProductCode">): number {
  return p.storeProductCode ?? p.id;
}

/**
 * @param activeStoreCodes storeProductCodes of every active product (not just weighed ones). An
 *   older product whose id equals another product's code would scan as that other product.
 */
export function buildRongtaTxp(
  products: readonly TxpSourceProduct[],
  activeStoreCodes: ReadonlySet<number>,
): TxpBuild {
  const skipped: TxpSkipped[] = [];
  const rows = new Map<number, string>();
  const lfCodesUsed = new Set<number>();

  const sorted = [...products].sort((a, b) => scaleCode(a) - scaleCode(b));
  for (const p of sorted) {
    const code = scaleCode(p);
    const lfCode = /^\d+$/.test(p.internalCode ?? "") ? Number(p.internalCode) : null;
    const name = toScaleName(p.nameUz);
    const skip = (reason: TxpSkipReason) => skipped.push({ id: p.id, name: p.nameUz, reason });

    if (!name) skip("no_name");
    else if (lfCode == null) skip("no_internal_code");
    else if (code > TXP_MAX_CODE || lfCode > TXP_MAX_CODE) skip("code_too_long");
    else if (p.storeProductCode == null && activeStoreCodes.has(p.id)) skip("code_taken");
    else if (rows.has(code) || lfCodesUsed.has(lfCode)) skip("duplicate_code");
    else {
      const row = [...TEMPLATE_ROW];
      row[COL_PLU] = row[COL_ITEM_CODE] = String(code);
      row[COL_LF_CODE] = String(lfCode);
      row[COL_NAME] = name;
      row[COL_PRICE] = String(Math.max(0, Math.round(p.price * 100)));
      rows.set(code, row.join("\t"));
      lfCodesUsed.add(lfCode);
    }
  }

  const lines = [...rows.values()];
  return {
    text: lines.length ? lines.join("\r\n") + "\r\n" : "",
    exported: lines.length,
    skipped,
  };
}
