# REGOS:VCR Integration Guide for posgro

## Architecture Overview

```
posgro Electron App (Renderer/Main Process)
    ↓ HTTP POST JSON-RPC 2.0
REGOS:VCR (installed locally on customer's PC)
    ↓ USB/Serial
Fiscal Module (hardware)
    ↓ HTTPS
"Yangi Texnologiyalar" OFD → Soliq Qo'mitasi
```

**Key point**: REGOS:VCR is a local app on the customer's machine. posgro sends HTTP requests to `localhost:{port}` (default: `http://localhost:8080`). No cloud, no tokens, no integration catalog.

**Test environment**: `http://vcr-test.regos.uz` (credentials requested from REGOS support)
**Live camera for test prints**: `https://vcr-camera.regos.uz/`

---

## Request Format

All requests: `POST` to VCR base URL. Every method uses JSON-RPC 2.0.

```typescript
// Auth: Base64(login:password) — only "cassir" user has API access
const auth = Buffer.from('cassir:password123').toString('base64');

// Request structure
{
  "id": 1,                          // Increment per request
  "jsonrpc": "2.0",
  "method": "Receipt.Sale",         // Method name
  "params": { ... },                // Method params (or null)
  "auth": "Y2Fzc2lyOjEyMzQ1"       // Base64(login:password)
}

// Success response
{ "id": 1, "ok": true, "result": { ... }, "jsonrpc": "2.0" }

// Error response
{ "id": 1, "ok": false, "result": { "error": 701003, "description": "..." }, "jsonrpc": "2.0" }
```

**Critical**: Send next request only after receiving response from previous one. VCR is single-threaded.

---

## TypeScript Client

```typescript
// src/regos-vcr/regos-vcr.client.ts
import axios, { AxiosInstance } from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VcrPosition {
  name: string;               // Product name (required)
  barcode: string;            // Barcode (required)
  icps: string;               // MXIK code (required — e.g. "02202002001010036")
  package_code: string;       // Unit code from MXIK (required — e.g. "1218868")
  amount: number;             // Total price in tiyin: sum × 100 (required)
  quantity: number;           // Quantity × 1000: 1pc=1000, 0.5kg=500 (required)
  vat_value: number;          // VAT in tiyin: vat_sum × 100 (required)
  discount: number;           // Discount in tiyin (0 if none, required)
  code?: string;              // Internal product code
  articul?: string;           // Article number
  label?: string;             // Mandatory marking code (unique per request)
  group_name?: string;        // Category name
  unit_name?: string;         // Unit name (e.g. "шт", "кг")
  type_name?: string;         // Type (e.g. "Товар")
  brand_name?: string;        // Brand
  producer_name?: string;     // Manufacturer
  country_name?: string;      // Country of origin
  color_name?: string;        // Color
  size_name?: string;         // Size
  department_name?: string;   // Department
  commission_inn?: string;    // Commission seller INN (for commission sales)
  owner_type?: 'BuyingAndSelling' | 'Commission'; // Default: BuyingAndSelling
}

export interface VcrPayment {
  type: 1 | 2;               // 1=cash, 2=card/terminal
  value: number;              // Amount in tiyin: sum × 100
  payment_id?: string;        // Payment system transaction ID (for type=2)
  card_type?: 1 | 2 | 3;    // 1=corporate, 2=personal, 3=social (for type=2)
  rrn?: string;               // Terminal RRN (for type=2)
}
```

