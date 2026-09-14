import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * What panel.posgro.uz offers: the POSGRO installer, plus drivers, utilities and manuals uploaded
 * by a super admin.
 *
 * The installer is NOT a DownloadItem. It is read from the same `/releases/latest.yml` that
 * electron-builder writes and every terminal's updater already polls, so the portal can never
 * advertise a build the updater will not accept. See tasks/DOMAIN_MIGRATION_POSGRO.md §8.
 */

export const DOWNLOAD_CATEGORIES = ['DRIVER', 'TOOL', 'MANUAL', 'OTHER'] as const;
export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];

export interface LatestApp {
  version: string;
  /** Bytes, or null when latest.yml omits it (older electron-builder output). */
  size: number | null;
  /** Relative, so it works over whichever host is serving the portal. */
  url: string;
  releasedAt: string | null;
}

/** Where uploaded tools live. Separate from `uploads/` — different size profile and retention. */
function downloadsDir(): string {
  return process.env.DOWNLOADS_DIR || join(process.cwd(), 'downloads');
}

/** Where electron-builder's release files are served from. */
function releasesDir(): string {
  return process.env.RELEASES_DIR || '/home/bobur/releases';
}

/**
 * Minimal reader for the two fields we need out of latest.yml.
 *
 * Deliberately not a YAML dependency: this file is machine-written by electron-builder in a flat,
 * predictable shape, and the updater is the component that actually has to parse it strictly.
 * Here a bad parse must degrade to "no version shown", never to a 500 on a public page.
 */
function parseLatestYml(text: string): Omit<LatestApp, 'url'> & { path: string | null } {
  const field = (name: string): string | null => {
    const m = text.match(new RegExp(`^${name}:\\s*'?"?([^'"\\n\\r]+)'?"?\\s*$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const size = text.match(/^\s+size:\s*(\d+)\s*$/m);
  return {
    version: field('version') ?? '',
    size: size ? Number(size[1]) : null,
    releasedAt: field('releaseDate'),
    path: field('path'),
  };
}

@Injectable()
export class DownloadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published files only, grouped the way the portal renders them. */
  async list(): Promise<unknown[]> {
    return this.prisma.downloadItem.findMany({
      where: { published: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Everything, published or not — the admin view. */
  async listAll(): Promise<unknown[]> {
    return this.prisma.downloadItem.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * The current POSGRO installer, read from the updater's own feed.
   *
   * Returns null rather than throwing when the feed is missing or unreadable: the portal's hero
   * is a download button, and a public page must render without it rather than 500.
   */
  async latestApp(): Promise<LatestApp | null> {
    try {
      const text = await readFile(join(releasesDir(), 'latest.yml'), 'utf8');
      const parsed = parseLatestYml(text);
      if (!parsed.version || !parsed.path) return null;
      return {
        version: parsed.version,
        size: parsed.size,
        url: `/releases/${parsed.path}`,
        releasedAt: parsed.releasedAt,
      };
    } catch {
      return null;
    }
  }

  async create(data: {
    slug: string;
    titleRu: string;
    titleUz: string;
    descRu?: string;
    descUz?: string;
    category: string;
    version?: string;
    sortOrder?: number;
    published?: boolean;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
  }): Promise<unknown> {
    const slug = normalizeSlug(data.slug || data.fileName);
    if (await this.prisma.downloadItem.findUnique({ where: { slug } })) {
      throw new BadRequestException(`A download with the slug "${slug}" already exists`);
    }
    return this.prisma.downloadItem.create({ data: { ...data, slug } });
  }

  async update(
    id: string,
    data: Partial<{
      titleRu: string;
      titleUz: string;
      descRu: string;
      descUz: string;
      category: string;
      version: string;
      sortOrder: number;
      published: boolean;
    }>,
  ): Promise<unknown> {
    await this.mustExist(id);
    return this.prisma.downloadItem.update({ where: { id }, data });
  }

  /**
   * Removes the row and then the file.
   *
   * In that order deliberately: a row with no file is a broken link on a public page, whereas a
   * file with no row is invisible and costs only disk. So the failure that can survive is the
   * harmless one.
   */
  async remove(id: string): Promise<{ id: string }> {
    const item = await this.mustExist(id);
    await this.prisma.downloadItem.delete({ where: { id } });
    try {
      await unlink(join(downloadsDir(), item.fileName));
    } catch {
      /* already gone, or never written — the row is what mattered */
    }
    return { id };
  }

  /**
   * Advisory counter. Deliberately fire-and-forget: this runs on the redirect that hands a shop
   * its driver, and a failed statistic must never fail that download.
   */
  async countDownload(slug: string): Promise<void> {
    try {
      await this.prisma.downloadItem.update({
        where: { slug },
        data: { downloads: { increment: 1 } },
      });
    } catch {
      /* nothing here is worth interrupting a download for */
    }
  }

  async bySlug(slug: string): Promise<{ filePath: string; fileName: string } | null> {
    const item = await this.prisma.downloadItem.findUnique({ where: { slug } });
    return item && item.published ? { filePath: item.filePath, fileName: item.fileName } : null;
  }

  private async mustExist(id: string) {
    const item = await this.prisma.downloadItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Download not found');
    return item;
  }
}

/** URL- and support-instruction-safe handle: lowercase, dashes, no dots or spaces. */
export function normalizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'file'
  );
}
