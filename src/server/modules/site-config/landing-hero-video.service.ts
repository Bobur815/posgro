import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { mkdir, readdir, rename, unlink, writeFile, copyFile } from 'fs/promises';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HERO_POSTER_ALIAS,
  LANDING_HERO_VIDEO_FILES,
  normalizeLandingHeroVideo,
  type LandingHeroVideo,
  type LandingHeroVideoFile,
} from '../../../shared/types/landing.types';

const HERO_VIDEO_KEY = 'landing_hero_video';

/** Per file. The encode script's output is 1–3 MB; this leaves headroom, not room for a raw clip. */
export const HERO_FILE_MAX_BYTES = 10 * 1024 * 1024;

type Kind = 'mp4' | 'webm' | 'jpg' | 'webp';

/** What each upload field must contain, and the suffix its stored file gets. */
const FIELDS: Record<LandingHeroVideoFile, { kind: Kind; suffix: string }> = {
  webm: { kind: 'webm', suffix: 'video.webm' },
  mp4: { kind: 'mp4', suffix: 'video.mp4' },
  mobileMp4: { kind: 'mp4', suffix: 'mobile.mp4' },
  posterJpg: { kind: 'jpg', suffix: 'poster.jpg' },
  posterWebp: { kind: 'webp', suffix: 'poster.webp' },
};

export interface HeroUpload {
  buffer: Buffer;
  size: number;
}

/**
 * The file's real type from its first bytes. The browser's mimetype and the file name are both
 * whatever the client says; these files end up served from posgro.uz, so they are checked.
 */
export function sniffKind(buf: Buffer): Kind | null {
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm'; // EBML header
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const VERSIONED = /^hero-(\d+)-/;

/**
 * The landing hero's background video: five finished files (scripts/encode-hero.sh), stored in
 * `uploads/landing/` and served by nginx on posgro.uz under `/media/` — straight from disk, so the
 * video keeps playing when the API is down.
 *
 * Every upload writes new, versioned names so they can be cached forever; the posters are also
 * copied to fixed names for index.html's preload. The previous version is kept on disk, so a
 * visitor midway through loading the old page still gets its files; anything older is removed.
 */
@Injectable()
export class LandingHeroVideoService {
  private readonly logger = new Logger(LandingHeroVideoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get dir(): string {
    return join(process.env.UPLOADS_DIR || join(process.cwd(), 'uploads'), 'landing');
  }

  async get(): Promise<LandingHeroVideo | null> {
    const row = await this.prisma.siteConfig.findUnique({
      where: { key: HERO_VIDEO_KEY },
    });
    if (!row) return null;
    try {
      return normalizeLandingHeroVideo(JSON.parse(row.value));
    } catch {
      return null;
    }
  }

  async set(files: Partial<Record<LandingHeroVideoFile, HeroUpload | undefined>>): Promise<LandingHeroVideo> {
    // Validate everything before touching the disk: a rejected upload must change nothing.
    for (const field of LANDING_HERO_VIDEO_FILES) {
      const file = files[field];
      if (!file) throw new BadRequestException(`Missing file: ${field}`);
      if (file.size > HERO_FILE_MAX_BYTES) throw new BadRequestException(`${field} is over 10 MB`);
      const kind = sniffKind(file.buffer);
      if (kind !== FIELDS[field].kind) {
        throw new BadRequestException(`${field} must be a ${FIELDS[field].kind} file`);
      }
    }

    const previous = await this.get();
    const version = Date.now();
    await mkdir(this.dir, { recursive: true });

    const names = {} as Record<LandingHeroVideoFile, string>;
    for (const field of LANDING_HERO_VIDEO_FILES) {
      names[field] = `hero-${version}-${FIELDS[field].suffix}`;
      await writeFile(join(this.dir, names[field]), files[field]!.buffer);
    }

    // Fixed-name posters: copy then rename, so a request never reads a half-written file.
    await this.replaceAlias(names.posterWebp, HERO_POSTER_ALIAS.webp);
    await this.replaceAlias(names.posterJpg, HERO_POSTER_ALIAS.jpg);

    const video: LandingHeroVideo = { version, ...names };
    const value = JSON.stringify(video);
    await this.prisma.siteConfig.upsert({
      where: { key: HERO_VIDEO_KEY },
      update: { value },
      create: { key: HERO_VIDEO_KEY, value },
    });

    await this.prune(new Set([version, previous?.version].filter((v): v is number => !!v)));
    this.logger.log(`hero video set: version=${version} (previous=${previous?.version ?? 'none'})`);
    return video;
  }

  /** Back to no video: the landing shows its gradient fallback. All hero files are removed. */
  async remove(): Promise<void> {
    await this.prisma.siteConfig.deleteMany({ where: { key: HERO_VIDEO_KEY } });
    await this.prune(new Set());
    for (const alias of Object.values(HERO_POSTER_ALIAS)) {
      await unlink(join(this.dir, alias)).catch(() => undefined);
    }
    this.logger.log('hero video removed');
  }

  private async replaceAlias(source: string, alias: string): Promise<void> {
    const tmp = join(this.dir, `.${alias}.tmp`);
    await copyFile(join(this.dir, source), tmp);
    await rename(tmp, join(this.dir, alias));
  }

  /** Delete versioned hero files whose version is not in `keep`. Touches nothing else in the dir. */
  private async prune(keep: Set<number>): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return; // no directory yet: nothing to prune
    }
    for (const name of entries) {
      const m = VERSIONED.exec(name);
      if (m && !keep.has(Number(m[1]))) {
        await unlink(join(this.dir, name)).catch((e: unknown) =>
          this.logger.warn(`could not delete ${name}: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    }
  }
}
