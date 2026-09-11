/**
 * The banner's whole job is to survive having no internet, which is the normal state of a till.
 */

const handlers = new Map<string, (...args: any[]) => unknown>();
jest.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...a: any[]) => unknown) => handlers.set(channel, fn) },
}));
jest.mock('../logger', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../config/app-config', () => ({
  getAppConfig: () => ({ vpsApiUrl: 'https://vps.example/api' }),
}));

const prismaMock = {
  systemSetting: {
    findUnique: jest.fn<Promise<{ value: string } | null>, [unknown]>(),
    upsert: jest.fn<Promise<void>, [{ update: { value: string } }]>(async () => undefined),
  },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));

import { setupBannerHandlers } from './banner-handlers';

const SERVER_BANNER = { imageUrl: '/uploads/banner.png', title: 'Welcome', subtitle: 'Open 9-9' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function getHandler() {
  setupBannerHandlers();
  const fn = handlers.get('banner:get');
  if (!fn) throw new Error('banner:get was not registered');
  return fn as () => Promise<{ imageUrl: string; title: string; subtitle: string }>;
}

/** Answers the banner JSON on the api path and image bytes on the uploads path. */
function online(imageOk = true) {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).endsWith('/site-config/login-banner')) {
      return { ok: true, status: 200, json: async () => SERVER_BANNER };
    }
    if (!imageOk) return { ok: false, status: 404, headers: new Headers() };
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => PNG,
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.systemSetting.findUnique.mockResolvedValue(null);
  online();
});

describe('banner:get', () => {
  it('inlines the image so it renders with no network later', async () => {
    const banner = await getHandler()();

    expect(banner).toMatchObject({ title: 'Welcome', subtitle: 'Open 9-9' });
    expect(banner.imageUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('resolves a server-relative image against the host, not the api path', async () => {
    await getHandler()();
    const requested = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(requested).toContain('https://vps.example/uploads/banner.png');
  });

  it('caches what it fetched', async () => {
    await getHandler()();

    expect(prismaMock.systemSetting.upsert).toHaveBeenCalledTimes(1);
    const written = JSON.parse(prismaMock.systemSetting.upsert.mock.calls[0][0].update.value);
    expect(written.title).toBe('Welcome');
    expect(written.imageUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  // The reason the cache exists at all.
  it('falls back to the cache when the server is unreachable', async () => {
    prismaMock.systemSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({ imageUrl: 'data:image/png;base64,AAA', title: 'Cached', subtitle: '' }),
    });
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await expect(getHandler()()).resolves.toMatchObject({ title: 'Cached' });
  });

  it('returns an empty banner rather than throwing when there is no cache either', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(getHandler()()).resolves.toEqual({ imageUrl: '', title: '', subtitle: '' });
  });

  it('survives a corrupted cache row', async () => {
    prismaMock.systemSetting.findUnique.mockResolvedValue({ value: 'not json' });
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(getHandler()()).resolves.toEqual({ imageUrl: '', title: '', subtitle: '' });
  });

  // A title over a broken image is still better than a blank panel.
  it('keeps the text when the image cannot be fetched', async () => {
    online(false);
    const banner = await getHandler()();

    expect(banner.title).toBe('Welcome');
    expect(banner.imageUrl).toBe('https://vps.example/uploads/banner.png');
  });
});
