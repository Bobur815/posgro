# Scale Label Printing & Barcode Workflow

## The Key Insight

**"Shakar" with barcode `4008764888120` is a REGULAR product barcode.**  
When sold by weight on the scale, the scale **generates a completely new barcode** — it does NOT print `4008764888120`. The new barcode encodes the **weight** inside it.

---

## Step 1 — Setup: Program the Scale

In RLS1000 software (RTPLU.exe), create a PLU entry:

```
Name:              Shakar
Fresh Code (LFCode): 000001   ← your internalCode in DB
Unit Price:        8500        ← per kg in UZS
Weight Unit:       Kg
Barcode Type:      15          ← EAN-13, encodes LFCode + weight
Hotkey:            1
```

Download to scale: `Network → Download PLU (F9)`

> The scale stores this PLU internally. The original barcode `4008764888120` is **not used** — only the Fresh Commodity Code `000001` matters.

---

## Step 2 — Weighing: Customer Brings Sugar

Staff places sugar on the scale tray and presses hotkey `1` (Shakar).

Scale shows:
```
Weight:      1.250 kg
Unit Price:  8500 /kg
Total:       10625 UZS
```

Scale **auto-prints a label**.

---

## Step 3 — Label Barcode Generation

The scale generates an **EAN-13 weight barcode** using Barcode Type 15:

```
Barcode Type 15 format:
  D(1)  + IIIIIII(7)  + W.WWW(4) + C
  dept    LF code       weight     checksum

Example:
  2  +  0000001  +  1250  +  C
  ↑       ↑          ↑
  dept  Shakar    1.250 kg
  code  LFCode

Result: 2 0000001 1250 C  → "20000001125" + checksum
```

So the printed barcode is something like: **`2000000112504`**  
*(NOT the original 4008764888120)*

---

## Step 4 — Cashier Scans the Label

Cashier scans `2000000112504` with the USB barcode scanner.

Your `useWeightBarcode.ts` hook detects it starts with `2` → parses it:

```typescript
isWeightBarcode("2000000112504")  // → true

parseWeightBarcode("2000000112504")
// → {
//     pluCode:      "00001",    // LFCode → look up in DB
//     weight:       1.250,      // kg
//     weightDisplay: "1.250 kg"
//   }
```

---

## Step 5 — POS Looks Up Product

```typescript
// In your SQLite database:
products.find(p => p.internalCode === "00001")
// → { nameRu: "Shakar", price: 8500, unit: "кг" }

// Price calculated:
subtotal = 8500 × 1.250 = 10625 UZS ✓
```

Cart shows:
```
Shakar    1.250 kg × 8500/kg = 10,625 сум  ⚖️
```

---

## Summary

```
DB (Shakar, internalCode=00001, price=8500)
        ↓  RLS1000 software downloads PLU
Scale stores PLU 00001 = Shakar, 8500/kg
        ↓  staff weighs 1.250 kg → presses hotkey 1
Scale prints label with barcode: 2000000112504
        ↓  cashier scans
POS parses: LFCode=00001, weight=1.250kg
        ↓  DB lookup by internalCode
Cart: Shakar 1.250kg × 8500 = 10,625 сум ✓
```

## What About `4008764888120`?

That barcode is only used if Shakar is sold as a **fixed package** (e.g. a sealed 1kg bag) — scanned directly without weighing. In that case it goes through the **regular barcode flow**, not the weight barcode flow.

Two separate flows, both handled by your existing `handleScan()` function:

```typescript
if (isWeightBarcode(barcode)) {
  // weight flow → lookup by internalCode
} else {
  // regular flow → lookup by barcode (4008764888120)
}
```
