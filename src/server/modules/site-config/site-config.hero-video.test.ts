import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { LandingHeroVideoService, sniffKind, type HeroUpload } from './landing-hero-video.service';
import { normalizeLandingHeroVideo } from '../../../shared/types/landing.types';

/**
 * The hero video's files are served from posgro.uz straight off disk, so what is under test is
 * what ends up there: only files that really are the declared type, nothing written when an
 * upload is rejected, and old versions cleaned up without touching anything else in the folder.
 */

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(8)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

const up = (buffer: Buffer): HeroUpload => ({ buffer, size: buffer.length });
const complete = () => ({
  webm: up(WEBM),
  mp4: up(MP4),
  mobileMp4: up(MP4),
  posterJpg: up(JPG),
  posterWebp: up(WEBP),
});

let uploads: string;
const landingDir = () => join(uploads, 'landing');

beforeEach(() => {
  uploads = mkdtempSync(join(tmpdir(), 'hero-video-'));
  process.env.UPLOADS_DIR = uploads;
});
afterEach(() => {
  rmSync(uploads, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
});

function build() {
  const rows = new Map<string, string>();
  const prisma = {
    siteConfig: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { key: where.key, value: rows.get(where.key)! } : null,
      ),
      upsert: jest.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        rows.set(where.key, update.value);
        return { key: where.key, value: update.value };
      }),
      deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => {
        rows.delete(where.key);
        return { count: 1 };
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a three-method fake, not a PrismaService
  return { service: new LandingHeroVideoService(prisma as any), rows };
}

describe('sniffKind', () => {
  it('recognises each format by its first bytes', () => {
    expect(sniffKind(MP4)).toBe('mp4');
    expect(sniffKind(WEBM)).toBe('webm');
    expect(sniffKind(JPG)).toBe('jpg');
    expect(sniffKind(WEBP)).toBe('webp');
  });

  it('rejects anything else, whatever its name or mimetype claimed', () => {
    expect(sniffKind(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('normalizeLandingHeroVideo', () => {
  it('is null for nothing, or for a half-configured video', () => {
    expect(normalizeLandingHeroVideo(null)).toBeNull();
    expect(normalizeLandingHeroVideo({ version: 1, webm: 'a.webm' })).toBeNull();
  });

  it('refuses names that could leave the uploads folder', () => {
    const base = { version: 1, webm: 'a.webm', mp4: 'a.mp4', mobileMp4: 'b.mp4', posterJpg: 'a.jpg', posterWebp: 'a.webp' };
    expect(normalizeLandingHeroVideo(base)).toEqual(base);
    expect(normalizeLandingHeroVideo({ ...base, mp4: '../../etc/passwd' })).toBeNull();
    expect(normalizeLandingHeroVideo({ ...base, mp4: '.hidden' })).toBeNull();
  });
});

describe('LandingHeroVideoService', () => {
  it('is null before anything is uploaded', async () => {
    expect(await build().service.get()).toBeNull();
  });

  it('stores five versioned files, the poster aliases, and the config', async () => {
    const { service } = build();
    const video = await service.set(complete());

    expect(await service.get()).toEqual(video);
    const files = readdirSync(landingDir()).sort();
    expect(files).toEqual(
      [
        'hero-poster.jpg',
        'hero-poster.webp',
        video.mobileMp4,
        video.mp4,
        video.posterJpg,
        video.posterWebp,
        video.webm,
      ].sort(),
    );
    expect(readFileSync(join(landingDir(), 'hero-poster.webp'))).toEqual(WEBP);
  });

  it('writes nothing when one file is the wrong type', async () => {
    const { service, rows } = build();
    await expect(service.set({ ...complete(), mp4: up(WEBM) })).rejects.toBeInstanceOf(BadRequestException);
    expect(rows.size).toBe(0);
    expect(() => readdirSync(landingDir())).toThrow();
  });

  it('writes nothing when a file is missing', async () => {
    const { service, rows } = build();
    await expect(service.set({ ...complete(), posterWebp: undefined })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rows.size).toBe(0);
  });

  it('keeps the current and previous versions, deletes older ones, leaves other files alone', async () => {
    const { service } = build();
    mkdirSync(landingDir(), { recursive: true });
    writeFileSync(join(landingDir(), 'unrelated.png'), 'x');

    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    const v1 = await service.set(complete());
    now.mockReturnValue(2000);
    const v2 = await service.set(complete());
    now.mockReturnValue(3000);
    const v3 = await service.set(complete());
    now.mockRestore();

    const files = readdirSync(landingDir());
    expect(files).toContain('unrelated.png');
    expect(files).toContain(v3.mp4);
    expect(files).toContain(v2.mp4);
    expect(files).not.toContain(v1.mp4);
    expect(files.filter((f) => f.startsWith('hero-1000-'))).toEqual([]);
  });

  it('remove() clears the config and every hero file, and nothing else', async () => {
    const { service } = build();
    await service.set(complete());
    writeFileSync(join(landingDir(), 'unrelated.png'), 'x');

    await service.remove();

    expect(await service.get()).toBeNull();
    expect(readdirSync(landingDir())).toEqual(['unrelated.png']);
  });
});
