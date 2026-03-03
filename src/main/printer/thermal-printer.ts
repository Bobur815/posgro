import { ipcMain, BrowserWindow } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { buildReceiptHTML, buildTestReceiptHTML } from '../../shared/receipt-html';
import type { ReceiptData, ReceiptSettings } from '../../shared/receipt-html';

interface PrinterConfig {
  name: string;
  type: 'thermal' | 'standard';
  width: number; // characters per line
}

let printerConfig: PrinterConfig = {
  name: process.env.PRINTER_NAME || '',
  type: 'thermal',
  width: 42, // Standard thermal printer width
};

export interface WeightedLabelData {
  productNameRu: string;
  productNameUz: string;
  internalCode: string;
  barcode: string;
  weightKg: number;
  pricePerKg: number;
  totalPrice: number;
  date: string;
}

export function setupPrinterHandlers(): void {
  ipcMain.handle('printer:printReceipt', async (_event, saleId: string) => {
    return printReceipt(saleId);
  });

  ipcMain.handle('printer:testPrint', async () => {
    return testPrint();
  });

  ipcMain.handle('printer:getAvailable', async () => {
    return getAvailablePrinters();
  });

  ipcMain.handle('printer:printPriceTags', async (_event, html: string, widthMm: number, heightMm: number) => {
    return printPriceTags(html, widthMm, heightMm);
  });

  ipcMain.handle('printer:printWeightedLabel', async (_event, data: WeightedLabelData) => {
    return printWeightedLabel(data);
  });
}

async function getAvailablePrinters(): Promise<string[]> {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    return [];
  }

  const printers = await window.webContents.getPrintersAsync();
  return printers.map((p) => p.name);
}

async function loadReceiptSettings(): Promise<ReceiptSettings> {
  const prisma = getPrismaClient();
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'store_name',
          'store_address',
          'store_phone',
          'receipt_header',
          'receipt_footer',
          'receipt_width',
          'receipt_language',
        ],
      },
    },
  });

  const map = rows.reduce(
    (acc: Record<string, string>, s: { key: string; value: string }) => ({ ...acc, [s.key]: s.value }),
    {} as Record<string, string>
  );

  return {
    store_name: map.store_name || '',
    store_address: map.store_address || '',
    store_phone: map.store_phone || '',
    receipt_header: map.receipt_header || '',
    receipt_footer: map.receipt_footer || '',
    receipt_width: (map.receipt_width as '80' | '58') || '80',
    receipt_language: (map.receipt_language as 'ru' | 'uz') || 'ru',
  };
}

async function printReceipt(saleId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  const settings = await loadReceiptSettings();

  const receiptData: ReceiptData = {
    receiptNumber: sale.receiptNumber,
    createdAt: sale.createdAt.toISOString(),
    cashierName: sale.cashierName,
    items: sale.items.map((item: { productName: string; quantity: unknown; unitPrice: unknown; subtotal: unknown }) => ({
      productName: item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
    totalAmount: Number(sale.totalAmount),
    discountAmount: Number(sale.discountAmount),
    finalAmount: Number(sale.finalAmount),
    paymentMethod: sale.paymentMethod,
  };

  const html = buildReceiptHTML(receiptData, settings);
  const widthMm = Number(settings.receipt_width) || 80;

  return printHTML(html, widthMm);
}

async function printHTML(html: string, widthMm: number): Promise<boolean> {
  if (!printerConfig.name) {
    console.log('No printer configured. Receipt HTML generated.');
    return true;
  }

  const widthMicrons = widthMm * 1000;

  // 1mm ≈ 3.78px at 96 DPI; add small buffer to avoid clipping
  const printWindow = new BrowserWindow({
    show: false,
    width: Math.round(widthMm * 3.78) + 20,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );

    // Small delay for rendering
    await new Promise((resolve) => setTimeout(resolve, 200));

    return await new Promise<boolean>((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerConfig.name,
          pageSize: {
            width: widthMicrons,
            height: 1000000, // auto-length roll paper
          },
          margins: {
            marginType: 'custom',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        } as Electron.WebContentsPrintOptions,
        (success, errorType) => {
          if (success) {
            resolve(true);
          } else {
            reject(new Error(`Print failed: ${errorType}`));
          }
        }
      );
    });
  } finally {
    printWindow.destroy();
  }
}

async function testPrint(): Promise<boolean> {
  const settings = await loadReceiptSettings();
  const html = buildTestReceiptHTML(settings);
  const widthMm = Number(settings.receipt_width) || 80;
  return printHTML(html, widthMm);
}

async function printPriceTags(html: string, widthMm: number, heightMm: number): Promise<boolean> {
  // Load printer name from settings (same setting as weighted labels)
  const prisma = getPrismaClient();
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['label_printer_name'] } },
  });
  const map = rows.reduce(
    (acc: Record<string, string>, s: { key: string; value: string }) => ({ ...acc, [s.key]: s.value }),
    {} as Record<string, string>
  );
  const printerName = map.label_printer_name || printerConfig.name;

  // Always use portrait: swap page dimensions when template is landscape (widthMm > heightMm)
  const isLandscape = widthMm > heightMm;
  const pageSizeWidth  = (isLandscape ? heightMm : widthMm) * 1000;
  const pageSizeHeight = (isLandscape ? widthMm  : heightMm) * 1000;

  const maxSide = Math.max(widthMm, heightMm);

  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: Math.round(maxSide * 3.78) + 20,
      height: Math.round(maxSide * 3.78) + 20,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        printWindow.webContents.print(
          {
            silent: !!printerName,
            printBackground: true,
            ...(printerName && { deviceName: printerName }),
            pageSize: {
              width: pageSizeWidth,
              height: pageSizeHeight,
            },
            margins: {
              marginType: 'none',
            },
          } as Electron.WebContentsPrintOptions,
          (success, errorType) => {
            printWindow.destroy();
            if (success) {
              resolve(true);
            } else {
              reject(new Error(`Price tag print failed: ${errorType}`));
            }
          }
        );
      }, 200);
    });
  });
}

