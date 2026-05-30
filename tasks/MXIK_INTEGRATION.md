# MXIK / IKPU Integration Guide
### Grocery POS — Electron + NestJS + Prisma

---

## What Is MXIK and Why Do You Need It

MXIK (МХИК) — also called IKPU — is Uzbekistan's national product classification code from `tasnif.soliq.uz`. Every product sold through a fiscal cash register must have one. Without it, OFD (fiscal data operator) receipts are invalid.

**No API key or government registration required** for `tasnif.soliq.uz`.

**Geo-restriction:** `tasnif.soliq.uz` is only reachable from Uzbekistan IP addresses.
- `mxik.searchByBarcode` → called from the **browser** (user is in UZ) ✅
- `mxik.lookupCode` → proxied through the **VPS server** ✅

---

## Architecture Overview

```
Web dashboard (browser in UZ)
└── mxik.searchByBarcode(barcode)
        └── GET tasnif.soliq.uz/api/cls-api/elasticsearch/search  ← browser, direct
        └── GET tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/:mxikCode

└── mxik.lookupCode(mxikCode)
        └── GET /api/mxik/code/:code  ← axiosInstance → VPS server
                └── MxikController → MxikService
                        └── GET tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/:code
```

**There is no `mxik` npm package in use.** Both client and server call the `tasnif.soliq.uz` REST API directly via `fetch`.

---

## Server-Side Module

### MxikController
`src/server/modules/mxik/mxik.controller.ts`

```
GET /api/mxik/code/:code      → look up by 17-digit MXIK code
GET /api/mxik/search/:barcode → find MXIK by product barcode (EAN-13)
```

Both endpoints require `JwtAuthGuard + RolesGuard`, roles: `ADMIN` or `SUPER_ADMIN`.

**Note:** The controller route for barcode search is `GET /mxik/search/:barcode` (path param), **not** `GET /mxik/search?q=` (query param). The web app does not call this server endpoint — it calls tasnif directly from the browser.

### MxikService
`src/server/modules/mxik/mxik.service.ts`

Uses `fetch` against `https://tasnif.soliq.uz/api/cls-api`:

**`getByCode(code)`**
- Validates 17-digit format
- `GET /integration-mxik/get/history/:code`
- Returns `{ code, name (UZ), nameRu, packageCode }`
- `packageCode` defaults to `'796'` (piece) if none returned

**`searchByBarcode(barcode)`**
- `GET /elasticsearch/search?lang=uz_cyrl&search=:barcode&size=5&page=0`
- Prefers exact `internationalCode` match, falls back to first result
- Calls `getByCode` on the matched MXIK code
- Returns same shape as `getByCode`

---

## Client-Side Functions (src/web/src/api/client.ts)

### `mxik.lookupCode(code)`
- `GET /api/mxik/code/:code` via `axiosInstance` (JWT included)
- Used when a 17-digit MXIK QR is scanned (routes through VPS)
- Returns `{ code, name, nameRu, packageCode }`

### `mxik.searchByBarcode(barcode)`
- **Calls `tasnif.soliq.uz` directly from the browser** (geo-restriction: must run in UZ)
- Two-step: elasticsearch search → get/history detail
- Returns `{ code, name, nameRu, packageCode }`
- Throws on not-found (caller wraps in try/catch)

### `mxik.lookupBatch(codes[])`
- Browser-direct to tasnif, uses `by-params` endpoint
- Returns `Record<string, MxikScanInfo>` — a map of code → info
- Used for bulk auto-fill on the product list
- Each call has a 6-second `AbortSignal` timeout

---

## Where MXIK Is Used in the Scan Flow

### handleFabScan (ProductList.tsx)

| QR Type | MXIK action |
|---------|-------------|
| `datamatrix` | `mxik.searchByBarcode(gtin)` — browser direct to tasnif |
| `mxik` (17-digit) | Sets `initial.mxik = qrData` only — no tasnif call |
| `barcode` | `mxik.searchByBarcode(barcode)` — browser direct to tasnif |
| `fiscal` | No MXIK lookup |

For `datamatrix` and `barcode` types, the lookup populates:
- `initial.mxik` ← `result.code`
- `initial.nameRu` ← `result.nameRu`
- `initial.nameUz` ← `result.name`
- `initial.packageCode` ← `result.packageCode`

Failures are silently caught — form opens with whatever data was found.

### handleAutoFillMxik (ProductList.tsx)

Bulk-assigns MXIK to all products that don't have one:
- Iterates products without `mxik`
- Calls `mxikApi.searchByBarcode(product.barcode)` for each
- Calls `productsApi.update(id, { mxik: result.code })` on success
- 300ms delay between requests to avoid rate-limiting tasnif

---

## Prisma Schema Fields

The `Product` model uses a single `mxik` field (not `mxikCode`/`mxikName`/`packageCode` as in older docs):

```prisma
model Product {
  mxik        String?   // 17-digit MXIK/IKPU code, e.g. "06111001018000000"
  packageCode String?   // OFD package code, e.g. "796" (piece), "166" (kg)
  // nameRu, nameUz store the product names (not a separate mxikName field)
}
```

There is **no `mxikName` field** in the current schema — product names are stored in `nameRu`/`nameUz` directly.

---

## OFD Sale Payload

Each sale item sent to the fiscal operator includes:

```typescript
interface OfdSaleItem {
  productName:     string   // nameRu or nameUz
  productCode:     string   // mxik — e.g. "06111001018000000"
  packageCode:     string   // e.g. "796" (piece), "166" (kg)
  productBarCode:  string
  productQuantity: number
  price:           number   // in UZS
  sumPrice:        number
  vat:             number
  vatPercent:      number   // 0 or 12
}
```

---

## Quick Reference

| Thing | Value |
|-------|-------|
| tasnif base URL | `https://tasnif.soliq.uz/api/cls-api` |
| API key needed? | No |
| npm package? | No — uses `fetch` directly |
| MXIK code format | 17-digit string, e.g. `06111001018000000` |
| Geo-blocked? | Yes — browser calls work (user in UZ); server calls may fail |
| `searchByBarcode` called from | Browser (web dashboard) |
| `lookupCode` called from | Server (via `/api/mxik/code/:code`) |
| DB field name | `mxik` (not `mxikCode`) |
| Package code "796" | Piece (шт) |
| Package code "166" | Kilogram (кг) |
| Package code "111" | Litre (л) |

---

## Troubleshooting

**`tasnif.soliq.uz` returns empty results**
→ Product not in MXIK registry, or site has downtime. Scan flow silently continues with whatever data was found. User can enter MXIK manually.

**Server-side `searchByBarcode` fails (VPS geo-blocked)**
→ The server endpoint `/api/mxik/search/:barcode` exists but may fail from the VPS. The web app deliberately uses browser-direct calls (`mxik.searchByBarcode`) to avoid this.

**Auto-fill stops mid-way**
→ User may have clicked Stop, or tasnif had a timeout. Progress state shows `running: false` when done or aborted.

**OFD rejects the receipt**
→ Verify `packageCode` matches unit type: piece=`796`, kg=`166`, litre=`111`.

**MXIK not syncing to SQLite terminals**
→ Check that `products-sync.ts` includes `mxik` and `packageCode` in the upsert fields.

---

*Last Updated: 2026-05-12 — reflects current production code*
