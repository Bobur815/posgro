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

/** `[fiscal] ✗ fiscalize cmu7v44wj08sp12d4apjho294 failed: [701003] Не отсканирован код…` */
const VCR_STAFF = /^\[fiscal\] ✗ fiscalize \S+ failed:\s*\[(\d+)\]\s*(.*)$/s;

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
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

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
    order: number;
  }
  const groups = new Map<string, Acc>();
  let order = 0;

  for (const e of entries) {
    if (!isForwardable(e.level, e.msg, verbose)) continue;
    const level = e.level === 'error' ? 'error' : 'info';

    const staff = VCR_STAFF.exec(e.msg);
    const raw = staff ? null : VCR_RAW.exec(e.msg);
    const code = staff?.[1] ?? raw?.[1] ?? null;
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
        order: order++,
      };
      groups.set(key, acc);
    }
    acc.terminals.add(e.terminalId);
    // An error anywhere in the group makes the whole incident an error.
    if (level === 'error') acc.level = 'error';

    if (staff) {
      acc.staffText = `[${staff[1]}] ${staff[2]}`;
      acc.staffCount++;
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
    }));
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
      const chats = await this.prisma.telegramChat.findMany({
        where: { storeId, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, alerts: true },
      });
      if (chats.length === 0) return;

      for (const chat of chats) {
        // Rendered per chat: a verbose subscriber sees the telemetry the others are spared.
        const groups = collapse(entries, chat.verbose);
        if (groups.length === 0) continue;
        await this.deliver(chat.chatId, chat.lang as Lang, groups, entries);
      }
    } catch (err) {
      this.logger.error(`Log alert flush failed for store ${storeId}`, err as Error);
    }
  }

  private async deliver(
    chatId: bigint,
    lang: Lang,
    groups: AlertGroup[],
    entries: BufferedLog[],
  ): Promise<void> {
    const terminals = [...new Set(entries.map((e) => e.terminalId))].sort();
    const html = fmt.msgLogAlert(
      {
        terminals,
        shown: groups.slice(0, MAX_GROUPS_PER_MESSAGE),
        hidden: Math.max(0, groups.length - MAX_GROUPS_PER_MESSAGE),
      },
      lang,
    );

    const result = await this.telegram.sendHtml(chatId, html);
    if (result === 'blocked') {
      // The admin blocked the bot or deleted the chat. Retrying every minute forever helps nobody.
      await this.prisma.telegramChat
        .update({ where: { chatId }, data: { alerts: false } })
        .catch(() => undefined);
      this.logger.warn(`Chat ${chatId} blocked the bot — log alerts disabled for it`);
    }
  }
}
