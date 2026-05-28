# ASL-BELGISI Integration Guide
Grocery POS — Product Marking Code Verification

---

## What Is asl-belgisi and Why Do You Need It

asl-belgisi (National Information System for Monitoring Marking and Tracking of Products) — Uzbekistan's mandatory product tracking system. Every marked product has a unique DataMatrix code that must be verified before sale.

Why integrate:

- Verify product authenticity (prevent counterfeit goods)
- Auto-populate product data from government registry
- Check marking code status (ensure not withdrawn/recalled)
- Get production/expiry dates from marking code
- Comply with government tracking requirements

**Auth required:** Yes — the `/public/api/cod/public/codes` endpoint requires a Bearer token (`ASLBELGISI_API_KEY`). Calls are proxied through the VPS server so the key is never exposed to the browser.

---

## Architecture Overview

```
ProductList / ProductForm (browser)
└── aslBelgisi.verifyMarkingCode(rawQr)
        └── normalizeDataMatrix(rawQr)            ← strips ZXing prefix + leading FNC1
        └── POST /api/aslbelgisi/verify { code }  ← axiosInstance (JWT required)
                └── AslBelgisiController (VPS)
                        └── AslBelgisiService
                                └── POST https://xtrace.aslbelgisi.uz/public/api/cod/public/codes
                                    Authorization: Bearer ASLBELGISI_API_KEY
                                    Returns: MC status, dates, issuer info

Browser also calls tasnif.soliq.uz directly (for MXIK/names — geo-restricted, must run in UZ):
└── mxik.searchByBarcode(gtin)
        └── GET tasnif.soliq.uz/api/cls-api/elasticsearch/search?...
        └── GET tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/:mxikCode
```

**Key distinction:**
| Data | Source | Called from | Auth |
|------|--------|-------------|------|
| MC verification, status, dates | xtrace.aslbelgisi.uz | VPS server (proxy) | Bearer API key |
| Product names (RU/UZ), MXIK code, package code | tasnif.soliq.uz | Browser (in UZ) | None |

---

## handleFabScan Flow (ProductList.tsx)

This is the main entry point when a barcode/QR is scanned from the FAB scanner button.

```
handleFabScan(rawQrData)
│
├── aslBelgisi.detectQrType(rawQrData)
│   ├── normalizeDataMatrix(raw) → strip ]d2/]C1/]e0 prefix + leading \x1d
│   ├── fiscal   (contains http:// or https://) → toast error, open blank form
│   ├── datamatrix (starts with "01" + 14 digits after normalize)
│   ├── mxik    (exactly 17 digits)
│   └── barcode (everything else)
│
├── [datamatrix] aslBelgisi.extractGtinFromDataMatrix(raw)
│   └── normalize → match /^01(\d{14})/ → strip leading 0 → EAN-13
│
├── searchByBarcode(barcode) — local DB check FIRST
│   └── if found → setFabArrivalProductId, return (show arrival dialog)
│
├── [datamatrix] aslBelgisi.verifyMarkingCode(rawQrData)
│   └── POST /api/aslbelgisi/verify   ← goes through VPS
│   └── On success: populate productionDate, expiryDate
│   └── On failure: partial data, continue (non-blocking)
│   └── Multi-pack types (GROUP, BOX_LV_1, BOX_LV_2) → warning toast, don't block
│
├── [datamatrix|barcode] mxik.searchByBarcode(barcode)
│   └── Browser → tasnif.soliq.uz directly
│   └── Populates: mxik, nameRu, nameUz, packageCode
│
├── [mxik] → sets initial.mxik = qrData (no API call, no barcode)
│
└── setFabInitialData(initial) → setShowProductForm(true)
```

**Important difference from `handleQrScan` in ProductForm:** `handleFabScan` does NOT block on invalid MC status — it collects whatever data is available and opens the form. `handleQrScan` is stricter and validates `VALID_MC_STATUSES`.

---

## Server-Side Implementation

### AslBelgisiController
`src/server/modules/aslbelgisi/aslbelgisi.controller.ts`

```
POST /api/aslbelgisi/verify
Body: { code: string }   ← normalized DataMatrix string
Auth: JwtAuthGuard (any logged-in user)
```

### AslBelgisiService
`src/server/modules/aslbelgisi/aslbelgisi.service.ts`

- Reads `ASLBELGISI_API_KEY` from env (`ConfigService`)
- Calls `POST https://xtrace.aslbelgisi.uz/public/api/cod/public/codes`
- Header: `Authorization: Bearer <ASLBELGISI_API_KEY>`
- Returns `McPublicInfo` shape

