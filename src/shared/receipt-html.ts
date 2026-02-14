/**
 * Shared receipt HTML builder — used by both the frontend preview and backend printing.
 * Pure function, no Node/Electron dependencies.
 */

export interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReceiptData {
  receiptNumber: string;
  createdAt: string; // ISO string or formatted
  cashierName: string;
  items: ReceiptItem[];
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  paymentMethod: string;
}

export interface ReceiptSettings {
  receipt_width: '80' | '58';
  receipt_language: 'ru' | 'uz';
  receipt_header: string;
  receipt_footer: string;
  store_name: string;
  store_address: string;
  store_phone: string;
}

const labels: Record<string, Record<string, string>> = {
  ru: {
    receipt: 'Чек №',
    date: 'Дата',
    time: 'Время',
    cashier: 'Кассир',
    positions: 'Позиций',
    subtotal: 'Подитог',
    discount: 'Скидка',
    total: 'ИТОГО',
    payment: 'Оплата',
    cash: 'Наличные',
    card: 'Карта',
    mixed: 'Смешанная',
    currency: 'сум',
    thankYou: 'Спасибо за покупку!',
    testTitle: 'ТЕСТОВАЯ ПЕЧАТЬ',
    testMessage: 'Если вы видите этот текст, принтер работает корректно.',
  },
  uz: {
    receipt: 'Chek №',
    date: 'Sana',
    time: 'Vaqt',
    cashier: 'Kassir',
    positions: 'Pozitsiyalar',
    subtotal: 'Oraliq jami',
    discount: 'Chegirma',
    total: 'JAMI',
    payment: "To'lov",
    cash: 'Naqd',
    card: 'Karta',
    mixed: 'Aralash',
    currency: "so'm",
    thankYou: 'Xaridingiz uchun rahmat!',
    testTitle: 'TEST CHOP ETISH',
    testMessage: "Agar siz bu matnni ko'rsangiz, printer to'g'ri ishlayapti.",
  },
};

