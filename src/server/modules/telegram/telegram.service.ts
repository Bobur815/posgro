import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { UsersService } from '../users/users.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { StoresService } from '../stores/stores.service';
import * as fmt from './bot-commands';
import type { Lang } from './bot-commands';

type UserRole = 'ADMIN' | 'USER' | 'SUPER_ADMIN' | 'SUPPLIER';

interface BotSession {
  phone: string;
  role: UserRole;
  userId?: string;
  supplierId?: string;
  storeId: string;
  name: string;
  lang: Lang;
}

// Keyboard button labels — language-aware, built per user
const BTN_UZ = {
  ANALYTICS: "📊 Bugungi tahlil",
  STOCK: "📦 Ombor qoldiqlari",
  LOW_STOCK: "🔴 Kam qolganlar",
  SUPPLIERS: "👥 Ta'minotchilar",
  STORES: "🏪 Do'konlar",
  BALANCE: "💰 Mening balansim",
  TRANSACTIONS: "📋 Tranzaksiyalar",
  MY_PRODUCTS: "📦 Mening tovarlarim",
  WEB: "🌐 Veb-panel",
} as const;

const BTN_RU = {
  ANALYTICS: "📊 Аналитика",
  STOCK: "📦 Остатки",
  LOW_STOCK: "🔴 Мало на складе",
  SUPPLIERS: "👥 Поставщики",
  STORES: "🏪 Магазины",
  BALANCE: "💰 Мой баланс",
  TRANSACTIONS: "📋 Транзакции",
  MY_PRODUCTS: "📦 Мои товары",
  WEB: "🌐 Веб-панель",
} as const;

// All possible button texts for hears() matching — plain string[] so Telegraf accepts them
const ALL_BTNS: Record<keyof typeof BTN_UZ, string[]> = {
  ANALYTICS: [BTN_UZ.ANALYTICS, BTN_RU.ANALYTICS],
  STOCK: [BTN_UZ.STOCK, BTN_RU.STOCK],
  LOW_STOCK: [BTN_UZ.LOW_STOCK, BTN_RU.LOW_STOCK],
  SUPPLIERS: [BTN_UZ.SUPPLIERS, BTN_RU.SUPPLIERS],
  STORES: [BTN_UZ.STORES, BTN_RU.STORES],
  BALANCE: [BTN_UZ.BALANCE, BTN_RU.BALANCE],
  TRANSACTIONS: [BTN_UZ.TRANSACTIONS, BTN_RU.TRANSACTIONS],
  MY_PRODUCTS: [BTN_UZ.MY_PRODUCTS, BTN_RU.MY_PRODUCTS],
  WEB: [BTN_UZ.WEB, BTN_RU.WEB],
};

