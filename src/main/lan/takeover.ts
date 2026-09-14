import * as bcrypt from 'bcryptjs';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import {
  databaseFilePath,
  getPrismaClient,
  getUserDataPath,
  openDatabaseAt,
} from '../database/sqlite-client';
import { requireSuperAdmin } from '../auth/super-admin';
import { generateDeviceSecret } from '../local-server/pairing';
import { DEFAULT_PORT } from '../local-server';
import { getLanAddress } from '../network/lan-address';
import { SATELLITE_MACHINE_SETTINGS } from '../sync/local-only-settings';
import { log } from '../logger';
import { MainLinkError, mainDownload, mainRequest } from './main-link';
import { normaliseMainUrl, probeMainTerminal } from './main-terminal-client';

/**
 * The new main's side of a planned handoff (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.4) — this till is
 * a satellite, and takes over the main role while the old main is still up.
 *
 * The truth moves as a whole file. The old main freezes, and this till downloads a consistent copy
 * of its database, then **stages** it next to its own and patches it into this machine's (its own
 * terminal id, its own printers and fiscal device, the next generation). Only once the old main has
 * confirmed it is now a satellite does this till swap the copy in — at its next start, before the
 * database opens, because a live SQLite file cannot be replaced from under its client on Windows.
 *
 * A marker file (`handoff-pending.json`) records how far it got, so a crash at any point leaves the
 * shop with one main or, at worst, with two satellites and a loud "main unreachable" — never two
 * mains.
 */

const MARKER_FILE = 'handoff-pending.json';

/**
 * Settings that describe *this* machine rather than the shop: they stay as they are here, and the
 * old main's are dropped from the copy. The printers, label size and fiscal device (the VCR is per
 * machine — a new main without one queues its receipts as not fiscalized until one is set up),
 * and the drawer/scale toggles and price-tag layouts a satellite already owned.
 *
 * The rest of `LOCAL_ONLY_SETTINGS` travels with the data on purpose: the VPS token is the store's,
 * and the sync cursors describe what in *this copy* has reached the VPS.
 */
const THIS_MACHINE_SETTINGS = [
  'printer_name',
  'label_printer_name',
  'label_width_mm',
  'regos_vcr_url',
  'regos_vcr_pos_id',
  'regos_vcr_password_enc',
  ...SATELLITE_MACHINE_SETTINGS,
];

/** Credentials of the old roles — neither side's is any use to the new main. */
const DROPPED_SETTINGS = ['lan_signing_secret', 'lan_device_secret', 'lan_session_user'];

type MarkerState = 'staged' | 'confirmed';

export interface TakeoverMarker {
  state: MarkerState;
  /** The patched copy, waiting to replace this till's database. */
  staged: string;
  /** Where the old main was — asked again at startup if the confirmation never arrived. */
  oldMainUrl: string;
  lineage: string;
  /** The generation this till becomes. */
  generation: number;
  at: string;
}

function markerPath(): string {
  return path.join(getUserDataPath(), MARKER_FILE);
}

export function readTakeoverMarker(): TakeoverMarker | null {
  try {
    return JSON.parse(readFileSync(markerPath(), 'utf-8')) as TakeoverMarker;
  } catch {
    return null;
  }
}

function writeMarker(marker: TakeoverMarker): void {
  writeFileSync(markerPath(), JSON.stringify(marker, null, 2), 'utf-8');
}

function discard(marker: TakeoverMarker | null): void {
  if (marker) rmSync(marker.staged, { force: true });
  rmSync(markerPath(), { force: true });
}

function stagedPathFor(dbPath: string): string {
  return dbPath.replace(/\.db$/, '') + '.handoff.db';
}

function backupPathFor(dbPath: string): string {
  return dbPath.replace(/\.db$/, '') + '.pre-handoff.db';
}

/** What to tell the person at the till, as a `settings.*` key. */
function takeoverErrorKey(err: unknown): string {
  if (err instanceof MainLinkError) {
    if (err.code === 'MAIN_UNREACHABLE') return 'settings.mainTerminal_unreachable';
    if (err.code === 'MAIN_SUPERSEDED') return 'settings.mainTerminal_superseded';
    if (err.code === 'DEVICE_UNPAIRED') return 'settings.takeoverNotPaired';
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/wrong or has expired/i.test(message)) return 'settings.handoffCodeWrong';
  if (/too many attempts/i.test(message)) return 'settings.pairingThrottled';
  if (/already in progress/i.test(message)) return 'settings.handoffInProgress';
  if (/not a main/i.test(message)) return 'settings.mainTerminal_not_a_main';
  return 'settings.takeoverFailed';
}

/**
 * Turn the old main's database into this till's: its own id, the main role at the next generation,
 * its own machine settings, and the old main paired as a satellite under `secret`.
 *
 * Every other row is the shop's and is left exactly as it came — stock, sales from every till,
 * shifts, users, suppliers, receipt counters, and the other satellites' pairings, whose secrets
 * therefore keep working here.
 */
