import { BadRequestException } from "@nestjs/common";

/**
 * The body of a news post: an ordered list of blocks, each holding both languages side by side so
 * a screenshot is uploaded once and the translations cannot drift apart.
 *
 * Nothing in a block is ever rendered as HTML — readers print text and set `src` — so a stored
 * body cannot inject markup into posgro.uz or the dashboard. The shape is mirrored for the readers
 * in src/web/src/components/news/types.ts; change both together.
 */

export interface Localized {
  uz: string;
  ru: string;
}

export type NewsBlock =
  | { type: "heading"; text: Localized }
  | { type: "paragraph"; text: Localized }
  | { type: "image"; url: string; caption?: Localized }
  /** One item per line in each language. */
  | { type: "list"; ordered: boolean; items: Localized }
  | { type: "callout"; tone: "info" | "warning"; text: Localized };

export const MAX_BLOCKS = 200;
const MAX_TEXT = 10_000;

/** Only images this API wrote; a post must not hotlink or point readers anywhere else. */
export const NEWS_IMAGE_URL = /^\/uploads\/news\/[a-z0-9-]+\.webp$/;

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function localized(
  v: unknown,
  where: string,
  required: boolean,
): Localized | undefined {
  if (v === undefined || v === null) {
    if (required) throw new BadRequestException(`${where}: text is required`);
    return undefined;
  }
  if (!isObj(v) || typeof v.uz !== "string" || typeof v.ru !== "string") {
    throw new BadRequestException(`${where}: expected { uz, ru } strings`);
  }
  const uz = v.uz.trim();
  const ru = v.ru.trim();
  if (uz.length > MAX_TEXT || ru.length > MAX_TEXT) {
    throw new BadRequestException(
      `${where}: text longer than ${MAX_TEXT} characters`,
    );
  }
  if (required && !uz && !ru)
    throw new BadRequestException(`${where}: text is empty`);
  return { uz, ru };
}

/**
 * Checks an incoming body and returns a clean copy — known fields only, trimmed, in order. Throws
 * a 400 naming the first bad block, so the editor can point at it.
 */
export function parseBlocks(input: unknown): NewsBlock[] {
  if (!Array.isArray(input))
    throw new BadRequestException("body: expected an array of blocks");
  if (input.length > MAX_BLOCKS) {
    throw new BadRequestException(`body: at most ${MAX_BLOCKS} blocks`);
  }

  return input.map((b, i): NewsBlock => {
    const where = `body[${i}]`;
    if (!isObj(b))
      throw new BadRequestException(`${where}: expected an object`);

    switch (b.type) {
      case "heading":
      case "paragraph":
        return { type: b.type, text: localized(b.text, where, true)! };
      case "image": {
        if (typeof b.url !== "string" || !NEWS_IMAGE_URL.test(b.url)) {
          throw new BadRequestException(
            `${where}: image must be uploaded through /news/upload-image`,
          );
        }
        const caption = localized(b.caption, where, false);
        return caption && (caption.uz || caption.ru)
          ? { type: "image", url: b.url, caption }
          : { type: "image", url: b.url };
      }
      case "list":
        return {
          type: "list",
          ordered: b.ordered === true,
          items: localized(b.items, where, true)!,
        };
      case "callout":
        return {
          type: "callout",
          tone: b.tone === "warning" ? "warning" : "info",
          text: localized(b.text, where, true)!,
        };
      default:
        throw new BadRequestException(`${where}: unknown block type`);
    }
  });
}

/**
 * Latin letters, digits and dashes. Uzbek apostrophes (o', g', ʻ) are dropped rather than turned
 * into dashes, so "Yangi to'lov usuli" becomes `yangi-tolov-usuli`, not `yangi-to-lov-usuli`.
 */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/['‘’ʻʼ`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}