> ### ⚠️ Decision: integrated acquiring is OPTIONAL — we use plain bank terminals
>
> Confirmed by REGOS support (2026-06-04):
> - **"Да, можете работать с обычными терминалами."** — you may record card payments as
>   `type=2` **without `payment_id`**. The card transaction happens out-of-band on a
>   regular bank terminal; the fiscal receipt just records that a card payment occurred.
> - `Payment.Create/Get/Cancel` and `Acquiring.Balance/Totals` **require a physically
>   connected, integrated terminal** — they cannot be tested on `vcr-test.regos.uz`.
> - There are **no test keys / `payment_system_id`** for ЭПС (Click, Payme, Uzum).
>
> **What this means for posgro:**
> - Our current `buildPayments()` (`src/main/fiscal/regos-vcr-service.ts`) is correct as-is:
>   `CASH → {type:1}`, otherwise `{type:2, card_type:2}` with **no `payment_id`**.
>   `card_type` is required for terminal payments; `2` (personal) is the right retail default.
>   (Corporate buyers would need `card_type:1` — future toggle, not needed now.)
> - Refunds are consistent: `refundSale()` → `fullRefund(QRCodeURL)` reuses the original
>   receipt, whose `type=2`/no-`payment_id` payments are treated as terminal payments on refund.
> - **Do NOT build** the `Payment.*` / `Acquiring.*` integrated-acquiring methods sketched
>   below — they are out of scope unless we later adopt integrated terminals.