async function patchStagedDatabase(
  staged: any,
  opts: { self: string; lineage: string; generation: number; secret: string },
): Promise<{ oldMainId: string; port: number }> {
  const check = (await staged.$queryRawUnsafe('PRAGMA quick_check')) as Array<Record<string, unknown>>;
  const verdict = check?.[0] ? Object.values(check[0])[0] : null;
  if (verdict !== 'ok') throw new Error(`the copy failed its integrity check: ${String(verdict)}`);

  const config = await staged.localConfig.findUnique({ where: { id: 'config' } });
  if (!config) throw new Error('the copy has no terminal configuration');
  const oldMainId: string = config.terminalId;

  await staged.localConfig.update({
    where: { id: 'config' },
    data: {
      terminalId: opts.self,
      isMain: true,
      mainTerminalUrl: null,
      lanLineage: opts.lineage,
      mainGeneration: opts.generation,
    },
  });

  const own = await getPrismaClient().systemSetting.findMany({
    where: { key: { in: THIS_MACHINE_SETTINGS } },
  });
  await staged.systemSetting.deleteMany({
    where: { key: { in: [...THIS_MACHINE_SETTINGS, ...DROPPED_SETTINGS] } },
  });
  for (const row of own) {
    await staged.systemSetting.create({ data: { key: row.key, value: row.value } });
  }

  // This till no longer pairs with itself; the old main now pairs with it.
  await staged.pairedTerminal.deleteMany({ where: { terminalId: opts.self } });
  const secretHash = await bcrypt.hash(opts.secret, 10);
  await staged.pairedTerminal.upsert({
    where: { terminalId: oldMainId },
    update: { secretHash, pairedAt: new Date(), lastSeenAt: null },
    create: { terminalId: oldMainId, secretHash },
  });

  const portRow = await staged.systemSetting.findUnique({ where: { key: 'local_web_port' } });
  const port = Number(portRow?.value);
  return { oldMainId, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT };
}

export interface TakeoverInput {
  /** The handoff code shown on the old main. */
  code: string;
  /**
   * Where the other tills will reach this one. Worked out from its LAN address and the shop's port
   * when omitted — the dialog never sets it; the two-till test does, having no LAN.
   */
  newMainUrl?: string;
}

/**
 * Take over the main role from this till's main. Resolves once the old main has confirmed; the app
 * then restarts, and the copy is swapped in before the database opens (`applyPendingTakeover`).
 */
export async function takeOverAsMain(
  superAdminPassword: string,
  input: TakeoverInput,
): Promise<{ newMainUrl: string }> {
  const config = await requireSuperAdmin(superAdminPassword);
  if (config.isMain !== false || !config.mainTerminalUrl) throw new Error('settings.takeoverNotSatellite');
  if (readTakeoverMarker()) throw new Error('settings.takeoverPending');

  // Checked before the old main is asked to freeze, so a till that cannot say where it will be
  // does not stop the shop selling for nothing.
  const address = input.newMainUrl ? null : getLanAddress();
  if (!input.newMainUrl && !address) throw new Error('settings.takeoverNoAddress');

  let begun: { handoff_token: string; lineage: string; generation: number };
  try {
    // Generous: the main answers only once what was under way has finished, which can include a
    // receipt the fiscal device is printing.
    begun = await mainRequest('POST', '/terminal/handoff/begin', {
      body: { code: input.code },
      timeoutMs: 2 * 60_000,
    });
  } catch (err) {
    throw new Error(takeoverErrorKey(err));
  }
  const headers = { 'X-Handoff-Token': begun.handoff_token };
  const giveUp = async (reason: unknown): Promise<never> => {
    log.warn(`[takeover] gave up: ${reason instanceof Error ? reason.message : reason}`);
    await mainRequest('POST', '/terminal/handoff/abort', { headers }).catch(() => undefined);
    throw new Error(takeoverErrorKey(reason));
  };

  const dbPath = databaseFilePath();
  const staged = stagedPathFor(dbPath);
  rmSync(staged, { force: true });

  const generation = begun.generation + 1;
  const secret = generateDeviceSecret();
  let port: number;
  try {
    await mainDownload('/terminal/handoff/database', staged, headers);
    const client = await openDatabaseAt(staged);
    try {
      ({ port } = await patchStagedDatabase(client, {
        self: config.terminalId,
        lineage: begun.lineage,
        generation,
        secret,
      }));
    } finally {
      await client.$disconnect();
    }
  } catch (err) {
    rmSync(staged, { force: true });
    return giveUp(err);
  }

  const newMainUrl = normaliseMainUrl(input.newMainUrl ?? `http://${address}:${port}/api`);
  const marker: TakeoverMarker = {
    state: 'staged',
    staged,
    oldMainUrl: config.mainTerminalUrl,
    lineage: begun.lineage,
    generation,
    at: new Date().toISOString(),
  };
  writeMarker(marker);

  try {
    await mainRequest('POST', '/terminal/handoff/complete', {
      headers,
      body: { new_main_url: newMainUrl, secret },
    });
  } catch (err) {
    // No answer is not a "no": the old main may have become a satellite and the reply been lost.
    // Keep the copy and the marker; startup asks the old main again, or the operator decides.
    if (err instanceof MainLinkError && err.code === 'MAIN_UNREACHABLE') {
      log.warn('[takeover] the old main did not answer the confirmation; the takeover is pending');
      throw new Error('settings.takeoverUnconfirmed');
    }
    discard(marker);
    return giveUp(err);
  }

  writeMarker({ ...marker, state: 'confirmed' });
  log.warn(
    `[takeover] ${config.terminalId} takes over as main at ${newMainUrl}, generation ${generation} ` +
      `of lineage ${begun.lineage}; restarting to swap the database in`,
  );
  return { newMainUrl };
}

