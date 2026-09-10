import { probeApiUrl } from './api-url-probe';

/**
 * The point of this probe is to refuse one specific mistake — pointing a terminal at another
 * terminal's LAN dashboard, which logs in fine and then never uploads a sale.
 *
 * The failure mode to guard against in the other direction is worse than the bug it fixes: if a
 * VPS having a bad day reads as "not a POS server", a technician is sent chasing a configuration
 * problem that does not exist, and a correct URL cannot be saved. So only a definitive answer —
 * a missing route, or a 200 that is not the health payload — counts against a URL.
 */

const originalFetch = global.fetch;

/** Distinct from `undefined`, which would just re-trigger the default parameter. */
const NOT_JSON = Symbol('not-json');

function respondWith(status: number, body: unknown = { status: 'ok' }) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === NOT_JSON) throw new Error('Unexpected token < in JSON');
      return body;
    },
  })) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('probeApiUrl', () => {
  it('accepts a server that answers /health', async () => {
    respondWith(200);
    await expect(probeApiUrl('https://pos.example/api')).resolves.toBe('ok');
  });

  // The LAN dashboard server has no /health route, which is exactly how it is told apart.
  it('rejects a server with no /health route', async () => {
    respondWith(404);
    await expect(probeApiUrl('http://192.168.1.7:5173/api')).resolves.toBe('not-pos-server');
  });

  /**
   * A URL ending `/web` instead of `/api` reaches the dashboard's SPA fallback, which answers 200
   * with index.html for every path. Verified against the live server: `/web/health` really does
   * return 200. Status alone would wave that through, so the body decides.
   */
  it('rejects a 200 that is not the health payload — the /web instead of /api typo', async () => {
    respondWith(200, NOT_JSON); // index.html: not JSON at all
    await expect(probeApiUrl('https://pos.example/web')).resolves.toBe('not-pos-server');

    respondWith(200, { some: 'other json' });
    await expect(probeApiUrl('https://pos.example/web')).resolves.toBe('not-pos-server');
  });

  it.each([500, 502, 503])('treats HTTP %d as inconclusive, not as the wrong server', async (status) => {
    respondWith(status);
    await expect(probeApiUrl('https://pos.example/api')).resolves.toBe('unknown');
  });

  it('treats an unreachable host as inconclusive', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(probeApiUrl('https://pos.example/api')).resolves.toBe('unknown');
  });

  it('does not probe something that is not an http(s) url', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(probeApiUrl('not-a-url')).resolves.toBe('unknown');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('probes exactly one /health, with any trailing slashes collapsed', async () => {
    respondWith(200);
    await probeApiUrl('https://pos.example/api///');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://pos.example/api/health');
  });
});
