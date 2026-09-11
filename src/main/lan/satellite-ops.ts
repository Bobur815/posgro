import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { openCashDrawer, printReceipt } from '../printer/thermal-printer';
import { printZXReport } from '../printer/smena-report-printer';
import { currentShift, shiftHistory } from '../sales/shifts';
import type { AuthUser } from '../../shared/types/user.types';
import {
  MainLinkError,
  SESSION_USER_KEY,
  mainRequest,
  setSession,
} from './main-link';
import {
  applyStock,
  cacheMovement,
  cacheSale,
  cacheShift,
  forgetSale,
  type RemoteMovement,
  type RemoteSale,
  type RemoteShift,
  type RemoteStock,
} from './satellite-cache';

/**
 * What the IPC handlers do on a satellite (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.7–§5.14).
 *
 * The renderer is untouched: `sales:create`, `smena:open`, `auth:login` and friends keep their
 * contracts and simply branch here when this terminal is a satellite. Every write goes to the main,
 * which owns the truth; what comes back is cached locally so it can be printed at this till and read
 * when the main is away.
 */

/** A sale waits up to 10s on the main for its fiscal QR, so give the request room for that. */
const SALE_TIMEOUT_MS = 25_000;

const db = () => getPrismaClient();

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function unreachable(err: unknown): boolean {
  return err instanceof MainLinkError && err.code === 'MAIN_UNREACHABLE';
}

// ── Login (§5.13, §6.9) ─────────────────────────────────────────────────────────────────────────

interface RemoteUser {
  id: string;
  phone: string;
  role: string;
  nameUz: string;
  nameRu: string;
}

function authUser(u: RemoteUser): AuthUser {
  return { id: u.id, phone: u.phone, role: u.role as AuthUser['role'], nameUz: u.nameUz, nameRu: u.nameRu };
}

/** Hold the session in memory, and remember who it belongs to for a read-only restart (§6.9). */
async function adopt(res: { user: RemoteUser; session: string }): Promise<{ user: AuthUser; token: string }> {
  setSession(res.session);
  const user = authUser(res.user);
  await db().systemSetting.upsert({
    where: { key: SESSION_USER_KEY },
    update: { value: JSON.stringify(user) },
    create: { key: SESSION_USER_KEY, value: JSON.stringify(user) },
  });
  // The main's session token doubles as the renderer's: it is what the renderer hands back to
  // auth:restoreSession after a restart.
  return { user, token: res.session };
}

export async function login(phone: string, password: string) {
  return adopt(await mainRequest('POST', '/terminal/auth/login', { body: { phone, password } }));
}

export async function loginWithPin(pin: string) {
  return adopt(await mainRequest('POST', '/terminal/auth/pin', { body: { pin } }));
}

/**
 * Whether to offer PIN login. With the main away nobody can log in at all, so the answer then is
 * "no" — the login screen falls back to the password form, which says why it cannot work.
 */
export async function isPinConfigured(): Promise<boolean> {
  try {
    const res = await mainRequest<{ configured: boolean }>('GET', '/terminal/auth/pin-configured');
    return Boolean(res?.configured);
  } catch {
    return false;
  }
}

/**
 * Restore a session after a restart.
 *
 * With the main reachable it decides. With the main away, a session that was already open survives
 * and degrades to read-only (§6.9): the person saved at login is trusted if the token is theirs and
 * has not expired. Nothing can be sold that way — every sale still has to reach the main.
 */
export async function restoreSession(token: string): Promise<AuthUser | null> {
  setSession(token);
  try {
    const res = await mainRequest<{ user: RemoteUser }>('GET', '/terminal/auth/session', { person: true });
    return (await adopt({ user: res.user, session: token })).user;
  } catch (err) {
    if (!unreachable(err)) {
      setSession(null);
      return null;
    }
    const saved = await db().systemSetting.findUnique({ where: { key: SESSION_USER_KEY } });
    const user = saved ? (JSON.parse(saved.value) as AuthUser) : null;
    const claims = decodeClaims(token);
    if (!user || claims.sub !== user.id || claims.exp * 1000 <= Date.now()) {
      setSession(null);
      return null;
    }
    return user;
  }
}

