/**
 * TSPL for price-tag labels (XP-365B, 203 DPI). Pure: no database, no printer, no Electron, so the
 * exact bytes a label turns into are unit-testable. Both print paths use it — the Windows spooler
 * (tspl-printer.ts) and the Bluetooth COM port (label-printer.service.ts).
 */
export interface TsplLabelItem {
  productNameRu: string;
  productNameUz: string;
  price: number;
  barcode?: string;
  unit?: string;
  amount: number;
  copies: number;
  productType?: string; // 'BULK_WEIGHTED' | 'PREPACKAGED' | 'REGULAR'
  articleId?: string | number;
  pluCode?: string;
  productionDate?: string;
  expiryDate?: string;
}

export interface TsplPrintRequest {
  items: TsplLabelItem[];
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  lang: string;
  fontSize?: number;   // CSS-like px value (8–24); maps to TSPL TEXT multiplier
  fontWeight?: number; // CSS-like (300–900); >=600 prints text twice for bold effect
  elements: {
    name: boolean;
    price: boolean;
    unit: boolean;
    barcode: boolean;
    articleId: boolean;
    pluCode: boolean;
    productionDate: boolean;
    expiryDate: boolean;
    customText1: boolean;
    customText2: boolean;
    customText1Value?: string;
    customText2Value?: string;
  };
}

export interface TsplBuildOptions {
  /**
   * How a label's copies are requested. `sets` → `PRINT <n>,1` (n sets of one), what the spooler
   * path has always sent. `perLabel` → `PRINT 1,<n>` (one set, n copies), used on the COM path.
   * The printed result is the same; the field exists so the spooler bytes stay exactly as before.
   */
  copies: "sets" | "perLabel";
}
// XP-365B is 203 DPI → ~8 dots per mm
const DOTS_PER_MM = 8;

/** Format integer with plain space as thousands separator (avoids U+00A0 from toLocaleString). */
function fmtNum(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function escapeTSPL(s: string): string {
  return s.replace(/\\/g, "/").replace(/"/g, "'");
}

/** Returns true only if the barcode is a 13-digit string with a valid EAN-13 check digit. */
export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const expected = (10 - (sum % 10)) % 10;
  return parseInt(barcode[12]) === expected;
}

/** Convert a UTF-16 JS string to a Windows-1251 Buffer (Cyrillic code page). */
export function toCP1251(str: string): Buffer {
  const out = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      out[i] = c;
    } else if (c === 0x0401) {
      out[i] = 0xa8; // Ё
    } else if (c === 0x0451) {
      out[i] = 0xb8; // ё
    } else if (c >= 0x0410 && c <= 0x042f) {
      out[i] = c - 0x0410 + 0xc0; // А–Я
    } else if (c >= 0x0430 && c <= 0x044f) {
      out[i] = c - 0x0430 + 0xe0; // а–я
    } else if (c === 0x00a0 || c === 0x202f) {
      out[i] = 0x20; // non-breaking / narrow no-break space → regular space
    } else if (c === 0x02bb || c === 0x02bc || c === 0x2018 || c === 0x2019) {
      out[i] = 0x27; // Uzbek oʻ / gʼ modifier letters and curly quotes → apostrophe
    } else {
      out[i] = 0x3f; // unknown → '?'
    }
  }
  return out;
}

// charW = character width in dots for each built-in font at xmul=1
function pickFont(heightMm: number): {
  name: string;
  h: number;
  charW: number;
} {
  if (heightMm < 20) return { name: "1", h: 12, charW: 8 };
  if (heightMm < 30) return { name: "2", h: 20, charW: 12 };
  if (heightMm < 50) return { name: "3", h: 32, charW: 20 };
  return { name: "4", h: 48, charW: 32 };
}

/**
 * Word-wrap `text` so each line fits within `maxChars` characters.
 * Falls back to hard-splitting words that are longer than the limit.
 */
function wrapText(text: string, maxChars: number): string[] {
  if (maxChars < 1) return [text];
  const words = text.split(" ");
  const result: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      // Hard-split overlong words
      if (current) {
        result.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        result.push(word.slice(i, i + maxChars));
      }
    } else if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Map the template's CSS-style fontSize (8–24) to a TSPL TEXT integer multiplier.
 * TSPL TEXT syntax: TEXT x,y,"font",rot,xmul,ymul,"text"
 * xmul/ymul are integer scaling factors (1 = base size, 2 = 2×, etc.)
 */
