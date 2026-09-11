import { ipcMain } from 'electron';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

/**
 * The login screen's banner, cached so it survives having no internet.
 *
 * It used to be fetched straight from the renderer on every mount, with the failure swallowed —
 * so a terminal without wifi showed a blank panel, and an OFFLINE_ONLY store showed one always,
 * since its `apiUrl` points at a server it is never expected to reach.
 *
 * A POS spends its life offline by design. Anything it displays has to come from SQLite, with the
 * network only ever refreshing it — the same shape as `subscription-handlers.ts`.
 *
 * The image is cached as a data URL rather than a link. A cached title over an image that silently
 * fails to load is not a working banner, and the image lives on the VPS.
 */

const CACHE_KEY = 'login_banner';
const REQUEST_TIMEOUT_MS = 6000;

/** Big enough for a real photo, small enough that SQLite and the IPC bridge stay comfortable. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export interface LoginBanner {
  imageUrl: string;
  title: string;
  subtitle: string;
}

const EMPTY: LoginBanner = { imageUrl: '', title: '', subtitle: '' };

async function readCache(): Promise<LoginBanner> {
  const row = await getPrismaClient().systemSetting.findUnique({ where: { key: CACHE_KEY } });
  if (!row?.value) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(row.value) as Partial<LoginBanner>) };
  } catch {
    return EMPTY;
  }
}

/**
 * Inline the image so it renders with no network at all.
 *
 * Returns the original URL on any failure: a banner with a title and a broken image is still
 * better than no banner, and the next refresh will try again.
 */
async function inlineImage(url: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return url;

    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return url;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      log.warn(`[banner] image is ${buffer.byteLength} bytes, too large to cache — linking it`);
      return url;
    }
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return url;
  }
}

export function setupBannerHandlers(): void {
  /**
   * The banner to show. Always resolves: the cache is the answer whenever the network is not.
   */
  ipcMain.handle('banner:get', async (): Promise<LoginBanner> => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.vpsApiUrl}/site-config/login-banner`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as Partial<LoginBanner>;
      const base = config.vpsApiUrl.replace(/\/api\/?$/, '');
      const raw = String(data.imageUrl ?? '');
      // The server sends a path for an uploaded image and a full URL for a linked one.
      const absolute = raw && !/^https?:\/\//i.test(raw) ? `${base}${raw}` : raw;

      const fresh: LoginBanner = {
        imageUrl: absolute ? await inlineImage(absolute, controller.signal) : '',
        title: String(data.title ?? ''),
        subtitle: String(data.subtitle ?? ''),
      };

      const value = JSON.stringify(fresh);
      await prisma.systemSetting.upsert({
        where: { key: CACHE_KEY },
        update: { value },
        create: { key: CACHE_KEY, value },
      });
      return fresh;
    } catch (e) {
      // Expected on a terminal with no internet, and the whole reason the cache exists — so this
      // is info, not a warning. A warning per login screen would bury the real ones.
      log.info(`[banner] using cached banner: ${e instanceof Error ? e.message : e}`);
      return readCache();
    } finally {
      clearTimeout(timer);
    }
  });
}
