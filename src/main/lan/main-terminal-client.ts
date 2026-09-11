/**
 * A satellite's side of the conversation with its main terminal.
 *
 * The mirror image of `config/api-url-probe.ts`. That one asks the vendor's server "are you a POS
 * API?" via `/health`; this asks a machine on the shop network "are you our main terminal?" via
 * `/terminal/info`. Two fields, two questions — and neither answer substitutes for the other,
 * which is why the LAN server deliberately has no `/health`.
 */

const TIMEOUT_MS = 8000;

export interface MainTerminalInfo {
  role: 'main' | 'satellite';
  storeId: string;
  terminalId: string;
}

export type ProbeResult =
  | { ok: true; info: MainTerminalInfo }
  /** Reached something, and it is definitely not a main terminal for this shop. */
  | { ok: false; reason: 'not-a-terminal' | 'not-a-main' | 'different-store' }
  /** Could not tell. Says nothing about whether the address is right. */
  | { ok: false; reason: 'unreachable' };

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Trailing slashes stripped, because every caller appends its own path. */
export function normaliseMainUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Is there a main terminal at this address, and is it ours?
 *
 * `expectedStoreId` matters more than it looks: two businesses sharing a building's wifi can see
 * each other's tills, and pairing into the wrong shop would be discovered at stocktake.
 */
export async function probeMainTerminal(
  url: string,
  expectedStoreId?: string,
): Promise<ProbeResult> {
  const base = normaliseMainUrl(url);
  if (!/^https?:\/\/.+/i.test(base)) return { ok: false, reason: 'unreachable' };

  const { signal, done } = withTimeout();
  try {
    const response = await fetch(`${base}/terminal/info`, { signal });
    if (!response.ok) return { ok: false, reason: 'not-a-terminal' };

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    // Same reasoning as the `/health` probe: a 200 is not enough, because anything can return one.
    if (!body || body.service !== 'posgro-terminal') return { ok: false, reason: 'not-a-terminal' };

    const info: MainTerminalInfo = {
      role: body.role === 'main' ? 'main' : 'satellite',
      storeId: String(body.store_id ?? ''),
      terminalId: String(body.terminal_id ?? ''),
    };

    if (info.role !== 'main') return { ok: false, reason: 'not-a-main' };
    if (expectedStoreId && info.storeId !== expectedStoreId) {
      return { ok: false, reason: 'different-store' };
    }
    return { ok: true, info };
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    done();
  }
}

/** The main answered a pairing attempt, and said no. */
export class PairingRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PairingRefused';
  }
}

/**
 * What to tell the person at the satellite when pairing fails, as a `settings.*` key.
 *
 * The main's refusals are English sentences written for a log; the person typing a code into a
 * till reads Russian or Uzbek. Each refusal this maps has a different fix — retype the code, wait
 * out the lockout, give this till a different id — so they are kept apart rather than collapsed into
 * one "failed". The main's messages are matched by fragment: both ends are this codebase, and an
 * unmatched one still lands on the generic key rather than leaking English onto the screen.
 */
export function pairingErrorKey(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  // By name, not instanceof — fetch's errors come from Node's own realm (see main-link.ts).
  if (name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError') {
    return 'settings.mainTerminal_unreachable';
  }
  if (err instanceof PairingRefused || name === 'PairingRefused') {
    const { status, message } = err as PairingRefused;
    if (status === 403 && /too many attempts/i.test(message)) return 'settings.pairingThrottled';
    if (status === 403 && /not a main/i.test(message)) return 'settings.mainTerminal_not_a_main';
    if (status === 403) return 'settings.pairingCodeWrong';
    if (status === 400 && /belongs to the main/i.test(message)) return 'settings.pairingIdIsMain';
  }
  return 'settings.pairingFailed';
}

export interface PairResult {
  secret: string;
  storeId: string;
  storeName: string;
  mainTerminalId: string;
}

/** Redeem a pairing code. The secret comes back exactly once and must be stored by the caller. */
export async function pairWithMain(
  url: string,
  code: string,
  terminalId: string,
  name?: string,
): Promise<PairResult> {
  const { signal, done } = withTimeout();
  try {
    const response = await fetch(`${normaliseMainUrl(url)}/terminal/pair`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, terminalId, name }),
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      // The main's own words, which say whether the code was wrong, expired, or the id clashed —
      // kept with the status so `pairingErrorKey` can say it in the operator's language.
      throw new PairingRefused(response.status, String(body?.message ?? `HTTP ${response.status}`));
    }

    return {
      secret: String(body?.secret ?? ''),
      storeId: String(body?.store_id ?? ''),
      storeName: String(body?.store_name ?? ''),
      mainTerminalId: String(body?.main_terminal_id ?? ''),
    };
  } finally {
    done();
  }
}

/** Trade the stored device secret for a short-lived terminal token. */
export async function fetchTerminalToken(
  url: string,
  terminalId: string,
  secret: string,
): Promise<string> {
  const { signal, done } = withTimeout();
  try {
    const response = await fetch(`${normaliseMainUrl(url)}/terminal/token`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, secret }),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(String(body?.message ?? `HTTP ${response.status}`));
    return String(body?.token ?? '');
  } finally {
    done();
  }
}
