/**
 * The portal's data. Everything here degrades to nothing rather than throwing: this is a public
 * page with no login, no retry button and no one to read an error message.
 */

export interface LatestApp {
  version: string;
  size: number | null;
  url: string;
  releasedAt: string | null;
}

export interface DownloadItem {
  id: string;
  slug: string;
  titleRu: string;
  titleUz: string;
  descRu: string | null;
  descUz: string | null;
  category: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  version: string | null;
  sortOrder: number;
}

/**
 * Same-origin by default: nginx on panel.posgro.uz proxies /api to the same backend, so the
 * portal needs no CORS and no configured host. VITE_API_URL exists only for `vite dev`.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const fetchLatestApp = () => getJson<LatestApp | null>('/downloads/latest-app', null);
export const fetchDownloads = () => getJson<DownloadItem[]>('/downloads', []);

/** Human-readable size. Returns '' for null so the caller can omit the whole element. */
export function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** `dd.mm.yyyy`, or '' if the feed had no date or an unparseable one. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
