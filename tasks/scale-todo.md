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

## 3. Barcode Byte Positions

**When:** After printing one real test label from the scale
**File:** `src/shared/utils/weightBarcode.ts` ~line 40:

```ts
const PLU_START = 1; // ← adjust if PLU is at different position
const PLU_END = 7; // ← adjust (currently assumes 6-digit PLU)
const WEIGHT_START = 7; // ← adjust
const WEIGHT_END = 12; // ← adjust (currently assumes 5-digit weight)
```

How to verify:

1. Program PLU `000001` on the scale
2. Put any item on the scale, print a label
3. Read the 13-digit barcode number from the label
4. The number should look like: `2` `000001` `WWWWW` `C`
   - Position 0: `2`
   - Positions 1–6: your PLU (`000001`)
   - Positions 7–11: weight in grams (e.g. `01500` = 1.500 kg)
   - Position 12: EAN-13 check digit
5. If the layout is different, update the four constants above

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
