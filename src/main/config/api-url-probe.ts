/**
 * Is this URL a server the terminal can actually sync to?
 *
 * A terminal pointed at another terminal's LAN dashboard logs in successfully — the LAN server
 * implements `/auth/login` — and then silently never uploads a sale, because `/sales/sync` is not
 * there. Nothing surfaces it: the cashier sees a normal login, the catalog even pulls down, and
 * the shop finds out when someone reconciles the month.
 *
 * `/health` separates the two cleanly. The VPS registers it (`server/main.ts`); the LAN router has
 * no such route and answers 404.
 *
 * The verdict is three-valued on purpose. "I could not reach it" is not evidence of "it is the
 * wrong kind of server" — a technician setting a terminal up before the network is live, or during
 * a VPS restart, must not be blocked from saving a URL that is perfectly correct.
 */

export type ApiUrlVerdict =
  /** Answered as a POS API. */
  | 'ok'
  /** Answered, but this is not a POS API — almost always another terminal's LAN dashboard. */
  | 'not-pos-server'
  /** No usable answer. Says nothing about whether the URL is right. */
  | 'unknown';

const PROBE_TIMEOUT_MS = 6000;

export async function probeApiUrl(url: string): Promise<ApiUrlVerdict> {
  const base = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(base)) return 'unknown';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      // A 200 is not enough on its own. A URL ending `/web` instead of `/api` hits the dashboard's
      // SPA fallback, which answers 200 with index.html for any path — including this one — so the
      // body is what actually distinguishes the API. The server answers `{"status":"ok"}`.
      const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
      return body && typeof body.status === 'string' ? 'ok' : 'not-pos-server';
    }

    // Only a missing route is proof. A 500 or a 503 means the right server is having a bad day,
    // and refusing the URL for that would be worse than useless — it would send someone chasing a
    // configuration problem that does not exist.
    if (response.status === 404) return 'not-pos-server';

    return 'unknown';
  } catch {
    // Offline, DNS failure, TLS failure, timeout. All inconclusive.
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}
