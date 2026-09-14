import {
  PairingRefused,
  normaliseMainUrl,
  pairingErrorKey,
  probeMainTerminal,
} from './main-terminal-client';

/**
 * The mirror of `api-url-probe.test.ts`, and it has the same shape of risk in both directions:
 * accepting the wrong machine pairs a till into somebody else's shop, and rejecting the right one
 * because it happened to be restarting leaves a technician unable to finish the job.
 */

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const MAIN = { service: 'posgro-terminal', role: 'main', store_id: '1000', terminal_id: 'T1' };

function answers(body: unknown, status = 200) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  })) as unknown as typeof fetch;
}

describe('probeMainTerminal', () => {
  it('accepts a main terminal', async () => {
    answers(MAIN);
    await expect(probeMainTerminal('http://192.168.1.7:5173/api')).resolves.toEqual({
      ok: true,
      // A main from before §11.3 says nothing about its lineage: no chain, generation zero.
      info: { role: 'main', storeId: '1000', terminalId: 'T1', lineage: null, generation: 0 },
    });
  });

  it('reads where a main stands in its lineage', async () => {
    answers({ ...MAIN, lineage: 'L-1', generation: 3 });
    await expect(probeMainTerminal('http://192.168.1.7:5173/api')).resolves.toEqual({
      ok: true,
      info: { role: 'main', storeId: '1000', terminalId: 'T1', lineage: 'L-1', generation: 3 },
    });
  });

  /**
   * Two businesses sharing a building's wifi can see each other's tills. Pairing into the wrong
   * shop would not fail — it would work, and be discovered at stocktake.
   */
  it('refuses a main belonging to a different shop', async () => {
    answers(MAIN);
    await expect(probeMainTerminal('http://192.168.1.9:5173/api', '2000')).resolves.toEqual({
      ok: false,
      reason: 'different-store',
    });
  });

  it('accepts the right shop when one is expected', async () => {
    answers(MAIN);
    await expect(probeMainTerminal('http://192.168.1.7:5173/api', '1000')).resolves.toMatchObject({
      ok: true,
    });
  });

  it('refuses another satellite', async () => {
    answers({ ...MAIN, role: 'satellite' });
    await expect(probeMainTerminal('http://192.168.1.8:5173/api')).resolves.toEqual({
      ok: false,
      reason: 'not-a-main',
    });
  });

  // A 200 proves nothing on its own — the VPS's /web path returns one for any URL under it.
  it.each([
    ['a page that is not a terminal', { something: 'else' }],
    ['a body that is not JSON', undefined],
  ])('refuses %s', async (_label, body) => {
    answers(body);
    await expect(probeMainTerminal('http://192.168.1.7:5173/api')).resolves.toEqual({
      ok: false,
      reason: 'not-a-terminal',
    });
  });

  it('treats an unreachable address as inconclusive, not as wrong', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('EHOSTUNREACH');
    }) as unknown as typeof fetch;

    await expect(probeMainTerminal('http://192.168.1.7:5173/api')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('does not probe something that is not an http(s) url', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(probeMainTerminal('192.168.1.7')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks the right path, with trailing slashes collapsed', async () => {
    answers(MAIN);
    await probeMainTerminal('http://192.168.1.7:5173/api//');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'http://192.168.1.7:5173/api/terminal/info',
    );
  });
});

describe('normaliseMainUrl', () => {
  it.each([
    ['http://x:5173/api/', 'http://x:5173/api'],
    ['  http://x:5173/api  ', 'http://x:5173/api'],
    ['http://x:5173/api///', 'http://x:5173/api'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseMainUrl(input)).toBe(expected);
  });
});

/**
 * The person at the satellite reads Russian or Uzbek, and each refusal has a different fix, so
 * they must not all collapse into "failed". The fragments below are the main's real messages
 * (local-server/routes/terminal.ts) — if one is reworded there, its case here stops matching.
 */
describe('pairingErrorKey', () => {
  it.each([
    ['an unreachable main', Object.assign(new Error('fetch failed'), { name: 'TypeError' }), 'settings.mainTerminal_unreachable'],
    ['a timeout', Object.assign(new Error('aborted'), { name: 'AbortError' }), 'settings.mainTerminal_unreachable'],
    ['a wrong or expired code', new PairingRefused(403, 'Pairing code is wrong or has expired'), 'settings.pairingCodeWrong'],
    ['a locked-out main', new PairingRefused(403, 'Too many attempts. Wait a minute and try again.'), 'settings.pairingThrottled'],
    ['a satellite at that address', new PairingRefused(403, 'This terminal is not a main terminal'), 'settings.mainTerminal_not_a_main'],
    ['this till using the main’s id', new PairingRefused(400, 'That terminal id belongs to the main terminal'), 'settings.pairingIdIsMain'],
    ['anything else', new PairingRefused(500, 'Internal error'), 'settings.pairingFailed'],
    ['a plain error', new Error('no secret in the answer'), 'settings.pairingFailed'],
  ])('names %s', (_label, err, key) => {
    expect(pairingErrorKey(err)).toBe(key);
  });
});