function fontSizeToMul(fontSize: number): number {
  if (fontSize <= 11) return 1;
  if (fontSize <= 15) return 1; // default
  if (fontSize <= 19) return 2;
  return 3;
}

/** Emit a TEXT command, optionally printing twice (+1 dot offset) to simulate bold. */
function textCmd(
  x: number,
  y: number,
  fontName: string,
  mul: number,
  text: string,
  bold: boolean,
): string[] {
  const escaped = escapeTSPL(text);
  const cmd = `TEXT ${x},${y},"${fontName}",0,${mul},${mul},"${escaped}"`;
  if (!bold) return [cmd];
  // Simulate bold: print again shifted 1 dot to the right
  return [cmd, `TEXT ${x + 1},${y},"${fontName}",0,${mul},${mul},"${escaped}"`];
}

function buildOneLabelTSPL(
  item: TsplLabelItem,
  req: TsplPrintRequest,
  opts: TsplBuildOptions,
): string {
  const { widthMm, heightMm, lang, elements } = req;
  const gapMm = req.gapMm ?? 3;
  const dotsH = Math.round(heightMm * DOTS_PER_MM);
  const marginDots = Math.round(2 * DOTS_PER_MM); // 2mm margin

  const mul = fontSizeToMul(req.fontSize ?? 12);
  const bold = (req.fontWeight ?? 400) >= 600;

  const lines: string[] = [];
  lines.push(`SIZE ${widthMm} mm, ${heightMm} mm`);
  lines.push(`GAP ${gapMm} mm, 0 mm`);
  lines.push(`SPEED 4`);
  lines.push(`DENSITY 8`);
  lines.push(`DIRECTION 0,0`);
  lines.push(`CODEPAGE 1251`);
  lines.push(`CLS`);

  const name =
    lang === "uz"
      ? item.productNameUz || item.productNameRu
      : item.productNameRu || item.productNameUz;

  const rawUnit = item.unit || "шт";
  const unitDisplay =
    lang === "uz"
      ? rawUnit === "шт"
        ? "dona"
        : rawUnit === "кг"
          ? "kg"
          : rawUnit === "л"
            ? "l"
            : rawUnit === "м"
              ? "m"
              : rawUnit
      : rawUnit;
  const hasRealUnit = rawUnit !== "шт" && rawUnit !== "dona";

  const dotsW = Math.round(widthMm * DOTS_PER_MM);
  const font = pickFont(heightMm);
  const smallFont = { name: "2", h: 20, charW: 12 };
  const availableW = dotsW - 2 * marginDots;
  let y = marginDots;

  if (elements.customText1 && elements.customText1Value) {
    lines.push(
      `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(elements.customText1Value)}"`,
    );
    y += smallFont.h + 4;
  }

  if (elements.name && name) {
    // Account for multiplier when calculating how many chars fit per line
    const maxChars = Math.floor(availableW / (font.charW * mul));
    const nameLines = wrapText(name, maxChars);
    for (const l of nameLines) {
      lines.push(...textCmd(marginDots, y, font.name, mul, l, bold));
      y += font.h * mul + 2;
    }
    y += 2; // small gap after name block
  }

  const isWeighted =
    item.productType === "BULK_WEIGHTED" ||
    item.productType === "PREPACKAGED";

  if (elements.unit) {
    if (isWeighted) {
      const amountFormatted =
        item.amount % 1 === 0
          ? String(Math.round(item.amount))
          : item.amount.toFixed(3).replace(/\.?0+$/, "");
      const amountStr = `${amountFormatted} ${unitDisplay}`;
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(amountStr)}"`,
      );
      y += smallFont.h + 2;
    } else if (hasRealUnit) {
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(unitDisplay)}"`,
      );
      y += smallFont.h + 2;
    }
    y += 6; // gap after unit block
  }

  if (elements.price || (elements.articleId && item.articleId != null)) {
    const priceStr = elements.price
      ? isWeighted || hasRealUnit
        ? `${fmtNum(item.price)} so'm/${unitDisplay}`
        : `${fmtNum(item.price)} so'm`
      : null;

    if (elements.articleId && item.articleId != null) {
      const idStr = `KOD: ${item.articleId}`;
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(idStr)}"`,
      );
      y += smallFont.h + 2;
    }
    if (elements.pluCode && item.pluCode) {
      const pluStr = `PLU: ${item.pluCode}`;
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(pluStr)}"`,
      );
      y += smallFont.h + 2;
    }
    if (elements.productionDate && item.productionDate) {
      const d = new Date(item.productionDate);
      const dateStr = `${lang === 'uz' ? 'Ish.s.:' : 'Произв.:'} ${d.toLocaleDateString('ru-RU')}`;
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(dateStr)}"`,
      );
      y += smallFont.h + 2;
    }
    if (elements.expiryDate && item.expiryDate) {
      const d = new Date(item.expiryDate);
      const dateStr = `${lang === 'uz' ? 'Yaroq.:' : 'Годен до:'} ${d.toLocaleDateString('ru-RU')}`;
      lines.push(
        `TEXT ${marginDots},${y},"${smallFont.name}",0,1,1,"${escapeTSPL(dateStr)}"`,
      );
      y += smallFont.h + 2;
    }
    if (priceStr) {
      lines.push(...textCmd(marginDots, y, font.name, mul, priceStr, bold));
      y += font.h * mul + 2;
    }
  }

  if (elements.customText2 && elements.customText2Value) {
    const ct2y = dotsH - marginDots - smallFont.h;
    lines.push(
      `TEXT ${marginDots},${ct2y},"${smallFont.name}",0,1,1,"${escapeTSPL(elements.customText2Value)}"`,
    );
  }
  if (elements.barcode && item.barcode) {
    const fixedBarcode = item.barcode;
    // Use EAN13 type only when the check digit is valid per EAN-13 spec.
    // If invalid, fall back to Code 128 which prints the barcode exactly as-is.
    const barcodeType = isValidEan13(fixedBarcode) ? "EAN13" : "128";
    const reservedBottom =
      elements.customText2 && elements.customText2Value
        ? smallFont.h + 4
        : 0;
    const bottomY = dotsH - marginDots - reservedBottom;
    const remainingH = bottomY - y;
    const barcodeH = Math.max(24, Math.min(80, Math.round(remainingH * 0.8)));
    const barcodeY = bottomY - barcodeH - 24;

    lines.push(
      `BARCODE ${marginDots},${barcodeY},"${barcodeType}",${barcodeH},1,0,2,2,"${fixedBarcode}"`,
    );

    // if (isWeighted) {
    //   // Total price alongside the barcode on the right
    //   const total = Math.round(item.amount * item.price);
    //   const totalStr = `${fmtNum(total)} so'm`;
    //   const totalX = Math.round(dotsW * 0.2);
    //   const totalY = barcodeY + Math.round((barcodeH - font.h) / 2);
    //   lines.push(
    //     `TEXT ${totalX},${totalY},"${font.name}",0,1,1,"${escapeTSPL(totalStr)}"`,
    //   );
    // }
  }

  lines.push(
    opts.copies === "perLabel" ? `PRINT 1,${item.copies}` : `PRINT ${item.copies},1`,
  );

  return lines.join("\r\n");
}