async function printWeightedLabel(data: WeightedLabelData): Promise<boolean> {
  const prisma = getPrismaClient();
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['label_printer_name', 'label_width_mm'] } },
  });
  const map = rows.reduce(
    (acc: Record<string, string>, s: { key: string; value: string }) => ({ ...acc, [s.key]: s.value }),
    {} as Record<string, string>,
  );

  const labelPrinterName = map.label_printer_name || printerConfig.name;
  const widthMm = parseInt(map.label_width_mm || '58', 10) || 58;
  const heightMm = 40;

  const formattedWeight = data.weightKg.toFixed(3);
  const formattedPrice = Math.round(data.pricePerKg).toLocaleString('ru-RU');
  const formattedTotal = Math.round(data.totalPrice).toLocaleString('ru-RU');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    font-family: Arial, sans-serif;
    padding: 2mm;
    overflow: hidden;
  }
  .label { display: flex; flex-direction: column; height: 100%; }
  .name { font-size: 9pt; font-weight: bold; line-height: 1.1; margin-bottom: 1mm; }
  .row { display: flex; justify-content: space-between; font-size: 8pt; margin-bottom: 0.5mm; }
  .total { font-size: 14pt; font-weight: bold; text-align: center; margin: 1mm 0; }
  .barcode-text { font-size: 6pt; text-align: center; font-family: monospace; letter-spacing: 1px; }
  .barcode-bars { text-align: center; font-size: 28pt; font-family: 'Libre Barcode 128', monospace; line-height: 1; }
  .date { font-size: 6pt; color: #666; text-align: right; margin-top: auto; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1mm 0; }
</style>
</head>
<body>
<div class="label">
  <div class="name">${data.productNameRu}</div>
  <hr/>
  <div class="row">
    <span>Вес: <b>${formattedWeight} кг</b></span>
    <span>Цена/кг: <b>${formattedPrice}</b></span>
  </div>
  <div class="total">${formattedTotal} сум</div>
  <hr/>
  <div class="barcode-text">${data.barcode}</div>
  <div class="date">${data.date} | ${data.internalCode}</div>
</div>
</body>
</html>`;

  // Use label-specific printer if configured, otherwise fall back to default
  const origName = printerConfig.name;
  if (labelPrinterName && labelPrinterName !== origName) {
    printerConfig = { ...printerConfig, name: labelPrinterName };
    const result = await printHTML(html, widthMm);
    printerConfig = { ...printerConfig, name: origName };
    return result;
  }

  return printHTML(html, widthMm);
}

export function setPrinterConfig(config: Partial<PrinterConfig>): void {
  printerConfig = { ...printerConfig, ...config };
}

export function getPrinterConfig(): PrinterConfig {
  return { ...printerConfig };
}