```typescript

export interface VcrRefundInfo {
  QRCodeURL?: string;         // If provided, other fields ignored
  TerminalID?: string;
  ReceiptNo?: string;
  DateTime?: string;          // "YYYY-MM-DD HH:MM:SS"
  FiscalSign?: string;
}

export interface VcrReceiptResult {
  Id: string;                 // VCR internal receipt UUID
  Amount: number;             // Total amount in tiyin
  QRCodeURL: string;          // Fiscal QR code URL for printing
  TerminalID: string;         // Fiscal module ID
  ReceiptNo: string;          // Fiscal receipt number
  DateTime: string;           // Receipt datetime
  FiscalSign: string;         // Fiscal signature
}

export interface VcrSysInfo {
  TerminalID: string;
  CurrentReceiptSeq: string;
  CurrentTime: string;
  ReceiptCount: number;
  ReceiptMaxCount: number;
  ZReportCount: number;
  ZReportMaxCount: number;
  AvailablePersistentMemory: number;
  AvailableResetMemory: number;
  AvailableDeselectMemory: number;
  AppletVersion: string;
}

export interface VcrZReportInfo {
  TerminalID: string;
  Number: number;
  Count: number;
  OpenTime: string;
  CloseTime: string;
  FirstReceiptSeq: number;
  LastReceiptSeq: number;
  TotalSaleCount: number;
  TotalSaleCash: number;      // ×100
  TotalSaleCard: number;      // ×100
  TotalSaleVat: number;       // ×100
  TotalRefundCount: number;
  TotalRefundCash: number;    // ×100
  TotalRefundCard: number;    // ×100
  TotalRefundVat: number;     // ×100
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class RegosVcrClient {
  private http: AxiosInstance;
  private requestId = 1;
  private authToken: string;

  constructor(
    baseUrl: string,    // e.g. 'http://localhost:8080'
    login: string,      // 'cassir'
    password: string,
  ) {
    this.authToken = Buffer.from(`${login}:${password}`).toString('base64');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    });
  }

  private async call<T>(method: string, params: unknown = null): Promise<T> {
    const id = this.requestId++;
    const { data } = await this.http.post('', {
      id,
      jsonrpc: '2.0',
      method,
      params,
      auth: this.authToken,
    });

    if (!data.ok) {
      const err = data.result;
      throw new VcrError(err?.error ?? 0, err?.description ?? 'Unknown VCR error', method);
    }

    return data.result as T;
  }

  // ── System ────────────────────────────────────────────────────────────────

  /** Check VCR availability and get fiscal module info */
  async initialize(): Promise<VcrSysInfo> {
    return this.call('Sys.Initialize');
  }

  /** Get fiscal module details */
  async getInfo(): Promise<VcrSysInfo> {
    return this.call('Sys.GetInfo');
  }

  /** Get memory overflow info */
  async getOverflowInfo() {
    return this.call<{ AvaialableZReportCount: number; AvaialableUnsendReceiptCount: number }>(
      'Sys.GetOverflowInfo'
    );
  }

  // ── Z-Report (Smena) ──────────────────────────────────────────────────────

  /** Open Z-report (start of workday/shift) */
  async openZReport() {
    return this.call<{ id: number; open_time: string; close_time: null }>('ZReport.Open');
  }

  /** Get current Z-report info without printing */
  async getZReportInfo(print = false): Promise<VcrZReportInfo> {
    return this.call('ZReport.GetInfo', { PrintReceipt: print });
  }

  /** Close Z-report (end of workday/shift) */
  async closeZReport() {
    return this.call<{ id: number; open_time: string; close_time: string }>('ZReport.Close');
  }

  // ── Receipts ──────────────────────────────────────────────────────────────

  /** Validate sale receipt before submitting (recommended) */
  async validateSale(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    code?: string;
  }, ignorePayments = false) {
    return this.call<{ validate: boolean } | null>('Receipt.ValidateSale', {
      receipt: params,
      ignore_payments: ignorePayments,
    });
  }

  /** Validate a single position (useful for marked goods) */
  async validatePosition(params: {
    icps: string;
    barcode: string;
    package_code?: string;
    label?: string;
  }) {
    return this.call<null>('Receipt.ValidatePosition', params);
  }

  /** Create sale receipt — the main fiscal operation */
  async sale(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    code?: string;             // Your internal receipt ID (for idempotency)
    cashier_name?: string;
    seller_name?: string;
    session_code?: string;     // Your shift ID
    pos_id?: string;           // Your POS terminal ID
    phone?: string;            // Customer phone
    custom_variables?: Array<{ name: string; value: string }>;
  }): Promise<VcrReceiptResult> {
    return this.call('Receipt.Sale', params);
  }

  /** Validate refund before submitting */
  async validateRefund(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    refund_info: VcrRefundInfo;
    code?: string;
  }, ignorePayments = false) {
    return this.call<null>('Receipt.ValidateRefund', {
      receipt: params,
      ignore_payments: ignorePayments,
    });
  }

  /** Create refund receipt (requires original receipt fiscal data) */
  async refund(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    refund_info: VcrRefundInfo;  // From original receipt
    code?: string;
    cashier_name?: string;
    seller_name?: string;
    session_code?: string;
    pos_id?: string;
    phone?: string;
    custom_variables?: Array<{ name: string; value: string }>;
  }): Promise<VcrReceiptResult> {
    return this.call('Receipt.Refund', params);
  }

  /** Full refund by QR code URL only — easiest refund method */
  async fullRefund(qrCodeUrl: string): Promise<VcrReceiptResult> {
    return this.call('Receipt.FullRefund', { QRCodeURL: qrCodeUrl });
  }

  /** Advance/prepayment receipt (NOT fiscalized — no FiscalSign returned) */
  async advance(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    code?: string;
    cashier_name?: string;
    session_code?: string;
    pos_id?: string;
    phone?: string;
  }): Promise<{ id: string }> {
    return this.call('Receipt.Advance', params);
  }

  /** Credit/installment receipt (NOT fiscalized — no FiscalSign returned) */
  async credit(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    code?: string;
    cashier_name?: string;
    session_code?: string;
    pos_id?: string;
    phone?: string;
  }): Promise<{ id: string }> {
    return this.call('Receipt.Credit', params);
  }

  /** Get receipt info by ID, QRCodeURL, ReceiptNo, or Code */
  async getReceiptInfo(params: {
    Id?: string;
    QRCodeURL?: string;
    ReceiptNo?: string;
    Code?: string;
  }) {
    return this.call<VcrReceiptResult & { Code: string } | null>('Receipt.GetInfo', params);
  }

  /** Print duplicate of a receipt */
  async printDuplicate(id: string): Promise<null> {
    return this.call('Receipt.Duplicate', { id });
  }

  /** Validate QR code URL format */
  async checkQRCodeUrl(qrCodeUrl: string): Promise<boolean> {
    return this.call('Receipt.CheckQRcodeUrl', { QRCodeURL: qrCodeUrl });
  }

  // ── Payments (for EPS integration) ────────────────────────────────────────

  /** Create payment through EPS (Click, Payme, Uzum, terminal) */
  async createPayment(params: {
    payment_system_id: number; // -1=Ingenico, -2=PAX, >0=EPS ID
    amount: number;            // In tiyin
    card_type?: 1 | 2;        // Required for terminal
    token?: string;            // Required for EPS
    description?: string;
  }) {
    return this.call('Payment.Create', params);
  }

  /** Get payment status */
  async getPayment(paymentId: string) {
    return this.call('Payment.Get', { payment_id: paymentId });
  }

  /** Cancel payment (cannot cancel if already linked to a receipt) */
  async cancelPayment(paymentId: string): Promise<null> {
    return this.call('Payment.Cancel', { payment_id: paymentId });
  }
}

// ─── Error Class ─────────────────────────────────────────────────────────────

export class VcrError extends Error {
  constructor(
    public readonly code: number,
    public readonly description: string,
    public readonly method: string,
  ) {
    super(`VCR [${code}] ${method}: ${description}`);
    this.name = 'VcrError';
  }
}
```