export function buildFullTSPL(
  req: TsplPrintRequest,
  opts: TsplBuildOptions = { copies: "sets" },
): string {
  // Trailing \r\n ensures the printer flushes the last PRINT command immediately
  return (
    req.items.map((item) => buildOneLabelTSPL(item, req, opts)).join("\r\n") + "\r\n"
  );
}

export interface TsplTestLabel {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  port: string;
}

/** A self-describing label for the "Test print" button: port, size, a Cyrillic line, a barcode. */
export function buildTestLabelTSPL(t: TsplTestLabel): string {
  const margin = 2 * DOTS_PER_MM;
  const dotsH = Math.round(t.heightMm * DOTS_PER_MM);
  const barcodeH = Math.max(24, Math.min(60, dotsH - margin * 2 - 3 * 24 - 28));
  const lines = [
    `SIZE ${t.widthMm} mm, ${t.heightMm} mm`,
    `GAP ${t.gapMm} mm, 0 mm`,
    `SPEED 4`,
    `DENSITY 8`,
    `DIRECTION 0,0`,
    `CODEPAGE 1251`,
    `CLS`,
    `TEXT ${margin},${margin},"2",0,1,1,"posgro ${escapeTSPL(t.port)}"`,
    `TEXT ${margin},${margin + 24},"2",0,1,1,"${t.widthMm}x${t.heightMm} mm, gap ${t.gapMm}"`,
    `TEXT ${margin},${margin + 48},"2",0,1,1,"Тест O'zbek"`,
    `BARCODE ${margin},${margin + 72},"128",${barcodeH},1,0,2,2,"1234567890"`,
    `PRINT 1,1`,
  ];
  return lines.join("\r\n") + "\r\n";
}
