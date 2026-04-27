// Pure message-formatting helpers for the Telegram bot.
// No imports, no side effects — only takes data, returns strings.

export type Lang = 'uz' | 'ru';

/** Return the string in the requested language, or both bilingual if lang is unknown. */
export function t(uz: string, ru: string, lang?: Lang): string {
  if (lang === 'uz') return uz;
  if (lang === 'ru') return ru;
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

export function msgSelectLanguage(): string {
  return '🌐 Tilni tanlang / Выберите язык:';
}

export function msgAskPhone(lang?: Lang): string {
  return t(
    'Xush kelibsiz! 👋\n\nTizimga kirish uchun telefon raqamingizni ulashing.',
    'Добро пожаловать! 👋\n\nПожалуйста, поделитесь своим номером телефона для входа.',
    lang,
  );
}

export function msgUnknownPhone(lang?: Lang): string {
  return t(
    '📢 Raqamingiz tizimda topilmadi.\n\nYangiliklar uchun kuzatib boring!',
    '📢 Ваш номер не зарегистрирован в системе.\n\nСледите за новостями!',
    lang,
  );
}

// ─── Menus ────────────────────────────────────────────────────────────────────

export function msgAdminMenu(name: string, lang?: Lang): string {
  return t(
    `Xush kelibsiz, ${name}! 👨‍💼\n\nAmalni tanlang:`,
    `Добро пожаловать, ${name}! 👨‍💼\n\nВыберите действие:`,
    lang,
  );
}

export function msgSuperAdminMenu(name: string, lang?: Lang): string {
  return t(
    `Xush kelibsiz, ${name}! 🛡️\n\nSuperadmin paneli. Amalni tanlang:`,
    `Добро пожаловать, ${name}! 🛡️\n\nПанель суперадмина. Выберите действие:`,
    lang,
  );
}

export function msgSupplierMenu(name: string, lang?: Lang): string {
  return t(
    `Xush kelibsiz, ${name}! 🤝\n\nAmalni tanlang:`,
    `Добро пожаловать, ${name}! 🤝\n\nВыберите действие:`,
    lang,
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function msgTodayAnalytics(
  data: {
    date: string;
    totalSales: number;
    totalRevenue: number;
    averageTransaction: number;
    topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  },
  lang?: Lang,
): string {
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
  return t(uz, ru, lang);
}

export function msgStockOverview(
  products: Array<{ nameRu: string; nameUz: string; stock: number | string; unit: string }>,
  lang?: Lang,
): string {
  if (products.length === 0)
    return t('📦 Tovarlar topilmadi.', '📦 Товаров не найдено.', lang);
  const lines = products
    .slice(0, 20)
    .map((p) => `• ${lang === 'uz' ? p.nameUz : p.nameRu}: *${Number(p.stock)} ${p.unit}*`)
    .join('\n');
  return t(
    `📦 *Ombor qoldiqlari:*\n\n${lines}`,
    `📦 *Остатки товаров:*\n\n${lines}`,
    lang,
  );
}

export function msgLowStock(
  products: Array<{
    nameRu: string;
    nameUz: string;
    stock: number | string;
    minStock: number | string;
    unit: string;
  }>,
  lang?: Lang,
): string {
  if (products.length === 0)
    return t(
      "✅ Barcha tovarlar normada! Kam qolgan tovarlar yo'q.",
      '✅ Все товары в норме! Нет товаров ниже минимума.',
      lang,
    );
  const lines = products
    .map(
      (p) =>
        `• ${lang === 'uz' ? p.nameUz : p.nameRu}: *${Number(p.stock)}* / min. ${Number(p.minStock)} ${p.unit}`,
    )
    .join('\n');
  return t(
    `🔴 *Kam qolgan tovarlar (${products.length}):*\n\n${lines}`,
    `🔴 *Товары с низким остатком (${products.length}):*\n\n${lines}`,
    lang,
  );
}

export function msgSuppliersList(
  suppliers: Array<{ nameRu: string; balance: number | string }>,
  lang?: Lang,
): string {
  if (suppliers.length === 0)
    return t("👥 Ta'minotchilar topilmadi.", '👥 Поставщики не найдены.', lang);
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
      return `• *${s.nameRu}*\n  ${lang === 'uz' ? uzBal : lang === 'ru' ? ruBal : `${uzBal} / ${ruBal}`}`;
    })
    .join('\n');
  return t(
    `👥 *Ta'minotchilar:*\n\n${lines}`,
    `👥 *Поставщики:*\n\n${lines}`,
    lang,
  );
}

// ─── Super Admin ──────────────────────────────────────────────────────────────

export function msgStoresList(
  stores: Array<{
    name: string;
    plan: string;
    active: boolean;
    aiCredits: number;
    usersCount: number;
    productsCount: number;
    salesCount: number;
  }>,
  lang?: Lang,
): string {
  if (stores.length === 0)
    return t("🏪 Do'konlar topilmadi.", '🏪 Магазины не найдены.', lang);
  const lines = stores
    .map((s) => {
      const status = s.active ? '✅' : '🔴';
      const planUz =
        s.plan === 'paid'
          ? `💎 Premium | AI: ${num(Math.round(s.aiCredits))} so'm`
          : '🆓 Bepul';
      const planRu =
        s.plan === 'paid'
          ? `💎 Платный | AI: ${num(Math.round(s.aiCredits))} сум`
          : '🆓 Бесплатный';
      const planLine = lang === 'uz' ? planUz : lang === 'ru' ? planRu : `${planUz} / ${planRu}`;
      return (
        `${status} *${s.name}*\n` +
        `  ${planLine}\n` +
        `  👤 ${s.usersCount} | 📦 ${s.productsCount} | 🛒 ${s.salesCount}`
      );
    })
    .join('\n\n');
  return t(
    `🏪 *Do'konlar ro'yxati (${stores.length}):*\n\n${lines}`,
    `🏪 *Список магазинов (${stores.length}):*\n\n${lines}`,
    lang,
  );
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export function msgSupplierBalance(name: string, balance: number | string, lang?: Lang): string {
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
    lang,
  );
}

const TX_LABELS: Record<string, [string, string]> = {
  PURCHASE: ['🛒 Xarid', '🛒 Закупка'],
  PAYMENT: ["💳 To'lov", '💳 Оплата'],
  RETURN: ["↩️ Qaytarish", '↩️ Возврат'],
  ADVANCE: ['💵 Avans', '💵 Аванс'],
  ADJUSTMENT: ["⚙️ Tuzatish", '⚙️ Корректировка'],
};

export function msgSupplierTransactions(
  supplierName: string,
  transactions: Array<{
    type: string;
    amount: number | string;
    description?: string | null;
    createdAt: Date | string;
  }>,
  lang?: Lang,
): string {
  if (transactions.length === 0)
    return t('📋 Tranzaksiyalar topilmadi.', '📋 Транзакций не найдено.', lang);
  const lines = transactions
    .slice(0, 10)
    .map((tx) => {
      const [uzLabel, ruLabel] = TX_LABELS[tx.type] ?? [tx.type, tx.type];
      const label = lang === 'uz' ? uzLabel : lang === 'ru' ? ruLabel : `${uzLabel}/${ruLabel}`;
      const amt = Math.round(Number(tx.amount));
      const sign = amt >= 0 ? '+' : '';
      const desc = tx.description ? ` — ${tx.description}` : '';
      const d = date(tx.createdAt);
      const currency = lang === 'uz' ? "so'm" : 'сум';
      return `${label}: *${sign}${num(amt)} ${currency}*${desc}\n  📅 ${d}`;
    })
    .join('\n');
  return t(
    `📋 *So'nggi tranzaksiyalar — ${supplierName}:*\n\n${lines}`,
    `📋 *Последние транзакции — ${supplierName}:*\n\n${lines}`,
    lang,
  );
}

export function msgSupplierProducts(
  products: Array<{
    nameRu: string;
    nameUz: string;
    price: number | string;
    stock: number | string;
    unit: string;
  }>,
  lang?: Lang,
): string {
  if (products.length === 0)
    return t(
      "📦 Siz bilan bog'liq tovarlar topilmadi.",
      '📦 Нет товаров, связанных с вами.',
      lang,
    );
  const currency = lang === 'uz' ? "so'm" : lang === 'ru' ? 'сум' : "so'm/сум";
  const stockLabel = lang === 'uz' ? 'Qoldiq' : lang === 'ru' ? 'Остаток' : 'Qoldiq/Остаток';
  const lines = products
    .map(
      (p) =>
        `• ${lang === 'uz' ? p.nameUz : p.nameRu}\n  ${num(Number(p.price))} ${currency} | ${stockLabel}: ${Number(p.stock)} ${p.unit}`,
    )
    .join('\n');
  return t(
    `📦 *Sizning tovarlaringiz:*\n\n${lines}`,
    `📦 *Ваши товары:*\n\n${lines}`,
    lang,
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

export function msgError(context?: string, lang?: Lang): string {
  const suffix = context ? ` (${context})` : '';
  return t(
    `❌ Xatolik yuz berdi${suffix}. Keyinroq urinib ko'ring.`,
    `❌ Произошла ошибка${suffix}. Попробуйте позже.`,
    lang,
  );
}
