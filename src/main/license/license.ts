import { BrowserWindow } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from '../sync/queue-manager';
import {
  holdsSeat,
  licenseState,
  publicKeyFrom,
  readLicense,
  type LicensePayload,
} from '../../shared/utils/license';
import type { TillLicenseState, TillLicenseStatus } from '../../shared/types/store.types';
import { DAY_MS } from '../../shared/utils/subscription';
import type { SaleRefusal } from '../sales/commit-sale';
import { LICENSE_PUBLIC_KEY } from './license-public-key';
import * as clock from './trusted-clock';

/**
 * This till's license: the store's subscription as the server last signed it
 * (shared/utils/license.ts), judged by a clock the shop cannot wind back (trusted-clock.ts).
 *
 * It is what lets a till enforce a block with no connection — an OFFLINE_ONLY store's never has
 * one. The server's half (SubscriptionInterceptor) refuses a blocked till's sync on top, which is
 * what still holds against a till whose checks here have been edited out.
 *
 * Checked on the main terminal only: a satellite signs in and sells through its main, and those
 * routes check the main's license (local-server/routes/satellite.ts).
 */

const SETTING_KEY = 'store_license';
const REQUEST_TIMEOUT_MS = 8000;
/** How often a till asks for a fresh license by itself, sync or not. */
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
/**
 * How long a till that has never held a license keeps working — every till, the day this ships,
 * until it first reaches the server. The server's own check-in rule is 14 days by default too.
 */
export const UNLICENSED_ALLOWANCE_MS = 14 * DAY_MS;

export type { TillLicenseState, TillLicenseStatus };

let publicKey = publicKeyFrom(LICENSE_PUBLIC_KEY);
/** The license held, once read: undefined until then, null for none (or none valid). */
let held: LicensePayload | null | undefined;

/** Test seam: check licenses against another key — a test signs with its own. */
export function __useLicensePublicKey(base64Der: string): void {
  publicKey = publicKeyFrom(base64Der);
  held = undefined;
}

/** Test seam: forget the license read, as a restart would. */
export function __forgetLicense(): void {
  held = undefined;
}

async function localConfig() {
  return getPrismaClient()
    .localConfig.findUnique({ where: { id: 'config' } })
    .catch(() => null) as Promise<{ storeId?: string | null; apiUrl?: string | null } | null>;
}

async function thisStoreId(): Promise<string | null> {
  return (await localConfig())?.storeId || getAppConfig().storeId || null;
}

async function thisTerminalId(): Promise<string> {
  const config = (await localConfig()) as { terminalId?: string | null } | null;
  return config?.terminalId || getAppConfig().terminalId;
}

/**
 * The terminals this till speaks for when it asks for a license: itself and, on a main, the
 * satellites paired with it — they never reach the server, so the main registers them for their
 * slots. `also` is a satellite about to pair, asked for before it has a row.
 */
export async function terminalClaim(also?: string): Promise<{ terminalId: string; satellites: string[] }> {
  let paired: Array<{ terminalId: string }> = [];
  try {
    paired = await getPrismaClient().pairedTerminal.findMany({
      select: { terminalId: true },
      orderBy: { pairedAt: 'asc' },
    });
  } catch {
    // Naming the satellites is a courtesy to the server's count; a license is worth more.
  }
  const satellites = paired.map((p) => p.terminalId);
  if (also && !satellites.includes(also)) satellites.push(also);
  return { terminalId: await thisTerminalId(), satellites };
}

/** The same claim as a query string, for GET /store-config and /store-config/subscription. */
export async function terminalClaimQuery(claim?: {
  terminalId: string;
  satellites: string[];
}): Promise<string> {
  const { terminalId, satellites } = claim ?? (await terminalClaim());
  const q = new URLSearchParams({ terminal_id: terminalId });
  if (satellites.length) q.set('satellites', satellites.join(','));
  return `?${q.toString()}`;
}

/** The license held, if it is genuine and this store's. */
export async function heldLicense(): Promise<LicensePayload | null> {
  if (held !== undefined) return held;
  const row = await getPrismaClient().systemSetting.findUnique({ where: { key: SETTING_KEY } });
  const payload = readLicense(row?.value, publicKey);
  held = payload && payload.storeId === (await thisStoreId()) ? payload : null;
  // The server's clock when it signed is a moment that has certainly passed.
  if (held) await clock.raiseTo(Date.parse(held.issuedAt));
  return held;
}

/**
 * Take a license the server sent — if it is genuine, this store's, and newer than the one held.
 * Newer only: a license kept from a month when the store was paid up cannot be played back to
 * undo a block. A newer one also sets the trusted clock to the server's time, which is how a clock
 * that ran ahead by accident is corrected. Returns whether it was taken.
 */
export async function acceptLicense(token: unknown): Promise<boolean> {
  const payload = readLicense(token, publicKey);
  if (!payload || payload.storeId !== (await thisStoreId())) return false;
  const current = await heldLicense();
  if (current && Date.parse(payload.issuedAt) <= Date.parse(current.issuedAt)) return false;

  const value = token as string;
  await getPrismaClient().systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
  held = payload;
  await clock.correctTo(Date.parse(payload.issuedAt));
  void broadcast();
  return true;
}

/**
 * Ask the server for a fresh license. First by renewing the one held — no sign-in needed, so this
 * works for a till whose token lapsed long ago — then, for a till that holds none yet, through
 * /store-config with the stored sign-in token. Returns whether a newer license was taken.
 */