---

## Critical Data Rules

### Money — always in tiyin (sum × 100)
```typescript
// 25,000 sum = 2,500,000 tiyin
const price = 25_000 * 100; // = 2_500_000

// VAT calculation (12% rate)
// vat_value is the actual VAT amount, NOT the rate
// If price is 25,000 sum and VAT is 12%:
// vat_value = Math.round(price * 12 / 112) * 100
const vatValue = Math.round(25_000 * 12 / 112) * 100; // = 267857 tiyin
```

### Quantity — always × 1000
```typescript
1 piece  → quantity: 1000
2 pieces → quantity: 2000
0.5 kg   → quantity: 500
1.5 kg   → quantity: 1500
250 g    → quantity: 250
1 bottle → quantity: 1000
```

### Amount vs Quantity
```typescript
// amount = total position price (price × qty) in tiyin
// If 2 pcs of Coca-Cola at 12,000 sum each:
const quantity = 2 * 1000; // = 2000
const amount = 2 * 12_000 * 100; // = 2_400_000

// VCR validates: sum(positions.amount) ≈ sum(payments.value) (tolerance 50 sum = 5000 tiyin)
```

### Payments must sum to receipt total (within 50 sum)
```typescript
// Total: 50,000 sum = 5,000,000 tiyin
const payments: VcrPayment[] = [
  { type: 1, value: 3_000_000 },  // 30,000 sum cash
  { type: 2, value: 2_000_000, payment_id: 'xxx', card_type: 2 }, // 20,000 sum card
];
// 3_000_000 + 2_000_000 = 5_000_000 ✓
```

---

## Checkout Flow (posgro → VCR)

```
cashier starts shift
    ↓
ZReport.Open() ← if no open Z-report
    ↓
customer scans items
    ↓
[optional] Receipt.ValidateSale() ← catch errors before fiscal
    ↓
Receipt.Sale() ← fiscalize
    ↓
print QRCodeURL as QR code on thermal receipt
    ↓
save { Id, FiscalSign, QRCodeURL, TerminalID, ReceiptNo, DateTime } to DB
    ↓
end of shift: ZReport.Close()
```

### Startup check (on posgro launch)
```typescript
async function checkVcrOnStartup(vcr: RegosVcrClient) {
  const info = await vcr.initialize();

  // Warn if Z-report memory is getting low
  const overflow = await vcr.getOverflowInfo();
  if (overflow.AvaialableZReportCount < 10) {
    console.warn('ZReport memory low — contact service center (TXKM)');
  }
  if (overflow.AvaialableUnsendReceiptCount < 20) {
    console.warn('Unsent receipt buffer nearly full — check internet connection');
  }

  return info;
}
```

