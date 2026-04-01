import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { UsersService } from '../users/users.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { AnalyticsService } from '../analytics/analytics.service';
import * as fmt from './bot-commands';

type UserRole = 'ADMIN' | 'USER' | 'SUPER_ADMIN' | 'SUPPLIER';

interface BotSession {
  phone: string;
  role: UserRole;
  userId?: string;
  supplierId?: string;
  storeId: string;
  name: string;
}

// Keyboard button labels (must match exactly in bot.hears())
const BTN = {
  ANALYTICS: '📊 Bugungi tahlil / Аналитика',
  STOCK: '📦 Ombor / Остатки',
  LOW_STOCK: '🔴 Kam qolganlar / Мало на складе',
  SUPPLIERS: "👥 Ta'minotchilar / Поставщики",
  BALANCE: '💰 Mening balansim / Мой баланс',
  TRANSACTIONS: '📋 Tranzaksiyalar / Транзакции',
  MY_PRODUCTS: '📦 Mening tovarlarim / Мои товары',
  WEB: '🌐 Veb-panel / Открыть веб-панель',
} as const;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private readonly sessions = new Map<number, BotSession>();

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly suppliersService: SuppliersService,
    private readonly inventoryService: InventoryService,
    private readonly productsService: ProductsService,
    private readonly analyticsService: AnalyticsService,
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

  private async resolveIdentity(rawPhone: string): Promise<BotSession | null> {
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

  private kbAskPhone() {
    return Markup.keyboard([[Markup.button.contactRequest('📱 Raqamni ulashish / Поделиться номером')]])
      .oneTime()
      .resize();
  }

  private kbAdmin() {
    return Markup.keyboard([
      [BTN.ANALYTICS, BTN.STOCK],
      [BTN.LOW_STOCK, BTN.SUPPLIERS],
      [BTN.WEB],
    ]).resize();
  }

  private kbSupplier() {
    return Markup.keyboard([
      [BTN.BALANCE, BTN.TRANSACTIONS],
      [BTN.MY_PRODUCTS],
      [BTN.WEB],
    ]).resize();
  }

  private inlineWebButton() {
    const url = this.configService.get<string>('WEB_APP_URL') ?? 'https://pos.bobur-dev.uz';
    return Markup.inlineKeyboard([Markup.button.url('🌐 Veb-panel / Открыть веб-панель', url)]);
  }

  // ─── Handler Registration ─────────────────────────────────────────────────

  private registerHandlers(bot: Telegraf) {
    // /start — reset session, ask for phone
    bot.start(async (ctx) => {
      this.sessions.delete(ctx.chat.id);
      await ctx.reply(fmt.msgAskPhone(), this.kbAskPhone());
    });

    // Contact shared — identify user
    bot.on('contact', async (ctx) => {
      const rawPhone = ctx.message.contact.phone_number;
      try {
        const session = await this.resolveIdentity(rawPhone);
        if (!session) {
          await ctx.reply(fmt.msgUnknownPhone(), this.inlineWebButton());
          return;
        }
        this.sessions.set(ctx.chat.id, session);
        if (session.role === 'SUPPLIER') {
          await ctx.reply(fmt.msgSupplierMenu(session.name), this.kbSupplier());
        } else {
          await ctx.reply(fmt.msgAdminMenu(session.name), this.kbAdmin());
        }
      } catch (err) {
        this.logger.error('Contact handler error', err);
        await ctx.reply(fmt.msgError('auth'));
      }
    });

    // ── Admin: Today's analytics ────────────────────────────────────────────
    bot.hears(BTN.ANALYTICS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER') return;
      if (!session.storeId) {
        await ctx.reply(fmt.msgError('no-store'));
        return;
      }
      try {
        const data = await this.analyticsService.getDailyAnalytics(session.storeId, new Date());
        await ctx.replyWithMarkdown(fmt.msgTodayAnalytics(data));
      } catch (err) {
        this.logger.error('Analytics error', err);
        await ctx.reply(fmt.msgError('analytics'));
      }
    });

    // ── Admin: Stock overview ───────────────────────────────────────────────
    bot.hears(BTN.STOCK, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER') return;
      if (!session.storeId) return;
      try {
        const products = await this.productsService.findAll(session.storeId, { active: true });
        await ctx.replyWithMarkdown(
          fmt.msgStockOverview(
            products.map((p) => ({ nameRu: p.nameRu, stock: Number(p.stock), unit: p.unit })),
          ),
        );
      } catch (err) {
        this.logger.error('Stock overview error', err);
        await ctx.reply(fmt.msgError('stock'));
      }
    });

    // ── Admin: Low stock ───────────────────────────────────────────────────
    bot.hears(BTN.LOW_STOCK, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER') return;
      if (!session.storeId) return;
      try {
        const products = await this.inventoryService.getLowStock(session.storeId);
        await ctx.replyWithMarkdown(
          fmt.msgLowStock(
            products.map((p) => ({
              nameRu: p.nameRu,
              stock: Number(p.stock),
              minStock: Number(p.minStock),
              unit: p.unit,
            })),
          ),
        );
      } catch (err) {
        this.logger.error('Low stock error', err);
        await ctx.reply(fmt.msgError('low-stock'));
      }
    });

    // ── Admin: Suppliers list ──────────────────────────────────────────────
    bot.hears(BTN.SUPPLIERS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role === 'SUPPLIER') return;
      if (!session.storeId) return;
      try {
        const suppliers = await this.suppliersService.findAll(session.storeId, { active: true });
        await ctx.replyWithMarkdown(
          fmt.msgSuppliersList(
            suppliers.map((s) => ({ nameRu: s.nameRu, balance: Number(s.balance) })),
          ),
        );
      } catch (err) {
        this.logger.error('Suppliers list error', err);
        await ctx.reply(fmt.msgError('suppliers'));
      }
    });

    // ── Supplier: Balance ──────────────────────────────────────────────────
    bot.hears(BTN.BALANCE, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(
          session.supplierId,
          session.storeId,
        );
        await ctx.replyWithMarkdown(
          fmt.msgSupplierBalance(supplier.nameRu, Number(supplier.balance)),
        );
      } catch (err) {
        this.logger.error('Supplier balance error', err);
        await ctx.reply(fmt.msgError('balance'));
      }
    });

    // ── Supplier: Transactions ─────────────────────────────────────────────
    bot.hears(BTN.TRANSACTIONS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(
          session.supplierId,
          session.storeId,
        );
        await ctx.replyWithMarkdown(
          fmt.msgSupplierTransactions(
            supplier.nameRu,
            supplier.transactions.map((tx) => ({
              type: tx.type,
              amount: Number(tx.amount),
              description: tx.description,
              createdAt: tx.createdAt,
            })),
          ),
        );
      } catch (err) {
        this.logger.error('Transactions error', err);
        await ctx.reply(fmt.msgError('transactions'));
      }
    });

    // ── Supplier: My products ──────────────────────────────────────────────
    bot.hears(BTN.MY_PRODUCTS, async (ctx) => {
      const session = this.sessions.get(ctx.chat.id);
      if (!session || session.role !== 'SUPPLIER' || !session.supplierId) return;
      try {
        const supplier = await this.suppliersService.findById(
          session.supplierId,
          session.storeId,
        );
        const products = (supplier as any).products ?? [];
        await ctx.replyWithMarkdown(fmt.msgSupplierProducts(products));
      } catch (err) {
        this.logger.error('Supplier products error', err);
        await ctx.reply(fmt.msgError('products'));
      }
    });

    // ── Web panel (both menus) ─────────────────────────────────────────────
    bot.hears(BTN.WEB, async (ctx) => {
      await ctx.reply(
        fmt.t('Quyidagi tugmani bosing:', 'Нажмите кнопку ниже:'),
        this.inlineWebButton(),
      );
    });

    // ── Fallback: no session → ask phone ──────────────────────────────────
    bot.on('message', async (ctx) => {
      if (!this.sessions.has(ctx.chat.id)) {
        await ctx.reply(fmt.msgAskPhone(), this.kbAskPhone());
      }
    });
  }

  // ─── Public notification helpers (existing callers) ───────────────────────

  async sendNotification(message: string) {
    // No-op — bot runs in pull mode (users query the bot, not push)
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
