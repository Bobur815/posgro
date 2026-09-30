import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { NewsPost, Prisma } from "@prisma/client";
import sharp from "sharp";
import { PrismaService } from "../../prisma/prisma.service";
import { parseBlocks, slugify, type NewsBlock } from "./news.blocks";
import type {
  CreateNewsDto,
  ListNewsQueryDto,
  NewsAudience,
  NewsStatus,
  UpdateNewsDto,
} from "./dto/news.dto";

/** What a card needs — the list endpoints never ship bodies. */
export interface NewsSummary {
  id: string;
  slug: string;
  titleUz: string;
  titleRu: string;
  excerptUz: string | null;
  excerptRu: string | null;
  coverUrl: string | null;
  audience: NewsAudience;
  publishedAt: Date | null;
}

export interface NewsArticle extends NewsSummary {
  body: NewsBlock[];
}

export interface NewsAdminRow extends NewsSummary {
  status: NewsStatus;
  updatedAt: Date;
}

export interface NewsPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Wide enough for a full-width screenshot on a laptop; anything larger is wasted bytes. */
const IMAGE_MAX_WIDTH = 1600;
const DEFAULT_LIMIT = 12;

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  titleUz: true,
  titleRu: true,
  excerptUz: true,
  excerptRu: true,
  coverUrl: true,
  audience: true,
  publishedAt: true,
} satisfies Prisma.NewsPostSelect;

type SummaryRow = Prisma.NewsPostGetPayload<{ select: typeof SUMMARY_SELECT }>;

const toSummary = (r: SummaryRow): NewsSummary => ({
  ...r,
  audience: r.audience as NewsAudience,
});

/** Where readers may look: published, not scheduled into the future, in their audience. */
function visibleWhere(audiences: NewsAudience[]): Prisma.NewsPostWhereInput {
  return {
    status: "PUBLISHED",
    publishedAt: { lte: new Date() },
    audience: { in: audiences },
  };
}

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Readers ──────────────────────────────────────────────────────────────

  async list(
    query: ListNewsQueryDto,
    audiences: NewsAudience[],
  ): Promise<NewsPage<NewsSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = visibleWhere(audiences);
    const [rows, total] = await Promise.all([
      this.prisma.newsPost.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.newsPost.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page, limit };
  }

  async article(slug: string, audiences: NewsAudience[]): Promise<NewsArticle> {
    const row = await this.prisma.newsPost.findFirst({
      where: { slug, ...visibleWhere(audiences) },
    });
    if (!row) throw new NotFoundException("News post not found");
    return this.toArticle(row);
  }

  // ─── Super admin ──────────────────────────────────────────────────────────

  async adminList(): Promise<NewsAdminRow[]> {
    const rows = await this.prisma.newsPost.findMany({
      select: { ...SUMMARY_SELECT, status: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    return rows.map((r) => ({
      ...toSummary(r),
      status: r.status as NewsStatus,
      updatedAt: r.updatedAt,
    }));
  }

  async adminGet(id: string): Promise<NewsArticle & { status: NewsStatus }> {
    const row = await this.prisma.newsPost.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("News post not found");
    return { ...this.toArticle(row), status: row.status as NewsStatus };
  }

  async create(dto: CreateNewsDto, actor: string): Promise<NewsArticle> {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.titleUz));
    const status = dto.status ?? "DRAFT";
    const row = await this.prisma.newsPost.create({
      data: {
        slug,
        titleUz: dto.titleUz,
        titleRu: dto.titleRu,
        excerptUz: dto.excerptUz ?? null,
        excerptRu: dto.excerptRu ?? null,
        coverUrl: dto.coverUrl ?? null,
        body: parseBlocks(dto.body ?? []) as unknown as Prisma.InputJsonValue,
        status,
        audience: dto.audience ?? "PUBLIC",
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
    this.logger.log(
      `News ${row.id} "${row.slug}" created by ${actor} (${status})`,
    );
    return this.toArticle(row);
  }

  async update(
    id: string,
    dto: UpdateNewsDto,
    actor: string,
  ): Promise<NewsArticle> {
    const current = await this.prisma.newsPost.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("News post not found");

    const data: Prisma.NewsPostUpdateInput = {};
    if (dto.slug !== undefined && dto.slug !== current.slug) {
      data.slug = await this.uniqueSlug(dto.slug, id);
    }
    if (dto.titleUz !== undefined) data.titleUz = dto.titleUz;
    if (dto.titleRu !== undefined) data.titleRu = dto.titleRu;
    if (dto.excerptUz !== undefined) data.excerptUz = dto.excerptUz;
    if (dto.excerptRu !== undefined) data.excerptRu = dto.excerptRu;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
    if (dto.body !== undefined)
      data.body = parseBlocks(dto.body) as unknown as Prisma.InputJsonValue;
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.status !== undefined) {
      data.status = dto.status;
      // First publish stamps the date; unpublishing keeps it, so a re-publish keeps its place.
      if (dto.status === "PUBLISHED" && !current.publishedAt)
        data.publishedAt = new Date();
    }

    const row = await this.prisma.newsPost.update({ where: { id }, data });
    this.logger.log(
      `News ${id} updated by ${actor}: ${Object.keys(data).join(", ")}`,
    );
    return this.toArticle(row);
  }

  async remove(id: string, actor: string): Promise<{ removed: true }> {
    const current = await this.prisma.newsPost.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!current) throw new NotFoundException("News post not found");
    await this.prisma.newsPost.delete({ where: { id } });
    // Its images stay in uploads/news: another post may reuse a screenshot, and they are small.
    this.logger.log(`News ${id} "${current.slug}" deleted by ${actor}`);
    return { removed: true };
  }

  /**
   * Re-encodes every upload: EXIF orientation applied then stripped (phone photos carry GPS),
   * at most IMAGE_MAX_WIDTH wide, WebP. Whatever arrived, only a clean WebP reaches the disk.
   */
  async saveImage(buffer: Buffer): Promise<{ url: string }> {
    let webp: Buffer;
    try {
      webp = await sharp(buffer, { animated: false })
        .rotate()
        .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Not a readable image");
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const name = `${stamp}-${randomBytes(6).toString("hex")}.webp`;
    const dir = join(uploadsDir(), "news");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), webp);
    return { url: `/uploads/news/${name}` };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** `slug`, or `slug-2`, `slug-3`… — whichever is free (ignoring the post being edited). */
  private async uniqueSlug(base: string, exceptId?: string): Promise<string> {
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? base : `${base.slice(0, 76)}-${n}`;
      const taken = await this.prisma.newsPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken || taken.id === exceptId) return candidate;
    }
    throw new BadRequestException(
      "slug: too many posts with this title — set a slug by hand",
    );
  }

  private toArticle(row: NewsPost): NewsArticle {
    let body: NewsBlock[];
    try {
      body = parseBlocks(row.body);
    } catch {
      // Only possible if the row was edited by hand; show the post without its body, not a 500.
      this.logger.error(`News ${row.id} has an invalid body — served empty`);
      body = [];
    }
    return {
      id: row.id,
      slug: row.slug,
      titleUz: row.titleUz,
      titleRu: row.titleRu,
      excerptUz: row.excerptUz,
      excerptRu: row.excerptRu,
      coverUrl: row.coverUrl,
      audience: row.audience as NewsAudience,
      publishedAt: row.publishedAt,
      body,
    };
  }
}