### Complete sale example
```typescript
async function processSale(
  vcr: RegosVcrClient,
  cartItems: Array<{
    name: string;
    barcode: string;
    mxikCode: string;      // icps
    packageCode: string;   // package_code
    unitName: string;
    price: number;         // in sum
    quantity: number;      // in normal units (1 = 1 piece, 0.5 = 500g)
    vatPercent: number;    // 0 or 12
    discount: number;      // in sum
  }>,
  cashAmount: number,      // in sum
  cardAmount: number,      // in sum
  sessionId: string,
  cashierId: string,
  internalReceiptCode: string, // your DB receipt ID — for idempotency
): Promise<VcrReceiptResult> {
  const positions: VcrPosition[] = cartItems.map(item => {
    const amountSum = item.price * item.quantity - item.discount;
    const vatValue = item.vatPercent > 0
      ? Math.round(amountSum * item.vatPercent / (100 + item.vatPercent))
      : 0;

    return {
      name: item.name,
      barcode: item.barcode,
      icps: item.mxikCode,
      package_code: item.packageCode,
      unit_name: item.unitName,
      amount: Math.round(amountSum * 100),
      quantity: Math.round(item.quantity * 1000),
      vat_value: Math.round(vatValue * 100),
      discount: Math.round(item.discount * 100),
      owner_type: 'BuyingAndSelling',
    };
  });

  const payments: VcrPayment[] = [];
  if (cashAmount > 0) {
    payments.push({ type: 1, value: Math.round(cashAmount * 100) });
  }
  if (cardAmount > 0) {
    payments.push({ type: 2, value: Math.round(cardAmount * 100), card_type: 2 });
  }

  // Validate first (catches MXIK errors before fiscal operation)
  await vcr.validateSale({ positions, payments }, false);

  // Fiscalize
  return vcr.sale({
    positions,
    payments,
    code: internalReceiptCode,  // idempotency key
    session_code: sessionId,
    cashier_name: cashierId,
    pos_id: 'posgro-001',
  });
}
```

### Refund flow
```typescript
// You need the original receipt's fiscal data stored in your DB
async function processRefund(
  vcr: RegosVcrClient,
  originalReceipt: { QRCodeURL: string; FiscalSign: string; TerminalID: string; ReceiptNo: string; DateTime: string },
  itemsToRefund: VcrPosition[],
  refundAmount: number,
): Promise<VcrReceiptResult> {
  // Easiest: full refund by QR code URL
  return vcr.fullRefund(originalReceipt.QRCodeURL);

  // OR partial refund:
  // await vcr.validateRefund({ positions: itemsToRefund, payments: [...], refund_info: originalReceipt });
  // return vcr.refund({ positions: itemsToRefund, payments: [{ type: 1, value: refundAmount * 100 }], refund_info: originalReceipt });
}
```

---

## EPS Payment Flow (Click, Payme, Uzum QR)

When customer pays via QR code app:

```typescript
async function processQrPayment(vcr: RegosVcrClient, token: string, amount: number) {
  // payment_system_id: get from REGOS settings (Click=1, Payme=2, Uzum=varies)
  const payment = await vcr.createPayment({
    payment_system_id: 2,   // Payme example
    amount: amount * 100,   // tiyin
    token,                  // QR token scanned from customer phone
  });

  // payment.id is used in Receipt.Sale payments array:
  return {
    type: 2 as const,
    value: amount * 100,
    payment_id: payment.id,
    card_type: 2,
  };
}
```

---

## NestJS Module Structure

```
src/
  regos-vcr/
    regos-vcr.module.ts
    regos-vcr.client.ts      ← the client above
    regos-vcr.service.ts     ← business logic (sale, refund, etc.)
    regos-vcr.errors.ts      ← VcrError class + error code map
    dto/
      sale-receipt.dto.ts
      refund-receipt.dto.ts
    interfaces/
      vcr-position.interface.ts
      vcr-payment.interface.ts
```

### Config (per customer)
```typescript
// Each customer has their own VCR installation
// Store in posgro DB (encrypted):
interface CustomerVcrConfig {
  customerId: string;
  vcrUrl: string;       // 'http://localhost:8080' (default)
  vcrLogin: string;     // always 'cassir'
  vcrPassword: string;  // customer sets in VCR settings
}
```

---

## Error Handling

