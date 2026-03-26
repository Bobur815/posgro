# Scale Integration — What To Change Later

## 1. TCP Port

**When:** After Wireshark capture or RLS1000 software docs
**Files:**

`src/main/scale/scale-sync.service.ts` ~line 15:

```ts
port: 8080,  // ← replace with real port
```

`src/main/ipc/scale-handlers.ts` ~line 58:

```ts
create: { key: "scale_port", value: "8080" },  // ← same value
```

---

## 2. TCP Protocol / Packet Format

**When:** After Wireshark capture (filter: `ip.addr == 192.168.1.20` while pushing one PLU via RLS1000 software)
**File:** `src/main/scale/scale-sync.service.ts`, function `buildPluPacket()` ~line 60

This is the **only function** that needs replacing. Everything else (connection, retry, bulk sync) stays identical.

How to capture:

1. Install RLS1000 software from rongtatech.com
2. Connect PC and scale to same 192.168.1.x subnet
3. Run Wireshark on the PC — filter: `ip.addr == 192.168.1.20`
4. Push one PLU via RLS1000 UI
5. Inspect the TCP payload bytes — that is the protocol

---

## 3. Barcode Byte Positions ✅ RESOLVED

**Confirmed** from real label: barcode `2500008522583` (goods code 85, section 5, 2.258 kg)

```
D0='2'  D1='5'  D2–D7='000085'  D8–D11='2258'  D12='3'
flag    section  goods code       weight(kg)      check
```

Constants in `src/shared/utils/weightBarcode.ts`:
```ts
const PLU_START = 2;    // skip flag + section
const PLU_END = 8;      // 6-digit goods code at D2–D7
const WEIGHT_START = 8; // 4-digit weight at D8–D11
const WEIGHT_END = 12;
```

Rule: Fresh Code in RLS1000 = SQLite product ID (e.g. product ID 89 → Fresh Code 89).
Barcode encodes the product ID, NOT internalCode or PLU hotkey number.
Lookup: `products.getById(productIdNum)`

Confirmed barcodes:
  "2500008903160" → product ID 89 (Banan), weight 0.316 kg
  "2500008522583" → product ID 85, weight 2.258 kg

---

## 4. Recreate Unit Tests

**When:** Same time as #3
**File:** recreate `src/shared/utils/weightBarcode.test.ts` (was deleted to fix CI)

Write tests using real barcode numbers scanned from actual printed labels to guarantee the parser matches what the scale actually produces.

---

## 5. Network Prerequisites

Before any of the above is testable:

- Router: 192.168.1.x subnet, WPA2-PSK/AES, SSID ≤ 15 chars, password ≤ 15 chars
- Scale static IP: `192.168.1.20` (already configured)
- Verify: `ping 192.168.1.20` replies from the POS PC
