// REGOS:VCR fiscalization service (main process).
// Owns config, the sale → fiscal-receipt pipeline, Z-report (shift) mapping, and a
// background retry worker. Failure mode: "allow + fiscalize later" — sales complete
// locally with fiscal_status=PENDING and are fiscalized here (immediately or on retry).

import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getVcrPassword, hasVcrPassword, setVcrPassword } from './secret-store';
import { log } from '../logger';
import { FiscalTimer } from './fiscal-timing';
import { isWriteFrozen } from '../sales/write-freeze';
import { normalizePollOptions } from './uzqr-poll';
import {
  RegosVcrClient,
  VcrError,
  describeVcrError,
  type VcrPosition,
  type VcrPayment,
  type VcrReceiptResult,
} from './regos-vcr-client';
import type {
  RegosVcrConfig,
  RegosVcrConfigInput,
  FiscalConnectionResult,
  FiscalQueueStatus,
  FiscalBacklogStep,
  FiscalBacklogProgress,
  FiscalBacklogClassifyResult,
  FiscalBacklogRepairResult,
  FiscalBacklogProductIssue,
  FiscalBacklogVerifyResult,
  FiscalBacklogFiscalizeResult,
  FiscalLinePlan,
  FiscalDuplicateCodeReceipt,
  FiscalLabel,
  FiscalZReportStatus,
  FiscalSalePreview,
  FiscalPreviewPosition,
  FiscalPreviewPayment,
} from '../../shared/types/fiscal.types';
import { repairCyrillicLayout, isLayoutCorrupted } from '../../shared/utils/keyboard-layout';
import { duplicateCodeLines, labelsPerLine } from '../../shared/utils/fiscal-labels';
import { pickSingleUnitPackage } from '../../shared/utils/mxik-packages';
import { lookupMxikByBarcode, getMxikPackages } from './tasnif';
import { normalizeMxik } from '../../shared/utils/mxik-lookup';
import { productRequiresMarking } from '../../shared/utils/marking';
import { toPieces } from '../../shared/utils/pack';
import { isFiscalCashTender } from '../../shared/constants';
import { MIXED_TENDER, tenderAmounts, type TenderLine } from '../../shared/utils/split-payment';
import { verifyMarkingCodeDetails } from '../marking/circulation-check';
import { classifyCirculation } from '../../shared/utils/circulation';
import {
  SKIP_TAG,
  SKIP_TAG_MARKING,
  SUBSTITUTE_QUANTITY,
  isBacklogCandidate,
  isCashOrClickOnly,
  maySkipFiscalisation,
  parseLinePlan,
} from '../../shared/utils/fiscal-backlog';
import { isProductRejection, markProductsInvalid, markProductsValid } from './product-validity';
import { checkCirculation, SALE_PATH_TIMEOUT_MS } from '../marking/circulation-cache';
import {
  MarkingBlockedError,
  decideMarkingBlock,
  describeMarkingBlock,
  parseMarkingBlock,
} from './marking-gate';

/** system_settings key: when this till began sending marking codes per line. */
const LABELS_PER_LINE_SINCE = 'labels_per_line_since';
const MAX_ATTEMPTS = 5; // cap retries for hard (business) failures
const FISCAL_DEBUG = process.env.FISCAL_DEBUG === 'true'; // verbose position/payment logs
const ERR_ZREPORT_EMPTY = 704020; // VCR: can't close an empty Z-report — benign no-op for us
const ERR_ZREPORT_NOT_OPEN = 704010; // VCR: no open Z-report — recoverable, we re-open and retry
// UZ statutory VAT rate. Used when neither the product's own vatRate nor the store-wide
// regos_vcr_vat setting is configured. A 0% fallback would send vat_value=0 for goods that
// are registered as VAT-able at soliq → REGOS rejects with 701003 "Ставка НДС не найдена".
const DEFAULT_VAT_PERCENT = 12;
// REGOS sentinel for "Без НДС" sent in a position's vat_value when the store is NOT a VAT payer.
// Confirmed by REGOS support (2026-06-19): non-payers must send -1, NOT 0 (0% is reserved for
// льготники and a non-payer sending vat_value=0 is rejected with 701003 "Ставка НДС запрещена").
// Doubles as the PositionMeta.rate marker for "без НДС" (no numeric rate applies).
const NON_VAT_PAYER_VAT_VALUE = -1;

/**
 * Makes the positions' discounts add up to the receipt's discount exactly, in tiyin.
 *
 * Each line's share is rounded on its own, so three lines splitting 10 000 so'm can sum to a tiyin
 * more or less than the payment, which is `finalAmount` to the tiyin — and the receipt no longer
 * balances. The difference goes on the last lines, never taking a line's discount below zero or
 * above its amount.
 */
export function settleDiscountRemainder(positions: VcrPosition[], totalDiscount: number): void {
  let diff = totalDiscount - positions.reduce((s, p) => s + p.discount, 0);
  for (let i = positions.length - 1; i >= 0 && diff !== 0; i--) {
    const current = positions[i].discount;
    const next = Math.min(positions[i].amount, Math.max(0, current + diff));
    positions[i].discount = next;
    diff -= next - current;
  }
}

// Product names appended to a failed receipt's log line, so the admin's Telegram alert can say
// what was being sold even before the sale reaches the server. The device does not say which
// position it rejected, so these are the receipt's lines in order.
const LOGGED_ITEMS_MAX = 3;

/**
 * ` items=["Coca-Cola 1L","Pepsi"] +2` — a JSON array, so a name holding a comma or bracket
 * still parses. The server reads this back (src/server/modules/telegram/log-alerts.service.ts,
 * LOGGED_ITEMS); change both together.
 */
export function loggedItems(names: string[]): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, LOGGED_ITEMS_MAX);
  const more = names.length - shown.length;
  return ` items=${JSON.stringify(shown)}${more > 0 ? ` +${more}` : ''}`;
}

// Per-position bookkeeping kept alongside the VCR positions so a VAT-rate heal can map a
// position back to its product (to persist the corrected rate) and know its current rate.
interface PositionMeta {
  productId: number;
  rate: number;
  /** The product is held invalid (Product.isValid = false); a fiscalised receipt clears it. */
  invalid?: boolean;
}

/** The product fields a fiscal position is built from. See buildPositions(). */
interface FiscalProduct {
  id: number;
  mxik: string | null;
  vatRate: number | null;
  unit: string;
  packageCode: string | null;
  category: { nameRu: string } | null;
  /** Read from the same row, so a fiscalised receipt clears an invalid flag with no extra query. */
  isValid?: boolean;
}

/** The substitute also lends its own name and barcode to the line it replaces. */
interface SubstituteProduct extends FiscalProduct {
  nameRu: string;
  nameUz: string;
  barcode: string;
}

interface ResolvedConfig {
  enabled: boolean;
  url: string;
  login: string;
  password: string;
  vatPercent: number;
  nonVatPayer: boolean;
  posId: string;
  vcrPrintsReceipt: boolean;
  markingCodeCheck: boolean;
  uzqrEnabled: boolean;
  /** Spread from normalizePollOptions — always present and always sane. */
  intervalMs: number;
  timeoutMs: number;
  substituteProductId: number | null;
  /** asl-belgisi circulation check at scan time and before Receipt.Sale. Default off. */
  circulationCheck: boolean;
}

const SETTING_KEYS = {
  enabled: 'regos_vcr_enabled',
  url: 'regos_vcr_url',
  login: 'regos_vcr_login',
  vat: 'regos_vcr_vat',
  nonVatPayer: 'regos_vcr_non_vat_payer',
  posId: 'regos_vcr_pos_id',
  printsReceipt: 'regos_vcr_prints_receipt',
  markingCheck: 'regos_vcr_marking_check',
  uzqrEnabled: 'regos_vcr_uzqr_enabled',
  uzqrPollMs: 'regos_vcr_uzqr_poll_ms',
  uzqrTimeoutMs: 'regos_vcr_uzqr_timeout_ms',
  substituteProductId: 'regos_vcr_substitute_product_id',
  circulationCheck: 'regos_vcr_circulation_check',
} as const;

class RegosVcrService {
  private worker: NodeJS.Timeout | null = null;
  private running = false;
  private vcrChain: Promise<unknown> = Promise.resolve();

  /**
   * Cached "the device's Z-report is open". A Z-report spans the whole shift, so asking the device
   * before every single receipt cost one full round-trip per sale on a single-threaded device for
   * an answer that changes twice a day.
   *
   * Safe to cache because the belief is verified where it matters: Receipt.Sale fails with 704010
   * when it is wrong, and fiscalizeSaleImpl treats that as recoverable — it clears this flag,
   * re-opens for real, and retries once. So a stale `true` costs one extra round-trip on the sale
   * that discovers it, never a lost receipt. Set only after the device has confirmed or opened it.
   */
  private zReportOpen = false;

