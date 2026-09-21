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
    aiPlan: string;
    active: boolean;
    balance: number;
    subscriptionPlan: string | null;
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
      const sub = s.subscriptionPlan ?? '—';
      const planUz =
        s.aiPlan === 'paid'
          ? `💎 AI Premium | Balans: ${num(Math.round(s.balance))} so'm | ${sub}`
          : `🆓 AI Bepul | ${sub}`;
      const planRu =
        s.aiPlan === 'paid'
          ? `💎 AI Платный | Баланс: ${num(Math.round(s.balance))} сум | ${sub}`
          : `🆓 AI Бесплатный | ${sub}`;
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

// ─── Terminal log alerts ──────────────────────────────────────────────────────

/**
 * Alert bodies are sent as HTML, not Markdown: they quote raw log lines, and a log line is free to
 * contain a stray `*`, `_` or `[` that makes Telegram reject the whole message as malformed
 * Markdown. HTML needs only these three characters escaped, so the text can never break the parse.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Keeps one alert line readable; the full text is always in the dashboard's log view. */
const ALERT_TEXT_MAX = 180;

/**
 * Telegram rejects a message over 4096 characters outright, and twenty quoted log lines can reach
 * that. Cut well short of the limit — HTML escaping expands what is counted here.
 */
const ALERT_MESSAGE_MAX = 3500;

function clip(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > ALERT_TEXT_MAX ? `${flat.slice(0, ALERT_TEXT_MAX - 1)}…` : flat;
}

export interface AlertLine {
  level: 'info' | 'error';
  text: string;
  count: number;
  terminals: string[];
}

