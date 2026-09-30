import { API_BASE } from "../config";
import type { NewsArticle, NewsPage } from "../components/news/types";

/** Images are stored as `/uploads/news/…` paths and served by nginx on the API host. */
export const MEDIA_ORIGIN = API_BASE.replace(/\/api$/, "");

/** null = could not load (API down or news switched off); the page says so instead of spinning. */
export async function fetchNews(
  page: number,
  limit: number,
): Promise<NewsPage | null> {
  try {
    const res = await fetch(`${API_BASE}/news?page=${page}&limit=${limit}`, {
      headers: { Accept: "application/json" },
    });
    return res.ok ? ((await res.json()) as NewsPage) : null;
  } catch {
    return null;
  }
}

export type ArticleResult =
  | { status: "ok"; post: NewsArticle }
  | { status: "missing" | "failed" };

export async function fetchArticle(slug: string): Promise<ArticleResult> {
  try {
    const res = await fetch(`${API_BASE}/news/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", post: (await res.json()) as NewsArticle };
  } catch {
    return { status: "failed" };
  }
}