function btn(key: keyof typeof BTN_UZ, lang: Lang) {
  return lang === 'uz' ? BTN_UZ[key] : BTN_RU[key];
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private readonly sessions = new Map<number, BotSession>();
  /** Stores chosen language before phone auth completes */
  private readonly langPrefs = new Map<number, Lang>();

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly suppliersService: SuppliersService,
    private readonly inventoryService: InventoryService,
    private readonly productsService: ProductsService,
    private readonly analyticsService: AnalyticsService,
    private readonly storesService: StoresService,
  ) {}

  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
      return;
    }
    this.bot = new Telegraf(token);
    this.registerHandlers(this.bot);
    this.bot.launch().catch((err) => this.logger.error('Bot launch error', err));
    this.logger.log('Telegram bot started (long polling)');
  }

  onModuleDestroy() {
    this.bot?.stop('SIGTERM');
  }

  // ─── Identity Resolution ──────────────────────────────────────────────────

  private phoneVariants(raw: string): string[] {
    const digits = raw.replace(/\D/g, '');
    return [digits, `+${digits}`];
  }

  private async resolveIdentity(rawPhone: string): Promise<Omit<BotSession, 'lang'> | null> {
    for (const phone of this.phoneVariants(rawPhone)) {
      const user = await this.usersService.findByPhoneAnyStore(phone);
      if (user) {
        return {
          phone,
          role: user.role as UserRole,
          userId: user.id,
          storeId: user.storeId ?? '',
          name: user.nameRu,
        };
      }
    }

    for (const phone of this.phoneVariants(rawPhone)) {
      const supplier = await this.suppliersService.findByPhoneAnyStore(phone);
      if (supplier) {
        return {
          phone,
          role: 'SUPPLIER',
          supplierId: supplier.id,
          storeId: supplier.storeId,
          name: supplier.nameRu,
        };
      }
    }

    return null;
  }

  // ─── Keyboards ────────────────────────────────────────────────────────────

  private kbAskPhone(lang: Lang) {
    const label = lang === 'uz'
      ? '📱 Raqamni ulashish'
      : '📱 Поделиться номером';
    return Markup.keyboard([[Markup.button.contactRequest(label)]]).oneTime().resize();
  }

  private kbAdmin(lang: Lang) {
    return Markup.keyboard([
      [btn('ANALYTICS', lang), btn('STOCK', lang)],
      [btn('LOW_STOCK', lang), btn('SUPPLIERS', lang)],
      [btn('WEB', lang)],
    ]).resize();
  }

  private kbSuperAdmin(lang: Lang) {
    return Markup.keyboard([
      [btn('STORES', lang)],
      [btn('WEB', lang)],
    ]).resize();
  }

  private kbSupplier(lang: Lang) {
    return Markup.keyboard([
      [btn('BALANCE', lang), btn('TRANSACTIONS', lang)],
      [btn('MY_PRODUCTS', lang)],
    ]).resize();
  }

  private inlineWebButton() {
    const url = this.configService.get<string>('WEB_APP_URL') ?? 'https://pos.bobur-dev.uz';
    return Markup.inlineKeyboard([Markup.button.url('🌐 Veb-panel / Открыть веб-панель', url)]);
  }

  private getLang(chatId: number): Lang {
    return this.sessions.get(chatId)?.lang ?? this.langPrefs.get(chatId) ?? 'ru';
  }

  // ─── Handler Registration ─────────────────────────────────────────────────

  private registerHandlers(bot: Telegraf) {
    // /start — reset session, ask language
    bot.start(async (ctx) => {
      this.sessions.delete(ctx.chat.id);
      this.langPrefs.delete(ctx.chat.id);
      await ctx.reply(
        fmt.msgSelectLanguage(),
        Markup.inlineKeyboard([
          Markup.button.callback("O'zbek 🇺🇿", 'lang_uz'),
          Markup.button.callback('Русский 🇷🇺', 'lang_ru'),
        ]),
      );
    });

    // Language selection callbacks
    bot.action('lang_uz', async (ctx) => {
      if (!ctx.chat) return;
      this.langPrefs.set(ctx.chat.id, 'uz');
      await ctx.answerCbQuery();
      await ctx.editMessageText("O'zbek tili tanlandi ✅");
      setTimeout(() => ctx.deleteMessage().catch(() => {}), 1500);
      await ctx.reply(fmt.msgAskPhone('uz'), this.kbAskPhone('uz'));
    });

    bot.action('lang_ru', async (ctx) => {
      if (!ctx.chat) return;
      this.langPrefs.set(ctx.chat.id, 'ru');
      await ctx.answerCbQuery();
      await ctx.editMessageText('Выбран русский язык ✅');
      setTimeout(() => ctx.deleteMessage().catch(() => {}), 1500);
      await ctx.reply(fmt.msgAskPhone('ru'), this.kbAskPhone('ru'));
    });

    // Contact shared — identify user
    bot.on('contact', async (ctx) => {
      const lang = this.getLang(ctx.chat.id);
      const rawPhone = ctx.message.contact.phone_number;
      try {
        const identity = await this.resolveIdentity(rawPhone);
        if (!identity) {
          await ctx.reply(fmt.msgUnknownPhone(lang), this.inlineWebButton());
          return;
        }
        const session: BotSession = { ...identity, lang };
        this.sessions.set(ctx.chat.id, session);
        if (session.role === 'SUPPLIER') {
          await ctx.reply(fmt.msgSupplierMenu(session.name, lang), this.kbSupplier(lang));
        } else if (session.role === 'SUPER_ADMIN') {
          await ctx.reply(fmt.msgSuperAdminMenu(session.name, lang), this.kbSuperAdmin(lang));
        } else {
          await ctx.reply(fmt.msgAdminMenu(session.name, lang), this.kbAdmin(lang));
        }
      } catch (err) {
        this.logger.error('Contact handler error', err);
        await ctx.reply(fmt.msgError('auth', lang));
      }
    });

    // ── Super Admin: Stores list ───────────────────────────────────────────
    bot.hears(ALL_BTNS.STORES, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPER_ADMIN') return;
      try {
        const stores = await this.storesService.findAll();
        await ctx.replyWithMarkdown(
          fmt.msgStoresList(
            stores.map((s) => ({
              name: s.name,
              aiPlan: s.aiPlan,
              active: s.active,
              balance: Number(s.balance),
              subscriptionPlan: s.subscriptionPlan,
              usersCount: s._count.users,
              productsCount: s._count.products,
              salesCount: s._count.sales,
            })),
            session.lang,
          ),
        );
      } catch (err) {
        this.logger.error('Stores list error', err);
        await ctx.reply(fmt.msgError('stores', session.lang));
      }
    });

    // ── Admin: Today's analytics ──────────────────────────────────────────
    bot.hears(ALL_BTNS.ANALYTICS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER' || session.role === 'SUPER_ADMIN') return;
      if (!session.storeId) {
        await ctx.reply(fmt.msgError('no-store', session.lang));
        return;
      }
      try {
        const data = await this.analyticsService.getDailyAnalytics(session.storeId, new Date());
        await ctx.replyWithMarkdown(fmt.msgTodayAnalytics(data, session.lang));
      } catch (err) {
        this.logger.error('Analytics error', err);
        await ctx.reply(fmt.msgError('analytics', session.lang));
      }
    });

    // ── Admin: Stock overview ─────────────────────────────────────────────
    bot.hears(ALL_BTNS.STOCK, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER' || session.role === 'SUPER_ADMIN') return;
      if (!session.storeId) return;
      try {
        const products = await this.productsService.findAll(session.storeId, { active: true });
        await ctx.replyWithMarkdown(
          fmt.msgStockOverview(
            products.map((p) => ({
              nameRu: p.nameRu,
              nameUz: p.nameUz,
              stock: Number(p.stock),
              unit: p.unit,
            })),
            session.lang,
          ),
        );
      } catch (err) {
        this.logger.error('Stock overview error', err);
        await ctx.reply(fmt.msgError('stock', session.lang));
      }
    });

    // ── Admin: Low stock ──────────────────────────────────────────────────
    bot.hears(ALL_BTNS.LOW_STOCK, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER' || session.role === 'SUPER_ADMIN') return;
      if (!session.storeId) return;
      try {
        const products = await this.inventoryService.getLowStock(session.storeId);
        await ctx.replyWithMarkdown(
          fmt.msgLowStock(
            products.map((p) => ({
              nameRu: p.nameRu,
              nameUz: p.nameUz,
              stock: Number(p.stock),
              minStock: Number(p.minStock),
              unit: p.unit,
            })),
            session.lang,
          ),
        );
      } catch (err) {
        this.logger.error('Low stock error', err);
        await ctx.reply(fmt.msgError('low-stock', session.lang));
      }
    });

    // ── Admin: Suppliers list ─────────────────────────────────────────────
    bot.hears(ALL_BTNS.SUPPLIERS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER' || session.role === 'SUPER_ADMIN') return;
      if (!session.storeId) return;
      try {
        const suppliers = await this.suppliersService.findAll(session.storeId, { active: true });
        await ctx.replyWithMarkdown(
          fmt.msgSuppliersList(
            suppliers.map((s) => ({ nameRu: s.nameRu, balance: Number(s.balance) })),
            session.lang,
          ),
        );
      } catch (err) {
        this.logger.error('Suppliers list error', err);
        await ctx.reply(fmt.msgError('suppliers', session.lang));
      }
    });

    // ── Supplier: Balance ─────────────────────────────────────────────────
    bot.hears(ALL_BTNS.BALANCE, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(session.supplierId, session.storeId);
        await ctx.replyWithMarkdown(
          fmt.msgSupplierBalance(supplier.nameRu, Number(supplier.balance), session.lang),
        );
      } catch (err) {
        this.logger.error('Supplier balance error', err);
        await ctx.reply(fmt.msgError('balance', session.lang));
      }
    });

    // ── Supplier: Transactions ────────────────────────────────────────────
    bot.hears(ALL_BTNS.TRANSACTIONS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(session.supplierId, session.storeId);
        await ctx.replyWithMarkdown(
          fmt.msgSupplierTransactions(
            supplier.nameRu,
            supplier.transactions.map((tx) => ({
              type: tx.type,
              amount: Number(tx.amount),
              description: tx.description,
              createdAt: tx.createdAt,
            })),
            session.lang,
          ),
        );
      } catch (err) {
        this.logger.error('Transactions error', err);
        await ctx.reply(fmt.msgError('transactions', session.lang));
      }
    });

    // ── Supplier: My products ─────────────────────────────────────────────
    bot.hears(ALL_BTNS.MY_PRODUCTS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(session.supplierId, session.storeId);
        const products = (supplier as any).products ?? [];
        await ctx.replyWithMarkdown(fmt.msgSupplierProducts(products, session.lang));
      } catch (err) {
        this.logger.error('Supplier products error', err);
        await ctx.reply(fmt.msgError('products', session.lang));
      }
    });

    // ── Web panel ─────────────────────────────────────────────────────────
    bot.hears(ALL_BTNS.WEB, async (ctx) => {
      const lang = this.getLang(ctx.chat.id);
      const label = lang === 'uz' ? 'Quyidagi tugmani bosing:' : 'Нажмите кнопку ниже:';
      await ctx.reply(label, this.inlineWebButton());
    });

    // ── Fallback: no session → ask language ───────────────────────────────
    bot.on('message', async (ctx) => {
      if (!this.sessions.has(ctx.chat.id)) {
        await ctx.reply(
          fmt.msgSelectLanguage(),
          Markup.inlineKeyboard([
            Markup.button.callback("O'zbek 🇺🇿", 'lang_uz'),
            Markup.button.callback('Русский 🇷🇺', 'lang_ru'),
          ]),
        );
      }
    });
  }

  // ─── Public notification helpers ──────────────────────────────────────────

  async sendNotification(message: string) {
    this.logger.debug(`[Telegram] Notification suppressed (pull mode): ${message}`);
  }

  async sendLowStockAlert(products: Array<{ name: string; stock: number }>) {
    if (products.length === 0) return;
    this.logger.debug(`[Telegram] Low stock alert: ${products.length} products`);
  }

  async sendDailySummary(summary: { date: string; totalSales: number; totalRevenue: number }) {
    this.logger.debug(`[Telegram] Daily summary: ${summary.date}`);
  }
}
