/**
 * Mirrors src/server/modules/news (news.blocks.ts, news.service.ts) — change both together.
 * The landing keeps its own copy in src/landing/src/components/news/types.ts.
 */

export interface Localized {
  uz: string;
  ru: string;
}

export type NewsBlock =
  | { type: "heading"; text: Localized }
  | { type: "paragraph"; text: Localized }
  | { type: "image"; url: string; caption?: Localized }
  | { type: "list"; ordered: boolean; items: Localized }
  | { type: "callout"; tone: "info" | "warning"; text: Localized };

export type NewsBlockType = NewsBlock["type"];
export type NewsAudience = "PUBLIC" | "CUSTOMERS";
export type NewsStatus = "DRAFT" | "PUBLISHED";

export interface NewsSummary {
  id: string;
  slug: string;
  titleUz: string;
  titleRu: string;
  excerptUz: string | null;
  excerptRu: string | null;
  coverUrl: string | null;
  audience: NewsAudience;
  publishedAt: string | null;
}

export interface NewsArticle extends NewsSummary {
  body: NewsBlock[];
}

export interface NewsAdminRow extends NewsSummary {
  status: NewsStatus;
  updatedAt: string;
}

export interface NewsPage {
  items: NewsSummary[];
  total: number;
  page: number;
  limit: number;
}

export type Lang = "uz" | "ru";

/** The reader's language, falling back to the other one when a field was left empty. */
export function pick(text: Localized, lang: Lang): string {
  return (lang === "uz" ? text.uz || text.ru : text.ru || text.uz) ?? "";
}

export function titleOf(post: NewsSummary, lang: Lang): string {
  return pick({ uz: post.titleUz, ru: post.titleRu }, lang);
}

export function excerptOf(post: NewsSummary, lang: Lang): string {
  return pick({ uz: post.excerptUz ?? "", ru: post.excerptRu ?? "" }, lang);
}

/** "30 sentabr 2026" / "30 сентября 2026 г." */
export function formatNewsDate(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(
    lang === "uz" ? "uz-Latn-UZ" : "ru-RU",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );
}