```typescript
import { VcrError } from './regos-vcr.client';

async function handleVcrOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof VcrError) {
      switch (err.code) {
        // Blocking errors — require support center (TXKM)
        case 704006: throw new Error('Kassa bloklangan: fiskal modul bloklangan. TXKMga murojaat qiling');
        case 704017: throw new Error('Kassa bloklangan: fiskal modul topilmadi. USB ni tekshiring');
        case 704016: throw new Error('Kassa bloklangan: printer xatosi. Printer va qog\'ozni tekshiring');
        case 704019: throw new Error('Kassa bloklangan: 24 soat vaqt serveri bilan ulanmadi. Internetni tekshiring');
        case 704025: throw new Error('Kassa bloklangan: litsenziya server bilan ulanmadi. Internetni tekshiring');
        case 704029: throw new Error('Kassa bloklangan: qarzdorlik mavjud. TXKMga murojaat qiling');

        // Z-report errors
        case 704010: throw new Error('Z-hisobot ochilmagan. Smenani boshlang (ZReport.Open)');
        case 704011: throw new Error('Z-hisobot allaqachon ochilgan');
        case 704020: throw new Error('Z-hisobot bo\'sh — chek qo\'shmasdan yopa olmaysiz');
        case 704100: throw new Error('Smena allaqachon ochilgan');
        case 704101: throw new Error('Ochiq smena yo\'q');

        // Auth
        case 705000: throw new Error('VCR: noto\'g\'ri login yoki parol');
        case 705010: throw new Error(`VCR: login bloklandi. ${err.description}`);

        // Validation
        case 701003: throw new Error(`Ma\'lumot xatosi: ${err.description}`);
        case 705511: throw new Error(`MXIK kodi xatosi: ${err.description}`);

        // Printer
        case 705002: throw new Error('Printer sozlanmagan');
        case 705020: throw new Error('Printer ulang va qog\'oz soling');
        case 702100: throw new Error(`Chek chop etish xatosi: ${err.description}`);

        // Network / offline
        case 704001: throw new Error('Sinxronizatsiya limitiga yetildi. Internet ulang');
        case 704002: throw new Error('OFD bilan sinxronizatsiya kerak. Internet ulang');

        default:
          throw new Error(`VCR xatosi [${err.code}]: ${err.description}`);
      }
    }
    throw err; // network error, timeout, etc.
  }
}
```

---

## Common Error Codes Quick Reference

| Code | Cause | Action |
|------|-------|--------|
| 701003 | Invalid input data | Check field values (see description) |
| 704010 | Z-report not open | Call `ZReport.Open()` |
| 704017 | Fiscal module not found | Check USB connection |
| 704019 | 24h time sync failure | Check internet |
| 704025 | 24h license sync failure | Check internet |
| 705000 | Wrong login/password | Check VCR credentials |
| 705002 | Printer not configured | Configure printer in VCR settings |
| 705511 | MXIK (ICPS) invalid | Fix product MXIK code |
| 704029 | Debt exists | Customer must pay TXKM |
| 704006 | Fiscal module blocked | Contact service center |

---

## VCR Settings Customer Must Configure

Before posgro can connect, the customer configures REGOS:VCR:

1. **API endpoint**: Settings → Service → set address `127.0.0.1` and port `8080` (or custom)
2. **Printer**: Settings → Service → select their thermal printer
3. **Fiscal module**: Plug in USB FM, VCR detects automatically
4. **Company info**: Legal name, INN, address (shown on fiscal receipts)
5. **Coordinates**: Latitude/Longitude of the shop (required by law)
6. **Time servers**: Leave defaults (OFD servers)
7. **Cassir password**: Customer sets this — posgro needs it in settings

---

## posgro Settings Screen (required fields)

```typescript
// Store per-device (not per-account — each POS terminal has its own VCR)
interface PosgroPosSettings {
  vcrUrl: string;           // Default: 'http://localhost:8080'
  vcrPassword: string;      // Cassir password (encrypted in keychain/electron-store)
  posId: string;            // This terminal's ID (e.g. 'pos-001')
  printerName?: string;     // For non-VCR printing (label printer etc.)
}
```

**Security**: Store `vcrPassword` in Electron's keychain (`electron-store` with encryption or `keytar`). Never in plaintext localStorage.

---

## Receipt Printing — avoid double prints ⚠️

**The problem:** REGOS:VCR **requires** a configured printer and **prints its own fiscal receipt** (with the Soliq OFD QR) on every receipt method — `Receipt.Sale`, `Receipt.FullRefund`, etc. (Without a printer, those methods fail with `705002`.) Meanwhile, posgro **also** prints a customer receipt, and as of this integration that receipt **includes the same fiscal QR** (sourced from the sale's `regosQrCodeUrl`, with the 1% cashback prompt). If both the VCR and posgro are pointed at the **same** physical thermal printer, the customer gets **two receipts** per sale.

**How posgro prints the QR (implemented):**
- `printReceipt()` in `src/main/printer/thermal-printer.ts` renders the OFD QR from `sale.regosQrCodeUrl` (falling back to Paynet's `paynetOfdUrl`). The footer shows the QR, the fiscal mark (`s` param) and "Кешбэк 1% — отсканируйте QR" / "1% cashback — QR kodni skanerlang".
- `sales:create` **awaits** the immediate fiscalization before returning, so `regosQrCodeUrl` is persisted **before** the renderer triggers the print. Cost: ~1–2s added to checkout while the VCR responds.
- If fiscalization fails (product missing MXIK, VCR unreachable), the receipt prints **without** the QR and the sale stays in the retry queue (surfaced by the POS fiscal-status badge).

**Deployment — pick ONE printing owner per terminal:**

| Option | VCR printer setting | posgro receipt auto-print | Result |
|--------|---------------------|---------------------------|--------|
| **A — posgro prints (recommended for us)** | a **separate / virtual** printer (or a model the shop doesn't use for customer receipts) | **ON** | One receipt, from posgro, with the cashback QR. posgro controls layout/branding. |
| **B — VCR prints** | the shop's real thermal printer | **OFF** via the setting below | One receipt, from the VCR (standard REGOS fiscal layout). |

Do **not** leave both pointed at the same physical printer with posgro auto-print ON — that produces duplicate receipts.

**Toggle (built):** Settings → Фискализация → **"Чек печатает виртуальная касса (не печатать из POS)"** (`regos_vcr_prints_receipt`, exposed as `RegosVcrConfig.vcrPrintsReceipt`). When enabled (and fiscal is on):
- POS **quick-pay** (`POSScreen`) skips its receipt auto-print.
- The **Checkout** modal defaults its "print receipt" checkbox **off** (the cashier can still tick it for a one-off copy).

Leave it **off** (default) for Option A — posgro prints the single customer receipt with the cashback QR.

---

## What Customer Pays For (Commercial Model)

| Component | Who pays | Amount |
|-----------|----------|--------|
| REGOS:VCR software license | Customer → REGOS | ~60,000 sum/month per terminal |
| Fiscal module (hardware) | Customer → REGOS/TXKM | ~500,000-1,200,000 sum one-time |
| TXKM service contract | Customer → TXKM | Negotiated |
| posgro subscription | Customer → you | Your pricing |

posgro does not pay REGOS anything. You're just using their VCR as a fiscal layer on the customer's machine.

---

## Testing Checklist

Before going live with a customer:

- [x] `Sys.Initialize()` returns `ok: true` — verified 2026-06-02 (terminal `VG298430008256`)
- [~] Z-report opens with `ZReport.Open()` — `ZReport.GetInfo` verified; shift was already open, `Open`/`Close` not re-run (shared stand)
- [x] `Receipt.ValidateSale()` passes for test item
- [x] `Receipt.Sale()` returns `FiscalSign` and `QRCodeURL` — `ReceiptNo 3048`, FiscalSign `222851825814`
- [ ] QR code scans to `ofd.soliq.uz` and shows valid receipt — verify in a browser (UZ; soliq page is JS-rendered)
- [x] `Receipt.FullRefund(qrUrl)` works on the test receipt — refund `ReceiptNo 3049`, FiscalSign `825776010404`
- [ ] `ZReport.Close()` succeeds — not tested (would close the shared test shift)
- [~] Error codes 704010, 704011, 704019 handled gracefully in UI — mapped in harness; UI not built yet
- [ ] VCR password stored encrypted, not in plaintext — test creds in gitignored `.env`; real client TODO (keychain/electron-store)
- [x] `code` field (idempotency key) is always your internal receipt UUID — harness sends unique `code` per sale

### Verified test run — 2026-06-02/03 (`http://vcr-test.regos.uz`, login `kassa`, terminal `VG298430008256`)

