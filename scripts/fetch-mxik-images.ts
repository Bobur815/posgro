// Builds the picture seed the POS installer ships: prisma/seed/images/ (extraResources already
// copies prisma/**, so nothing in electron-builder.config.js changes).
//
//   1. Category pictures from files you drop into scripts/category-images/, named after the
//      category's nameUz (`Salqin ichimliklar.png`); matched on the till by categoryNameKey().
//   2. Fetch: every picture tasnif.soliq.uz has for each MXIK (up to MAX_CANDIDATES) goes into a
//      local cache, scripts/.mxik-candidates/ (gitignored, never shipped). Network only here.
//   3. Build: one picture per code from the cache — your choice in
//      scripts/mxik-image-overrides.json if there is one, else the lowest numbered picture, else
//      the tallest (pickUpright). Overrides `null` = block the code: no picture, and tills never
//      fetch one.
//   4. Review: scripts/.mxik-candidates/review.html — every code with its alternatives. Pick
//      better ones, block bad ones, download the overrides file into scripts/, run again.
// Every picture is fitted inside 256×256, flattened onto white and stored as WebP.
//
// tasnif.soliq.uz is geo-blocked to Uzbekistan IPs — run this from a UZ machine.
//
//   npx tsx scripts/fetch-mxik-images.ts ./mxik-prod.csv
//   DELAY_MS=1000 …   # slower
//   REFRESH=1 …       # ask tasnif again for codes already cached or known to have none
//   OFFLINE=1 …       # steps 1, 3, 4 only: rebuild from the cache after editing overrides
//
// Input: a CSV whose first column is the MXIK and second the product count (a header row is
// fine). Produce it read-only on the VPS:
//   SELECT mxik, COUNT(*) FROM products WHERE mxik ~ '^[0-9]{17}$' GROUP BY mxik ORDER BY 2 DESC;
//
// Resumable: a cached code is never fetched again, and a network error caches nothing.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import {
  categoryNameKey,
  isNumberedPictureName,
  pickUpright,
  preferredPictureOrder,
  sniffImageMime,
  TASNIF_PICTURES,
  wantsMxikPicture,
  type ImageSeedManifest,
} from '../src/main/images/image-bytes';

const DELAY_MS = Number(process.env.DELAY_MS ?? 500);
const REFRESH = process.env.REFRESH === '1';
const OFFLINE = process.env.OFFLINE === '1';
const SIZE = 256;
const WEBP_QUALITY = 80;
const MAX_CANDIDATES = 6;

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.env.SEED_DIR ?? path.join(ROOT, 'prisma', 'seed', 'images'));
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const CACHE = path.resolve(process.env.CACHE_DIR ?? path.join(ROOT, 'scripts', '.mxik-candidates'));
const OVERRIDES = path.resolve(process.env.OVERRIDES_FILE ?? path.join(ROOT, 'scripts', 'mxik-image-overrides.json'));
const CATEGORY_SRC = path.join(ROOT, 'scripts', 'category-images');
const CATEGORY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Candidate {
  sourceName: string;
  /** Relative to CACHE. */
  file: string;
  width: number;
  height: number;
}

/** CACHE/{mxik}.json — what tasnif had for the code when it was fetched. Empty = none. */
interface CacheEntry {
  fetchedAt: string;
  candidates: Candidate[];
}

/** mxik → chosen sourceName, or null to block the code. */
type Overrides = Record<string, string | null>;

function toWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // honour EXIF orientation — phone photos arrive sideways otherwise
    .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function getBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const cachePath = (mxik: string) => path.join(CACHE, `${mxik}.json`);

function readCache(mxik: string): CacheEntry | null {
  const p = cachePath(mxik);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as CacheEntry) : null;
}

