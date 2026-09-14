import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getPrismaClient } from '../database/sqlite-client';

/**
 * The time this till judges its license by — one the shop cannot wind back.
 *
 *   trustedNow = max(system clock, mark + time the app has run since the mark was set)
 *
 * The mark is the latest moment this till is sure has passed. It is kept twice — a `license_clock`
 * row in SQLite and an encrypted file in userData (Electron safeStorage: DPAPI on Windows) — and
 * the larger wins, so deleting one copy resets nothing. With both gone the till falls back on its
 * own records: the newest sale or shift it wrote.
 *
 * While the app runs the mark advances by the monotonic clock, so setting the system clock back, or
 * freezing it, mid-session gains nothing either. Only a newer license from the server moves the
 * mark down (`correctTo`): its issuedAt is the server's own time, which is how a clock that ran
 * ahead by accident is put right once it is fixed.
 *
 * The limit, stated plainly: the app ships unpacked, so someone who edits its JavaScript can skip
 * all of this. A store that syncs is still cut off by the server (SubscriptionInterceptor).
 */

const SETTING_KEY = 'license_clock';
const FILE_NAME = 'license-clock.bin';
/** A copy written where safeStorage has no key to encrypt with — still a second copy. */
const PLAIN = 'plain:';
/** How often the running clock is written back, so a crash or a kill loses at most this much. */
export const PERSIST_EVERY_MS = 60_000;
/** A system clock further behind than this is set wrong, not drifting. */
export const CLOCK_BEHIND_LIMIT_MS = 24 * 60 * 60 * 1000;

interface Saved {
  /** The latest moment known to have passed, epoch ms. */
  mark: number;
  /** When this till first ran with licensing — the unlicensed allowance counts from it. */
  since: number;
}

const seams = {
  now: (): number => Date.now(),
  monotonic: (): number => performance.now(),
};

/** Test seam: drive the system clock and the monotonic one by hand. */
export function __setClockSeams(next: Partial<typeof seams>): void {
  Object.assign(seams, next);
}

let state: (Saved & { monoAtMark: number; persistedAt: number }) | null = null;
let loading: Promise<void> | null = null;

/** Test seam: forget what was read, as a restart would. */
export function __forgetClock(): void {
  state = null;
  loading = null;
}

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

function parse(text: string | null | undefined): Saved | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Partial<Saved>;
    const mark = Number(o.mark);
    const since = Number(o.since);
    return Number.isFinite(mark) && Number.isFinite(since) ? { mark, since } : null;
  } catch {
    return null;
  }
}

function canEncrypt(): boolean {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable?.());
  } catch {
    return false;
  }
}

function readFileCopy(): Saved | null {
  try {
    if (!existsSync(filePath())) return null;
    const raw = readFileSync(filePath(), 'utf8');
    // A plain copy only counts where nothing could have encrypted it.
    if (raw.startsWith(PLAIN)) return canEncrypt() ? null : parse(raw.slice(PLAIN.length));
    return parse(safeStorage.decryptString(Buffer.from(raw, 'base64')));
  } catch {
    return null;
  }
}

function writeFileCopy(saved: Saved): void {
  try {
    const text = JSON.stringify(saved);
    const out = canEncrypt() ? safeStorage.encryptString(text).toString('base64') : PLAIN + text;
    writeFileSync(filePath(), out, 'utf8');
  } catch (e) {
    console.warn('[license] clock file not written:', e instanceof Error ? e.message : e);
  }
}

async function readDbCopy(): Promise<Saved | null> {
  const row = await getPrismaClient()
    .systemSetting.findUnique({ where: { key: SETTING_KEY } })
    .catch(() => null);
  return parse(row?.value);
}

async function writeDbCopy(saved: Saved): Promise<void> {
  const value = JSON.stringify(saved);
  await getPrismaClient().systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
}

/** The newest moment in this till's own records: the floor when both copies of the mark are gone. */
async function newestRecord(): Promise<number> {
  const prisma = getPrismaClient();
  const [sale, shift] = await Promise.all([
    prisma.sale
      .findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
      .catch(() => null),
    prisma.smena
      .findFirst({ orderBy: { openedAt: 'desc' }, select: { openedAt: true, closedAt: true } })
      .catch(() => null),
  ]);
  const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);
  return Math.max(0, ms(sale?.createdAt), ms(shift?.openedAt), ms(shift?.closedAt));
}

async function load(): Promise<void> {
  const copies = [await readDbCopy(), readFileCopy()].filter((c): c is Saved => c !== null);
  const now = seams.now();
  const mark = copies.length ? Math.max(...copies.map((c) => c.mark)) : await newestRecord();
  const since = copies.length ? Math.min(...copies.map((c) => c.since)) : now;
  state = { mark, since, monoAtMark: seams.monotonic(), persistedAt: 0 };
  // Writes both copies — which also puts back one that had been deleted.
  await persist(Math.max(now, mark));
}

function ensureLoaded(): Promise<void> {
  loading ??= load().catch((e) => {
    console.warn('[license] trusted clock not read:', e instanceof Error ? e.message : e);
    const now = seams.now();
    state = { mark: now, since: now, monoAtMark: seams.monotonic(), persistedAt: now };
  });
  return loading;
}

/** Make `mark` the latest moment known to have passed, and write it down twice. */
async function persist(mark: number): Promise<void> {
  if (!state) return;
  state.mark = mark;
  state.monoAtMark = seams.monotonic();
  state.persistedAt = mark;
  const saved: Saved = { mark, since: state.since };
  writeFileCopy(saved);
  await writeDbCopy(saved).catch((e) =>
    console.warn('[license] clock row not written:', e instanceof Error ? e.message : e),
  );
}

export async function trustedNow(): Promise<number> {
  await ensureLoaded();
  const s = state!;
  const t = Math.max(seams.now(), s.mark + Math.max(0, seams.monotonic() - s.monoAtMark));
  if (t - s.persistedAt >= PERSIST_EVERY_MS) await persist(t);
  return t;
}

/** How far the system clock is behind the trusted one, given `trusted` = trustedNow(). */
export function systemBehindBy(trusted: number): number {
  return trusted - seams.now();
}

/** A moment known to have passed — a license's issuedAt — raises the mark, never lowers it. */
export async function raiseTo(ms: number): Promise<void> {
  const current = await trustedNow();
  if (Number.isFinite(ms) && ms > current) await persist(ms);
}

/** The server's time, from a license newer than any this till has held: the mark becomes it. */
export async function correctTo(serverMs: number): Promise<void> {
  await ensureLoaded();
  if (Number.isFinite(serverMs)) await persist(serverMs);
}

/** When this till first ran with licensing — see `Saved.since`. */
export async function firstSeen(): Promise<number> {
  await ensureLoaded();
  return state!.since;
}