Harness: `scripts/regos-vcr-test.ts` — `npm run test:regos-vcr -- <command>` (run `all` for the full suite + coverage summary).

**Full API coverage (22 documented methods):** 16 software-testable methods **PASS**, 6 require hardware/EPS or are destructive on the shared stand.

| Method | Result |
|--------|--------|
| Sys.Initialize / Sys.GetInfo / Sys.GetOverflowInfo | ✅ PASS |
| ZReport.GetInfo / ZReport.Open | ✅ PASS |
| Receipt.ValidatePosition / Receipt.ValidateSale / Receipt.ValidateRefund | ✅ PASS |
| Receipt.Sale / Receipt.GetInfo / Receipt.Duplicate / Receipt.CheckQRcodeUrl | ✅ PASS |
| Receipt.FullRefund / Receipt.Refund (partial) | ✅ PASS |
| Receipt.Advance / Receipt.Credit (non-fiscal) | ✅ PASS |
| ZReport.Close | ⏭ not auto-run (closes the shared test shift — `zclose` manually) |
| Payment.Create / Payment.Get / Payment.Cancel | ⏭ needs payment terminal (Ingenico/PAX) or EPS token |
| Acquiring.Balance / Acquiring.Totals | ⏭ needs Ingenico/PAX terminal |

