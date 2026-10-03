import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';
import { recomputeBalance } from '../sales/debt-ledger';
import { endpointKnownMissing, noteEndpointStatus } from './missing-endpoints';

/**
 * Nasiya across tills: pull the ledger rows the store's other tills wrote.
 *
 * Every till keeps its own SQLite ledger and uploads it (upload-sync.ts). Before this, nothing came
 * back down: T2 learned a customer's balance once, when the user first arrived, and never again —
 * so a credit sale rung up on T1 was invisible on T2, a payment taken on T2 could not settle it,
 * and the receipt was never fiscalized.
 *
 * Rows are merged, never overwritten, with the same rule the server uses (`mergeLedgerRow` in
 * src/server/modules/debtors/debtors.service.ts): everything about the money is fixed when a row is
 * written; a later copy can only add that a charge got settled, and the earliest settlement wins.
 *
 * The balance follows the ledger only when the server says it does (DEBT_BALANCE_FROM_LEDGER, sent
 * with every page). Until then rows still arrive — history, settlements, receipts — and the stored
 * balance keeps today's behaviour, so one server switch turns the whole store over at once.
 */

const CURSOR_KEY = 'debt_ledger_cursor';
const MODE_KEY = 'debt_ledger_balance_mode';
/** When the last pull finished without an error — shown beside the debtors page's Sync button. */
const LAST_SYNC_KEY = 'debt_ledger_last_sync';
const PAGE = 500;
/** A cycle stops after this many pages and carries on next cycle; the cursor is saved per page. */
const MAX_PAGES = 20;

type Prisma = ReturnType<typeof getPrismaClient>;

interface Cursor {
  updatedAfter: string;
  afterId: string;
}

/** One row as GET /debtors/ledger/sync returns it (Decimal and dates arrive as strings). */
export interface RemoteLedgerRow {
  id: string;
  userId: string;
  type: string;
  amount: string | number;
  paymentMethod: string | null;
  saleId: string | null;
  settledAt: string | null;
  dueDate: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  originTerminalId: string | null;
  settleTender: string | null;
  settleFiscalize: boolean | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
}

interface PullPage {
  rows: RemoteLedgerRow[];
  nextCursor: Cursor | null;
  balanceFromLedger?: boolean;
}

export interface LedgerSettlement {
  settledAt: Date | null;
  settleTender: string | null;
  settleFiscalize: boolean | null;
  originTerminalId: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

/**
 * What an incoming copy may change on a stored row, or null for nothing. Kept identical to the
 * server's rule — a till and the server merging differently would never converge.
 */
export function mergeLedgerRow(
  stored: LedgerSettlement,
  incoming: LedgerSettlement,
): Partial<LedgerSettlement> | null {
  const patch: Partial<LedgerSettlement> = {};

  if (
    incoming.settledAt &&
    (!stored.settledAt || incoming.settledAt.getTime() < new Date(stored.settledAt).getTime())
  ) {
    patch.settledAt = incoming.settledAt;
    patch.settleTender = incoming.settleTender;
    patch.settleFiscalize = incoming.settleFiscalize;
  }
  // A void is final: the first one recorded stands, and nothing un-voids a row.
  if (!stored.voidedAt && incoming.voidedAt) {
    patch.voidedAt = incoming.voidedAt;
    patch.voidedBy = incoming.voidedBy;
    patch.voidReason = incoming.voidReason;
  }
  if (!stored.originTerminalId && incoming.originTerminalId) {
    patch.originTerminalId = incoming.originTerminalId;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export interface PullResult {
  applied: number;
  /** Credit sales held here that another till has just settled — this till fiscalizes them. */
  settledHere: {
    saleId: string;
    tender: string | null;
    fiscalize: boolean | null;
  }[];
}

/**
 * Apply one page of remote rows to this till's ledger.
 *
 * Stops at the first row whose person this till does not have yet (the user pull runs first, but
 * a customer created on another till a moment ago may not have reached it): the cursor is only
 * ever advanced past rows that were actually applied, so that row comes again next cycle.
 */
export async function applyLedgerRows(
  prisma: Prisma,
  rows: RemoteLedgerRow[],
): Promise<
  PullResult & {
    cursor: Cursor | null;
    touchedUsers: Set<string>;
    blocked: boolean;
  }
> {
  const settledHere: PullResult['settledHere'] = [];
  const touchedUsers = new Set<string>();
  let cursor: Cursor | null = null;
  let applied = 0;

  for (const row of rows) {
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true },
    });
    if (!user) return { applied, settledHere, cursor, touchedUsers, blocked: true };

    const incoming: LedgerSettlement = {
      settledAt: row.settledAt ? new Date(row.settledAt) : null,
      settleTender: row.settleTender ?? null,
      settleFiscalize: row.settleFiscalize ?? null,
      originTerminalId: row.originTerminalId ?? null,
      voidedAt: row.voidedAt ? new Date(row.voidedAt) : null,
      voidedBy: row.voidedBy ?? null,
      voidReason: row.voidReason ?? null,
    };

    const local = await prisma.debtTransaction.findUnique({
      where: { id: row.id },
    });
    let newlySettled = false;

    if (!local) {
      await prisma.debtTransaction.create({
        data: {
          id: row.id,
          userId: row.userId,
          type: row.type,
          amount: Number(row.amount),
          paymentMethod: row.paymentMethod ?? null,
          saleId: row.saleId ?? null,
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
          note: row.note ?? null,
          createdBy: row.createdBy,
          createdAt: new Date(row.createdAt),
          ...incoming,
          // The server has it — that is where it came from.
          synced: true,
        },
      });
      newlySettled = incoming.settledAt != null;
      touchedUsers.add(row.userId);
    } else {
      const patch = mergeLedgerRow(local, incoming);
      if (patch) {
        // `synced` is left as it is: a row this till still has to send stays queued.
        await prisma.debtTransaction.update({
          where: { id: row.id },
          data: patch,
        });
        newlySettled = patch.settledAt != null && local.settledAt == null;
        touchedUsers.add(row.userId);
      }
    }

    if (newlySettled && row.type === 'CHARGE' && row.saleId) {
      settledHere.push({
        saleId: row.saleId,
        tender: incoming.settleTender,
        fiscalize: incoming.settleFiscalize,
      });
    }

    applied++;
    cursor = { updatedAfter: row.updatedAt, afterId: row.id };
  }

