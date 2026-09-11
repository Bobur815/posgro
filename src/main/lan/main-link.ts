import { getPrismaClient } from '../database/sqlite-client';
import { fetchTerminalToken, normaliseMainUrl } from './main-terminal-client';

/**
 * A satellite's one line to its main terminal (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.7).
 *
 * "A satellite's server is the main terminal, always" — so everything a satellite asks of anyone
 * goes through here: its device token, the signed-in person's session, and the difference between
 * the main *refusing* something and the main *not answering*, which the rest of the satellite has
 * to treat very differently (§5.9: refuse to sell, keep the cart, keep reading).
 *
 * Failures are thrown as `Error(JSON.stringify({ code }))`, the shape the renderer already digs
 * codes out of for a sale, so a new code needs a translation and nothing else.
 */

export const DEVICE_SECRET_KEY = 'lan_device_secret';

/**
 * The profile of whoever is signed in at this satellite — not their token, which the renderer
 * already keeps. It is what lets a session that was open when the main went away survive an app
 * restart in read-only mode (§6.9) instead of dumping the cashier at a login screen that cannot
 * work until the main is back.
 */
export const SESSION_USER_KEY = 'lan_session_user';

export type MainLinkCode =
  /** Nothing answered: the main is off, unplugged, or unreachable on this network. */
  | 'MAIN_UNREACHABLE'
  /** The main answered, but the person's session is gone — they have to sign in again. */
  | 'MAIN_SESSION_EXPIRED'
  /** The main no longer recognises this terminal: it was unpaired there. */
  | 'DEVICE_UNPAIRED'
  /** Called on a terminal that is not a satellite — a bug, not a network state. */
  | 'NOT_A_SATELLITE';

export class MainLinkError extends Error {
  constructor(readonly code: MainLinkCode) {
    super(JSON.stringify({ code }));
  }
}

export interface MainLinkStatus {
  /** Null until the first request has been made. */
  reachable: boolean | null;
  lastContactAt: string | null;
}

const DEFAULT_TIMEOUT_MS = 8_000;
/** Renew a device token this long before it expires rather than waiting for a refusal. */
const TOKEN_MARGIN_MS = 5 * 60_000;

let deviceToken: { value: string; expiresAt: number } | null = null;
let session: string | null = null;
let status: MainLinkStatus = { reachable: null, lastContactAt: null };
const listeners = new Set<(s: MainLinkStatus) => void>();

export function getMainLinkStatus(): MainLinkStatus {
  return status;
}

/** Told on every change of reachability — the renderer's "main terminal unreachable" banner. */
export function onMainLinkStatus(listener: (s: MainLinkStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function markReachable(reachable: boolean): void {
  const changed = status.reachable !== reachable;
  status = {
    reachable,
    lastContactAt: reachable ? new Date().toISOString() : status.lastContactAt,
  };
  if (changed) for (const listener of listeners) listener(status);
}

export function setSession(token: string | null): void {
  session = token;
}

export function getSession(): string | null {
  return session;
}

/** Forget everything held in memory — after leaving the main, or in tests. */
export function resetMainLink(): void {
  deviceToken = null;
  session = null;
  status = { reachable: null, lastContactAt: null };
}

async function linkConfig(): Promise<{ url: string; terminalId: string; secret: string }> {
  const prisma = getPrismaClient();
  const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
  if (!config || config.isMain !== false || !config.mainTerminalUrl) {
    throw new MainLinkError('NOT_A_SATELLITE');
  }
  const secret = await prisma.systemSetting.findUnique({ where: { key: DEVICE_SECRET_KEY } });
  // A satellite with no secret cannot prove who it is to anyone; to the main it is unpaired.
  if (!secret?.value) throw new MainLinkError('DEVICE_UNPAIRED');
  return { url: normaliseMainUrl(config.mainTerminalUrl), terminalId: config.terminalId, secret: secret.value };
}

function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * A network failure, as opposed to an answer. Told apart by name, not `instanceof`: fetch's
 * `TypeError('fetch failed')` comes from Node's own realm, which is not always the realm this code
 * runs in (a test context is not), and a failed instanceof would turn "main unreachable" into an
 * unexplained crash — the one failure this module exists to name.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof MainLinkError) return false;
  const name = (err as { name?: string })?.name;
  return name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError';
}

async function currentDeviceToken(force = false): Promise<{ url: string; token: string }> {
  const { url, terminalId, secret } = await linkConfig();
  if (!force && deviceToken && deviceToken.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
    return { url, token: deviceToken.value };
  }

  let token: string;
  try {
    token = await fetchTerminalToken(url, terminalId, secret);
  } catch (err) {
    if (isNetworkError(err)) {
      markReachable(false);
      throw new MainLinkError('MAIN_UNREACHABLE');
    }
    // It answered, and said no: the row for this terminal is gone on the main.
    markReachable(true);
    deviceToken = null;
    throw new MainLinkError('DEVICE_UNPAIRED');
  }
  deviceToken = { value: token, expiresAt: expiryOf(token) };
  return { url, token };
}

export interface MainRequestOptions {
  body?: unknown;
  /** Send the signed-in person's session as well as the device token. */
  person?: boolean;
  /**
   * Safe to send twice. A GET is; so is a sale commit, because it carries its own id and the main
   * answers a repeat with the sale it already made. Only these are retried after a connection that
   * dropped mid-request — anything else could be applied twice.
   */
  idempotent?: boolean;
  timeoutMs?: number;
}

/**
 * Ask the main terminal. Resolves with its JSON answer; rejects with the main's own message when it
 * refuses (`auth.errors.*` keys and sale refusals pass through untouched), or with a
 * `MainLinkError` when it cannot be asked at all.
 */
export async function mainRequest<T = any>(
  method: string,
  path: string,
  options: MainRequestOptions = {},
): Promise<T> {
  const idempotent = options.idempotent ?? method === 'GET';
  let renewedToken = false;
  let retriedNetwork = false;

  for (;;) {
    const { url, token } = await currentDeviceToken(renewedToken);
    if (options.person && !session) throw new MainLinkError('MAIN_SESSION_EXPIRED');

    let response: Response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.person && session ? { 'X-User-Session': session } : {}),
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // One more try for a request that is safe to repeat: a socket the main closed just as this
      // one was reused is an everyday LAN event, not an outage.
      if (idempotent && !retriedNetwork) {
        retriedNetwork = true;
        continue;
      }
      markReachable(false);
      throw new MainLinkError('MAIN_UNREACHABLE');
    }

    markReachable(true);
    const text = await response.text();
    const body = text ? safeJson(text) : null;
    if (response.ok) return body as T;

    const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
    if (response.status === 401) {
      if (message === 'SESSION_REQUIRED') {
        session = null;
        throw new MainLinkError('MAIN_SESSION_EXPIRED');
      }
      // The device token lapsed or the main restarted with a new key: renew once, then believe it.
      if (!renewedToken && !message.startsWith('auth.errors.')) {
        renewedToken = true;
        continue;
      }
    }
    throw new Error(message);
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
