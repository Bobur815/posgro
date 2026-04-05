import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getPrismaClient } from "../database/sqlite-client";

/** Recalculates and fixes the EAN-13 check digit if the barcode is 13 digits. */
function fixEan13CheckDigit(barcode: string): string {
  if (!/^\d{13}$/.test(barcode)) return barcode;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return barcode.slice(0, 12) + check;
}

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
}

export interface TsplPrintRequest {
  items: TsplLabelItem[];
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  lang: string;
  elements: {
    name: boolean;
    price: boolean;
    unit: boolean;
    barcode: boolean;
    articleId: boolean;
    customText1: boolean;
    customText2: boolean;
    customText1Value?: string;
    customText2Value?: string;
  };
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

/** Convert a UTF-16 JS string to a Windows-1251 Buffer (Cyrillic code page). */
function toCP1251(str: string): Buffer {
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
    } else if (c === 0x02bb || c === 0x2018 || c === 0x2019) {
      out[i] = 0x27; // Uzbek modifier letter ʻ → apostrophe
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

function buildOneLabelTSPL(item: TsplLabelItem, req: TsplPrintRequest): string {
  const { widthMm, heightMm, lang, elements } = req;
  const gapMm = req.gapMm ?? 3;
  const dotsH = Math.round(heightMm * DOTS_PER_MM);
  const marginDots = Math.round(2 * DOTS_PER_MM); // 2mm margin

  const lines: string[] = [];
  lines.push(`SIZE ${widthMm} mm, ${heightMm} mm`);
  lines.push(`GAP ${gapMm} mm, 0 mm`);
  lines.push(`SPEED 4`);
  lines.push(`DENSITY 8`);
  lines.push(`DIRECTION 0,0`);
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
    const maxChars = Math.floor(availableW / font.charW);
    const nameLines = wrapText(name, maxChars);
    for (const l of nameLines) {
      lines.push(
        `TEXT ${marginDots},${y},"${font.name}",0,1,1,"${escapeTSPL(l)}"`,
      );
      y += font.h + 2;
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
    if (priceStr) {
      lines.push(
        `TEXT ${marginDots},${y},"${font.name}",0,1,1,"${escapeTSPL(priceStr)}"`,
      );
      y += font.h + 2;
    }
  }

  if (elements.customText2 && elements.customText2Value) {
    const ct2y = dotsH - marginDots - smallFont.h;
    lines.push(
      `TEXT ${marginDots},${ct2y},"${smallFont.name}",0,1,1,"${escapeTSPL(elements.customText2Value)}"`,
    );
  }

  if (elements.barcode && item.barcode) {
    const fixedBarcode = fixEan13CheckDigit(item.barcode);
    const barcodeType = /^\d{13}$/.test(fixedBarcode) ? "EAN13" : "128";
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

    if (isWeighted) {
      // Total price alongside the barcode on the right
      const total = Math.round(item.amount * item.price);
      const totalStr = `${fmtNum(total)} so'm`;
      const totalX = Math.round(dotsW * 0.45);
      const totalY = barcodeY + Math.round((barcodeH - font.h) / 2);
      lines.push(
        `TEXT ${totalX},${totalY},"${font.name}",0,1,1,"${escapeTSPL(totalStr)}"`,
      );
    }
  }

  lines.push(`PRINT ${item.copies},1`);

  return lines.join("\r\n");
}

function buildFullTSPL(req: TsplPrintRequest): string {
  // Trailing \r\n ensures the printer flushes the last PRINT command immediately
  return (
    req.items.map((item) => buildOneLabelTSPL(item, req)).join("\r\n") + "\r\n"
  );
}

function sendRawToPrinter(printerName: string, data: Buffer): void {
  const stamp = Date.now();
  const tmpData = path.join(os.tmpdir(), `prtag_${stamp}.prn`);
  const tmpScript = path.join(os.tmpdir(), `rawprint_${stamp}.ps1`);

  fs.writeFileSync(tmpData, data);

  // Escape paths for PowerShell single-quoted strings
  const safePrinter = printerName.replace(/'/g, "''");
  const safeFile = tmpData.replace(/\\/g, "\\\\").replace(/'/g, "''");

  const ps = `
$printerName = '${safePrinter}'
$filePath = '${safeFile}'
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA")]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr p);
  [DllImport("winspool.Drv")]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA")]
  public static extern int StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA d);
  [DllImport("winspool.Drv")]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv")]
  public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    public string pDocName = "PriceTag";
    public string pOutputFile = null;
    public string pDataType = "RAW";
  }
}
"@
$handle = [IntPtr]::Zero
[RawPrint]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero) | Out-Null
$docInfo = New-Object RawPrint+DOCINFOA
[RawPrint]::StartDocPrinter($handle, 1, $docInfo) | Out-Null
[RawPrint]::StartPagePrinter($handle) | Out-Null
$gcHandle = [Runtime.InteropServices.GCHandle]::Alloc($bytes, 'Pinned')
$written = 0
[RawPrint]::WritePrinter($handle, $gcHandle.AddrOfPinnedObject(), $bytes.Length, [ref]$written) | Out-Null
$gcHandle.Free()
[RawPrint]::EndPagePrinter($handle) | Out-Null
[RawPrint]::EndDocPrinter($handle) | Out-Null
[RawPrint]::ClosePrinter($handle) | Out-Null
`;

  fs.writeFileSync(tmpScript, ps, "utf8");

  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpScript}"`, {
      shell: "cmd.exe",
      stdio: "pipe",
    });
  } finally {
    try {
      fs.unlinkSync(tmpScript);
    } catch {}
    try {
      fs.unlinkSync(tmpData);
    } catch {}
  }
}

export async function printPriceTagsTSPL(req: TsplPrintRequest): Promise<void> {
  const prisma = getPrismaClient();
  const settingRows = await prisma.systemSetting.findMany({
    where: { key: { in: ["label_printer_name", "printer_name"] } },
  });
  const settingsMap = Object.fromEntries(
    settingRows.map((r: { key: string; value: string }) => [r.key, r.value]),
  );
  const printerName =
    settingsMap["label_printer_name"] ||
    settingsMap["printer_name"] ||
    process.env.PRINTER_NAME ||
    "";

  if (!printerName) {
    throw new Error(
      "No printer configured. Set a label printer in Price Tags settings.",
    );
  }

  const tspl = buildFullTSPL(req);
  const buf = toCP1251(tspl);
  sendRawToPrinter(printerName, buf);
}
