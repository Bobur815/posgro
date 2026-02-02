// Receipt templates for different printer types

export interface ReceiptData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  receiptNumber: string;
  date: Date;
  cashierName: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  change?: number;
  header?: string;
  footer?: string;
}

export interface TemplateOptions {
  width: number;
  encoding: 'utf8' | 'cp866';
  language: 'ru' | 'uz';
}

const defaultOptions: TemplateOptions = {
  width: 42,
  encoding: 'utf8',
  language: 'ru',
};

// Translations
const translations = {
  ru: {
    receipt: 'ЧЕК',
    date: 'Дата',
    cashier: 'Кассир',
    subtotal: 'Подитог',
    discount: 'Скидка',
    total: 'ИТОГО',
    payment: 'Оплата',
    cash: 'Наличные',
    card: 'Карта',
    change: 'Сдача',
    thankYou: 'Спасибо за покупку!',
    items: 'Товары',
  },
  uz: {
    receipt: 'CHEK',
    date: 'Sana',
    cashier: 'Kassir',
    subtotal: 'Jami',
    discount: 'Chegirma',
    total: 'JAMI',
    payment: "To'lov",
    cash: 'Naqd',
    card: 'Karta',
    change: 'Qaytim',
    thankYou: "Xaridingiz uchun rahmat!",
    items: 'Mahsulotlar',
  },
};

export function generateTextReceipt(
  data: ReceiptData,
  options: Partial<TemplateOptions> = {}
): string {
  const opts = { ...defaultOptions, ...options };
  const t = translations[opts.language];
  const lines: string[] = [];

  // Helper functions
  const center = (text: string) => {
    const padding = Math.max(0, Math.floor((opts.width - text.length) / 2));
    return ' '.repeat(padding) + text;
  };

  const separator = (char = '-') => char.repeat(opts.width);

  const formatLine = (left: string, right: string) => {
    const space = opts.width - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  // Store header
  if (data.storeName) {
    lines.push(center(data.storeName));
  }
  if (data.storeAddress) {
    lines.push(center(data.storeAddress));
  }
  if (data.storePhone) {
    lines.push(center(data.storePhone));
  }
  if (data.header) {
    lines.push(center(data.header));
  }

  lines.push(separator('='));

  // Receipt info
  lines.push(center(`${t.receipt} № ${data.receiptNumber}`));
  lines.push(`${t.date}: ${data.date.toLocaleString(opts.language === 'ru' ? 'ru-RU' : 'uz-UZ')}`);
  lines.push(`${t.cashier}: ${data.cashierName}`);

  lines.push(separator());

  // Items
  for (const item of data.items) {
    // Product name (may need truncation)
    const name = item.name.length > opts.width ? item.name.substring(0, opts.width - 3) + '...' : item.name;
    lines.push(name);

    // Quantity x Price = Subtotal
    const qty = `  ${item.quantity} x ${formatCurrency(item.unitPrice)}`;
    lines.push(formatLine(qty, formatCurrency(item.subtotal)));
  }

  lines.push(separator());

  // Totals
  lines.push(formatLine(t.subtotal + ':', formatCurrency(data.subtotal)));

  if (data.discount > 0) {
    lines.push(formatLine(t.discount + ':', `-${formatCurrency(data.discount)}`));
  }

  lines.push(separator('='));
  lines.push(formatLine(t.total + ':', formatCurrency(data.total)));
  lines.push('');

  // Payment
  const paymentType = data.paymentMethod === 'cash' ? t.cash : t.card;
  lines.push(formatLine(t.payment + ':', paymentType));

  if (data.paymentMethod === 'cash' && data.change !== undefined && data.change > 0) {
    lines.push(formatLine(t.change + ':', formatCurrency(data.change)));
  }

  lines.push(separator());

  // Footer
  lines.push(center(data.footer || t.thankYou));

  // Paper feed for cutting
  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

export function generateHtmlReceipt(
  data: ReceiptData,
  options: Partial<TemplateOptions> = {}
): string {
  const opts = { ...defaultOptions, ...options };
  const t = translations[opts.language];

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' сум';
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 280px;
      margin: 0;
      padding: 10px;
    }
    .center { text-align: center; }
    .separator { border-top: 1px dashed #000; margin: 8px 0; }
    .separator-bold { border-top: 2px solid #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; }
    .item-name { margin-bottom: 2px; }
    .item-detail { padding-left: 10px; color: #333; }
    .total { font-weight: bold; font-size: 14px; }
    .footer { margin-top: 15px; }
  </style>
</head>
<body>
  <div class="center">
    ${data.storeName ? `<strong>${data.storeName}</strong><br>` : ''}
    ${data.storeAddress ? `${data.storeAddress}<br>` : ''}
    ${data.storePhone ? `${data.storePhone}<br>` : ''}
    ${data.header ? `${data.header}` : ''}
  </div>

  <div class="separator-bold"></div>

  <div class="center"><strong>${t.receipt} № ${data.receiptNumber}</strong></div>
  <div>${t.date}: ${data.date.toLocaleString(opts.language === 'ru' ? 'ru-RU' : 'uz-UZ')}</div>
  <div>${t.cashier}: ${data.cashierName}</div>

  <div class="separator"></div>

  ${data.items
    .map(
      (item) => `
    <div class="item-name">${item.name}</div>
    <div class="row item-detail">
      <span>${item.quantity} x ${formatCurrency(item.unitPrice)}</span>
      <span>${formatCurrency(item.subtotal)}</span>
    </div>
  `
    )
    .join('')}

  <div class="separator"></div>

  <div class="row">
    <span>${t.subtotal}:</span>
    <span>${formatCurrency(data.subtotal)}</span>
  </div>

  ${
    data.discount > 0
      ? `
  <div class="row">
    <span>${t.discount}:</span>
    <span>-${formatCurrency(data.discount)}</span>
  </div>
  `
      : ''
  }

  <div class="separator-bold"></div>

  <div class="row total">
    <span>${t.total}:</span>
    <span>${formatCurrency(data.total)}</span>
  </div>

  <br>

  <div class="row">
    <span>${t.payment}:</span>
    <span>${data.paymentMethod === 'cash' ? t.cash : t.card}</span>
  </div>

  ${
    data.paymentMethod === 'cash' && data.change !== undefined && data.change > 0
      ? `
  <div class="row">
    <span>${t.change}:</span>
    <span>${formatCurrency(data.change)}</span>
  </div>
  `
      : ''
  }

  <div class="separator"></div>

  <div class="center footer">${data.footer || t.thankYou}</div>
</body>
</html>
  `;
}