  return { applied, settledHere, cursor, touchedUsers, blocked: false };
}

async function readSetting(prisma: Prisma, key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeSetting(prisma: Prisma, key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Make each person's stored balance what their ledger adds up to.
 *
 * Only under the server's DEBT_BALANCE_FROM_LEDGER. The first cycle after it is switched on does
 * everyone with a ledger, not only the rows that moved: the cursor may already be past the rows
 * that make up an older balance.
 */
async function alignBalances(prisma: Prisma, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const balance = await recomputeBalance(prisma, userId);
    await prisma.user.update({
      where: { id: userId },
      data: { debt: balance },
    });
  }
}

/**
 * Pull, merge, align balances, then fiscalize what other tills finished paying for.
 *
 * Safe to call on every cycle and to interrupt: the cursor is saved after each page, and applying
 * a row twice is a no-op. A server without the endpoint (404) leaves everything as it was.
 *
 * Returns whether the pull reached the end without an error — what the Sync button reports.
 */
export async function pullDebtLedger(): Promise<boolean> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) return false;
  if (endpointKnownMissing('debtors/ledger/sync')) return false;
  const { vpsApiUrl } = getAppConfig();

  const saved = await readSetting(prisma, CURSOR_KEY);
  let cursor: Cursor | null = null;
  try {
    cursor = saved ? (JSON.parse(saved) as Cursor) : null;
  } catch {
    cursor = null; // a full pull is always correct, only slower
  }

  const touched = new Set<string>();
  const settledHere: PullResult['settledHere'] = [];
  let balanceFromLedger: boolean | null = null;
  let failed = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (cursor) {
      query.set('updatedAfter', cursor.updatedAfter);
      query.set('afterId', cursor.afterId);
    }

    const res = await fetch(`${vpsApiUrl}/debtors/ledger/sync?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    noteEndpointStatus('debtors/ledger/sync', res.status);
    if (res.status === 404) return false; // server from before ledger replication
    if (!res.ok) {
      console.error(`[debt-ledger] pull failed (HTTP ${res.status})`);
      failed = true;
      break;
    }

    const body = (await res.json()) as PullPage;
    balanceFromLedger = body.balanceFromLedger === true;

    const result = await applyLedgerRows(prisma, body.rows ?? []);
    result.touchedUsers.forEach((id) => touched.add(id));
    settledHere.push(...result.settledHere);
    if (result.cursor) {
      cursor = result.cursor;
      await writeSetting(prisma, CURSOR_KEY, JSON.stringify(cursor));
    }

    if (result.blocked || !body.nextCursor) break;
  }

  if (balanceFromLedger !== null) {
    const previous = await readSetting(prisma, MODE_KEY);
    if (balanceFromLedger) {
      const everyone =
        previous !== 'ledger'
          ? (
              (await prisma.debtTransaction.findMany({
                distinct: ['userId'],
                select: { userId: true },
              })) as { userId: string }[]
            ).map((r) => r.userId)
          : [];
      await alignBalances(prisma, [...new Set([...touched, ...everyone])]);
    }
    await writeSetting(prisma, MODE_KEY, balanceFromLedger ? 'ledger' : 'till');
  }

  await fiscalizeSettledElsewhere(prisma, settledHere);

  if (failed) return false;
  await writeSetting(prisma, LAST_SYNC_KEY, new Date().toISOString());
  return true;
}

/** The server said balances follow the ledger (as of this till's last pull). */
export async function isLedgerBalanceMode(prisma: Prisma): Promise<boolean> {
  return (await readSetting(prisma, MODE_KEY)) === 'ledger';
}

/** ISO time of the last complete ledger pull, or null if there has not been one. */
export async function lastLedgerSync(prisma: Prisma): Promise<string | null> {
  return readSetting(prisma, LAST_SYNC_KEY);
}

/**
 * Receipts rung up here and paid off on another till.
 *
 * This till holds the sale, so this till issues its receipt — the same `fiscalizeSettledSale` a
 * local payoff calls, which does nothing unless the sale is still DEFERRED_DEBT and the fiscal
 * device is on. A shop that chose "without fiscalization" at the payoff (settleFiscalize false)
 * gets exactly what it chose: the sale stays deferred.
 *
 * Imported lazily: the fiscal service starts the app logger on import (tasks/lessons.md).
 */
async function fiscalizeSettledElsewhere(
  prisma: Prisma,
  settled: PullResult['settledHere'],
): Promise<void> {
  const wanted = settled.filter((s) => s.fiscalize !== false);
  if (wanted.length === 0) return;

  const local = (await prisma.sale.findMany({
    where: { id: { in: wanted.map((s) => s.saleId) } },
    select: { id: true },
  })) as { id: string }[];
  const here = new Set(local.map((s) => s.id));
  if (here.size === 0) return;

  const { fiscalizeSettledSale } = await import('../sales/settle-sale');
  for (const s of wanted) {
    if (here.has(s.saleId)) await fiscalizeSettledSale(s.saleId, s.tender ?? 'cash');
  }
}