/** Every usable picture tasnif lists for `mxik`, shrunk, into the cache. Throws on network trouble. */
async function fetchCandidates(mxik: string): Promise<CacheEntry> {
  const names = await getJson<unknown>(`${TASNIF_PICTURES}/mxik/picture-names?mxik_code=${mxik}`);
  if (!Array.isArray(names)) throw new Error(`picture-names: unexpected body for ${mxik}`);

  const dir = path.join(CACHE, mxik);
  fs.mkdirSync(dir, { recursive: true });
  const candidates: Candidate[] = [];
  const ordered = preferredPictureOrder(names.filter((n): n is string => typeof n === 'string' && !!n));
  for (const name of ordered.slice(0, MAX_CANDIDATES)) {
    await sleep(DELAY_MS);
    const bytes = await getBytes(`${TASNIF_PICTURES}/file/${encodeURIComponent(name)}`);
    // A missing file is HTTP 200 with a placeholder (SVG for .png names) — the bytes decide.
    if (!sniffImageMime(bytes)) continue;
    let webp: Buffer;
    try {
      webp = await toWebp(bytes);
    } catch (e) {
      console.warn(`  ${mxik}: ${name} does not decode (${(e as Error).message}) — skipped`);
      continue;
    }
    const { width = 0, height = 0 } = await sharp(webp).metadata();
    const file = `${mxik}/${candidates.length}.webp`;
    fs.writeFileSync(path.join(CACHE, file), webp);
    candidates.push({ sourceName: name, file, width, height });
  }
  const entry: CacheEntry = { fetchedAt: new Date().toISOString(), candidates };
  fs.writeFileSync(cachePath(mxik), JSON.stringify(entry, null, 2));
  return entry;
}

/** The overridden candidate, else the lowest numbered one, else the tallest. */
function choose(mxik: string, entry: CacheEntry, overrides: Overrides): Candidate | null {
  if (mxik in overrides) {
    const wanted = overrides[mxik];
    if (wanted === null) return null;
    const hit = entry.candidates.find((c) => c.sourceName === wanted);
    if (hit) return hit;
    console.warn(`  ${mxik}: override "${wanted}" is not among the cached pictures — using the rule`);
  }
  // Candidates are cached in preferredPictureOrder, so the first numbered one is the lowest.
  return entry.candidates.find((c) => isNumberedPictureName(c.sourceName)) ?? pickUpright(entry.candidates) ?? null;
}

function readCodes(csvPath: string): Map<string, number> {
  const codes = new Map<string, number>();
  for (const line of fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const [mxik = '', count = ''] = line.split(/[,;|\t]/).map((s) => s.trim());
    if (wantsMxikPicture(mxik) && !codes.has(mxik)) codes.set(mxik, Number(count) || 0);
  }
  return codes;
}

function loadManifest(): ImageSeedManifest {
  if (!fs.existsSync(MANIFEST)) return { generatedAt: '', mxik: [], mxikNone: [], categories: [] };
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as ImageSeedManifest;
}

/** Sorted, so a run that changes nothing leaves the file byte-identical in git. */
function normalise(m: ImageSeedManifest): ImageSeedManifest {
  return {
    generatedAt: m.generatedAt,
    mxik: [...m.mxik].sort((a, b) => a.mxik.localeCompare(b.mxik)),
    mxikNone: [...new Set(m.mxikNone)].sort(),
    mxikBlocked: [...new Set(m.mxikBlocked ?? [])].sort(),
    categories: [...m.categories].sort((a, b) => a.nameKey.localeCompare(b.nameKey)),
  };
}

const contentOf = (m: ImageSeedManifest) => JSON.stringify({ ...normalise(m), generatedAt: '' });

/** Category pictures, named by content: ASCII, and a replaced picture changes the manifest. */
async function buildCategories(): Promise<ImageSeedManifest['categories']> {
  const dir = path.join(OUT_DIR, 'category');
  fs.mkdirSync(dir, { recursive: true });
  const next: ImageSeedManifest['categories'] = [];
  const seen = new Map<string, string>();

  const files = fs.existsSync(CATEGORY_SRC) ? fs.readdirSync(CATEGORY_SRC).sort() : [];
  for (const f of files) {
    if (!CATEGORY_EXT.has(path.extname(f).toLowerCase())) continue;
    const nameKey = categoryNameKey(path.basename(f, path.extname(f)));
    if (seen.has(nameKey)) {
      console.warn(`category: "${f}" and "${seen.get(nameKey)}" are the same category — "${f}" skipped`);
      continue;
    }
    seen.set(nameKey, f);
    const webp = await toWebp(fs.readFileSync(path.join(CATEGORY_SRC, f)));
    const file = `category/${crypto.createHash('sha1').update(webp).digest('hex').slice(0, 12)}.webp`;
    fs.writeFileSync(path.join(OUT_DIR, file), webp);
    next.push({ nameKey, file });
  }
  const keep = new Set(next.map((c) => path.basename(c.file)));
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.unlinkSync(path.join(dir, f));
  console.log(`categories: ${next.length} picture(s) from ${CATEGORY_SRC}`);
  return next;
}

