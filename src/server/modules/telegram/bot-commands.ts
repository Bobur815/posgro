// Pure message-formatting helpers for the Telegram bot.
// No imports, no side effects — only takes data, returns strings.

/** Bilingual string: Uzbek first, Russian second. */
export function t(uz: string, ru: string): string {
  return `${uz}\n―――\n${ru}`;
}

function num(n: number): string {
  return n.toLocaleString('ru-RU');
}

function date(d: Date | string): string {
  return new Date(d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Auth / Onboarding ────────────────────────────────────────────────────────

export function msgAskPhone(): string {
  return t(
    'Xush kelibsiz! 👋\n\nTizimga kirish uchun telefon raqamingizni ulashing.',
    'Добро пожаловать! 👋\n\nПожалуйста, поделитесь своим номером телефона для входа.',
  );
}

export function msgUnknownPhone(): string {
  return t(
    '📢 Raqamingiz tizimda topilmadi.\n\nYangiliklar uchun kuzatib boring!',
    '📢 Ваш номер не зарегистрирован в системе.\n\nСледите за новостями!',
  );
}

// ─── Menus ────────────────────────────────────────────────────────────────────

export function msgAdminMenu(name: string): string {
  return t(
    `Xush kelibsiz, ${name}! 👨‍💼\n\nAmalni tanlang:`,
    `Добро пожаловать, ${name}! 👨‍💼\n\nВыберите действие:`,
  );
}

export function msgSupplierMenu(name: string): string {
  return t(
    `Xush kelibsiz, ${name}! 🤝\n\nAmalni tanlang:`,
    `Добро пожаловать, ${name}! 🤝\n\nВыберите действие:`,
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function msgTodayAnalytics(data: {
  date: string;
  totalSales: number;
  totalRevenue: number;
  averageTransaction: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}): string {
  const top3 = data.topProducts.slice(0, 3);
  const uz =
    `📊 *Bugungi tahlil — ${data.date}*\n\n` +
    `Sotuvlar: *${data.totalSales}*\n` +
    `Tushum: *${num(Math.round(data.totalRevenue))} so'm*\n` +
    `O'rtacha chek: *${num(Math.round(data.averageTransaction))} so'm*` +
    (top3.length
      ? '\n\n🏆 *Top tovarlar:*\n' +
        top3.map((p, i) => `${i + 1}. ${p.name} — ${num(Math.round(p.revenue))} so'm`).join('\n')
      : '');
  const ru =
    `📊 *Аналитика за ${data.date}*\n\n` +
    `Продаж: *${data.totalSales}*\n` +
    `Выручка: *${num(Math.round(data.totalRevenue))} сум*\n` +
    `Средний чек: *${num(Math.round(data.averageTransaction))} сум*` +
    (top3.length
      ? '\n\n🏆 *Топ товары:*\n' +
        top3.map((p, i) => `${i + 1}. ${p.name} — ${num(Math.round(p.revenue))} сум`).join('\n')
      : '');
  return t(uz, ru);
}

export function msgStockOverview(
  products: Array<{ nameRu: string; stock: number | string; unit: string }>,
): string {
  if (products.length === 0)
    return t('📦 Tovarlar topilmadi.', '📦 Товаров не найдено.');
  const lines = products
    .slice(0, 20)
    .map((p) => `• ${p.nameRu}: *${Number(p.stock)} ${p.unit}*`)
    .join('\n');
  return t(
    `📦 *Ombor qoldiqlari:*\n\n${lines}`,
    `📦 *Остатки товаров:*\n\n${lines}`,
  );
}

export function msgLowStock(
  products: Array<{
    nameRu: string;
    stock: number | string;
    minStock: number | string;
    unit: string;
  }>,
): string {
  if (products.length === 0)
    return t(
      '✅ Barcha tovarlar normada! Kam qolgan tovarlar yo\'q.',
      '✅ Все товары в норме! Нет товаров ниже минимума.',
    );
  const lines = products
    .map((p) => `• ${p.nameRu}: *${Number(p.stock)}* / min. ${Number(p.minStock)} ${p.unit}`)
    .join('\n');
  return t(
    `🔴 *Kam qolgan tovarlar (${products.length}):*\n\n${lines}`,
    `🔴 *Товары с низким остатком (${products.length}):*\n\n${lines}`,
  );
}

export function msgSuppliersList(
  suppliers: Array<{ nameRu: string; balance: number | string }>,
): string {
  if (suppliers.length === 0)
    return t("👥 Ta'minotchilar topilmadi.", '👥 Поставщики не найдены.');
  const lines = suppliers
    .map((s) => {
      const bal = Number(s.balance);
      const uzBal =
        bal < 0
          ? `Qarz: ${num(Math.abs(bal))} so'm`
          : bal > 0
            ? `Ortiqcha: ${num(bal)} so'm`
            : 'Balans nol';
      const ruBal =
        bal < 0
          ? `Долг: ${num(Math.abs(bal))} сум`
          : bal > 0
            ? `Переплата: ${num(bal)} сум`
            : 'Баланс нулевой';
      return `• *${s.nameRu}*\n  ${uzBal} / ${ruBal}`;
    })
    .join('\n');
  return t(
    `👥 *Ta'minotchilar:*\n\n${lines}`,
    `👥 *Поставщики:*\n\n${lines}`,
  );
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export function msgSupplierBalance(name: string, balance: number | string): string {
  const bal = Number(balance);
  const uzStatus =
    bal < 0
      ? `💸 Biz ta'minotchiga qarzdormiz: *${num(Math.abs(bal))} so'm*`
      : bal > 0
        ? `💰 Ta'minotchi bizga qarzdor: *${num(bal)} so'm*`
        : '✅ Balans nol';
  const ruStatus =
    bal < 0
      ? `💸 Мы должны поставщику: *${num(Math.abs(bal))} сум*`
      : bal > 0
        ? `💰 Поставщик должен нам: *${num(bal)} сум*`
        : '✅ Баланс нулевой';
  return t(
    `💰 *Balans — ${name}*\n\n${uzStatus}`,
    `💰 *Баланс — ${name}*\n\n${ruStatus}`,
  );
}

const TX_LABELS: Record<string, [string, string]> = {
  PURCHASE: ['🛒 Xarid', '🛒 Закупка'],
  PAYMENT: ['💳 To\'lov', '💳 Оплата'],
  RETURN: ['↩️ Qaytarish', '↩️ Возврат'],
  ADVANCE: ['💵 Avans', '💵 Аванс'],
  ADJUSTMENT: ['⚙️ Tuzatish', '⚙️ Корректировка'],
};

export function msgSupplierTransactions(
  supplierName: string,
  transactions: Array<{
    type: string;
    amount: number | string;
    description?: string | null;
    createdAt: Date | string;
  }>,
): string {
  if (transactions.length === 0)
    return t('📋 Tranzaksiyalar topilmadi.', '📋 Транзакций не найдено.');
  const lines = transactions
    .slice(0, 10)
    .map((tx) => {
      const [uzLabel, ruLabel] = TX_LABELS[tx.type] ?? [tx.type, tx.type];
      const amt = Math.round(Number(tx.amount));
      const sign = amt >= 0 ? '+' : '';
      const desc = tx.description ? ` — ${tx.description}` : '';
      const d = date(tx.createdAt);
      return `${uzLabel}/${ruLabel}: *${sign}${num(amt)} so'm/сум*${desc}\n  📅 ${d}`;
    })
    .join('\n');
  return t(
    `📋 *So'nggi tranzaksiyalar — ${supplierName}:*\n\n${lines}`,
    `📋 *Последние транзакции — ${supplierName}:*\n\n${lines}`,
  );
}

export function msgSupplierProducts(
  products: Array<{
    nameRu: string;
    price: number | string;
    stock: number | string;
    unit: string;
  }>,
): string {
  if (products.length === 0)
    return t(
      '📦 Siz bilan bog\'liq tovarlar topilmadi.',
      '📦 Нет товаров, связанных с вами.',
    );
  const lines = products
    .map(
      (p) =>
        `• ${p.nameRu}\n  ${num(Number(p.price))} so'm/сум | ${t('Qoldiq', 'Остаток')}: ${Number(p.stock)} ${p.unit}`,
    )
    .join('\n');
  return t(
    `📦 *Sizning tovarlaringiz:*\n\n${lines}`,
    `📦 *Ваши товары:*\n\n${lines}`,
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

export function msgError(context?: string): string {
  const suffix = context ? ` (${context})` : '';
  return t(
    `❌ Xatolik yuz berdi${suffix}. Keyinroq urinib ko'ring.`,
    `❌ Произошла ошибка${suffix}. Попробуйте позже.`,
  );
}
