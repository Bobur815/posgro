---
name: regos-vcr
description: Uzbekistan fiscal compliance for posgro - REGOS VCR JSON-RPC, MXIK/IKPU codes, VAT (vat_value), tiyin and quantity units, asl-belgisi marking codes, OFD/soliq.uz receipts, ZReport, refunds, tasnif.soliq.uz. Use whenever the task mentions fiscal, REGOS, VCR, receipt fiscalization, MXIK, IKPU, package_code, marking codes, DataMatrix, OFD, VAT/QQS.
---

# Fiscal compliance (verified project facts)

## REGOS VCR
- HTTP JSON-RPC to a **locally installed VCR** on the store PC, so the call belongs in the Electron **main process** (find the existing integration with `grep -ri regos src/main` before writing anything). The renderer reaches it only through IPC.
- Confirmed on the REGOS test stand: `Receipt.Sale`, `Receipt.Refund`, `ZReport`. Try them with `npm run test:regos-vcr` (`scripts/regos-vcr-test.ts`, asks for permission).
- Units: money in **tiyin** (UZS × 100), quantities **× 1000**. Integers only.
- Every item carries **MXIK/icps**. `vat_value = -1` for non-VAT payers.
- Product fields feeding fiscalization: `mxik`, `package_code`, `product_type`, `unit`, `vat_value`.
- Never guess REGOS method names or parameters: read `scripts/regos-vcr-test.ts` and the REGOS docs, or ask.

## Conversion helpers (shared code; a change in `src/shared` needs a version bump)

```ts
export const toTiyin = (uzs: number): number => Math.round((uzs + Number.EPSILON) * 100);
export const toQty1000 = (qty: number): number => Math.round((qty + Number.EPSILON) * 1000);
```

Convert at the boundary only. Assert that the sum of item tiyin equals the receipt total before sending.

## Scanning and marking codes
- Two QR kinds: fiscal receipt QR (an `ofd.soliq.uz` URL) vs product MXIK QR (raw 17 digits). Distinguish with `/^\d{17}$/`.
- Asl-belgisi hybrid: the product registry endpoint needs Business User auth (don't rely on it). The **public MC verification endpoint needs no auth**: use it for marking-code status. Use **tasnif.soliq.uz** (npm `mxik`) for MXIK codes and names. Test with `npm run test:aslbelgisi`; audit codes with `npm run check:mxik`.
- Bulk tools that write to the DB (`import:mxik-catalog`, `backfill:package-code`, `seed:mxik-categories`) ask for permission: confirm `DATABASE_URL` is local or staging first.
- DataMatrix verification and withdrawal go through the xtrace API; keep behind a feature flag.

## Rules
- Fiscal records are append-only: never edit or delete a fiscalized sale. A refund is a new record referencing the original.
- Log request/response ids for each fiscal call; never log secrets or customer PII.
- Fiscalization failures must never lose the sale: queue and retry, and surface the state to the cashier.
