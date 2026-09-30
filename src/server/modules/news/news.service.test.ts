import sharp from "sharp";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NewsService } from "./news.service";

/**
 * The rules with teeth: a draft or customers-only post never leaks to posgro.uz, the publish date
 * is stamped once and survives unpublish, and uploads are re-encoded before touching the disk.
 */

function build(current: Record<string, unknown> | null = null) {
  const row = (data: Record<string, unknown>) => ({
    id: "n1",
    slug: "post",
    titleUz: "T",
    titleRu: "T",
    excerptUz: null,
    excerptRu: null,
    coverUrl: null,
    body: [],
    status: "DRAFT",
    audience: "PUBLIC",
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...current,
    ...data,
  });
  const prisma = {
    newsPost: {
      findMany: jest.fn(async (_args: unknown) => []),
      count: jest.fn(async (_args: unknown) => 0),
      findFirst: jest.fn(async (_args: unknown) => null),
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string; slug?: string } }) =>
          where.id ? current && row({}) : null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row(data),
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row(data),
      ),
    },
  };
  // Only the members the service touches are mocked.
  return { service: new NewsService(prisma as never), prisma };
}

describe("NewsService readers", () => {
  it("shows posgro.uz only published PUBLIC posts dated up to now", async () => {
    const { service, prisma } = build();
    await service.list({}, ["PUBLIC"]);
    const { where } = prisma.newsPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where.status).toBe("PUBLISHED");
    expect(where.audience).toEqual({ in: ["PUBLIC"] });
    expect((where.publishedAt as { lte: Date }).lte).toBeInstanceOf(Date);
  });

  it("pages with a default of 12", async () => {
    const { service, prisma } = build();
    const page = await service.list({ page: 3 }, ["PUBLIC", "CUSTOMERS"]);
    expect(prisma.newsPost.findMany.mock.calls[0][0]).toMatchObject({
      skip: 24,
      take: 12,
    });
    expect(page).toMatchObject({ page: 3, limit: 12, total: 0 });
  });

  it("404s a post outside the audience instead of revealing it", async () => {
    const { service } = build();
    await expect(service.article("customers-only", ["PUBLIC"])).rejects.toThrow(
      "not found",
    );
  });
});

describe("NewsService publishing", () => {
  it("derives the slug from the Uzbek title and stamps a date when created published", async () => {
    const { service, prisma } = build();
    await service.create(
      { titleUz: "Yangi to'lov", titleRu: "Новая оплата", status: "PUBLISHED" },
      "u1",
    );
    const { data } = prisma.newsPost.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.slug).toBe("yangi-tolov");
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it("leaves a draft undated", async () => {
    const { service, prisma } = build();
    await service.create({ titleUz: "A", titleRu: "A" }, "u1");
    expect(
      (
        prisma.newsPost.create.mock.calls[0][0] as {
          data: { publishedAt: unknown };
        }
      ).data.publishedAt,
    ).toBeNull();
  });

  it("keeps the first publish date when re-published", async () => {
    const first = new Date("2026-09-01T00:00:00Z");
    const { service, prisma } = build({ status: "DRAFT", publishedAt: first });
    await service.update("n1", { status: "PUBLISHED" }, "u1");
    const { data } = prisma.newsPost.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toEqual({ status: "PUBLISHED" });
  });
});

describe("NewsService.saveImage", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "news-"));
    process.env.UPLOADS_DIR = dir;
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.UPLOADS_DIR;
  });

  it("writes a WebP no wider than 1600px under uploads/news", async () => {
    const png = await sharp({
      create: { width: 3200, height: 400, channels: 3, background: "#2196f3" },
    })
      .png()
      .toBuffer();
    const { url } = await build().service.saveImage(png);
    expect(url).toMatch(/^\/uploads\/news\/\d{6}-[0-9a-f]{12}\.webp$/);
    const meta = await sharp(
      readFileSync(join(dir, url.replace("/uploads/", ""))),
    ).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1600 });
  });

  it("refuses bytes that are not an image", async () => {
    await expect(
      build().service.saveImage(Buffer.from("not an image")),
    ).rejects.toThrow("Not a readable image");
  });
});
