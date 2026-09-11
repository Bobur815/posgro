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
      // The main's own words, which say whether the code was wrong, expired, or the id clashed.
      throw new Error(String(body?.message ?? `HTTP ${response.status}`));
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
