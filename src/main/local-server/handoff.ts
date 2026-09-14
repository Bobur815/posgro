import { randomBytes, randomInt, randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AttemptThrottle } from '../ipc/override-throttle';
import { log } from '../logger';
import { regosVcrService } from '../fiscal/regos-vcr-service';
import { drainSaleWrites } from '../sales/commit-sale';
import { freezeWrites, thawWrites } from '../sales/write-freeze';
import { newLineage } from '../lan/lineage';
import { DEVICE_SECRET_KEY, SESSION_USER_KEY, resetMainLink } from '../lan/main-link';
import { normaliseMainUrl } from '../lan/main-terminal-client';
import { db } from './helpers';
import { FileReply, HttpError, badRequest, forbidden, unauthorized } from './router';

/**
 * The old main's side of a planned handoff (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.4).
 *
 * 1. Behind the super-admin password, the main issues a **handoff code** — its own consent, given
 *    on its own screen. Like a pairing code: in memory, single-use, ten minutes.
 * 2. The satellite taking over presents it (`begin`). The main **freezes every write** (§11.4's
 *    decision 3), lets what was already under way finish — the sale queue, the settling of sales
 *    just committed, the fiscal device's queue — and hands back a handoff token.
 * 3. The satellite downloads a consistent copy of the whole database (`VACUUM INTO`).
 * 4. The satellite confirms (`complete`), and this terminal becomes a satellite of it, at the next
 *    generation of the lineage, with the device secret the new main minted for it.
 *
 * If step 4 never comes, the freeze lapses after `FREEZE_MS` and this terminal carries on as the
 * main as if nothing happened. The satellite's copy is then a stale file nobody uses.
 */

const CODE_DIGITS = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
/** How long a begun handoff may hold the shop's writes. Seconds, in practice; this is the ceiling. */
export const FREEZE_MS = 5 * 60 * 1000;

interface HandoffSession {
  token: string;
  /** The satellite taking over. Only it may download the copy or complete the handoff. */
  terminalId: string;
  lineage: string;
  generation: number;
  timer: NodeJS.Timeout;
}

let freezeMs = FREEZE_MS;

/** Test seam: a freeze short enough to watch lapse. Production never calls this. */
export function __setFreezeMs(ms: number): void {
  freezeMs = ms;
}

let code: { code: string; expiresAt: number } | null = null;
let session: HandoffSession | null = null;
const throttle = new AttemptThrottle();
const handedOffListeners = new Set<() => void>();

export function issueHandoffCode(): { code: string; expiresAt: number } {
  code = {
    code: String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0'),
    expiresAt: Date.now() + CODE_TTL_MS,
  };
  return code;
}

export function getHandoffState(): { code: string | null; expiresAt: number | null; inProgress: boolean } {
  if (code && code.expiresAt <= Date.now()) code = null;
  return { code: code?.code ?? null, expiresAt: code?.expiresAt ?? null, inProgress: session !== null };
}

export function cancelHandoffCode(): void {
  code = null;
}

/**
 * Told once this terminal has handed its role over and the answer is on its way back — the app
 * relaunches as the satellite it now is; the LAN server stops serving.
 */
export function onHandedOff(listener: () => void): () => void {
  handedOffListeners.add(listener);
  return () => handedOffListeners.delete(listener);
}

/** Test seam: forget everything, thaw. Production never calls this. */
export function __resetHandoff(): void {
  if (session) clearTimeout(session.timer);
  session = null;
  code = null;
  throttle.reset();
  thawWrites();
}

function abandon(reason: string): void {
  if (!session) return;
  clearTimeout(session.timer);
  log.warn(`[handoff] handoff to ${session.terminalId} abandoned (${reason}); still the main`);
  session = null;
  thawWrites();
}

function requireSession(token: unknown, terminalId: string): HandoffSession {
  if (!session || typeof token !== 'string' || token !== session.token || session.terminalId !== terminalId) {
    throw unauthorized('No handoff in progress for this terminal');
  }
  return session;
}