### Environment Variable
```
ASLBELGISI_API_KEY=<your key>   # required in .env / .env.server
```
Service will throw `503 SERVICE_UNAVAILABLE` if key is not set.

---

## Client-Side Functions (src/web/src/api/client.ts)

### `normalizeDataMatrix(raw)` (private helper)
Strips ZXing symbology prefixes (`]d2`, `]C1`, `]e0`) and a leading FNC1 byte (`\x1d`).
Internal `\x1d` separators are preserved — they are required by the aslbelgisi API.

### `aslBelgisi.verifyMarkingCode(markingCode)`
- Normalizes the raw QR string
- `POST /api/aslbelgisi/verify` via `axiosInstance` (includes JWT)
- Returns `McPublicInfo` on success or `{ isValid: false, _error }` on any error

### `aslBelgisi.extractGtinFromDataMatrix(dataMatrix)`
- Normalizes the raw string
- Matches `/^01(\d{14})/`
- Strips leading `0` from GTIN-14 to produce EAN-13
- Returns `string | null`

### `aslBelgisi.detectQrType(qrData)`
Normalizes first, then:
| Input | Result |
|-------|--------|
| Contains `http://` or `https://` | `'fiscal'` |
| Starts with `01` + 14 digits (after normalize) | `'datamatrix'` |
| Exactly 17 digits | `'mxik'` |
| Anything else | `'barcode'` |

---

## QR Code Types Reference

| Type | Format | Detection | Action |
|------|--------|-----------|--------|
| Fiscal Receipt | URL | Contains `http://` | Show error, open blank form |
| GS1 DataMatrix | `01{GTIN-14}21{serial}...` | Starts with `01` + 14 digits | Extract GTIN → verify MC → lookup tasnif |
| MXIK Code | 17-digit number | `/^\d{17}$/` | Populate mxik field only, open form |
| Regular Barcode | EAN-13, EAN-8, etc. | Anything else | DB search → tasnif lookup |

### DataMatrix Structure
```
01 04870123456789 21 ABC123 \x1d 93 XYZ
│  └─ GTIN-14    │  └─ Serial │  └─ Verification
└─ AI=GTIN       └─ AI=Serial └─ AI separator (kept for aslbelgisi)
```

---

## MC Status Reference

| Status | Description | handleFabScan | handleQrScan |
|--------|-------------|---------------|--------------|
| EMITTED | Code issued, not yet applied | warns, continues | blocks |
| APPLIED | Code applied to product | continues | continues |
| INTRODUCED | Introduced to circulation | continues | continues |
| IN_CIRCULATION | Being sold/moved | continues | continues |
| WITHDRAWN | Recalled | warns, continues | blocks |
| RETIRED | Retired from system | warns, continues | blocks |

Valid statuses for `handleQrScan` strict check: `INTRODUCED`, `APPLIED`, `IN_CIRCULATION`

---

## Multi-Pack Handling

Types `GROUP`, `BOX_LV_1`, `BOX_LV_2` trigger a warning toast:
> "Multi-pack: {packageType}. Check quantity before saving."

The form is still opened — the user must manually verify quantity.

---

## Troubleshooting

**`ASL BELGISI API key not configured`**
→ Set `ASLBELGISI_API_KEY` in `.env` / `.env.server` and restart the server.

**`ASL BELGISI returned 401`**
→ API key expired or invalid. Generate a new one in your aslbelgisi business account.

**`isValid: false` with no error**
→ Marking code not found in system. Usually means the product predates the tracking system or the DataMatrix is damaged.

**ZXing / scanner sends garbled prefix**
→ `normalizeDataMatrix()` handles `]d2`, `]C1`, `]e0`, and leading `\x1d` automatically.

**Verification works but tasnif lookup fails**
→ Two separate systems. A product can have a valid MC but no entry in the MXIK classifier. Fall back to manual entry.

---

## Testing Checklist

- Scan fiscal receipt QR → error toast, blank form opens
- Scan DataMatrix (valid status) → dates auto-populated, tasnif name loaded
- Scan DataMatrix (product already in DB) → arrival dialog shown, no form
- Scan DataMatrix (multi-pack) → warning toast, form opens
- Scan 17-digit MXIK code → mxik field set, form opens
- Scan EAN-13 barcode → tasnif lookup for name/mxik, form opens
- Scan barcode already in DB → arrival dialog shown
- No `ASLBELGISI_API_KEY` → 503 error logged, partial data continues

---

*Last Updated: 2026-05-12 — reflects current production code*