export async function refreshLicense(alsoSatellite?: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const apiUrl = (await localConfig())?.apiUrl || getAppConfig().vpsApiUrl;
  try {
    const claim = await terminalClaim(alsoSatellite);
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row?.value) {
      const res = await fetch(`${apiUrl}/licenses/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license: row.value, ...claim }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return acceptLicense(((await res.json()) as { license?: unknown }).license);
    }

    const token =
      getServerToken() ??
      (await prisma.systemSetting.findUnique({ where: { key: 'server_token' } }))?.value ??
      null;
    if (!token) return false;
    const res = await fetch(`${apiUrl}/store-config${await terminalClaimQuery(claim)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    return acceptLicense(((await res.json()) as { license?: unknown }).license);
  } catch (e) {
    // console, not the logger module: this sits under commitSale, and the logger starts
    // electron-log on import. The app's logger captures console output all the same.
    console.info(`[license] refresh failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/**
 * Where a till stands now, by its license and the trusted clock: this one by default, a satellite
 * by its id (the main holds the license for both), or — with null — the store alone, for what is
 * not any one till's, such as the web dashboard.
 */
export async function licenseStatus(terminalId?: string | null): Promise<TillLicenseStatus> {
  const now = await clock.trustedNow();
  const clockBehind = clock.systemBehindBy(now) > clock.CLOCK_BEHIND_LIMIT_MS;
  const license = await heldLicense();

  if (!license) {
    const until = (await clock.firstSeen()) + UNLICENSED_ALLOWANCE_MS;
    const works = now < until;
    return {
      // Past the allowance with no license, the fix is the same as an overdue check-in.
      state: works ? 'unlicensed' : 'checkin-required',
      daysLeft: Math.max(0, Math.ceil((until - now) / DAY_MS)),
      plan: null,
      expiresAt: null,
      blockAt: null,
      clockBehind,
      canSignIn: works,
      canSell: works && !clockBehind,
      terminals: null,
      seated: true,
    };
  }

  const judged = licenseState(license, now);
  const id = terminalId === undefined ? await thisTerminalId() : terminalId;
  const seated = id === null || holdsSeat(license, id);
  // Paying, or checking in, comes first: a slot alone would not let this till work.
  const storeWorks = judged.state !== 'blocked' && judged.state !== 'checkin-required';
  const state: TillLicenseState = storeWorks && !seated ? 'terminal-limit' : judged.state;
  const works = storeWorks && seated;
  return {
    state,
    daysLeft: judged.daysLeft,
    plan: license.plan,
    expiresAt: license.expiresAt,
    blockAt: license.blockAt,
    clockBehind,
    canSignIn: works,
    canSell: works && !clockBehind,
    terminals: license.terminals ?? null,
    seated,
  };
}

/**
 * Whether a satellite may pair with this main, by the store's terminal slots. Online, the server
 * decides: the satellite is claimed with a license renewal, and the fresh license says whether it
 * got a slot. Offline, the last license is counted against: every terminal it seats, this main,
 * and the satellites already paired all take one. Re-pairing a till already paired is always
 * allowed — it already has its place.
 */
export async function mayPair(terminalId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  if (await prisma.pairedTerminal.findUnique({ where: { terminalId } }).catch(() => null)) return true;
  const renewed = await refreshLicense(terminalId);
  const license = await heldLicense();
  if (!license?.seats || license.terminals === undefined) return true;
  if (renewed) return holdsSeat(license, terminalId);
  const { terminalId: main, satellites } = await terminalClaim();
  const taken = new Set([...license.seats, main, ...satellites]);
  return taken.has(terminalId) || taken.size < license.terminals;
}

/** The `auth.errors.*` key for a till that may not sign in, by its state. */
function signInRefusal(state: TillLicenseState): string {
  if (state === 'blocked') return 'auth.errors.subscription_blocked';
  if (state === 'terminal-limit') return 'auth.errors.terminal_limit';
  return 'auth.errors.license_checkin_required';
}

/**
 * Refuse a sign-in the license does not allow. A blocked till first asks the server once — the
 * store may have paid since the license was last renewed — so paying is enough to get back in.
 * Throws an `auth.errors.*` key the login screens translate.
 */
export async function assertCanSignIn(terminalId?: string | null): Promise<void> {
  let status = await licenseStatus(terminalId);
  if (!status.canSignIn) {
    await refreshLicense();
    status = await licenseStatus(terminalId);
  }
  if (!status.canSignIn) throw new Error(signInRefusal(status.state));
}

/** Why a till (this one by default) may not sell or open a shift right now, or null when it may. */
export async function sellingRefusal(terminalId?: string): Promise<SaleRefusal | null> {
  const status = await licenseStatus(terminalId);
  if (status.canSell) return null;
  if (status.state === 'blocked') return { code: 'SUBSCRIPTION_BLOCKED' };
  if (status.state === 'terminal-limit') return { code: 'TERMINAL_LIMIT' };
  if (!status.canSignIn) return { code: 'LICENSE_CHECKIN_REQUIRED' };
  return { code: 'CLOCK_BEHIND' };
}

async function broadcast(): Promise<void> {
  try {
    const status = await licenseStatus();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('license:changed', status);
    }
  } catch {
    /* no window yet, or tests */
  }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Renew by itself every few hours, and once shortly after start — a till in a store that never
 * syncs has no other way to learn of a payment, or to check in before its deadline.
 */
export function startLicenseRefresh(): void {
  if (refreshTimer) return;
  // A newer license announces itself; otherwise say where the till stands, as time has moved on.
  const run = () =>
    void refreshLicense().then((taken) => {
      if (!taken) void broadcast();
    });
  setTimeout(run, 15_000);
  refreshTimer = setInterval(run, REFRESH_EVERY_MS);
}

export function stopLicenseRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