async function fetchMissing(codes: string[], knownNone: Set<string>): Promise<number> {
  const todo = codes.filter((c) => REFRESH || (!readCache(c) && !knownNone.has(c)));
  console.log(`fetch: ${todo.length} of ${codes.length} code(s) to ask tasnif`);
  let failed = 0;
  for (let i = 0; i < todo.length; i++) {
    try {
      await fetchCandidates(todo[i]);
    } catch (e) {
      failed++;
      console.warn(`  ${todo[i]}: ${(e as Error).message} — left for the next run`);
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${todo.length}, failed ${failed}`);
    await sleep(DELAY_MS);
  }
  return failed;
}

function buildReview(codes: Map<string, number>, overrides: Overrides, chosen: Map<string, Candidate | null>): string {
  const rows: string[] = [];
  const sorted = [...codes.keys()].sort((a, b) => (codes.get(b) ?? 0) - (codes.get(a) ?? 0));
  for (const mxik of sorted) {
    const entry = readCache(mxik);
    if (!entry?.candidates.length) continue;
    const pick = chosen.get(mxik);
    const auto = !entry.candidates.some((c) => isNumberedPictureName(c.sourceName));
    const imgs = entry.candidates
      .map((c) => {
        const data = fs.readFileSync(path.join(CACHE, c.file)).toString('base64');
        const on = pick?.sourceName === c.sourceName ? ' on' : '';
        return `<img class="c${on}" data-name="${c.sourceName}" title="${c.sourceName} ${c.width}×${c.height}" src="data:image/webp;base64,${data}">`;
      })
      .join('');
    const blocked = overrides[mxik] === null ? ' blocked' : '';
    rows.push(
      `<div class="row${blocked}" data-mxik="${mxik}" data-auto="${auto}"><div class="meta"><b>${mxik}</b>` +
        `<span>${codes.get(mxik) ?? 0} mahsulot</span><span>${auto ? 'avto tanlangan' : 'raqamli rasm'}</span>` +
        `<button class="block">Bloklash</button></div><div class="pics">${imgs}</div></div>`,
    );
  }
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>MXIK rasmlari — ko'rib chiqish</title>
<style>
body{font:14px system-ui,sans-serif;margin:0;background:#f4f4f5;color:#18181b}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;gap:16px;align-items:center;z-index:1}
.row{display:flex;gap:12px;align-items:center;background:#fff;margin:8px 16px;padding:8px;border-radius:8px}
.row.blocked{opacity:.35}.row.blocked .meta{opacity:1}
.meta{width:190px;display:flex;flex-direction:column;gap:4px;flex-shrink:0}.meta span{color:#71717a;font-size:12px}
.pics{display:flex;gap:8px;flex-wrap:wrap}
.c{width:110px;height:110px;object-fit:contain;border:3px solid transparent;border-radius:6px;cursor:pointer;background:#fff}
.c.on{border-color:#16a34a}.row.blocked .c.on{border-color:#ccc}
button{cursor:pointer}
</style></head><body>
<header><b>${rows.length} ta kod</b>
<label><input type="checkbox" id="onlyAuto"> Faqat avto tanlanganlar</label>
<span id="count"></span>
<button id="save">mxik-image-overrides.json ni yuklab olish</button>
<span style="color:#71717a">Rasmni bosing — tanlanadi. «Bloklash» — bu kodga rasm yo'q.</span></header>
${rows.join('\n')}
<script>
const overrides = ${JSON.stringify(overrides)};
const initial = {};
document.querySelectorAll('.row').forEach(r => { const on = r.querySelector('.c.on'); initial[r.dataset.mxik] = on ? on.dataset.name : null; });
const count = () => document.getElementById('count').textContent = Object.keys(overrides).length + ' ta o\\'zgartirish';
document.addEventListener('click', e => {
  const row = e.target.closest('.row'); if (!row) return;
  const mxik = row.dataset.mxik;
  if (e.target.classList.contains('c')) {
    row.querySelectorAll('.c').forEach(c => c.classList.toggle('on', c === e.target));
    row.classList.remove('blocked');
    if (e.target.dataset.name === initial[mxik] && overrides[mxik] !== null) delete overrides[mxik]; else overrides[mxik] = e.target.dataset.name;
  } else if (e.target.classList.contains('block')) {
    if (row.classList.toggle('blocked')) overrides[mxik] = null;
    else { const on = row.querySelector('.c.on'); if (on && on.dataset.name !== initial[mxik]) overrides[mxik] = on.dataset.name; else delete overrides[mxik]; }
  }
  count();
});
document.getElementById('onlyAuto').onchange = e => document.querySelectorAll('.row').forEach(r => r.hidden = e.target.checked && r.dataset.auto !== 'true');
document.getElementById('save').onclick = () => {
  const sorted = Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(sorted, null, 2) + '\\n'], { type: 'application/json' }));
  a.download = 'mxik-image-overrides.json'; a.click();
};
count();
</script></body></html>`;
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('usage: npx tsx scripts/fetch-mxik-images.ts <mxik.csv>');
    process.exit(1);
  }
  fs.mkdirSync(path.join(OUT_DIR, 'mxik'), { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  const previous = loadManifest();
  const codes = readCodes(csvPath);
  const overrides: Overrides = fs.existsSync(OVERRIDES)
    ? (JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) as Overrides)
    : {};

  const categories = await buildCategories();
  const failed = OFFLINE ? 0 : await fetchMissing([...codes.keys()], new Set(previous.mxikNone));

  const next: ImageSeedManifest = { generatedAt: previous.generatedAt, mxik: [], mxikNone: [], mxikBlocked: [], categories };
  const chosen = new Map<string, Candidate | null>();
  const keepFiles = new Set<string>();
  for (const mxik of codes.keys()) {
    const entry = readCache(mxik);
    if (!entry) {
      // Not fetched (a failure, or known-none from an earlier run) — carry over what was known.
      if (previous.mxikNone.includes(mxik)) next.mxikNone.push(mxik);
      continue;
    }
    if (!entry.candidates.length) {
      next.mxikNone.push(mxik);
      continue;
    }
    const pick = choose(mxik, entry, overrides);
    chosen.set(mxik, pick);
    if (!pick) {
      next.mxikBlocked!.push(mxik);
      continue;
    }
    const file = `mxik/${mxik}.webp`;
    fs.copyFileSync(path.join(CACHE, pick.file), path.join(OUT_DIR, file));
    keepFiles.add(`${mxik}.webp`);
    next.mxik!.push({ mxik, file, sourceName: pick.sourceName });
  }
  for (const f of fs.readdirSync(path.join(OUT_DIR, 'mxik'))) {
    if (!keepFiles.has(f)) fs.unlinkSync(path.join(OUT_DIR, 'mxik', f));
  }

  // A new generatedAt is what makes tills re-import — only when the content really changed.
  if (contentOf(next) !== contentOf(previous)) next.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(normalise(next), null, 2) + '\n');

  const reviewPath = path.join(CACHE, 'review.html');
  fs.writeFileSync(reviewPath, buildReview(codes, overrides, chosen));

  const bytes = [...keepFiles].reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, 'mxik', f)).size, 0);
  const auto = [...chosen].filter(([, c]) => c && !isNumberedPictureName(c.sourceName)).length;
  console.log(
    `done — seed: ${next.mxik.length} MXIK picture(s) (${auto} picked by the tallest rule), ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB; none ${next.mxikNone.length}; blocked ${next.mxikBlocked!.length}; ` +
      `${categories.length} category picture(s); fetch failures ${failed}.\nreview: ${reviewPath}`,
  );
  if (failed) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