/** One batched digest of what a store's terminals logged in the last minute. HTML. */
export function msgLogAlert(
  data: { terminals: string[]; shown: AlertLine[]; hidden: number; storeId?: string | null },
  lang?: Lang,
): string {
  const title = t('🖥 <b>Terminal jurnali</b>', '🖥 <b>Журнал терминала</b>', lang);
  const terminalsLabel = t('Terminallar', 'Терминалы', lang);
  // Named only for the fleet-wide subscriber; a store's own admin knows which store this is.
  const store = data.storeId
    ? `\n${t("Do'kon", 'Магазин', lang)}: <code>${escapeHtml(data.storeId)}</code>`
    : '';
  const header = `${title}${store}\n${terminalsLabel}: <code>${escapeHtml(data.terminals.join(', '))}</code>`;

  const lines = data.shown.map((l) => {
    const icon = l.level === 'error' ? '🔴' : '🔵';
    const times = l.count > 1 ? ` <b>×${l.count}</b>` : '';
    // Only name terminals per line when the store has more than one and they differ from the
    // header — otherwise every line repeats what the header already said.
    const where =
      data.terminals.length > 1 && l.terminals.length < data.terminals.length
        ? ` <i>(${escapeHtml(l.terminals.join(', '))})</i>`
        : '';
    return `${icon}${times} ${escapeHtml(clip(l.text))}${where}`;
  });

  const more =
    data.hidden > 0
      ? `\n\n${t(`…va yana ${data.hidden} ta`, `…и ещё ${data.hidden}`, lang)}`
      : '';

  const body = `${header}\n\n${lines.join('\n')}${more}`;
  if (body.length <= ALERT_MESSAGE_MAX) return body;

  // Drop whole lines from the end rather than cutting mid-tag: a truncated `<b>` leaves unbalanced
  // HTML, and Telegram answers that by rejecting the message instead of merely shortening it.
  const kept: string[] = [];
  let size = header.length + 2;
  for (const l of lines) {
    if (size + l.length + 1 > ALERT_MESSAGE_MAX) break;
    kept.push(l);
    size += l.length + 1;
  }
  const dropped = data.shown.length - kept.length + data.hidden;
  return `${header}\n\n${kept.join('\n')}\n\n${t(`…va yana ${dropped} ta`, `…и ещё ${dropped}`, lang)}`;
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

/** Date AND time: a shift is an event within a day, and two shifts can share a date. */
function moment(d: Date | string): string {
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface ShiftOpened {
  terminalId: string;
  cashierName: string;
  initialCash: number;
  openedAt: string | Date;
  zReportNumber: number;
}

/** A till just opened for business. HTML, like every message this bot pushes unprompted. */
export function msgShiftOpened(s: ShiftOpened, lang?: Lang): string {
  const title = t('🟢 <b>Smena ochildi</b>', '🟢 <b>Смена открыта</b>', lang);
  const rows = [
    `${t('Kassir', 'Кассир', lang)}: <b>${escapeHtml(s.cashierName)}</b>`,
    `${t('Terminal', 'Терминал', lang)}: <code>${escapeHtml(s.terminalId)}</code>`,
    `${t('Vaqt', 'Время', lang)}: ${moment(s.openedAt)}`,
    `${t("Boshlang'ich kassa", 'Начальная касса', lang)}: <b>${num(s.initialCash)}</b>`,
    `${t('Z-hisobot', 'Z-отчёт', lang)}: №${s.zReportNumber}`,
  ];
  return `${title}\n\n${rows.join('\n')}`;
}

export interface ShiftClosed extends ShiftOpened {
  finalCash: number;
  closedAt: string | Date;
  cashSalesAmount: number;
  cardSalesAmount: number;
  payInTotal: number;
  payOutTotal: number;
  returnAmount: number;
}

/**
 * What a shift closed with — the one message of the day an owner actually waits for.
 *
 * Expected cash is recomputed here from the same terms `smena.math.ts` uses rather than being
 * read off the row, because the server stores the parts and not the total. The variance is what
 * the message exists for, so it leads the money block and is signed explicitly: "0" and "−12 000"
 * must not look alike at a glance.
 */
export function msgShiftClosed(s: ShiftClosed, lang?: Lang): string {
  const expected =
    s.initialCash + s.cashSalesAmount + s.payInTotal - s.payOutTotal - s.returnAmount;
  const variance = s.finalCash - expected;
  const icon = variance === 0 ? '✅' : variance > 0 ? '🔵' : '🔴';

  const title = t('🔒 <b>Smena yopildi</b>', '🔒 <b>Смена закрыта</b>', lang);
  const head = [
    `${t('Kassir', 'Кассир', lang)}: <b>${escapeHtml(s.cashierName)}</b>`,
    `${t('Terminal', 'Терминал', lang)}: <code>${escapeHtml(s.terminalId)}</code>`,
    `${moment(s.openedAt)} — ${moment(s.closedAt)}`,
    `${t('Z-hisobot', 'Z-отчёт', lang)}: №${s.zReportNumber}`,
  ];
  const money = [
    `${t("Boshlang'ich kassa", 'Начальная касса', lang)}: ${num(s.initialCash)}`,
    `${t('Naqd savdo', 'Продажи наличными', lang)}: ${num(s.cashSalesAmount)}`,
    `${t('Karta/QR', 'Карта/QR', lang)}: ${num(s.cardSalesAmount)}`,
    `${t('Kirim', 'Внесения', lang)}: ${num(s.payInTotal)}`,
    `${t('Chiqim', 'Изъятия', lang)}: ${num(s.payOutTotal)}`,
    `${t('Qaytarishlar', 'Возвраты', lang)}: ${num(s.returnAmount)}`,
  ];
  const result = [
    `${t('Kutilgan', 'Ожидалось', lang)}: <b>${num(expected)}</b>`,
    `${t('Sanaldi', 'Посчитано', lang)}: <b>${num(s.finalCash)}</b>`,
    `${icon} ${t('Farq', 'Расхождение', lang)}: <b>${variance > 0 ? '+' : ''}${num(variance)}</b>`,
  ];

  return `${title}\n\n${head.join('\n')}\n\n${money.join('\n')}\n\n${result.join('\n')}`;
}

// ─── Alert settings ───────────────────────────────────────────────────────────

export function msgAlertSettings(
  state: { alerts: boolean; verbose: boolean },
  lang?: Lang,
): string {
  const on = t('yoqilgan', 'включены', lang);
  const off = t("o'chirilgan", 'выключены', lang);
  return t(
    `🔔 <b>Ogohlantirishlar</b>\n\nJurnal xabarlari: <b>${state.alerts ? on : off}</b>\nBatafsil rejim: <b>${state.verbose ? on : off}</b>\n\nBatafsil rejim har bir chek uchun texnik o'lchov satrlarini ham qo'shadi.`,
    `🔔 <b>Уведомления</b>\n\nСообщения журнала: <b>${state.alerts ? on : off}</b>\nПодробный режим: <b>${state.verbose ? on : off}</b>\n\nПодробный режим добавляет технические строки тайминга по каждому чеку.`,
    lang,
  );
}

/** Labels for the two inline switches in the alert settings menu. */
export function btnAlertToggle(state: { alerts: boolean; verbose: boolean }, lang?: Lang) {
  return {
    alerts: state.alerts
      ? t("🔕 Jurnalni o'chirish", '🔕 Выключить журнал', lang)
      : t('🔔 Jurnalni yoqish', '🔔 Включить журнал', lang),
    verbose: state.verbose
      ? t("📉 Batafsil rejimni o'chirish", '📉 Выключить подробный режим', lang)
      : t('📈 Batafsil rejimni yoqish', '📈 Включить подробный режим', lang),
  };
}