  /**
   * Serialize all VCR interactions — the device is single-threaded and the docs
   * require waiting for each response before sending the next request. Without this,
   * an immediate fiscalization (from sales:create) could overlap a worker tick.
   */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.vcrChain.then(fn, fn);
    this.vcrChain = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * Resolves once everything already queued for the device has finished — for a main handing its
   * role over (§11.4), so a receipt the device is printing right now is recorded as fiscalized in
   * the copy the new main takes, rather than fiscalized again there.
   */
  drain(): Promise<void> {
    return this.runExclusive(async () => undefined);
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  private async resolveConfig(): Promise<ResolvedConfig> {
    const prisma = getPrismaClient();
    const appConfig = getAppConfig();
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    const password = (await getVcrPassword()) || process.env.VCR_PASSWORD || '';
    return {
      enabled: map[SETTING_KEYS.enabled] === 'true',
      // Default to literal IPv4 loopback, NOT 'localhost'. REGOS:VCR binds 127.0.0.1 only, and
      // Node's fetch (undici, verbatim DNS) tries IPv6 ::1 first for 'localhost' → ECONNREFUSED
      // surfaced as VcrError [0] "fetch failed". 22298 is REGOS's documented port.
      url: map[SETTING_KEYS.url] || process.env.VCR_URL || 'http://127.0.0.1:22298/',
      login: map[SETTING_KEYS.login] || process.env.VCR_LOGIN || 'cassir',
      password,
      vatPercent: parseVatPercent(map[SETTING_KEYS.vat]),
      nonVatPayer: map[SETTING_KEYS.nonVatPayer] === 'true',
      posId: map[SETTING_KEYS.posId] || appConfig.terminalId || 'posgro',
      vcrPrintsReceipt: map[SETTING_KEYS.printsReceipt] === 'true',
      // Default ON — only disabled when explicitly set to 'false'.
      markingCodeCheck: map[SETTING_KEYS.markingCheck] !== 'false',
      // Default OFF, unlike markingCheck above. Stores already taking UzQR through a bank
      // terminal must keep the current behaviour until someone deliberately opts in.
      uzqrEnabled: map[SETTING_KEYS.uzqrEnabled] === 'true',
      ...normalizePollOptions({
        intervalMs: Number(map[SETTING_KEYS.uzqrPollMs]),
        timeoutMs: Number(map[SETTING_KEYS.uzqrTimeoutMs]),
      }),
      substituteProductId: parseProductId(map[SETTING_KEYS.substituteProductId]),
      // Default OFF: until someone turns it on, marked receipts go to REGOS exactly as before.
      circulationCheck: map[SETTING_KEYS.circulationCheck] === 'true',
    };
  }

  async getConfig(): Promise<RegosVcrConfig> {
    const cfg = await this.resolveConfig();
    // Report hasPassword based on whether the stored secret actually DECRYPTS, not just that a
    // row exists. resolveConfig() already decrypted into cfg.password (it falls back to '' when
    // decryption fails), so a stored-but-undecryptable secret correctly surfaces as "not saved"
    // and the UI prompts for re-entry instead of lying with a "сохранён" placeholder.
    const storedButBroken = (await hasVcrPassword()) && !cfg.password;
    if (storedButBroken) {
      log.warn('[fiscal] VCR password is stored but failed to decrypt — prompting for re-entry');
    }
    return {
      enabled: cfg.enabled,
      url: cfg.url,
      login: cfg.login,
      hasPassword: Boolean(cfg.password),
      vatPercent: cfg.vatPercent,
      nonVatPayer: cfg.nonVatPayer,
      posId: cfg.posId,
      vcrPrintsReceipt: cfg.vcrPrintsReceipt,
      markingCodeCheck: cfg.markingCodeCheck,
      uzqrEnabled: cfg.uzqrEnabled,
      uzqrPollMs: cfg.intervalMs,
      uzqrTimeoutMs: cfg.timeoutMs,
      substituteProductId: cfg.substituteProductId,
    };
  }

  async setConfig(input: RegosVcrConfigInput): Promise<RegosVcrConfig> {
    const prisma = getPrismaClient();
    const writes: Array<[string, string]> = [];
    if (input.enabled !== undefined) writes.push([SETTING_KEYS.enabled, String(input.enabled)]);
    if (input.url !== undefined) writes.push([SETTING_KEYS.url, input.url]);
    if (input.login !== undefined) writes.push([SETTING_KEYS.login, input.login]);
    if (input.vatPercent !== undefined) writes.push([SETTING_KEYS.vat, String(input.vatPercent)]);
    if (input.nonVatPayer !== undefined) writes.push([SETTING_KEYS.nonVatPayer, String(input.nonVatPayer)]);
    if (input.posId !== undefined) writes.push([SETTING_KEYS.posId, input.posId]);
    if (input.vcrPrintsReceipt !== undefined) writes.push([SETTING_KEYS.printsReceipt, String(input.vcrPrintsReceipt)]);
    if (input.markingCodeCheck !== undefined) writes.push([SETTING_KEYS.markingCheck, String(input.markingCodeCheck)]);
    if (input.uzqrEnabled !== undefined) writes.push([SETTING_KEYS.uzqrEnabled, String(input.uzqrEnabled)]);
    if (input.uzqrPollMs !== undefined) writes.push([SETTING_KEYS.uzqrPollMs, String(input.uzqrPollMs)]);
    if (input.uzqrTimeoutMs !== undefined) writes.push([SETTING_KEYS.uzqrTimeoutMs, String(input.uzqrTimeoutMs)]);
    if (input.substituteProductId !== undefined)
      writes.push([SETTING_KEYS.substituteProductId, input.substituteProductId == null ? '' : String(input.substituteProductId)]);

    for (const [key, value] of writes) {
      await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    if (input.password) await setVcrPassword(input.password);
    return this.getConfig();
  }

  /**
   * The asl-belgisi circulation check (scan time + fiscal gate). Its own pair rather than a field
   * of RegosVcrConfig, which lives in src/shared and is compiled into older consumers.
   */
  async circulationCheckEnabled(): Promise<boolean> {
    return (await this.resolveConfig()).circulationCheck;
  }

  async setCirculationCheck(on: boolean): Promise<boolean> {
    const value = String(on);
    await getPrismaClient().systemSetting.upsert({
      where: { key: SETTING_KEYS.circulationCheck },
      update: { value },
      create: { key: SETTING_KEYS.circulationCheck, value },
    });
    return on;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.resolveConfig()).enabled;
  }

  /**
   * True when the REGOS:VCR device prints the paper receipt itself, so the POS must NOT print a
   * second one. Mirrors the "Чек печатает виртуальная касса" checkbox in Fiscal settings.
   *
   * Read straight from the settings row rather than through getConfig(), which also probes the
   * stored password and logs about it — irrelevant work on the sale hot path.
   */
  async vcrPrintsReceipt(): Promise<boolean> {
    return (await this.resolveConfig()).vcrPrintsReceipt;
  }

  private buildClient(cfg: ResolvedConfig): RegosVcrClient | null {
    if (!cfg.password) return null;
    return new RegosVcrClient(cfg.url, cfg.login, cfg.password);
  }

  /**
   * Run one VCR call through the same single-threaded queue as fiscalization.
   *
   * Exposed for the UzQR flow, which lives outside this class but must not talk to the device
   * concurrently with a sale or Z-report. Callers pass ONE call at a time — never a whole poll
   * loop — so a buyer taking two minutes cannot block fiscalization for two minutes.
   */
  async runVcr<T>(fn: (client: RegosVcrClient) => Promise<T>): Promise<T> {
    const cfg = await this.resolveConfig();
    const client = this.buildClient(cfg);
    if (!client) throw new Error('Пароль кассира не задан');
    return this.runExclusive(() => fn(client));
  }

  /** Config the UzQR flow needs, without exposing the password to callers. */
  async getUzQrConfig(): Promise<{ enabled: boolean; intervalMs: number; timeoutMs: number }> {
    const cfg = await this.resolveConfig();
    return {
      // Both switches matter: UzQR rides the VCR connection, so it cannot run with fiscalization
      // switched off entirely.
      enabled: cfg.enabled && cfg.uzqrEnabled,
      intervalMs: cfg.intervalMs,
      timeoutMs: cfg.timeoutMs,
    };
  }

  // ── Connection test ───────────────────────────────────────────────────────
  async testConnection(): Promise<FiscalConnectionResult> {
    const cfg = await this.resolveConfig();
    const client = this.buildClient(cfg);
    if (!client) return { ok: false, error: 'Пароль кассира не задан' };
    return this.runExclusive(async () => {
      try {
        const info = await client.initialize();
        const overflow = await client.getOverflowInfo();
        return {
          ok: true,
          terminalId: info.TerminalID,
          appletVersion: info.AppletVersion,
          availableZReports: overflow.AvaialableZReportCount,
          availableUnsentReceipts: overflow.AvaialableUnsendReceiptCount,
        };
      } catch (e) {
        return { ok: false, error: this.errText(e) };
      }
    });
  }

  // ── Shift (Z-report) mapping ────────────────────────────────────────────────
  /**
   * Make sure the device has an open Z-report, skipping the check when we already know it does.
   *
   * `force` re-asks the device regardless — used by the manual Z-report actions, where the point
   * is to read real state, and by the 704010 recovery, where our cached belief was just disproven.
   */
  private async ensureZReportOpen(
    client: RegosVcrClient,
    smenaId: string | null,
    force = false,
  ): Promise<void> {
    if (this.zReportOpen && !force) return;
    const info = await client.zGetInfo(false);
    const isOpen = Boolean(info.OpenTime?.trim()) && !info.CloseTime?.trim();
    if (!isOpen) {
      const z = await client.zOpen();
      if (smenaId) {
        await getPrismaClient().smena.update({
          where: { id: smenaId },
          data: { regosZReportId: z.id },
        }).catch(() => {});
      }
    }
    this.zReportOpen = true;
  }

  /**
   * How much room the applet has left, written to the log the terminal uploads.
   *
   * REGOS's own spelling: `AvaialableUnsendReceiptCount` is how many *more* unsent receipts the
   * device can hold, so it falls as a backlog to the OFD builds up. That backlog is the leading
   * suspect for `Receipt.Sale` growing slower over weeks, and it is invisible from our side
   * otherwise. Sampled at shift open and shift close — never on the sale path, which must not
   * grow a round-trip to a single-threaded device — so the pair brackets one shift's selling and
   * reads as a delta.
   *
   * The device's own maximum is not documented, so nothing here judges the number; it is logged
   * for its trend. Best-effort throughout: a diagnostic may not fail a shift.
   */
  private async logDeviceCapacity(client: RegosVcrClient, when: 'shift-open' | 'shift-close'): Promise<void> {
    try {
      const o = await client.getOverflowInfo();
      log.info(
        `[fiscal-timing] VCR capacity ${when}: unsent-receipt slots left=${o.AvaialableUnsendReceiptCount} z-report slots left=${o.AvaialableZReportCount}`,
      );
    } catch (e) {
      log.info(`[fiscal-timing] VCR capacity ${when}: unavailable (${this.errText(e)})`);
    }
  }

  /** Ensure a VCR Z-report is open for a new shift (called from smena:open). Best-effort. */
  async openShift(smenaId: string): Promise<void> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return;
    const client = this.buildClient(cfg);
    if (!client) return;
    await this.runExclusive(async () => {
      try {
        await this.ensureZReportOpen(client, smenaId);
      } catch (e) {
        console.error('[fiscal] openShift failed:', this.errText(e));
      }
      await this.logDeviceCapacity(client, 'shift-open');
    });
  }