**Gotchas learned (apply to the real client):**
- **VAT rate is resolved by `icps`** in the tax registry, NOT computed as a % of `amount`. A wrong/rounded VAT amount → `701003 "Ставка НДС не найдена"`. Send the product's registered VAT amount.
- **Marked goods** (e.g. beverages group 022 like the docs' Coca-Cola `icps 02202002001010036`, which is also 0% VAT) require a `label` (Asl-Belgisi DataMatrix) → else `701003 "Код обязательной маркировки не задан"`. Use `Receipt.ValidatePosition` for marked items.
- **Proven non-marked smoke-test item:** `icps 02004001004002007` ("Heinz Яблоко"), amount 9000 tiyin, vat_value 1200, no `package_code`/`label` needed.
- `package_code` is optional for non-marked goods (omit when empty).

---

## Test Environment

```bash
# Base URL for testing
BASE_URL=http://vcr-test.regos.uz

# Get test credentials from REGOS:
# Tel: +998 55 501 00 30
# Telegram: @regos_uzbot

# Watch test prints live:
# https://vcr-camera.regos.uz/

# Quick test with curl:
curl -X POST http://vcr-test.regos.uz \
  -H "Content-Type: application/json;charset=utf-8" \
  -d '{
    "id": 1,
    "jsonrpc": "2.0",
    "method": "Sys.Initialize",
    "params": null,
    "auth": "YOUR_BASE64_AUTH"
  }'
```

---

## Notes for Claude Code

- All money values in **tiyin** (sum × 100) — no exceptions
- All quantities × **1000** (1 pc = 1000, 0.5 kg = 500)
- `icps` (MXIK code) is **mandatory** on every position — VCR rejects without it
- `package_code` is **mandatory** — get from `tasnif.soliq.uz` API
- VCR is **sequential** — wait for response before next request
- `code` field = your internal receipt ID — enables idempotency (duplicate rejection)
- Save `{ FiscalSign, QRCodeURL, TerminalID, ReceiptNo, DateTime }` to DB for every sale — needed for refunds
- `ZReport.Open` at shift start, `ZReport.Close` at shift end
- `Receipt.ValidateSale` before every `Receipt.Sale` — catches MXIK and sum errors early
- Default VCR port: **8080** — configurable in VCR service settings
- Auth user is always **cassir** — only this role has API access