function fmt(amount: number, currency: string): string {
  return amount.toLocaleString('ru-RU') + ' ' + currency;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseStyles(widthMm: number): string {
  return `
    @page { size: ${widthMm}mm auto; margin: 0; padding: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { margin: 0 !important; padding: 0 !important; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${widthMm === 58 ? '11px' : '13px'};
      width: ${widthMm}mm;
      max-width: 100%;
      padding: 2mm 11mm 2mm 0 !important;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    .brand { font-size: ${widthMm === 58 ? '15px' : '17px'}; font-weight: bold; margin-bottom: 2px; }
    .sub { font-size: ${widthMm === 58 ? '11px' : '12px'}; font-weight: 500; color: #000; }
    hr {
      border: none;
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    hr.double {
      border-top: 2px solid #000;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1px 6px;
    }
    .meta-grid .label { font-weight: 700; white-space: nowrap; }
    .meta-grid .value { text-align: right; }
    .item-row { margin: 3px 0; }
    .item-name { font-weight: 700; }
    .item-detail {
      display: flex;
      justify-content: space-between;
      padding-left: 10px;
      font-size: ${widthMm === 58 ? '10px' : '12px'};
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 2px 0;
    }
    .total-row .dots {
      flex: 1;
      overflow: hidden;
      margin: 0 3px;
      min-width: 8px;
      color: #000;
      font-size: 10px;
      line-height: 1;
      letter-spacing: 1px;
    }
    .total-row.grand {
      font-size: ${widthMm === 58 ? '15px' : '17px'};
      font-weight: 700;
      margin: 4px 0;
    }
    .footer { margin-top: 6px; font-size: ${widthMm === 58 ? '11px' : '12px'}; color: #000; }
    .positions { font-size: ${widthMm === 58 ? '11px' : '12px'}; color: #000; }
  `;
}

export function buildReceiptHTML(sale: ReceiptData, settings: ReceiptSettings): string {
  const lang = settings.receipt_language || 'ru';
  const widthMm = Number(settings.receipt_width) || 80;
  const l = labels[lang] || labels.ru;
  const cur = l.currency;

  const dateObj = new Date(sale.createdAt);
  const dateStr = dateObj.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ');
  const timeStr = dateObj.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const paymentLabel =
    sale.paymentMethod === 'cash'
      ? l.cash
      : sale.paymentMethod === 'card'
        ? l.card
        : l.mixed;

  let itemsHTML = '';
  sale.items.forEach((item, idx) => {
    itemsHTML += `
      <div class="item-row">
        <div class="item-name">${idx + 1}. ${escapeHtml(item.productName)}</div>
        <div class="item-detail">
          <span>${item.quantity} × ${fmt(item.unitPrice, cur)}</span>
          <span>${fmt(item.subtotal, cur)}</span>
        </div>
      </div>`;
  });

  const discountHTML =
    sale.discountAmount > 0
      ? `<div class="total-row">
          <span>${l.discount}</span><span class="dots">.....................................................</span>
          <span>-${fmt(sale.discountAmount, cur)}</span>
        </div>`
      : '';

  const footerText = settings.receipt_footer || l.thankYou;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles(widthMm)}</style></head>
<body>
  <div class="center">
    ${settings.store_name ? `<div class="brand">${escapeHtml(settings.store_name)}</div>` : ''}
    ${settings.store_address ? `<div class="sub">${escapeHtml(settings.store_address)}</div>` : ''}
    ${settings.store_phone ? `<div class="sub">${escapeHtml(settings.store_phone)}</div>` : ''}
    ${settings.receipt_header ? `<div class="sub">${escapeHtml(settings.receipt_header)}</div>` : ''}
  </div>

  <hr>

  <div class="meta-grid">
    <span class="label">${l.receipt}</span><span class="value">${escapeHtml(sale.receiptNumber)}</span>
    <span class="label">${l.date}</span><span class="value">${dateStr} ${timeStr}</span>
    <span class="label">${l.cashier}</span><span class="value">${escapeHtml(sale.cashierName)}</span>
  </div>

  <hr class="double">

  ${itemsHTML}

  <hr>

  <div class="positions">${l.positions}: ${sale.items.length}</div>

  <hr>

  <div class="total-row">
    <span>${l.subtotal}</span><span class="dots">.....................................................</span>
    <span>${fmt(sale.totalAmount, cur)}</span>
  </div>
  ${discountHTML}
  <div class="total-row grand">
    <span>${l.total}</span><span class="dots">.....................................................</span>
    <span>${fmt(sale.finalAmount, cur)}</span>
  </div>
  <div class="total-row">
    <span>${l.payment}</span><span class="dots">.....................................................</span>
    <span>${paymentLabel}</span>
  </div>

  <hr>

  <div class="center footer">${escapeHtml(footerText)}</div>
</body></html>`;
}

export function buildTestReceiptHTML(settings: ReceiptSettings): string {
  const lang = settings.receipt_language || 'ru';
  const widthMm = Number(settings.receipt_width) || 80;
  const l = labels[lang] || labels.ru;

  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ');
  const timeStr = now.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${baseStyles(widthMm)}</style></head>
<body>
  <div class="center">
    <hr class="double">
    <div class="brand">${l.testTitle}</div>
    <hr class="double">
    <div style="margin: 8px 0;">${l.testMessage}</div>
    <div class="sub">${l.date}: ${dateStr} ${timeStr}</div>
    ${settings.store_name ? `<div class="sub" style="margin-top: 4px;">${escapeHtml(settings.store_name)}</div>` : ''}
    <hr class="double">
  </div>
</body></html>`;
}

/** Build a sample receipt for the live preview in settings */
export function buildSampleReceiptHTML(settings: ReceiptSettings): string {
  const lang = settings.receipt_language || 'ru';
  const sampleItems: ReceiptItem[] =
    lang === 'ru'
      ? [
          { productName: 'Хлеб белый', quantity: 2, unitPrice: 5000, subtotal: 10000 },
          { productName: 'Молоко 1л', quantity: 1, unitPrice: 12000, subtotal: 12000 },
          { productName: 'Сахар 1кг', quantity: 1, unitPrice: 14000, subtotal: 14000 },
        ]
      : [
          { productName: 'Oq non', quantity: 2, unitPrice: 5000, subtotal: 10000 },
          { productName: 'Sut 1l', quantity: 1, unitPrice: 12000, subtotal: 12000 },
          { productName: 'Shakar 1kg', quantity: 1, unitPrice: 14000, subtotal: 14000 },
        ];

  const html = buildReceiptHTML(
    {
      receiptNumber: '000123',
      createdAt: new Date().toISOString(),
      cashierName: lang === 'ru' ? 'Иванов А.' : 'Aliyev A.',
      items: sampleItems,
      totalAmount: 36000,
      discountAmount: 0,
      finalAmount: 36000,
      paymentMethod: 'cash',
    },
    settings
  );

  // Override print-specific padding for accurate preview display:
  // Print uses 11mm right padding to compensate for ~5mm hardware left margin.
  // Preview should show balanced padding instead.
  return html.replace(
    '</style>',
    ' body { padding: 2mm 2mm 2mm 3mm !important; }\n</style>'
  );
}
