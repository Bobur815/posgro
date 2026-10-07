import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import * as fmt from './bot-commands';
import type { Lang } from './bot-commands';

/**
 * Forwards terminal log lines to the Telegram chats of a store's admins.
 *
 * The raw feed is not sendable as-is. One production store writes ~270 info+error lines a day, and
 * nearly all of the info half is `[fiscal-timing] … ok total=3983ms …` — one telemetry line per
 * receipt. Errors are worse than merely numerous: every fiscal failure logs *two* lines, the raw
 * REGOS wording and the staff-facing one, and the same failure repeats all day. Sending that
 * verbatim would bury the signal and trip Telegram's ~20 msg/min per-chat limit at exactly the
 * moment a terminal is broken.
 *
 * So: filter the telemetry out, batch a minute at a time, collapse the pairs, count the repeats.
 */

/** Only these reach a chat. `warn` is the loudest level in production and is deliberately absent. */
const FORWARDED_LEVELS = new Set(['info', 'error']);

/**
 * The per-receipt timing telemetry — the bulk of `info` volume, and meaningless to a shop owner.
 * A chat that has turned `verbose` on gets it anyway.
 */
const NOISE = /^\[fiscal-timing\]/;

/** How long a store's lines accumulate before one message goes out. */
const FLUSH_MS = 60_000;

/** Beyond this a message stops being readable; the rest is reported as a count. */
const MAX_GROUPS_PER_MESSAGE = 20;

/** A hard stop on buffer growth if a terminal goes into a log loop while the flush is failing. */
const MAX_BUFFERED_PER_STORE = 1_000;

/** `[fiscal] raw VCR error [701003] Receipt.Sale: Некорректные входные данные (…)` */
const VCR_RAW = /^\[fiscal\] raw VCR error \[(\d+)\][^:]*:\s*(.*)$/s;

/**
 * `[fiscal] ✗ fiscalize cmu7v44wj08sp12d4apjho294 failed: [701003] Не отсканирован код…`
 * Groups: sale id, REGOS code, staff wording.
 */
const VCR_STAFF = /^\[fiscal\] ✗ fiscalize (\S+) failed:\s*\[(\d+)\]\s*(.*)$/s;

/**
 * ` items=["Coca-Cola 1L","Pepsi"] +2` — the receipt's products, appended by tills from 1.32.17
 * (`loggedItems` in src/main/fiscal/regos-vcr-service.ts; change both together). Older tills omit
 * it. Groups: JSON array of names, count of lines beyond them.
 */
const LOGGED_ITEMS = /\s+items=(\[.*\])(?:\s+\+(\d+))?$/s;

/** Receipts named under one incident; the rest are a count. */
const MAX_RECEIPTS_PER_GROUP = 3;

/** Product names shown per receipt; the rest are a count. */
const MAX_PRODUCTS_PER_RECEIPT = 3;

/** One line as a terminal uploads it — the terminal's id travels once, on the batch. */
export interface LogEntryInput {
  level: string;
  msg: string;
  ts: string;
}

/** The same line once buffered, tagged with the terminal it came from. */
export interface BufferedLog extends LogEntryInput {
  terminalId: string;
}

/** One incident, however many log lines described it. */
export interface AlertGroup {
  level: 'info' | 'error';
  /** What the admin reads. */
  text: string;
  /** How many times it happened in this window. */
  count: number;
  /** Which terminals it happened on, sorted. */
  terminals: string[];
  /** The receipts a fiscal failure hit, in order, each once. Empty for anything else. */
  receiptRefs: ReceiptRef[];
}

/** A receipt as a log line names it: the sale's id, when the line was written, what it sold. */
export interface ReceiptRef {
  saleId: string;
  ts: string;
  /** From the line itself; empty from a till that predates it. */
  products: string[];
  moreProducts: number;
}