/** Step 2: the code checks out → freeze, drain, and hand back a token for the rest. */
export async function beginHandoff(
  candidate: unknown,
  terminalId: string,
): Promise<{ handoff_token: string; lineage: string; generation: number; store_id: string }> {
  if (throttle.isLockedOut()) throw forbidden('Too many attempts. Wait a minute and try again.');
  if (session) throw new HttpError(409, 'A handoff is already in progress');

  const config = await db().localConfig.findUnique({ where: { id: 'config' } });
  if (!config?.isMain) throw forbidden('This terminal is not a main terminal');

  const state = getHandoffState();
  if (!state.code || String(candidate ?? '').trim() !== state.code) {
    throttle.recordFailure();
    throw forbidden('Handoff code is wrong or has expired');
  }
  throttle.reset();
  code = null;

  // A main paired before lineages existed (§11.3) starts one now, so it travels in the copy and the
  // new main's generation means something to every satellite.
  let lineage = config.lanLineage;
  if (!lineage) {
    lineage = newLineage();
    await db().localConfig.update({ where: { id: 'config' }, data: { lanLineage: lineage } });
  }

  freezeWrites(freezeMs);
  session = {
    token: randomBytes(32).toString('hex'),
    terminalId,
    lineage,
    generation: config.mainGeneration ?? 0,
    timer: setTimeout(() => abandon('the new main never confirmed'), freezeMs),
  };
  session.timer.unref?.();
  log.warn(`[handoff] handing the main role to ${terminalId}: writes frozen`);

  // Nothing new can start; wait out what had. Then the copy has every sale, settled and — where
  // the device was already printing it — fiscalized.
  await drainSaleWrites();
  await regosVcrService.drain();

  return {
    handoff_token: session.token,
    lineage,
    generation: session.generation,
    store_id: config.storeId,
  };
}

/**
 * The satellite gave up before completing — a download that failed, a copy it could not open.
 * Thawed at once rather than at the timeout: the shop should not wait five minutes to sell again.
 */
export function abortHandoff(token: unknown, terminalId: string): { ok: true } {
  requireSession(token, terminalId);
  abandon('the new main gave up');
  return { ok: true };
}

/** Step 3: a consistent copy of the whole database, deleted once it has been sent. */
export async function snapshotDatabase(token: unknown, terminalId: string): Promise<FileReply> {
  requireSession(token, terminalId);
  const file = join(tmpdir(), `posgro-handoff-${randomUUID()}.db`);
  // VACUUM INTO writes a complete, compacted copy from one read transaction — consistent even if
  // something slipped past the freeze, and nothing half-written from the live file's journal.
  await db().$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return new FileReply(file, () => {
    void rm(file, { force: true });
  });
}

/**
 * Step 4: become a satellite of the new main.
 *
 * Written here in one go, and only then announced: the new main swaps its database in only after
 * this answer arrives, so there is never a moment when both believe they are the main.
 */
export async function completeHandoff(
  token: unknown,
  terminalId: string,
  body: { new_main_url?: unknown; secret?: unknown },
): Promise<{ ok: true }> {
  const current = requireSession(token, terminalId);
  const url = normaliseMainUrl(String(body?.new_main_url ?? ''));
  const secret = String(body?.secret ?? '');
  if (!/^https?:\/\/.+/i.test(url)) throw badRequest('new_main_url must be an http(s) address');
  if (secret.length < 32) throw badRequest('secret is missing');

  const prisma = db();
  await prisma.systemSetting.upsert({
    where: { key: DEVICE_SECRET_KEY },
    update: { value: secret },
    create: { key: DEVICE_SECRET_KEY, value: secret },
  });
  // What belonged to being the main: its signing key, and the satellites it served — they are the
  // new main's now, their rows went with the copy. And what belongs to no role at all: the catalog
  // cursor on the VPS's clock (a satellite pages through its main's, §6.5), a satellite session.
  await prisma.systemSetting.deleteMany({
    where: { key: { in: ['lan_signing_secret', 'last_product_sync', SESSION_USER_KEY] } },
  });
  await prisma.pairedTerminal.deleteMany({});
  await prisma.localConfig.update({
    where: { id: 'config' },
    data: {
      isMain: false,
      mainTerminalUrl: url,
      lanLineage: current.lineage,
      mainGeneration: current.generation + 1,
    },
  });
  resetMainLink();

  clearTimeout(current.timer);
  session = null;
  // The freeze stays until the relaunch: this till is a satellite now, and its own writes go to the
  // new main from here on.
  log.warn(
    `[handoff] handed the main role to ${terminalId} at ${url}; now its satellite, generation ` +
      `${current.generation + 1} of lineage ${current.lineage}`,
  );

  // After the answer has gone out, not before: the new main needs to hear "done" to proceed.
  setImmediate(() => {
    for (const listener of handedOffListeners) listener();
  });
  return { ok: true };
}
