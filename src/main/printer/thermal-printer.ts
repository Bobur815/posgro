import { ipcMain, BrowserWindow } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';

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

async function printReceipt(saleId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  // Get sale with items
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  // Get store settings
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: ['store_name', 'store_address', 'store_phone', 'receipt_header', 'receipt_footer'],
      },
    },
  });

  const settingsMap = settings.reduce(
    (acc, s) => ({ ...acc, [s.key]: s.value }),
    {} as Record<string, string>
  );

  // Generate receipt content
  const receiptContent = generateReceiptContent(sale, settingsMap);

  // Print
  return printContent(receiptContent);
}

function generateReceiptContent(
  sale: {
    receiptNumber: string;
    createdAt: Date;
    cashierName: string;
    items: Array<{
      productName: string;
      quantity: unknown;
      unitPrice: unknown;
      subtotal: unknown;
    }>;
    totalAmount: unknown;
    discountAmount: unknown;
    finalAmount: unknown;
    paymentMethod: string;
  },
  settings: Record<string, string>
): string {
  const { width } = printerConfig;
  const lines: string[] = [];

  // Helper functions
  const center = (text: string) => {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  };

  const separator = () => '-'.repeat(width);

  const formatLine = (left: string, right: string) => {
    const space = width - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  };

  const formatCurrency = (amount: unknown) => {
    return Number(amount).toLocaleString('uz-UZ') + ' сум';
  };

  // Header
  if (settings.store_name) {
    lines.push(center(settings.store_name));
  }
  if (settings.store_address) {
    lines.push(center(settings.store_address));
  }
  if (settings.store_phone) {
    lines.push(center(settings.store_phone));
  }
  if (settings.receipt_header) {
    lines.push(center(settings.receipt_header));
  }

  lines.push(separator());

  // Receipt info
  lines.push(`Чек №: ${sale.receiptNumber}`);
  lines.push(`Дата: ${sale.createdAt.toLocaleString('ru-RU')}`);
  lines.push(`Кассир: ${sale.cashierName}`);

  lines.push(separator());

  // Items
  for (const item of sale.items) {
    lines.push(item.productName);
    lines.push(
      formatLine(
        `  ${Number(item.quantity)} x ${formatCurrency(item.unitPrice)}`,
        formatCurrency(item.subtotal)
      )
    );
  }

  lines.push(separator());

  // Totals
  lines.push(formatLine('Подитог:', formatCurrency(sale.totalAmount)));

  if (Number(sale.discountAmount) > 0) {
    lines.push(formatLine('Скидка:', `-${formatCurrency(sale.discountAmount)}`));
  }

  lines.push(formatLine('ИТОГО:', formatCurrency(sale.finalAmount)));
  lines.push('');
  lines.push(
    formatLine('Способ оплаты:', sale.paymentMethod === 'cash' ? 'Наличные' : 'Карта')
  );

  lines.push(separator());

  // Footer
  if (settings.receipt_footer) {
    lines.push(center(settings.receipt_footer));
  } else {
    lines.push(center('Спасибо за покупку!'));
  }

  lines.push('');
  lines.push('');
  lines.push(''); // Feed for cutting

  return lines.join('\n');
}

async function printContent(content: string): Promise<boolean> {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    throw new Error('No window available for printing');
  }

  if (!printerConfig.name) {
    // No printer configured, return success anyway (for testing)
    console.log('No printer configured. Receipt content:');
    console.log(content);
    return true;
  }

  return new Promise((resolve, reject) => {
    // Create a hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      width: 300,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load the receipt content
    printWindow.loadURL(
      `data:text/html;charset=utf-8,<html><head><style>
        body {
          font-family: monospace;
          font-size: 12px;
          margin: 0;
          padding: 5px;
          white-space: pre;
        }
      </style></head><body>${content.replace(/\n/g, '<br>')}</body></html>`
    );

    printWindow.webContents.on('did-finish-load', () => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: printerConfig.name,
        },
        (success, errorType) => {
          printWindow.close();
          if (success) {
            resolve(true);
          } else {
            reject(new Error(`Print failed: ${errorType}`));
          }
        }
      );
    });
  });
}

async function testPrint(): Promise<boolean> {
  const testContent = [
    '================================',
    '        ТЕСТОВАЯ ПЕЧАТЬ         ',
    '================================',
    '',
    'Если вы видите этот текст,',
    'принтер работает корректно.',
    '',
    `Дата: ${new Date().toLocaleString('ru-RU')}`,
    '',
    '================================',
    '',
    '',
    '',
  ].join('\n');

  return printContent(testContent);
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