/** What the server knows of a synced sale — enough for an admin to find the receipt. */
export interface SaleSummary {
  receiptNumber: string;
  createdAt: Date;
  products: string[];
  itemCount: number;
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Splits the till's product suffix off a staff-facing failure text. A suffix that does not parse
 * is left in the text — garbled is better than silently dropped.
 */
export function splitLoggedItems(text: string): {
  text: string;
  products: string[];
  moreProducts: number;
} {
  const m = LOGGED_ITEMS.exec(text);
  if (!m) return { text, products: [], moreProducts: 0 };
  try {
    const parsed: unknown = JSON.parse(m[1]);
    if (!Array.isArray(parsed) || !parsed.every((p): p is string => typeof p === 'string')) {
      return { text, products: [], moreProducts: 0 };
    }
    return { text: text.slice(0, m.index), products: parsed, moreProducts: Number(m[2] ?? 0) };
  } catch {
    return { text, products: [], moreProducts: 0 };
  }
}

/** Whether a line is worth an admin's attention at all. */
export function isForwardable(level: string, msg: string, verbose: boolean): boolean {
  if (!FORWARDED_LEVELS.has(level)) return false;
  if (level === 'info' && !verbose && NOISE.test(msg)) return false;
  return true;
}

/**
 * Collapses the incidental parts of a message so two reports of the same problem group together.
 *
 * Short numbers are left alone on purpose: `[701003]` and `[704030]` are different failures and
 * must not merge. Only the parts that vary per receipt are erased — the sale's cuid, the marking
 * code embedded in REGOS's wording, and millisecond timings.
 */
export function normalizeMessage(msg: string): string {
  return msg
    .replace(/\b[a-z][a-z0-9]{19,}\b/g, '<id>') // cuid: cmu7v44wj08sp12d4apjho294
    .replace(/\d{10,}/g, '<code>') // marking code: 010478011…
    .replace(/\d+ms\b/g, '<t>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Groups a window's lines into incidents.
 *
 * The two lines a fiscal failure writes share their REGOS code, so they key on it and collapse into
 * one entry showing the staff-facing wording. The count comes from the staff line where there is
 * one, because there is exactly one of those per receipt — counting both lines would double every
 * figure. (A pair split across two flush windows is reported twice; the count is a diagnostic, not
 * an accounting figure.)
 */
export function collapse(entries: BufferedLog[], verbose: boolean): AlertGroup[] {
  interface Acc {
    level: 'info' | 'error';
    rawText: string;
    staffText: string | null;
    rawCount: number;
    staffCount: number;
    terminals: Set<string>;
    receipts: Map<string, ReceiptRef>;
    order: number;
  }
  const groups = new Map<string, Acc>();
  let order = 0;

  for (const e of entries) {
    if (!isForwardable(e.level, e.msg, verbose)) continue;
    const level = e.level === 'error' ? 'error' : 'info';

    const staff = VCR_STAFF.exec(e.msg);
    const raw = staff ? null : VCR_RAW.exec(e.msg);
    const code = staff?.[2] ?? raw?.[1] ?? null;
    const key = code ? `vcr:${code}` : `msg:${normalizeMessage(e.msg)}`;

    let acc = groups.get(key);
    if (!acc) {
      acc = {
        level,
        rawText: e.msg,
        staffText: null,
        rawCount: 0,
        staffCount: 0,
        terminals: new Set(),
        receipts: new Map(),
        order: order++,
      };
      groups.set(key, acc);
    }
    acc.terminals.add(e.terminalId);
    // An error anywhere in the group makes the whole incident an error.
    if (level === 'error') acc.level = 'error';

    if (staff) {
      // The products vary per receipt; left in the text they would make the incident read as
      // whichever receipt failed last.
      const items = splitLoggedItems(staff[3]);
      acc.staffText = `[${staff[2]}] ${items.text}`;
      acc.staffCount++;
      if (!acc.receipts.has(staff[1])) {
        acc.receipts.set(staff[1], {
          saleId: staff[1],
          ts: e.ts,
          products: items.products,
          moreProducts: items.moreProducts,
        });
      }
    } else if (raw) {
      acc.rawText = `[${raw[1]}] ${raw[2]}`;
      acc.rawCount++;
    } else {
      acc.rawCount++;
    }
  }

  return [...groups.values()]
    .sort((a, b) => (a.level === b.level ? a.order - b.order : a.level === 'error' ? -1 : 1))
    .map((a) => ({
      level: a.level,
      text: a.staffText ?? a.rawText,
      count: a.staffCount || a.rawCount,
      terminals: [...a.terminals].sort(),
      receiptRefs: [...a.receipts.values()],
    }));
}

/**
 * Turns an incident's receipt refs into what the admin reads. A sale the server has not got yet
 * (the till fiscalizes before it syncs, or is offline) still shows the time the line was logged
 * and the products the line named — only the receipt number is missing.
 */
export function describeReceipts(
  receipts: ReceiptRef[],
  sales: ReadonlyMap<string, SaleSummary>,
): { shown: fmt.AlertReceipt[]; hidden: number } {
  const shown = receipts.slice(0, MAX_RECEIPTS_PER_GROUP).map((r): fmt.AlertReceipt => {
    const sale = sales.get(r.saleId);
    if (!sale) {
      const products = r.products.slice(0, MAX_PRODUCTS_PER_RECEIPT);
      return {
        at: r.ts,
        receiptNumber: null,
        products,
        moreProducts: r.products.length - products.length + r.moreProducts,
      };
    }
    const products = sale.products.slice(0, MAX_PRODUCTS_PER_RECEIPT);
    return {
      at: sale.createdAt,
      receiptNumber: sale.receiptNumber,
      products,
      moreProducts: Math.max(0, sale.itemCount - products.length),
    };
  });
  return { shown, hidden: Math.max(0, receipts.length - shown.length) };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LogAlertsService implements OnModuleDestroy {
  private readonly logger = new Logger(LogAlertsService.name);
  private readonly buffers = new Map<string, BufferedLog[]>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /**
   * Takes a terminal's freshly uploaded batch. Never throws and is not awaited by the caller:
   * the lines are already durable in `terminal_logs`, so a failed alert must not fail an upload.
   */
  enqueue(storeId: string, terminalId: string, entries: LogEntryInput[]): void {
    const worth = entries.filter((e) => isForwardable(e.level, e.msg, true));
    if (worth.length === 0) return;

    const buffer = this.buffers.get(storeId) ?? [];
    for (const e of worth) {
      if (buffer.length >= MAX_BUFFERED_PER_STORE) break;
      buffer.push({ terminalId, level: e.level, msg: e.msg, ts: e.ts });
    }
    this.buffers.set(storeId, buffer);

    // The first line of a window arms the timer; later lines join the window already running, so
    // a burst becomes one message and latency stays bounded at FLUSH_MS.
    if (!this.timers.has(storeId)) {
      this.timers.set(
        storeId,
        setTimeout(() => {
          this.timers.delete(storeId);
          void this.flush(storeId);
        }, FLUSH_MS).unref(),
      );
    }
  }

  private async flush(storeId: string): Promise<void> {
    const entries = this.buffers.get(storeId) ?? [];
    this.buffers.delete(storeId);
    if (entries.length === 0) return;

    try {
      // The audience rule lives in TelegramService, shared with the shift notifications — a
      // second copy here would be a second thing to keep in step.
      const chats = await this.telegram.alertChats(storeId);
      if (chats.length === 0) return;

      // Receipts come only from error lines, which every chat sees — so one lookup serves all.
      const saleIds = [
        ...new Set(collapse(entries, false).flatMap((g) => g.receiptRefs.map((r) => r.saleId))),
      ];
      const sales = await this.loadSales(storeId, saleIds);

      for (const chat of chats) {
        // Rendered per chat: a verbose subscriber sees the telemetry the others are spared.
        const groups = collapse(entries, chat.verbose);
        if (groups.length === 0) continue;
        // Only the fleet-wide subscriber needs telling which store this is.
        const from = chat.role === 'SUPER_ADMIN' ? storeId : null;
        await this.deliver(chat.chatId, chat.lang as Lang, groups, entries, sales, from);
      }
    } catch (err) {
      this.logger.error(`Log alert flush failed for store ${storeId}`, err as Error);
    }
  }

  /**
   * The receipt number, time and products of the sales a window's failures name. Scoped to the
   * store, so a sale id from one store's log can never pull another store's receipt. Best effort:
   * a failed lookup costs the details, never the alert.
   */
  async loadSales(storeId: string, saleIds: string[]): Promise<Map<string, SaleSummary>> {
    if (saleIds.length === 0) return new Map();
    try {
      const sales = await this.prisma.sale.findMany({
        where: { storeId, id: { in: saleIds } },
        select: {
          id: true,
          receiptNumber: true,
          createdAt: true,
          items: { select: { productName: true }, take: MAX_PRODUCTS_PER_RECEIPT },
          _count: { select: { items: true } },
        },
      });
      return new Map(
        sales.map((s) => [
          s.id,
          {
            receiptNumber: s.receiptNumber,
            createdAt: s.createdAt,
            products: s.items.map((i) => i.productName),
            itemCount: s._count.items,
          },
        ]),
      );
    } catch (err) {
      this.logger.warn(
        `Receipt lookup for log alert failed (store ${storeId}): ${(err as Error).message}`,
      );
      return new Map();
    }
  }

  private async deliver(
    chatId: bigint,
    lang: Lang,
    groups: AlertGroup[],
    entries: BufferedLog[],
    sales: ReadonlyMap<string, SaleSummary>,
    storeId: string | null,
  ): Promise<void> {
    const terminals = [...new Set(entries.map((e) => e.terminalId))].sort();
    const html = fmt.msgLogAlert(
      {
        storeId,
        terminals,
        shown: groups.slice(0, MAX_GROUPS_PER_MESSAGE).map((g) => {
          const receipts = describeReceipts(g.receiptRefs, sales);
          return { ...g, receipts: receipts.shown, hiddenReceipts: receipts.hidden };
        }),
        hidden: Math.max(0, groups.length - MAX_GROUPS_PER_MESSAGE),
      },
      lang,
    );

    // sendAlert unsubscribes a chat that has blocked the bot — see TelegramService.
    await this.telegram.sendAlert(chatId, html);
  }
}
