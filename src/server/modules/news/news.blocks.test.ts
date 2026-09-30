import { BadRequestException } from "@nestjs/common";
import { parseBlocks, slugify } from "./news.blocks";

/**
 * The body is stored as JSON and read on a public page, so the parser is the only thing standing
 * between a stored post and the reader: unknown fields dropped, images limited to our uploads.
 */

const L = (uz: string, ru = uz) => ({ uz, ru });

describe("parseBlocks", () => {
  it("keeps every block type, trimmed, in order", () => {
    const out = parseBlocks([
      { type: "heading", text: L("  Sarlavha ", "Заголовок") },
      { type: "paragraph", text: L("Matn") },
      {
        type: "image",
        url: "/uploads/news/202609-ab12cd.webp",
        caption: L("Rasm"),
      },
      { type: "list", ordered: true, items: L("bir\nikki") },
      { type: "callout", tone: "warning", text: L("Diqqat") },
    ]);
    expect(out).toEqual([
      { type: "heading", text: { uz: "Sarlavha", ru: "Заголовок" } },
      { type: "paragraph", text: L("Matn") },
      {
        type: "image",
        url: "/uploads/news/202609-ab12cd.webp",
        caption: L("Rasm"),
      },
      { type: "list", ordered: true, items: L("bir\nikki") },
      { type: "callout", tone: "warning", text: L("Diqqat") },
    ]);
  });

  it("drops unknown fields — nothing extra reaches the table", () => {
    const [block] = parseBlocks([
      { type: "paragraph", text: L("a"), html: "<script>" },
    ]);
    expect(block).toEqual({ type: "paragraph", text: L("a") });
  });

  it("drops an empty caption and defaults list / callout options", () => {
    expect(
      parseBlocks([
        { type: "image", url: "/uploads/news/x1.webp", caption: L("", "") },
        { type: "list", items: L("a") },
        { type: "callout", tone: "loud", text: L("a") },
      ]),
    ).toEqual([
      { type: "image", url: "/uploads/news/x1.webp" },
      { type: "list", ordered: false, items: L("a") },
      { type: "callout", tone: "info", text: L("a") },
    ]);
  });

  it.each([
    ["https://evil.example/x.webp"],
    ["/uploads/banner-1.png"],
    ["/uploads/news/../../etc/passwd"],
    ["javascript:alert(1)"],
  ])("refuses an image that is not one of our uploads: %s", (url) => {
    expect(() => parseBlocks([{ type: "image", url }])).toThrow(
      BadRequestException,
    );
  });

  it("names the bad block", () => {
    expect(() =>
      parseBlocks([{ type: "paragraph", text: L("ok") }, { type: "video" }]),
    ).toThrow("body[1]: unknown block type");
  });

  it("refuses a block with text in neither language", () => {
    expect(() => parseBlocks([{ type: "heading", text: L("  ", "") }])).toThrow(
      "text is empty",
    );
  });

  it("refuses a non-array body", () => {
    expect(() => parseBlocks({ type: "paragraph" })).toThrow(
      BadRequestException,
    );
  });
});

describe("slugify", () => {
  it("drops Uzbek apostrophes instead of splitting words on them", () => {
    expect(slugify("Yangi to'lov usuli")).toBe("yangi-tolov-usuli");
    expect(slugify("Oʻzbekiston va gʻalaba")).toBe("ozbekiston-va-galaba");
  });

  it("falls back when nothing Latin is left", () => {
    expect(slugify("Новости")).toBe("post");
  });
});