  /** Close the VCR Z-report (called when a Smena closes). Best-effort. */
  async closeZReport(): Promise<void> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return;
    const client = this.buildClient(cfg);
    if (!client) return;
    await this.runExclusive(async () => {
      // Read before the close, so the open/close pair brackets exactly this shift's selling.
      await this.logDeviceCapacity(client, 'shift-close');
      // Whatever happens next, our cached belief that a Z-report is open is no longer trustworthy.
      this.zReportOpen = false;
      try {
        await client.zClose();
      } catch (e) {
        // An empty Z-report (no receipts) can't be closed — that's expected, not an error.
        if (e instanceof VcrError && e.code === ERR_ZREPORT_EMPTY) return;
        console.error('[fiscal] ZReport.Close failed:', this.errText(e));
      }
    });
  }

  // ── Z-report status / manual control (for the Smena page) ───────────────────

  /** Current fiscal Z-report info for display (ZReport.GetInfo, no print). */
  async getZReportInfo(): Promise<FiscalZReportStatus> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return { enabled: false, open: false };
    const client = this.buildClient(cfg);
    if (!client) return { enabled: true, open: false, error: 'Пароль кассира не задан' };
    return this.runExclusive(async () => {
      try {
        const z = await client.zGetInfo(false);
        const open = Boolean(z.OpenTime?.trim()) && !z.CloseTime?.trim();
        // An authoritative read we are making anyway — resync the cache from it.
        this.zReportOpen = open;
        return {
          enabled: true,
          open,
          info: {
            terminalId: z.TerminalID,
            number: z.Number,
            openTime: z.OpenTime,
            closeTime: z.CloseTime,
            totalSaleCount: z.TotalSaleCount,
            totalSaleCash: z.TotalSaleCash / 100,
            totalSaleCard: z.TotalSaleCard / 100,
            totalSaleVat: z.TotalSaleVat / 100,
            totalRefundCount: z.TotalRefundCount,
            totalRefundCash: z.TotalRefundCash / 100,
            totalRefundCard: z.TotalRefundCard / 100,
          },
        };
      } catch (e) {
        return { enabled: true, open: false, error: this.errText(e) };
      }
    });
  }

  /** Manually open the fiscal Z-report (resync when shift is open but Z-report isn't). */
  async openZReportManual(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return { ok: false, error: 'Фискализация выключена' };
    const client = this.buildClient(cfg);
    if (!client) return { ok: false, error: 'Пароль кассира не задан' };
    const smena = await getPrismaClient().smena.findFirst({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    return this.runExclusive(async () => {
      try {
        // Manual action: re-ask the device rather than trusting the cache, since the reason to
        // press this button is usually that the cached state and the device disagree.
        await this.ensureZReportOpen(client, smena?.id ?? null, true);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: this.errText(e) };
      }
    });
  }

  /** Manually close the fiscal Z-report (returns a result for UI feedback). */
  async closeZReportManual(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return { ok: false, error: 'Фискализация выключена' };
    const client = this.buildClient(cfg);
    if (!client) return { ok: false, error: 'Пароль кассира не задан' };
    return this.runExclusive(async () => {
      this.zReportOpen = false;
      try {
        await client.zClose();
        return { ok: true };
      } catch (e) {
        // Empty Z-report → nothing to close; treat as success so the UI isn't alarmed.
        if (e instanceof VcrError && e.code === ERR_ZREPORT_EMPTY) return { ok: true };
        return { ok: false, error: this.errText(e) };
      }
    });
  }

  // ── Position / payment builders ─────────────────────────────────────────────
  private async buildPositions(
    sale: {
      discountAmount: unknown;
      regosLabels: string | null;
      fiscalSubstitutions?: string | null;
      items: Array<Record<string, unknown>>;
    },
    cfg: ResolvedConfig,
  ): Promise<{ positions: VcrPosition[]; meta: PositionMeta[]; partial: boolean }> {
    const prisma = getPrismaClient();
    const labels: FiscalLabel[] = sale.regosLabels ? safeParseLabels(sale.regosLabels) : [];
    // Per line, not per barcode: two packs of one drink share a barcode but never a code.
    const lineLabels = labelsPerLine(sale.items as Array<{ barcode: string }>, labels);

    // The backlog run's per-line plan: a line with a dead or missing marking code goes out as the
    // substitute product at its own amount (card receipts), or is left off (cash/Click receipts
    // send only their valid marked lines). Only this payload changes; the sale itself never does.
    const planByItem = new Map(parseLinePlan(sale.fiscalSubstitutions).map((p) => [p.itemId, p]));
    let substitute: SubstituteProduct | null = null;
    if ([...planByItem.values()].some((p) => p.action === 'substitute')) {
      substitute = cfg.substituteProductId
        ? await prisma.product.findUnique({
            where: { id: cfg.substituteProductId },
            include: { category: true },
          })
        : null;
      // Never fall back to sending the dead code: REGOS would reject it, or worse, accept it.
      if (!substitute) throw new Error('Товар-замена для фискализации не выбран или удалён');
    }

    const orderDiscount = Number(sale.discountAmount) || 0;
    const totalSubtotal = sale.items.reduce((s, it) => s + Number(it.subtotal), 0) || 1;

    // One query for every line's product instead of one per line. This runs inside the VCR lock,
    // so N sequential SQLite round-trips (each joining category) delayed the device call itself —
    // and a big receipt paid for it linearly.
    const productIds = [...new Set(sale.items.map((it) => Number(it.productId)))];
    // The generated SQLite client is require()d, so its delegates are untyped — this annotation is
    // what documents which product fields a fiscal position actually depends on.
    const productRows: FiscalProduct[] = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { category: true },
    });
    const productById = new Map(productRows.map((p) => [p.id, p] as const));

    const positions: VcrPosition[] = [];
    const meta: PositionMeta[] = [];
    let partial = false;
    for (const [lineIndex, item] of sale.items.entries()) {
      const plan = planByItem.get(String(item.id));
      if (plan?.action === 'omit') {
        partial = true;
        continue;
      }
      const sub = plan?.action === 'substitute' ? substitute : null;
      const product = sub ?? productById.get(Number(item.productId));
      const subtotal = Number(item.subtotal);
      const amount = Math.round(subtotal * 100);
      // Non-VAT-payer store: send "Без НДС" (vat_value=-1) for every line and ignore any
      // per-product/global rate. -1 is the REGOS sentinel for "не плательщик НДС" — DISTINCT
      // from a 0% rate (vat_value=0, льготники only, rejected for non-payers). `rate` is set to
      // the same sentinel purely so the heal short-circuits and the failure log reads "без НДС".
      // Otherwise: VAT must match the rate registered for the product's MXIK — a mixed catalog
      // (0% staples vs 12% goods) can't use one global rate. Prefer the product's own vatRate;
      // fall back to the store-wide default only when it's unset.
      const rate = cfg.nonVatPayer ? NON_VAT_PAYER_VAT_VALUE : (product?.vatRate ?? cfg.vatPercent);
      // Round VAT *up*, not to nearest. REGOS re-derives the rate from the position as
      // vat_value*100/(amount-vat_value) and TRUNCATES it. Math.round here yields a VAT whose
      // implied rate lands just under the target (e.g. 12% → 11.9946%), which truncates to 11%
      // — an unregistered rate → 701003 "Ставка НДС не найдена". Ceil keeps the implied rate in
      // [rate, rate+ε) so it truncates back to exactly `rate`; cost is ≤1 tiyin extra VAT.
      const vat = cfg.nonVatPayer
        ? NON_VAT_PAYER_VAT_VALUE
        : rate > 0
          ? Math.ceil((amount * rate) / (100 + rate))
          : 0;
      const discount =
        orderDiscount > 0 ? Math.round(((orderDiscount * subtotal) / totalSubtotal) * 100) : 0;

      const pos: VcrPosition = {
        name: sub ? sub.nameRu || sub.nameUz : String(item.productName),
        barcode: sub ? sub.barcode : String(item.barcode),
        icps: normalizeMxik(product?.mxik) ?? '',
        amount,
        // REGOS is told the PHYSICAL piece count, not the number of boxes. Its implied unit
        // price is amount/quantity, and package_code registers the product in its SMALLEST
        // packaging unit (pickSingleUnitPackage in shared/utils/mxik-packages), i.e. one piece.
        // Sending 1 for a box would make the implied unit price the box price and disagree with
        // the registered package. amount stays the true line total, so 2 boxes of 5 @ 45 000
        // report quantity 10 000 (10 pcs) / amount 9 000 000 → 9 000 per piece.
        // A substituted line is 1 kg of the (weighed) substitute, so its unit price is the amount.
        quantity: sub
          ? SUBSTITUTE_QUANTITY
          : Math.round(toPieces(Number(item.quantity), Number(item.piecesPerUnit ?? 1)) * 1000),
        vat_value: vat,
        discount,
        unit_name: product?.unit ?? undefined,
        group_name: product?.category?.nameRu ?? undefined,
        owner_type: 'BuyingAndSelling',
      };
      if (product?.packageCode) pos.package_code = product.packageCode;
      const label = sub ? undefined : lineLabels[lineIndex];
      if (label) pos.label = label;
      positions.push(pos);
      // A VAT heal on a substituted line corrects the substitute — it is the product sent.
      meta.push({
        productId: sub ? sub.id : Number(item.productId),
        rate,
        ...(product?.isValid === false ? { invalid: true } : {}),
      });
    }
    if (positions.length === 0) throw new Error('В чеке не осталось позиций для фискализации');
    // A full receipt pays finalAmount to the tiyin, so its line discounts must add up to the order
    // discount. A partial one (lines left off) pays only its sent lines (paymentsFor), which balance
    // by construction — settling it would load the left-off lines' discount onto the sent ones.
    if (!partial) settleDiscountRemainder(positions, Math.round(orderDiscount * 100));
    return { positions, meta, partial };
  }

  /**
   * Payments for what is actually sent. A receipt with lines left off (backlog, cash/Click only)
   * pays exactly the sent lines, as cash — Click is fiscal cash too. Everything else is unchanged.
   */
  private paymentsFor(
    sale: Parameters<RegosVcrService['buildPayments']>[0],
    built: { positions: VcrPosition[]; partial: boolean },
  ): VcrPayment[] {
    if (!built.partial) return this.buildPayments(sale);
    const value = built.positions.reduce((s, p) => s + p.amount - (p.discount ?? 0), 0);
    return [{ type: 1, value }];
  }

  /**
   * Self-heal a VAT-rate rejection. REGOS resolves each position's VAT rate from its MXIK in the
   * soliq registry and rejects a wrong rate; our stored product.vatRate (or the global default)
   * can disagree — e.g. a VAT-exempt staple left NULL falls back to 12%. Rather than orphan the
   * sale as FAILED, re-probe the real device per position (Receipt.ValidateSale is side-effect
   * free) to find the rate it actually accepts, correct vat_value in place, and persist the
   * discovered rate back onto the product so it syncs to every terminal and never fails again.
   *
   * Reuses the real positions (so marking labels / package codes are present) and only varies
   * vat_value. Returns true if any position's rate was corrected (caller should retry the sale).
   */
  private async healVatRates(
    client: RegosVcrClient,
    positions: VcrPosition[],
    meta: PositionMeta[],
  ): Promise<boolean> {
    const prisma = getPrismaClient();
    let changed = false;
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const currentRate = meta[i].rate;
      // Try the line's current rate first (it may be a different line that's wrong), then the
      // statutory alternatives. dedup keeps the probe count minimal.
      const candidates = [...new Set([currentRate, 0, 12, 6])];
      let accepted: number | null = null;
      for (const rate of candidates) {
        const vat = rate > 0 ? Math.ceil((pos.amount * rate) / (100 + rate)) : 0;
        try {
          await client.validateSale([{ ...pos, vat_value: vat }], [{ type: 1, value: pos.amount }], true);
          accepted = rate;
          pos.vat_value = vat; // mutate the real position used by the retried sale
          break;
        } catch (e) {
          if (e instanceof VcrError && e.code === 0) throw e; // device unreachable — abort healing
          if (e instanceof VcrError && isVatRateError(e)) continue; // wrong rate — try next candidate
          break; // a non-VAT line fault (marking/MXIK) — can't heal this line, leave it
        }
      }
      if (accepted !== null && accepted !== currentRate) {
        changed = true;
        meta[i].rate = accepted;
        log.info(`[fiscal] VAT heal: product ${meta[i].productId} ${currentRate}% → ${accepted}%`);
        await prisma.product
          .update({ where: { id: meta[i].productId }, data: { vatRate: accepted } })
          .catch(() => {}); // bumps updatedAt → syncs the corrected rate up and back down
      }
    }
    return changed;
  }

  /**
   * Finds which products a receipt-level rejection was about, and marks them invalid.
   *
   * REGOS names no position, so a one-line receipt is blamed outright and a longer one is probed:
   * each line alone through Receipt.ValidateSale (side-effect free, as healVatRates does), and only
   * the lines that are themselves rejected for a product reason are blamed — never the innocent
   * neighbours of a bad line. Failure path only, inside the VCR lock the sale already holds.
   * A device that stops answering mid-probe blames nobody.
   */
  private async blameRejectedProducts(
    client: RegosVcrClient,
    rejection: VcrError,
    positions: VcrPosition[],
    meta: PositionMeta[],
  ): Promise<void> {
    if (positions.length === 0) return; // failed before the receipt was built
    const blamed: number[] = [];
    if (positions.length === 1) {
      blamed.push(0);
    } else {
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        try {
          await client.validateSale([pos], [{ type: 1, value: pos.amount - pos.discount }], true);
        } catch (e) {
          if (e instanceof VcrError && e.code === 0) return;
          if (isProductRejection(e)) blamed.push(i);
        }
      }
    }

    const products = blamed.map((i) => ({ productId: meta[i].productId, barcode: positions[i].barcode }));
    for (const p of products) {
      log.warn(`[fiscal] product ${p.barcode} marked invalid: [${rejection.code}] ${rejection.description}`);
    }
    await markProductsInvalid(products, rejection.code);
  }

  private buildPayments(sale: {
    paymentMethod: string;
    finalAmount: unknown;
    regosPaymentId?: string | null;
    payments?: TenderLine[];
  }): VcrPayment[] {
    if (sale.paymentMethod === MIXED_TENDER && sale.payments?.length) {
      return this.buildSplitPayments(sale.payments, sale.regosPaymentId ?? null);
    }
    const value = Math.round(Number(sale.finalAmount) * 100);
    // paymentMethod may be 'cash'/'card'/'uzqr'/'click' (POS quick-pay) or upper-case elsewhere.
    // Click is fiscalised as cash: the receipt says cash although the money went to the shop's
    // Click account. isFiscalCashTender, never isCashTender — the drawer is a different question.
    if (isFiscalCashTender(sale.paymentMethod)) return [{ type: 1, value }];

    // A Payment.Create-backed tender (UzQR) is booked by REFERENCE: VCR already holds the
    // amount against that payment id, so the receipt links to it instead of restating a sum.
    // `value` is deliberately omitted — the Receipt.Sale example for a Payment.Create-backed
    // payment sends payment_id alone, and sending both risks a mismatch rejection.
    //
    // Only ONE such payment is allowed per receipt, and it may not be reused across receipts,
    // which is why the UzQR flow fiscalizes immediately rather than deferring.
    if (sale.regosPaymentId) return [{ type: 2, payment_id: sale.regosPaymentId }];

    // Plain cashless: a bank terminal the POS does not drive (card, or UzQR with the
    // integration switched off). REGOS treats it as a card payment.
    return [{ type: 2, value, card_type: 2 }];
  }

  /**
   * A split-payment receipt, tender by tender (Receipt.Sale takes a cash and a card payment side by
   * side). Cash and Click together are one cash payment — Click is fiscalised as cash; card and a
   * plain UzQR line are one card payment; a REGOS-backed UzQR line is booked by reference, alone,
   * as in the single-tender case. Lines are stored net of change, so they sum to the receipt.
   *
   * 55 000 cash + 45 000 card  → [{type 1, 5 500 000}, {type 2, 4 500 000}]
   * 55 000 cash + 45 000 Click → [{type 1, 10 000 000}]
   */
  private buildSplitPayments(lines: TenderLine[], regosPaymentId: string | null): VcrPayment[] {
    const t = tenderAmounts({ paymentMethod: MIXED_TENDER, paidAmount: 0 }, lines);
    const tiyin = (n: number) => Math.round(n * 100);
    const payments: VcrPayment[] = [];

    const cash = tiyin(t.cash) + tiyin(t.click);
    if (cash > 0) payments.push({ type: 1, value: cash });

    const byReference = regosPaymentId && t.uzqr > 0;
    const card = tiyin(t.card) + (byReference ? 0 : tiyin(t.uzqr));
    if (card > 0) payments.push({ type: 2, value: card, card_type: 2 });
    if (byReference) payments.push({ type: 2, payment_id: regosPaymentId });

    return payments;
  }

  /**
   * Reconstruct everything about a receipt for the Receipt Details modal — the stored
   * fiscal metadata + the EXACT Receipt.Sale body sent to REGOS:VCR. Read-only: it reuses
   * buildPositions/buildPayments (no VCR calls, no writes), so it's the ground truth for
   * "what is sent to the fiscal module", including per-line MXIK, package_code, VAT and the
   * marking DataMatrix labels. Returns null if the sale doesn't exist.
   */
  async previewSalePayload(saleId: string): Promise<FiscalSalePreview | null> {
    const prisma = getPrismaClient();
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });
    if (!sale) return null;

    const cfg = await this.resolveConfig();
    const built = await this.buildPositions(sale as never, cfg);
    const { positions } = built;
    const payments = this.paymentsFor(sale as never, built);
    const labels: FiscalLabel[] = sale.regosLabels ? safeParseLabels(sale.regosLabels) : [];

    return {
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      createdAt: sale.createdAt.toISOString(),
      cashierName: sale.cashierName,
      terminalId: sale.terminalId,
      paymentMethod: sale.paymentMethod,
      totalAmount: Number(sale.totalAmount),
      discountAmount: Number(sale.discountAmount),
      finalAmount: Number(sale.finalAmount),
      fiscalStatus: sale.fiscalStatus ?? null,
      fiscalError: sale.fiscalError ?? null,
      fiscalAttempts: sale.fiscalAttempts ?? null,
      regosReceiptNo: sale.regosReceiptNo ?? null,
      regosReceiptId: sale.regosReceiptId ?? null,
      regosFiscalSign: sale.regosFiscalSign ?? null,
      regosQrCodeUrl: sale.regosQrCodeUrl ?? null,
      regosTerminalId: sale.regosTerminalId ?? null,
      regosFiscalAt: sale.regosFiscalAt ? sale.regosFiscalAt.toISOString() : null,
      refunded: sale.refunded ?? false,
      labels,
      config: {
        enabled: cfg.enabled,
        url: cfg.url,
        login: cfg.login,
        posId: cfg.posId,
        nonVatPayer: cfg.nonVatPayer,
        vatPercent: cfg.vatPercent,
      },
      request: {
        method: 'Receipt.Sale',
        code: sale.id,
        pos_id: cfg.posId,
        session_code: sale.smenaId ?? null,
        cashier_name: sale.cashierName,
        positions: positions as unknown as FiscalPreviewPosition[],
        payments: payments as unknown as FiscalPreviewPayment[],
      },
    };
  }

  // ── Fiscalize one sale ───────────────────────────────────────────────────────
  async fiscalizeSale(saleId: string): Promise<void> {
    // The timer starts HERE, before the queue, so its first phase measures how long this receipt
    // waited behind other VCR work. That wait is invisible from inside the device and is the usual
    // explanation for a receipt that took far longer than the device itself did.
    const timer = new FiscalTimer();
    return this.runExclusive(() => this.fiscalizeSaleImpl(saleId, timer));
  }

  private async fiscalizeSaleImpl(saleId: string, timer = new FiscalTimer()): Promise<void> {
    timer.phase('queue');
    // Handing the main role over (§11.4): the new main's copy may already be taken, and a receipt
    // fiscalized here now would read PENDING there and be fiscalized a second time. Left PENDING,
    // it is fiscalized once — by the new main.
    if (isWriteFrozen()) return;
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return;
    const prisma = getPrismaClient();
    const client = this.buildClient(cfg);
    if (!client) {
      await prisma.sale.update({
        where: { id: saleId },
        data: { fiscalStatus: 'FAILED', fiscalError: 'Пароль кассира не задан' },
      }).catch(() => {});
      return;
    }
    timer.phase('config');

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });
    if (!sale || sale.fiscalStatus === 'FISCALIZED') return;
    timer.phase('load');

    // Hoisted so the catch block can log the VAT rates / amounts actually sent to the VCR.
    let positions: VcrPosition[] = [];
    let meta: PositionMeta[] = [];
    try {
      await this.ensureZReportOpen(client, sale.smenaId);
      timer.phase('zreport');
      const built = await this.buildPositions(sale as never, cfg);
      ({ positions, meta } = built);
      const payments = this.paymentsFor(sale as never, built);
      if (FISCAL_DEBUG) {
        console.log('[fiscal] positions:', JSON.stringify(positions));
        console.log('[fiscal] payments:', JSON.stringify(payments));
      }
      timer.phase('build');
      // Nothing reaches Receipt.Sale with a code asl-belgisi calls out of circulation.
      await this.applyMarkingGate(sale as never, positions, cfg);
      timer.phase('marking');
      // What the device is about to be asked to verify, logged alongside how long it then took.
      timer.contents(positions.length, positions.filter((p) => p.label).length);
      let result: VcrReceiptResult | null = null;
      // Straight to Receipt.Sale — no Receipt.ValidateSale pre-flight. Sale applies exactly the
      // same validation and returns the same error, so the pre-flight only doubled the round-trips
      // to a single-threaded device on every receipt to learn nothing new. Validation still has a
      // job here, just on the failure path: healVatRates() probes with it.
      //
      // Two one-shot recoveries, each allowed once:
      //  - Z-report not open → our cached belief was stale (closed in the REGOS app, or the 24h
      //    auto-close). Re-check for real and retry.
      //  - VAT rate rejected → re-probe the device per position for the rate it accepts, correct
      //    it (and persist back to the product), then retry.
      for (let healedVat = false, reopenedZ = false; result === null; ) {
        try {
          result = await client.sale({
            positions,
            payments,
            code: sale.id, // idempotency key
            session_code: sale.smenaId ?? undefined,
            cashier_name: sale.cashierName,
            pos_id: cfg.posId,
          });
        } catch (e) {
          if (!reopenedZ && e instanceof VcrError && e.code === ERR_ZREPORT_NOT_OPEN) {
            reopenedZ = true;
            this.zReportOpen = false;
            log.info(`[fiscal] Z-report was not open for ${sale.receiptNumber} — reopening`);
            await this.ensureZReportOpen(client, sale.smenaId, true);
            continue;
          }
          // The VAT-rate heal probes numeric rates [0,12,6]; it's meaningless (and wrong) for a
          // non-VAT-payer store, whose only valid value is the "Без НДС" sentinel — skip it.
          if (!healedVat && !cfg.nonVatPayer && e instanceof VcrError && isVatRateError(e)) {
            healedVat = true;
            if (await this.healVatRates(client, positions, meta)) {
              log.info(`[fiscal] VAT rates healed for ${sale.receiptNumber} — retrying`);
              continue;
            }
          }
          throw e;
        }
      }
      timer.phase('vcr-sale');
      console.log(`[fiscal] FISCALIZED ${sale.receiptNumber} → ReceiptNo=${result.ReceiptNo}`);
      await prisma.sale.update({
        where: { id: saleId },
        data: {
          fiscalStatus: 'FISCALIZED',
          // Bank turnover: the server learns the receipt was fiscalized (fiscal-status-sync.ts).
          fiscalSynced: false,
          regosReceiptId: result.Id,
          regosFiscalSign: result.FiscalSign,
          regosQrCodeUrl: result.QRCodeURL,
          regosTerminalId: result.TerminalID,
          regosReceiptNo: result.ReceiptNo,
          regosFiscalAt: new Date(),
          fiscalError: null,
          markingBlock: null,
        },
      });
      // REGOS took every product on it, so none of them is invalid any more (Product.isValid).
      await markProductsValid(sentProducts(positions, meta));
      timer.phase('persist');
      timer.finish(sale.receiptNumber, true);
    } catch (e) {
      // A blocked receipt never reached the device: nothing to recover, nobody to blame, no
      // attempt counted. applyMarkingGate already recorded why.
      if (e instanceof MarkingBlockedError) {
        timer.finish(sale.receiptNumber, false);
        throw e;
      }
      // Note: the timer is closed at each exit below, not here — the recovery path that follows
      // can still turn this into a fiscalized receipt, and calling it a failure now would log a
      // FAILED line for a sale that succeeded.
      // Use the electron-log instance (not raw console) so these lines land in the upload buffer
      // → terminal_logs → super-admin Logs dashboard. Main-process console is NOT captured.
      // The SQLite client is require()d, so `sale` is untyped — name the one field read.
      const names = sale.items.map((i: { productName: string }) => i.productName);
      log.error(`[fiscal] ✗ fiscalize ${saleId} failed: ${this.errText(e)}${loggedItems(names)}`);
      // Log the raw REGOS code + description too — describeVcrError() collapses several distinct
      // VAT/MXIK faults into one staff message, which hides which one actually fired when debugging.
      if (e instanceof VcrError) log.error(`[fiscal] raw VCR error [${e.code}] ${e.method}: ${e.description}`);
      const unreachable = e instanceof VcrError && e.code === 0;

      // Recovery: a business-level failure may mean Receipt.Sale actually registered on
      // the VCR but the response was lost, or this is a retry hitting the uniqueness guard
      // (we send sale.id as `code`). Either way the receipt exists fiscally — look it up by
      // our code and adopt it rather than orphaning a fiscalized sale as FAILED. Skipped for
      // network errors (nothing was sent) and validation errors return null here harmlessly.
      if (!unreachable) {
        const recovered = await this.tryRecoverByCode(client, sale.id);
        if (recovered) {
          console.log(`[fiscal] recovered ${sale.receiptNumber} by code → ReceiptNo=${recovered.ReceiptNo}`);
          await prisma.sale.update({
            where: { id: saleId },
            data: {
              fiscalStatus: 'FISCALIZED',
              // Bank turnover: the server learns the receipt was fiscalized (fiscal-status-sync.ts).
              fiscalSynced: false,
              regosReceiptId: recovered.Id,
              regosFiscalSign: recovered.FiscalSign,
              regosQrCodeUrl: recovered.QRCodeURL,
              regosTerminalId: recovered.TerminalID,
              regosReceiptNo: recovered.ReceiptNo,
              regosFiscalAt: new Date(),
              fiscalError: null,
              markingBlock: null,
            },
          }).catch(() => {});
          await markProductsValid(sentProducts(positions, meta));
          timer.phase('recover');
          timer.finish(sale.receiptNumber, true);
          return; // recovered — do not propagate the error
        }
      }

      // A rejection about a product's own data: mark the product(s) at fault invalid until their
      // next arrival. After the recovery above — a receipt the device already holds blames nobody.
      if (isProductRejection(e)) await this.blameRejectedProducts(client, e, positions, meta);

      await prisma.sale.update({
        where: { id: saleId },
        data: unreachable
          ? { fiscalStatus: 'PENDING', fiscalError: this.errText(e) }
          : { fiscalStatus: 'FAILED', fiscalAttempts: { increment: 1 }, fiscalError: this.errText(e) },
      }).catch(() => {});
      timer.finish(sale.receiptNumber, false);
      throw e;
    }
  }

  /**
   * Look up a receipt on the VCR by our idempotency `code` (= sale.id). Returns the
   * fiscal result only if a fiscalized receipt with a FiscalSign is found, else null.
   * Never throws — a failed lookup (network, not found) just means "no recovery".
   */
  private async tryRecoverByCode(
    client: RegosVcrClient,
    code: string,
  ): Promise<(VcrReceiptResult & { Code: string }) | null> {
    try {
      const existing = await client.getReceiptInfo({ Code: code });
      return existing?.FiscalSign ? existing : null;
    } catch {
      return null;
    }
  }

  /** Manual admin retry — clears the attempt cap for one sale. Returns a result (never throws). */
  async retrySale(saleId: string): Promise<{ ok: boolean; error?: string }> {
    await getPrismaClient().sale.update({
      where: { id: saleId },
      data: { fiscalStatus: 'PENDING', fiscalAttempts: 0, fiscalError: null },
    });
    try {
      await this.fiscalizeSale(saleId);
      return { ok: true };
    } catch (e) {
      if (e instanceof VcrError) return { ok: false, error: describeVcrError(e.code, e.description) };
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Print a fiscal duplicate of a fiscalized sale's receipt. */
  async printDuplicate(saleId: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.resolveConfig();
    const client = this.buildClient(cfg);
    const sale = await getPrismaClient().sale.findUnique({ where: { id: saleId } });
    if (!sale?.regosReceiptId) return { ok: false, error: 'Чек не фискализирован' };
    if (!client) return { ok: false, error: 'Виртуальная касса не настроена' };
    return this.runExclusive(async () => {
      try {
        await client.duplicate(sale.regosReceiptId!);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: this.errText(e) };
      }
    });
  }

  /** Full refund of a fiscalized sale via its stored QR code. */
  async refundSale(saleId: string): Promise<{ ok: boolean; fiscalSign?: string; error?: string }> {
    const cfg = await this.resolveConfig();
    const client = this.buildClient(cfg);
    const sale = await getPrismaClient().sale.findUnique({ where: { id: saleId } });
    if (!sale?.regosQrCodeUrl) return { ok: false, error: 'Чек не фискализирован' };
    if (!client) return { ok: false, error: 'Виртуальная касса не настроена' };
    return this.runExclusive(async () => {
      try {
        const result = await client.fullRefund(sale.regosQrCodeUrl!);
        await getPrismaClient().sale.update({ where: { id: saleId }, data: { refunded: true } });
        return { ok: true, fiscalSign: result.FiscalSign };
      } catch (e) {
        return { ok: false, error: this.errText(e) };
      }
    });
  }

  /**
   * The marking-circulation gate (marking-gate.ts), with `regos_vcr_circulation_check` on: asks
   * asl-belgisi about every code this receipt will carry — the scan-time check has usually left
   * the answer in the cache. Throws MarkingBlockedError after recording the block; clears a block
   * that no longer holds. A receipt that is already blocked is asked fresh, with the roomier
   * timeout: that is a person pressing Retry.
   */
  private async applyMarkingGate(
    sale: { id: string; markingBlock?: string | null },
    positions: VcrPosition[],
    cfg: ResolvedConfig,
  ): Promise<void> {
    if (!cfg.circulationCheck) return;
    const prior = parseMarkingBlock(sale.markingBlock);
    const sent = positions.flatMap((p) => (p.label ? [{ barcode: p.barcode, label: p.label }] : []));

    const fresh = prior.length > 0;
    const answers = await Promise.all(
      sent.map((l) =>
        checkCirculation(l.label, { fresh, timeoutMs: fresh ? 8000 : SALE_PATH_TIMEOUT_MS }),
      ),
    );
    const blocked = decideMarkingBlock(sent, answers, prior);
    const prisma = getPrismaClient();

    if (blocked.length > 0) {
      log.warn(`[fiscal] marking block on ${sale.id}: ${describeMarkingBlock(blocked)}`);
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          fiscalStatus: 'FAILED',
          markingBlock: JSON.stringify(blocked),
          fiscalError: describeMarkingBlock(blocked),
        },
      });
      throw new MarkingBlockedError(blocked);
    }
    if (prior.length > 0) {
      log.info(`[fiscal] marking block lifted on ${sale.id}`);
      await prisma.sale.update({ where: { id: sale.id }, data: { markingBlock: null } });
    }
  }

  // ── Background worker ─────────────────────────────────────────────────────────
  async processPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const cfg = await this.resolveConfig();
      if (!cfg.enabled) return;
      const prisma = getPrismaClient();
      const pending = await prisma.sale.findMany({
        where: {
          fiscalStatus: { in: ['PENDING', 'FAILED'] },
          fiscalAttempts: { lt: MAX_ATTEMPTS },
          // A blocked receipt waits for an edit or a manual retry. With the check off, the block
          // is inert and the receipt goes like any other.
          ...(cfg.circulationCheck ? { markingBlock: null } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const s of pending) {
        try {
          await this.fiscalizeSale(s.id);
        } catch (e) {
          // VCR unreachable → stop this cycle (no point hammering); retry next tick.
          if (e instanceof VcrError && e.code === 0) break;
          // business error → already recorded; continue to next sale
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * When this till started sending marking codes per line (the first boot of a build that does).
   * Written once and never moved: receipts fiscalised before it may have gone to REGOS with one
   * code for several packs; receipts after it cannot have.
   */
  private async labelsPerLineSince(): Promise<Date> {
    const prisma = getPrismaClient();
    const row = await prisma.systemSetting.findUnique({ where: { key: LABELS_PER_LINE_SINCE } });
    const at = row ? new Date(row.value) : null;
    if (at && !Number.isNaN(at.getTime())) return at;
    const now = new Date();
    await prisma.systemSetting
      .create({ data: { key: LABELS_PER_LINE_SINCE, value: now.toISOString() } })
      .catch(() => {}); // another caller wrote it first — theirs stands
    return now;
  }

  /**
   * Read-only: fiscalised receipts in which two or more packs of one product were sent to REGOS
   * with the same (last scanned) code, before codes were sent per line. Lists the codes REGOS never
   * received, so the owner can decide what to do; nothing here is changed.
   */
  async duplicateCodeReceipts(): Promise<FiscalDuplicateCodeReceipt[]> {
    const since = await this.labelsPerLineSince();
    const rows: Array<{
      id: string;
      receiptNumber: string;
      createdAt: Date;
      regosReceiptNo: string | null;
      regosFiscalAt: Date | null;
      regosLabels: string | null;
      items: Array<{ barcode: string; productName: string }>;
    }> = await getPrismaClient().sale.findMany({
      where: { fiscalStatus: 'FISCALIZED', regosLabels: { not: null }, regosFiscalAt: { lt: since } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        receiptNumber: true,
        createdAt: true,
        regosReceiptNo: true,
        regosFiscalAt: true,
        regosLabels: true,
        items: { select: { barcode: true, productName: true } },
      },
    });
    const out: FiscalDuplicateCodeReceipt[] = [];
    for (const s of rows) {
      const lines = duplicateCodeLines(safeParseLabels(s.regosLabels ?? '[]'), s.items);
      if (lines.length === 0) continue;
      out.push({
        saleId: s.id,
        receiptNumber: s.receiptNumber,
        createdAt: s.createdAt.toISOString(),
        regosReceiptNo: s.regosReceiptNo,
        regosFiscalAt: s.regosFiscalAt ? s.regosFiscalAt.toISOString() : null,
        lines,
      });
    }
    return out;
  }

  async getQueueStatus(): Promise<FiscalQueueStatus> {
    const prisma = getPrismaClient();
    const enabled = await this.isEnabled();
    const [pending, failed, fiscalized] = await Promise.all([
      prisma.sale.count({ where: { fiscalStatus: 'PENDING' } }),
      prisma.sale.count({ where: { fiscalStatus: 'FAILED' } }),
      prisma.sale.count({ where: { fiscalStatus: 'FISCALIZED' } }),
    ]);
    return { enabled, pending, failed, fiscalized };
  }

  // ── Fiscal backlog: the 4-step stepper on the Fiscal Settings screen ────────────────────────────
  // Each step is its own call, run when the admin presses it, and recomputes the backlog from the
  // database — nothing is carried between steps in memory, so a restart between steps is harmless.
  // Rule #1 decides what may skip (see shared/utils/fiscal-backlog.ts); everything else is fiscalised.

  /** Which step is running right now, so a second press (or a remounted screen) cannot overlap it. */
  private backlogRunning: FiscalBacklogStep | null = null;

  backlogBusy(): FiscalBacklogStep | null {
    return this.backlogRunning;
  }

  private async withBacklogLock<T extends { ok: boolean; error?: string }>(
    step: FiscalBacklogStep,
    busy: T,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (this.backlogRunning) return busy;
    this.backlogRunning = step;
    try {
      return await fn();
    } finally {
      this.backlogRunning = null;
    }
  }

  /**
   * Every receipt from `fromDate` (YYYY-MM-DD, local midnight) that is still a backlog candidate,
   * oldest first, with what rule #1 and the marking checks need.
   */
  private async loadBacklog(fromDate: string) {
    const [y, m, d] = fromDate.split('-').map(Number);
    const from = new Date(y, (m || 1) - 1, d || 1);
    if (Number.isNaN(from.getTime())) throw new Error(`bad from date: ${fromDate}`);
    const rows = await getPrismaClient().sale.findMany({
      where: {
        createdAt: { gte: from },
        // Spelled out so NULL (no status ever set) stays in: `notIn` alone drops NULL rows.
        OR: [{ fiscalStatus: null }, { fiscalStatus: { notIn: ['FISCALIZED', 'DEFERRED_DEBT'] } }],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        receiptNumber: true,
        createdAt: true,
        finalAmount: true,
        paymentMethod: true,
        debtAmount: true,
        fiscalStatus: true,
        fiscalError: true,
        regosLabels: true,
        fiscalSubstitutions: true,
        payments: { select: { method: true } },
        items: {
          select: {
            id: true,
            barcode: true,
            productName: true,
            product: {
              select: { id: true, nameRu: true, nameUz: true, barcode: true, mxik: true, isMarked: true, packageCode: true },
            },
          },
        },
      },
    });
    // getPrismaClient() is require()d and untyped; this is the shape selected above.
    type BacklogRow = {
      id: string;
      receiptNumber: string;
      createdAt: Date;
      finalAmount: unknown;
      paymentMethod: string;
      debtAmount: unknown;
      fiscalStatus: string | null;
      fiscalError: string | null;
      regosLabels: string | null;
      fiscalSubstitutions: string | null;
      payments: Array<{ method: string }>;
      items: Array<{
        id: string;
        barcode: string;
        productName: string;
        product: {
          id: number;
          nameRu: string;
          nameUz: string;
          barcode: string;
          mxik: string | null;
          isMarked: boolean | null;
          packageCode: string | null;
        } | null;
      }>;
    };
    return (rows as BacklogRow[])
      .filter((s) => isBacklogCandidate(s.fiscalStatus, s.fiscalError))
      .map((s) => {
        const marked = s.items.some((it) => it.product != null && productRequiresMarking(it.product));
        const skippable = maySkipFiscalisation(
          { paymentMethod: s.paymentMethod, debtAmount: Number(s.debtAmount ?? 0), payments: s.payments },
          marked,
        );
        const cashOnly = isCashOrClickOnly({
          paymentMethod: s.paymentMethod,
          debtAmount: Number(s.debtAmount ?? 0),
          payments: s.payments,
        });
        return { ...s, marked, skippable, cashOnly };
      });
  }

  /** Step 1: DISABLE (tagged) what rule #1 lets skip; list what must be fiscalised. */
  async backlogClassify(fromDate: string): Promise<FiscalBacklogClassifyResult> {
    const busy: FiscalBacklogClassifyResult = { ok: false, error: 'BUSY', skipped: 0, kept: [] };
    return this.withBacklogLock('classify', busy, async () => {
      const prisma = getPrismaClient();
      const sales = await this.loadBacklog(fromDate);
      const skipIds = sales.filter((s) => s.skippable).map((s) => s.id);

      let skipped = 0;
      // Chunked: SQLite caps bound variables per statement.
      for (let i = 0; i < skipIds.length; i += 500) {
        const r = await prisma.sale.updateMany({
          where: {
            id: { in: skipIds.slice(i, i + 500) },
            // Re-checked here: a receipt fiscalised since it was read must stay FISCALIZED.
            OR: [{ fiscalStatus: null }, { fiscalStatus: { notIn: ['FISCALIZED', 'DEFERRED_DEBT'] } }],
          },
          data: { fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG },
        });
        skipped += r.count;
      }

      const kept = sales
        .filter((s) => !s.skippable)
        .map((s) => ({
          saleId: s.id,
          receiptNumber: s.receiptNumber,
          createdAt: s.createdAt.toISOString(),
          finalAmount: Number(s.finalAmount),
          paymentMethod: s.paymentMethod,
          fiscalStatus: s.fiscalStatus,
          marked: s.marked,
        }));
      log.info(`[fiscal] backlog classify from ${fromDate}: ${skipped} skipped (rule #1), ${kept.length} to fiscalise`);
      return { ok: true, skipped, kept };
    });
  }

  /**
   * Step 2: strip whitespace from every product's stored MXIK (a pasted "01905007001000000 "
   * failed every 17-digit check, so tasnif was asked and the product reported as NO_MXIK); undo
   * the Russian-layout corruption in stored marking codes; fill a missing MXIK from
   * tasnif.soliq.uz (exact barcode match only) and save it on the product, with the single-unit
   * package code for a marked one; then list products REGOS will still reject. Saving bumps
   * updatedAt, so the corrected product syncs like the VAT heal's.
   */
  async backlogRepair(fromDate: string): Promise<FiscalBacklogRepairResult> {
    const busy: FiscalBacklogRepairResult = {
      ok: false, error: 'BUSY', labelsRepaired: 0, receiptsTouched: 0, mxikCleaned: 0, mxikFilled: [], tasnifUnreachable: 0, productIssues: [],
    };
    return this.withBacklogLock('repair', busy, async () => {
      const prisma = getPrismaClient();

      // Every product, not just the backlog's: a dirty code fails live sales too. Runs before the
      // backlog is read so the checks below see the cleaned values.
      const withMxik: Array<{ id: number; mxik: string }> = await prisma.product.findMany({
        where: { mxik: { not: null } },
        select: { id: true, mxik: true },
      });
      let mxikCleaned = 0;
      for (const p of withMxik) {
        const clean = normalizeMxik(p.mxik);
        if (clean === p.mxik || !clean || !/^\d{17}$/.test(clean)) continue;
        await prisma.product.update({ where: { id: p.id }, data: { mxik: clean } });
        mxikCleaned++;
      }

      const kept = (await this.loadBacklog(fromDate)).filter((s) => !s.skippable);
      let labelsRepaired = 0;
      let receiptsTouched = 0;
      for (const s of kept) {
        if (!s.regosLabels) continue;
        const n = await this.repairSaleLabels(s.id);
        labelsRepaired += n;
        if (n > 0) receiptsTouched++;
      }

      // Every distinct product in the kept receipts, once.
      type P = NonNullable<(typeof kept)[number]['items'][number]['product']>;
      const products = new Map<number, { p: P; name: string }>();
      for (const s of kept) {
        for (const it of s.items) {
          if (it.product && !products.has(it.product.id)) {
            products.set(it.product.id, { p: { ...it.product }, name: it.product.nameRu || it.product.nameUz || it.productName });
          }
        }
      }

      const mxikFilled: FiscalBacklogRepairResult['mxikFilled'] = [];
      let tasnifUnreachable = 0;
      for (const { p, name } of products.values()) {
        if (/^\d{17}$/.test(p.mxik ?? '')) continue;
        const r = await lookupMxikByBarcode(p.barcode);
        if (!r.ok) {
          tasnifUnreachable++;
          continue;
        }
        if (!r.match || !/^\d{17}$/.test(r.match.code)) continue;
        const data: { mxik: string; packageCode?: string } = { mxik: r.match.code };
        if (productRequiresMarking({ isMarked: p.isMarked, mxik: r.match.code }) && !p.packageCode) {
          const pick = pickSingleUnitPackage(await getMxikPackages(r.match.code));
          if (pick) data.packageCode = pick.code;
        }
        await prisma.product.update({ where: { id: p.id }, data });
        p.mxik = data.mxik;
        if (data.packageCode) p.packageCode = data.packageCode;
        mxikFilled.push({ productId: p.id, name, barcode: p.barcode, mxik: data.mxik });
      }

      const productIssues: FiscalBacklogProductIssue[] = [];
      for (const { p, name } of products.values()) {
        if (!/^\d{17}$/.test(p.mxik ?? '')) {
          productIssues.push({ productId: p.id, name, barcode: p.barcode, problem: 'NO_MXIK' });
        } else if (productRequiresMarking(p) && !p.packageCode) {
          productIssues.push({ productId: p.id, name, barcode: p.barcode, problem: 'NO_PACKAGE_CODE' });
        }
      }
      log.info(
        `[fiscal] backlog repair: ${mxikCleaned} MXIK cleaned, ${labelsRepaired} labels in ${receiptsTouched} receipts, ${mxikFilled.length} MXIK from tasnif (${tasnifUnreachable} unreachable), ${productIssues.length} product issues`,
      );
      return { ok: true, labelsRepaired, receiptsTouched, mxikCleaned, mxikFilled, tasnifUnreachable, productIssues };
    });
  }

  /**
   * Step 3: ask asl-belgisi about every marking code in the kept receipts (the same lookup as the
   * Marking Check screen) and decide each line, stored in sales.fiscal_substitutions:
   *  - card/UzQR receipt: a dead or missing code → the line goes out as the substitute product;
   *  - cash/Click receipt: only marked lines with a valid code are sent, everything else is left
   *    off; with no valid code at all the receipt is DISABLED (SKIP_TAG_MARKING).
   * Stops — without guessing — when the registry can't answer.
   */
  async backlogVerify(
    fromDate: string,
    onProgress?: (p: FiscalBacklogProgress) => void,
  ): Promise<FiscalBacklogVerifyResult> {
    const busy: FiscalBacklogVerifyResult = { ok: false, error: 'BUSY', checked: 0, disabled: 0, changes: [] };
    return this.withBacklogLock('verify', busy, async () => {
      const prisma = getPrismaClient();
      const cfg = await this.resolveConfig();
      const kept = (await this.loadBacklog(fromDate)).filter((s) => !s.skippable);
      const result: FiscalBacklogVerifyResult = { ok: true, checked: 0, disabled: 0, changes: [] };

      // The substitute is checked once, the first time a line needs it.
      let substituteChecked = false;
      const ensureSubstitute = async (): Promise<string | null> => {
        if (substituteChecked) return null;
        if (!cfg.substituteProductId) return 'NO_SUBSTITUTE';
        const p = await prisma.product.findUnique({
          where: { id: cfg.substituteProductId },
          select: { mxik: true },
        });
        if (!p) return 'NO_SUBSTITUTE';
        if (!/^\d{17}$/.test(normalizeMxik(p.mxik) ?? '')) return 'SUBSTITUTE_NO_MXIK';
        substituteChecked = true;
        return null;
      };

      // One registry call per distinct code, however many receipts carry it.
      const verdicts = new Map<string, { verdict: 'IN' | 'OUT' | 'UNKNOWN'; status?: string; error?: string; reachable: boolean }>();
      const total = kept.length;
      let processed = 0;

      for (const s of kept) {
        onProgress?.({ step: 'verify', processed, total, currentReceipt: s.receiptNumber });
        const labels = s.regosLabels ? safeParseLabels(s.regosLabels) : [];
        // Per line: two packs of one drink share a barcode but never a code.
        const lineLabels = labelsPerLine(s.items, labels);
        const plan: FiscalLinePlan[] = [];
        const changes: FiscalBacklogVerifyResult['changes'] = [];
        let validMarked = 0;

        for (const [i, it] of s.items.entries()) {
          const productName = it.product?.nameRu || it.product?.nameUz || it.productName;
          if (!it.product || !productRequiresMarking(it.product)) {
            // A cash/Click receipt sends only its valid marked lines.
            if (s.cashOnly) plan.push({ itemId: it.id, action: 'omit', reason: 'UNMARKED' });
            continue;
          }

          const label = lineLabels[i];
          let reason: string | null = null;
          if (!label) {
            reason = 'NO_LABEL';
          } else {
            let v = verdicts.get(label);
            if (!v) {
              const lookup = await verifyMarkingCodeDetails(label);
              v = lookup.reachable
                ? {
                    reachable: true,
                    status: lookup.details?.isValid === false ? 'NOT_FOUND' : lookup.details?.status,
                    verdict: lookup.details?.isValid === false ? 'OUT' : classifyCirculation(lookup.details?.status),
                  }
                : { reachable: false, verdict: 'UNKNOWN', error: lookup.error };
              verdicts.set(label, v);
            }
            result.checked++;
            if (!v.reachable) {
              return { ...result, ok: false, error: v.error ?? 'REGISTRY_UNREACHABLE', stoppedAt: { receipt: s.receiptNumber, label } };
            }
            // A status we do not classify is sent as it is: REGOS decides (user, 2026-10-09). Only
            // an unreachable registry, above, still stops the step.
            if (v.verdict === 'UNKNOWN') {
              log.info(`[fiscal] backlog verify: ${s.receiptNumber} code with unknown status ${v.status ?? '—'} is sent as is`);
            }
            if (v.verdict === 'OUT') reason = v.status ?? 'NOT_FOUND';
          }

          if (!reason) {
            validMarked++;
          } else if (s.cashOnly) {
            plan.push({ itemId: it.id, action: 'omit', reason });
            changes.push({ receipt: s.receiptNumber, productName, reason, action: 'omit' });
          } else {
            const err = await ensureSubstitute();
            if (err) return { ...result, ok: false, error: err, stoppedAt: { receipt: s.receiptNumber } };
            plan.push({ itemId: it.id, action: 'substitute', reason });
            changes.push({ receipt: s.receiptNumber, productName, reason, action: 'substitute' });
          }
        }

        if (s.cashOnly && validMarked === 0) {
          // Rule #1: nothing in this cash/Click receipt may be fiscalised — it is skipped for good.
          await prisma.sale.updateMany({
            where: {
              id: s.id,
              OR: [{ fiscalStatus: null }, { fiscalStatus: { notIn: ['FISCALIZED', 'DEFERRED_DEBT'] } }],
            },
            data: { fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG_MARKING, fiscalSubstitutions: null },
          });
          result.disabled++;
          result.changes.push({
            receipt: s.receiptNumber,
            productName: '',
            reason: changes[0]?.reason ?? 'NO_LABEL',
            action: 'disable',
          });
        } else {
          result.changes.push(...changes);
          // Written for every kept receipt, so a code that is fine now clears an older plan.
          const json = plan.length ? JSON.stringify(plan) : null;
          if (json !== (s.fiscalSubstitutions ?? null)) {
            await prisma.sale.update({ where: { id: s.id }, data: { fiscalSubstitutions: json } });
          }
        }
        processed++;
      }
      onProgress?.({ step: 'verify', processed, total });
      log.info(
        `[fiscal] backlog verify: ${result.checked} codes checked, ${result.changes.length} changes, ${result.disabled} cash receipts disabled`,
      );
      return result;
    });
  }

  /**
   * Step 4: fiscalise every kept receipt, one at a time. A receipt counts as fiscalised only when
   * its status reads FISCALIZED afterwards — fiscalizeSale returns quietly in several cases (write
   * freeze, no password, fiscalisation off) and that must never be reported as success.
   */
  async backlogFiscalize(
    fromDate: string,
    onProgress?: (p: FiscalBacklogProgress) => void,
  ): Promise<FiscalBacklogFiscalizeResult> {
    const busy: FiscalBacklogFiscalizeResult = { ok: false, error: 'BUSY', fiscalized: 0, failed: [] };
    return this.withBacklogLock('fiscalize', busy, async () => {
      const cfg = await this.resolveConfig();
      if (!cfg.enabled) return { ok: false, error: 'FISCAL_DISABLED', fiscalized: 0, failed: [] };
      if (!this.buildClient(cfg)) return { ok: false, error: 'NO_PASSWORD', fiscalized: 0, failed: [] };

      const prisma = getPrismaClient();
      const kept = (await this.loadBacklog(fromDate)).filter((s) => !s.skippable);
      const result: FiscalBacklogFiscalizeResult = { ok: true, fiscalized: 0, failed: [] };
      const total = kept.length;
      let processed = 0;

      for (const s of kept) {
        onProgress?.({ step: 'fiscalize', processed, total, currentReceipt: s.receiptNumber });
        // Conditional, so a receipt fiscalised since it was read is never knocked back to PENDING.
        await prisma.sale.updateMany({
          where: {
            id: s.id,
            OR: [{ fiscalStatus: null }, { fiscalStatus: { notIn: ['FISCALIZED', 'DEFERRED_DEBT'] } }],
          },
          data: { fiscalStatus: 'PENDING', fiscalAttempts: 0, fiscalError: null },
        });
        let thrown: unknown = null;
        try {
          await this.fiscalizeSale(s.id);
        } catch (e) {
          thrown = e;
        }
        processed++;

        const after = await prisma.sale.findUnique({
          where: { id: s.id },
          select: { fiscalStatus: true, fiscalError: true },
        });
        if (after?.fiscalStatus === 'FISCALIZED') {
          result.fiscalized++;
        } else {
          result.failed.push({
            receipt: s.receiptNumber,
            error: after?.fiscalError || (thrown ? this.errText(thrown) : 'NOT_FISCALIZED'),
          });
        }
        // The device stopped answering: the rest stay as they are for a later run.
        if (thrown instanceof VcrError && thrown.code === 0) {
          result.unreachable = true;
          result.ok = false;
          result.error = 'VCR_UNREACHABLE';
          break;
        }
      }
      onProgress?.({ step: 'fiscalize', processed, total });
      log.info(
        `[fiscal] backlog fiscalise: ${result.fiscalized} fiscalised, ${result.failed.length} failed${result.unreachable ? ' (VCR unreachable — stopped early)' : ''}`,
      );
      return result;
    });
  }

  /**
   * Repair a sale's stored marking labels (sale.regosLabels) that were captured while a Cyrillic
   * keyboard layout was active, mapping each corrupted label back to the ASCII the scanner meant.
   * Returns the number of labels actually changed; a no-op (0) when there are none or none are
   * corrupted. See keyboard-layout.ts for why the corruption is deterministic and reversible.
   */
  private async repairSaleLabels(saleId: string): Promise<number> {
    const prisma = getPrismaClient();
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { regosLabels: true },
    });
    if (!sale?.regosLabels) return 0;
    let labels: FiscalLabel[];
    try {
      const parsed = JSON.parse(sale.regosLabels);
      if (!Array.isArray(parsed)) return 0;
      labels = parsed;
    } catch {
      return 0;
    }
    let changed = 0;
    const fixed = labels.map((l) => {
      if (l?.label && isLayoutCorrupted(l.label)) {
        changed++;
        return { ...l, label: repairCyrillicLayout(l.label) };
      }
      return l;
    });
    if (changed > 0) {
      await prisma.sale
        .update({ where: { id: saleId }, data: { regosLabels: JSON.stringify(fixed) } })
        .catch(() => {});
    }
    return changed;
  }

  start(): void {
    // One-time startup diagnostic: surface what config the service actually resolved after a
    // reboot, so a "settings keep disappearing" report can be confirmed (or ruled out) from the
    // log instead of guesswork — including whether the stored VCR password decrypted.
    this.logStartupConfig().catch(() => {});
    this.warmZReportCache().catch(() => {});
    // Fix the per-line-codes cut-off at the first boot of this build, before any receipt is sent.
    this.labelsPerLineSince().catch(() => {});
    // NOTE: the periodic background retry worker was removed by request. Fiscalization now happens
    // (a) immediately when a sale is created, (b) as a flush on shift close (smena:close →
    // processPending), and (c) on demand via the "Fiscalise all old receipts" admin button
    // (the fiscal backlog stepper, backlog*). A silently-looping retry that hammers the VCR every
    // 30s is gone.
  }

  /**
   * Learn the device's Z-report state once at startup, so the first receipt of the session does
   * not pay for it.
   *
   * A shift opened in THIS session already warms the cache through openShift(). The cold case is
   * an app restart with a shift already open — the terminal is relaunched mid-day and the next
   * customer waits out a ZReport.GetInfo (measured at ~1.4s against a real device) on top of their
   * own receipt.
   *
   * Read-only on purpose: this records what the device says and never opens a Z-report. Opening
   * one is a fiscal action that belongs to smena:open or to the first sale, not to app startup.
   */
  private async warmZReportCache(): Promise<void> {
    const cfg = await this.resolveConfig();
    if (!cfg.enabled) return;
    const client = this.buildClient(cfg);
    if (!client) return;
    // No open shift means no receipts are coming, so there is nothing to prepare for — and asking
    // the device would be a pointless call on every launch of an idle terminal.
    const smena = await getPrismaClient().smena.findFirst({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!smena) return;
    try {
      await this.runExclusive(async () => {
        const info = await client.zGetInfo(false);
        this.zReportOpen = Boolean(info.OpenTime?.trim()) && !info.CloseTime?.trim();
      });
      log.info(`[fiscal] Z-report state warmed at startup: open=${this.zReportOpen}`);
    } catch (e) {
      // The device may not be running yet. The first sale will ask again — this is only a warm-up.
      log.info(`[fiscal] could not warm Z-report state at startup: ${this.errText(e)}`);
    }
  }

  /**
   * Strip the password out of a connection string before it reaches a log.
   *
   * This diagnostic is uploaded: `flushLogs()` ships it to `POST /logs/upload`, where it lands in
   * the VPS `terminal_logs` table and the super-admin Logs page. A terminal's own SQLite path is
   * `file:...` and carries no secret, but the value must be sanitised on the way out regardless —
   * this line has already leaked a PostgreSQL password once.
   */
  private redactConnection(url: string | undefined): string {
    if (!url) return '(unset)';
    // Everything between "scheme://" and the LAST "@" of the authority goes, username included.
    // Greedy on purpose: a password containing an unescaped "@" would otherwise survive in part,
    // and over-redacting a diagnostic costs nothing while under-redacting a secret costs a lot.
    // A `file:` URL has no authority and no "@", so a terminal's own path is left readable.
    return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1***@');
  }

  private async logStartupConfig(): Promise<void> {
    try {
      const cfg = await this.resolveConfig();
      const passwordRowExists = await hasVcrPassword();
      log.info('[fiscal] resolved config at startup', {
        db: this.redactConnection(process.env.DATABASE_URL),
        enabled: cfg.enabled,
        url: cfg.url,
        login: cfg.login,
        posId: cfg.posId,
        passwordRowExists,
        passwordDecrypted: Boolean(cfg.password),
      });
      if (passwordRowExists && !cfg.password) {
        log.error('[fiscal] VCR password row present but did NOT decrypt — re-entry required');
      }
    } catch (e) {
      log.error('[fiscal] failed to resolve config at startup:', e instanceof Error ? e.message : e);
    }
  }

  stop(): void {
    if (this.worker) {
      clearInterval(this.worker);
      this.worker = null;
    }
  }

  private errText(e: unknown): string {
    if (e instanceof VcrError) return `[${e.code}] ${describeVcrError(e.code, e.description)}`;
    return e instanceof Error ? e.message : String(e);
  }
}

export const regosVcrService = new RegosVcrService();

/**
 * Resolve the store-wide VAT percent from its stored setting. An unset/blank/invalid value
 * falls back to the UZ statutory rate (12%) — never silently to 0%, which would fiscalize
 * VAT-able goods with vat_value=0 and trip REGOS 701003. An explicit "0" is honoured (a store
 * that genuinely sells only exempt goods can still set 0%).
 */
/**
 * True when a VCR rejection is about the VAT rate not matching the product's MXIK registration.
 * REGOS surfaces these as 701003 with a "Ставка НДС…" description; gate on the text so a generic
 * 701003 (e.g. an MXIK fault) doesn't trigger a pointless heal pass.
 */
function isVatRateError(e: VcrError): boolean {
  return /ставка\s*ндс/i.test(e.description || '');
}

function parseVatPercent(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_VAT_PERCENT;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_VAT_PERCENT;
}

function parseProductId(raw: string | undefined): number | null {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The invalid products a fiscalised receipt carried to REGOS — a substituted line counts as its
 * substitute. Only these need writing: everything else on the receipt is valid already.
 */
function sentProducts(
  positions: VcrPosition[],
  meta: PositionMeta[],
): Array<{ productId: number; barcode: string }> {
  return positions.flatMap((p, i) =>
    meta[i]?.invalid ? [{ productId: meta[i].productId, barcode: p.barcode }] : [],
  );
}

function safeParseLabels(json: string): FiscalLabel[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
