# Scale Integration — What To Change Later

> **Rongta support, 2026-09-08.** They did not answer any of the seven questions — not the port,
> not the protocol, not the RS-232 pinout, not the service menu. Their whole reply was: *"For the
> machine in September 2025, please use the new version of the upper computer"*, with
> `RLS1000_SETUP_V2.0.30.52.zip` attached.
>
> That is still the unblocker, just not an answer. The software in use was **v1.129, build 2018.05**
> — seven years older than the scale — which explains why it could not connect over either
> interface despite the scale replying to ping. Install V2.0.30.52, get it talking to the scale,
> and the Wireshark capture in §2 becomes possible. The capture is what yields §1 and §2; Rongta
> have effectively declined to shortcut it.
>
> Do the capture in the same session as the first successful connection — that connection is the
> only thing currently known to be fragile.

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

## 4. Recreate Unit Tests ✅ RESOLVED (2026-09-11)

`src/shared/utils/weightBarcode.test.ts` is back — 27 cases, built on the two barcodes scanned
from real printed labels. Both their EAN-13 check digits verify, which is independent evidence the
field boundaries are right: a wrong split would still parse, but the check digit could not agree by
accident. Also covers the section digit being ignored, the 2-decimal scale setting, and the price
rounding.

Write tests using real barcode numbers scanned from actual printed labels to guarantee the parser matches what the scale actually produces.

---

## 5. Network Prerequisites

Before any of the above is testable:

- Router: 192.168.1.x subnet, WPA2-PSK/AES, SSID ≤ 15 chars, password ≤ 15 chars
- Scale static IP: `192.168.1.20` (already configured)
- Verify: `ping 192.168.1.20` replies from the POS PC