function decodeClaims(token: string): { sub?: string; exp: number } {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return { sub: payload.sub, exp: Number(payload.exp) || 0 };
  } catch {
    return { exp: 0 };
  }
}

export async function logout(): Promise<void> {
  setSession(null);
  await db().systemSetting.deleteMany({ where: { key: SESSION_USER_KEY } });
}

export async function hasPin(): Promise<boolean> {
  return Boolean((await mainRequest<{ hasPin: boolean }>('GET', '/terminal/auth/has-pin', { person: true }))?.hasPin);
}

export async function setupPin(pin: string): Promise<true> {
  await mainRequest('POST', '/terminal/auth/pin/setup', { person: true, body: { pin } });
  return true;
}

export async function removePin(): Promise<true> {
  await mainRequest('DELETE', '/terminal/auth/pin', { person: true });
  return true;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<true> {
  await mainRequest('POST', '/terminal/auth/change-password', {
    person: true,
    body: { currentPassword, newPassword },
  });
  return true;
}

// ── Sales (§5.5, §5.9, §5.12) ───────────────────────────────────────────────────────────────────

interface CommitReply {
  sale: RemoteSale;
  stock: RemoteStock[];
  replayed: boolean;
}

/**
 * The cart as the main needs it: each line also names its product by barcode, because this till's
 * product ids are its own (see `onThisMain` in local-server/routes/satellite.ts).
 */
async function forTheMain(data: any): Promise<any> {
  const ids = [...new Set((data.items ?? []).map((i: any) => Number(i.productId)))] as number[];
  const products = await db().product.findMany({ where: { id: { in: ids } }, select: { id: true, barcode: true } });
  const barcodeById = new Map(products.map((p: { id: number; barcode: string }) => [p.id, p.barcode]));
  return {
    ...data,
    items: (data.items ?? []).map((item: any) => ({
      ...item,
      productBarcode: barcodeById.get(Number(item.productId)),
    })),
  };
}

/**
 * The idempotency key for a sale that may already have reached the main.
 *
 * A commit that timed out may have been committed; the cashier's natural reaction is to press pay
 * again, with the same cart. Reusing the key for an identical cart makes that second press return
 * the sale the main already made instead of selling everything twice. Any definite answer — the
 * sale, or a refusal — clears it.
 */
let unconfirmed: { fingerprint: string; id: string } | null = null;

function fingerprint(body: any): string {
  return JSON.stringify({
    items: body.items.map((i: any) => [i.productBarcode, i.quantity, i.unitPrice, i.piecesPerUnit ?? 1]),
    paymentMethod: body.paymentMethod,
    discountAmount: body.discountAmount ?? 0,
  });
}

/**
 * Cache what the main committed and print it here — always, even where the VCR prints its own
 * receipt, because the VCR is at the main and this customer is standing at this till (§6.7). A
 * failed fiscalization still prints: the customer must not be held up by a fiscal problem (§5.12).
 */
async function keepAndPrint(reply: CommitReply): Promise<unknown> {
  try {
    if (reply.sale.smenaId && !(await db().smena.findUnique({ where: { id: reply.sale.smenaId } }))) {
      const current = await mainRequest<{ smena: RemoteShift | null }>('GET', '/terminal/smena/current', {
        person: true,
      }).catch(() => null);
      if (current?.smena) await cacheShift(current.smena);
    }
    await applyStock(reply.stock);
    await cacheSale(reply.sale, reply.stock);
  } catch (err) {
    // The sale is committed on the main whatever happens here. Say so loudly, and still hand the
    // cashier the sale rather than an error that reads like it failed.
    console.error('[satellite] could not cache a committed sale:', err instanceof Error ? err.message : err);
    return reply.sale;
  }

  printReceipt(reply.sale.id).catch((e) =>
    console.error('[printer] auto receipt print failed:', e instanceof Error ? e.message : e),
  );

  const local = await db().sale.findUnique({ where: { id: reply.sale.id }, include: { items: true } });
  return plain(local ?? reply.sale);
}

export async function createSale(data: any): Promise<unknown> {
  const body = await forTheMain(data);
  const print = fingerprint(body);
  const id = unconfirmed?.fingerprint === print ? unconfirmed.id : randomUUID();
  unconfirmed = { fingerprint: print, id };

  let reply: CommitReply;
  try {
    reply = await mainRequest<CommitReply>('POST', '/terminal/sales', {
      person: true,
      idempotent: true,
      timeoutMs: SALE_TIMEOUT_MS,
      body: { ...body, id },
    });
  } catch (err) {
    if (!unreachable(err)) unconfirmed = null;
    throw err;
  }
  unconfirmed = null;
  return keepAndPrint(reply);
}

export async function updateSale(saleId: string, data: any): Promise<unknown> {
  const reply = await mainRequest<CommitReply>('PUT', `/terminal/sales/${encodeURIComponent(saleId)}`, {
    person: true,
    timeoutMs: SALE_TIMEOUT_MS,
    body: await forTheMain(data),
  });
  return keepAndPrint(reply);
}

export async function deleteSale(saleId: string): Promise<true> {
  const reply = await mainRequest<{ stock: RemoteStock[] }>(
    'DELETE',
    `/terminal/sales/${encodeURIComponent(saleId)}`,
    { person: true },
  );
  await forgetSale(saleId);
  await applyStock(reply?.stock ?? []);
  return true;
}

// ── Shifts (§5.14) ──────────────────────────────────────────────────────────────────────────────

/**
 * The open shift. From the main when it answers — cached as it passes — and from that cache when
 * it does not, so the shift panel still shows the day's figures in read-only mode (§5.9).
 */
export async function getCurrentShift(): Promise<unknown> {
  try {
    const { smena } = await mainRequest<{ smena: (RemoteShift & { stats: unknown }) | null }>(
      'GET',
      '/terminal/smena/current',
      { person: true },
    );
    if (smena) await cacheShift(smena);
    return smena;
  } catch (err) {
    if (!unreachable(err)) throw err;
    return currentShift(getAppConfig().terminalId);
  }
}

export async function openShift(initialCash: number): Promise<unknown> {
  const smena = await mainRequest<RemoteShift>('POST', '/terminal/smena/open', {
    person: true,
    body: { initialCash },
  });
  await cacheShift(smena);
  openCashDrawer().catch((err) => console.error('[Smena] Cash drawer error on open:', err));
  return smena;
}

export async function addMovement(data: {
  smenaId: string;
  type: 'PAY_IN' | 'PAY_OUT';
  amount: number;
  note?: string;
}): Promise<unknown> {
  const movement = await mainRequest<RemoteMovement>('POST', '/terminal/smena/movement', {
    person: true,
    body: data,
  });
  await cacheMovement(movement);
  if (data.type === 'PAY_IN') {
    openCashDrawer().catch((err) => console.error('[Smena] Cash drawer error on PAY_IN:', err));
  }
  return movement;
}

/** Close on the main, then print this till's Z-report here, on its own printer. */
export async function closeShift(smenaId: string, finalCash: number): Promise<unknown> {
  const { smena, stats } = await mainRequest<{ smena: RemoteShift; stats: any }>(
    'POST',
    '/terminal/smena/close',
    { person: true, body: { smenaId, finalCash } },
  );
  await cacheShift(smena);
  try {
    await printZXReport({ smena: smena as any, stats, isXReport: false });
  } catch (err) {
    console.error('[Smena] Z-report print error:', err);
  }
  return { ...smena, stats };
}

export async function printShiftReport(smenaId: string, isXReport: boolean): Promise<true> {
  const report = await mainRequest<{ smena: RemoteShift; stats: any }>(
    'GET',
    `/terminal/smena/${encodeURIComponent(smenaId)}/report`,
    { person: true },
  );
  if (isXReport && report.smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');
  await printZXReport({
    smena: { ...report.smena, ...(isXReport ? { finalCash: null } : {}) } as any,
    stats: report.stats,
    isXReport,
  });
  return true;
}

export async function getShiftHistory(limit: number): Promise<unknown> {
  try {
    return await mainRequest('GET', `/terminal/smena/history?limit=${limit}`, { person: true });
  } catch (err) {
    if (!unreachable(err)) throw err;
    return shiftHistory(getAppConfig().terminalId, limit);
  }
}
