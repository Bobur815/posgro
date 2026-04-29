import { printRawHTML, loadReceiptSettings } from './thermal-printer';
import type { Smena, SmenaStats } from '../../shared/types/smena.types';

function fmt(amount: number): string {
  return Math.round(amount).toLocaleString('ru-RU');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function line(width: number): string {
  return '─'.repeat(width);
}

function center(text: string, width: number): string {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function row2(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  if (gap <= 0) return left + ' ' + right;
  return left + ' '.repeat(gap) + right;
}

export async function printZXReport(params: {
  smena: Smena;
  stats: SmenaStats;
  isXReport?: boolean;
}): Promise<boolean> {
  const { smena, stats, isXReport = false } = params;
  const settings = await loadReceiptSettings();
  const widthMm = Number(settings.receipt_width) || 80;
  // 80mm ≈ 42 chars, 58mm ≈ 32 chars
  const W = widthMm >= 70 ? 42 : 32;

  const expectedCash =
    smena.initialCash +
    stats.cashSalesAmount +
    stats.payInTotal -
    stats.payOutTotal -
    stats.returnAmount;

  const diff = smena.finalCash != null ? smena.finalCash - expectedCash : null;

  const reportTitle = isXReport
    ? 'X-HISOBOT / X-ОТЧЕТ'
    : 'Z-HISOBOT / Z-ОТЧЕТ';

  const reportLabel = isXReport
    ? `X-hisobot №${smena.zReportNumber}`
    : `Z-hisobot №${smena.zReportNumber}`;

  const hr = line(W);

  const rows: string[] = [
    center(settings.store_name || 'MAGAZIN', W),
    ...(settings.store_address ? [center(settings.store_address, W)] : []),
    ...(settings.store_phone || settings.store_stir
      ? [center(`Tel: ${settings.store_phone}  STIR: ${settings.store_stir}`, W)]
      : []),
    hr,
    center(reportTitle, W),
    center(reportLabel, W),
    center(`Terminal: ${smena.terminalId}`, W),
    hr,
    row2("Smena ochildi:", fmtDate(smena.openedAt), W),
    ...(!isXReport && smena.closedAt ? [row2("Smena yopildi:", fmtDate(smena.closedAt), W)] : []),
    row2("Kassir:", smena.cashierName, W),
    hr,
    row2("Boshlang'ich naqd:", fmt(smena.initialCash) + " so'm", W),
    row2("Kirim (Pay-in):", fmt(stats.payInTotal) + " so'm", W),
    row2("Chiqim (Pay-out):", fmt(stats.payOutTotal) + " so'm", W),
    hr,
    row2(`Naqd savdo (${stats.cashSalesCount} chek):`, fmt(stats.cashSalesAmount) + " so'm", W),
    row2(`Karta (${stats.cardSalesCount} chek):`, fmt(stats.cardSalesAmount) + " so'm", W),
    row2(`Qaytarish (${stats.returnCount} chek):`, fmt(stats.returnAmount) + " so'm", W),
    row2("Chegirmalar:", fmt(stats.totalDiscounts) + " so'm", W),
    row2("Jami daromad:", fmt(stats.totalRevenue) + " so'm", W),
    hr,
    ...(!isXReport
      ? [
          row2("Kutilayotgan naqd:", fmt(expectedCash) + " so'm", W),
          ...(smena.finalCash != null
            ? [
                row2("Haqiqiy naqd:", fmt(smena.finalCash) + " so'm", W),
                row2(
                  diff != null && diff >= 0 ? "Ortiqcha:" : "Kamomad:",
                  fmt(Math.abs(diff ?? 0)) + " so'm",
                  W,
                ),
              ]
            : []),
          hr,
          center("SMENA YOPILDI / СМЕНА ЗАКРЫТА", W),
        ]
      : [
          hr,
          center("TEKSHIRUV / ПРОВЕРКА", W),
        ]),
    hr,
    center(fmtDate(new Date().toISOString()), W),
  ];

  const bodyHtml = rows
    .map((r) => `<div class="line">${escHtml(r)}</div>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${widthMm}mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    padding: 2mm;
    background: #fff;
    color: #000;
  }
  .line {
    white-space: pre;
    line-height: 1.3;
    display: block;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  return printRawHTML(html, widthMm);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
