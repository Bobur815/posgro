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
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    throw new Error('No window available for printing');
  }

  // Convert mm to microns (1mm = 1000 microns)
  const widthMicrons = widthMm * 1000;
  const heightMicrons = heightMm * 1000;

  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: Math.round(widthMm * 3.78), // approximate px
      height: Math.round(heightMm * 3.78),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize: {
            width: widthMicrons,
            height: heightMicrons,
          },
          margins: {
            marginType: 'none',
          },
        } as Electron.WebContentsPrintOptions,
        (success, errorType) => {
          printWindow.close();
          if (success) {
            resolve(true);
          } else {
            reject(new Error(`Price tag print failed: ${errorType}`));
          }
        }
      );
    });
  });
}

export function setPrinterConfig(config: Partial<PrinterConfig>): void {
  printerConfig = { ...printerConfig, ...config };
}

export function getPrinterConfig(): PrinterConfig {
  return { ...printerConfig };
}
