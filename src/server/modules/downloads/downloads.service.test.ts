import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DownloadsService, normalizeSlug } from './downloads.service';

/**
 * The portal is a public page with no login and no retry. The guarantees under test are that a
 * missing or malformed release feed degrades to "no installer shown" rather than a 500, and that
 * a slug can never carry a path separator into a URL.
 */

function build() {
  const prisma = {
    downloadItem: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => data),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
  };
  return { service: new DownloadsService(prisma as any), prisma };
}

const REAL_LATEST_YML = `version: 1.28.0
files:
  - url: POSGRO-Setup-1.28.0.exe
    sha512: 2XPadBAujVfVUYM1+LF1ubT2m/AK8RXThwj/QRhxdcFjm6aRPyegTXpcO7Z6R8qmK+jGcpF05VRgXaj7RXUCMA==
    size: 153859304
path: POSGRO-Setup-1.28.0.exe
sha512: 2XPadBAujVfVUYM1+LF1ubT2m/AK8RXThwj/QRhxdcFjm6aRPyegTXpcO7Z6R8qmK+jGcpF05VRgXaj7RXUCMA==
releaseDate: '2026-09-11T08:35:09.407Z'
`;

describe('latestApp', () => {
  let dir: string;
  const originalEnv = process.env.RELEASES_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'releases-'));
    process.env.RELEASES_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.RELEASES_DIR;
    else process.env.RELEASES_DIR = originalEnv;
  });

  it('reads the real latest.yml electron-builder writes', async () => {
    writeFileSync(join(dir, 'latest.yml'), REAL_LATEST_YML);
    const { service } = build();
    expect(await service.latestApp()).toEqual({
      version: '1.28.0',
      size: 153859304,
      url: '/releases/POSGRO-Setup-1.28.0.exe',
      releasedAt: '2026-09-11T08:35:09.407Z',
    });
  });

  it('returns a RELATIVE url so it works over whichever host serves the portal', async () => {
    writeFileSync(join(dir, 'latest.yml'), REAL_LATEST_YML);
    const { service } = build();
    expect((await service.latestApp())!.url.startsWith('/')).toBe(true);
  });

  it('returns null when there is no feed, rather than throwing on a public page', async () => {
    const { service } = build();
    expect(await service.latestApp()).toBeNull();
  });

  it('returns null for a feed with no version instead of advertising an empty one', async () => {
    writeFileSync(join(dir, 'latest.yml'), 'files:\n  - url: x.exe\n');
    const { service } = build();
    expect(await service.latestApp()).toBeNull();
  });

  it('survives a truncated feed mid-upload', async () => {
    writeFileSync(join(dir, 'latest.yml'), 'version: 1.28.0\nfiles:\n  - url: POSG');
    const { service } = build();
    // No `path:` yet, so there is nothing safe to link to.
    expect(await service.latestApp()).toBeNull();
  });

  it('tolerates a feed with no size', async () => {
    writeFileSync(join(dir, 'latest.yml'), "version: 2.0.0\npath: S.exe\nreleaseDate: '2026-01-01'\n");
    const { service } = build();
    expect(await service.latestApp()).toMatchObject({ version: '2.0.0', size: null });
  });
});

describe('normalizeSlug', () => {
  it('strips the extension', () => {
    expect(normalizeSlug('Xprinter-Driver-v3.2.zip')).toBe('xprinter-driver-v3-2');
  });

  it('cannot produce a path separator', () => {
    expect(normalizeSlug('../../etc/passwd')).toBe('etc-passwd');
    expect(normalizeSlug('a/b\\c')).toBe('a-b-c');
  });

  it('collapses spaces and punctuation', () => {
    expect(normalizeSlug('RLS1000  Scale Utility!! (v1.4)')).toBe('rls1000-scale-utility-v1-4');
  });

  it('never returns empty, so a row always has a usable handle', () => {
    expect(normalizeSlug('!!!')).toBe('file');
    expect(normalizeSlug('')).toBe('file');
  });

  it('caps the length', () => {
    expect(normalizeSlug('x'.repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe('downloads', () => {
  it('lists only published files to the public', async () => {
    const { service, prisma } = build();
    await service.list();
    expect(prisma.downloadItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { published: true } }),
    );
  });

  it('includes unpublished files in the admin listing', async () => {
    const { service, prisma } = build();
    await service.listAll();
    const args = (prisma.downloadItem.findMany as jest.Mock).mock.calls[0][0];
    expect(args).not.toHaveProperty('where');
  });

  it('refuses a duplicate slug rather than silently shadowing a file', async () => {
    const { service, prisma } = build();
    prisma.downloadItem.findUnique.mockResolvedValueOnce({ id: 'x' } as any);
    await expect(
      service.create({
        slug: 'xprinter',
        titleRu: 'A',
        titleUz: 'A',
        category: 'DRIVER',
        fileName: 'f.zip',
        filePath: '/downloads/f.zip',
        fileSize: 1,
        mimeType: 'application/zip',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('normalizes the slug on the way in', async () => {
    const { service, prisma } = build();
    const created: any = await service.create({
      slug: 'Xprinter Driver v3.2.zip',
      titleRu: 'A',
      titleUz: 'A',
      category: 'DRIVER',
      fileName: 'f.zip',
      filePath: '/downloads/f.zip',
      fileSize: 1,
      mimeType: 'application/zip',
    });
    expect(created.slug).toBe('xprinter-driver-v3-2');
    expect(prisma.downloadItem.create).toHaveBeenCalled();
  });

  it('stores a RELATIVE file path — a stored host makes the next domain move a migration', async () => {
    const { service } = build();
    const created: any = await service.create({
      slug: 'a',
      titleRu: 'A',
      titleUz: 'A',
      category: 'TOOL',
      fileName: 'f.zip',
      filePath: '/downloads/f.zip',
      fileSize: 1,
      mimeType: 'application/zip',
    });
    expect(created.filePath).toBe('/downloads/f.zip');
    expect(created.filePath).not.toMatch(/^https?:/);
  });

  it('does not hand out an unpublished file by slug', async () => {
    const { service, prisma } = build();
    prisma.downloadItem.findUnique.mockResolvedValueOnce({
      published: false,
      filePath: '/downloads/f.zip',
      fileName: 'f.zip',
    } as any);
    expect(await service.bySlug('f')).toBeNull();
  });

  it('never lets a failed download counter break the download', async () => {
    const { service, prisma } = build();
    prisma.downloadItem.update.mockRejectedValueOnce(new Error('db down'));
    await expect(service.countDownload('f')).resolves.toBeUndefined();
  });
});