/**
 * Where the old main stands now, for a takeover whose confirmation never arrived: still the main
 * at the old generation (it never switched — throw the copy away), no longer a main (it switched —
 * finish), or no answer (it may be a satellite now, which serves nothing, or it may be off).
 */
async function askOldMain(marker: TakeoverMarker): Promise<'still-main' | 'handed-over' | 'unknown'> {
  const probe = await probeMainTerminal(marker.oldMainUrl);
  if (probe.ok) {
    return probe.info.lineage === marker.lineage && probe.info.generation < marker.generation
      ? 'still-main'
      : 'unknown';
  }
  return probe.reason === 'not-a-main' ? 'handed-over' : 'unknown';
}

function swapIn(marker: TakeoverMarker): void {
  const dbPath = databaseFilePath();
  const backup = backupPathFor(dbPath);
  rmSync(backup, { force: true });
  rmSync(`${backup}-journal`, { force: true });
  // The satellite's own file is kept, not deleted: it is the one thing to go back to if the new
  // main turns out to be wrong. A hot journal belongs with the file it was written for.
  if (existsSync(dbPath)) renameSync(dbPath, backup);
  if (existsSync(`${dbPath}-journal`)) renameSync(`${dbPath}-journal`, `${backup}-journal`);
  renameSync(marker.staged, dbPath);
  rmSync(markerPath(), { force: true });
}

/**
 * At startup, before the database opens: finish or undo a takeover that stopped part-way.
 *
 * - `confirmed` — the old main is a satellite now; swap the copy in.
 * - `staged` — the confirmation never arrived. The old main still a main → discard; no longer one
 *   → swap; no answer → leave it pending for the operator (`resolvePendingTakeover`), because
 *   guessing wrong either way costs more than asking.
 */
export async function applyPendingTakeover(): Promise<'none' | 'swapped' | 'discarded' | 'pending'> {
  const marker = readTakeoverMarker();
  if (!marker) return 'none';
  if (!existsSync(marker.staged)) {
    log.warn('[takeover] a takeover marker without its copy; forgetting it');
    discard(null);
    return 'discarded';
  }

  if (marker.state === 'staged') {
    const where = await askOldMain(marker);
    if (where === 'still-main') {
      log.warn('[takeover] the old main is still the main; discarding the unconfirmed copy');
      discard(marker);
      return 'discarded';
    }
    if (where === 'unknown') {
      log.warn('[takeover] cannot tell whether the old main handed over; the takeover stays pending');
      return 'pending';
    }
  }

  swapIn(marker);
  log.warn(`[takeover] swapped in the main's database; now the main, generation ${marker.generation}`);
  return 'swapped';
}

/** For the dialog: an unconfirmed takeover waiting for the operator. */
export function getPendingTakeover(): { oldMainUrl: string; at: string } | null {
  const marker = readTakeoverMarker();
  return marker ? { oldMainUrl: marker.oldMainUrl, at: marker.at } : null;
}

/**
 * The operator's call on a takeover that could not be confirmed. `finish` when the old main has
 * restarted as a satellite (they can see it); `discard` when it is still selling as the main.
 * Either way the app restarts afterwards.
 */
export async function resolvePendingTakeover(
  superAdminPassword: string,
  action: 'finish' | 'discard',
): Promise<void> {
  await requireSuperAdmin(superAdminPassword);
  const marker = readTakeoverMarker();
  if (!marker) return;
  if (action === 'discard') {
    log.warn('[takeover] pending takeover discarded by the operator');
    discard(marker);
    return;
  }
  log.warn('[takeover] pending takeover confirmed by the operator');
  writeMarker({ ...marker, state: 'confirmed' });
}
