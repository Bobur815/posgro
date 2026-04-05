# MXIK / IKPU Integration Guide
### Grocery POS — Electron + NestJS + Prisma

> **Vibe coding guide for Claude Code in terminal.**
> Copy-paste these prompts directly into your Claude Code session. Each section builds on the previous one.

---

## What Is MXIK and Why Do You Need It

MXIK (МХИК) — also called IKPU — is Uzbekistan's national product classification code from `tasnif.soliq.uz`. Every product sold through a fiscal cash register must have one. Without it, your OFD (fiscal data operator) receipts are invalid.

**The good news:** `tasnif.soliq.uz` has a **free, public API — no government registration or API key required.**

---

## Architecture Overview

```
ProductForm (Renderer)
    └── searches MXIK via /api/mxik/search
            └── NestJS MxikController (VPS)
                    └── calls tasnif.soliq.uz public API (npm: mxik)
                            └── result stored in Product.mxikCode (PostgreSQL + SQLite)
                                    └── sent in OFD receipt payload on sale
```

---

## Step 1 — Install the MXIK npm Package

Open your terminal in the project root and run this prompt in **Claude Code**:

```
install the npm package "mxik" in the server dependencies
```

Or do it manually:

```bash
npm i mxik
```

---

## Step 2 — Update Prisma Schema

**Prompt for Claude Code:**

```
In prisma/schema.prisma, add three optional fields to the Product model:
- mxikCode String? mapped to "mxik_code"
- mxikName  String? mapped to "mxik_name"
- packageCode String? mapped to "package_code"
Then generate a new migration named "add_mxik_to_products"
```

**What it should produce:**

```prisma
model Product {
  id           Int      @id @default(autoincrement())
  barcode      String   @unique
  nameUz       String   @map("name_uz")
  nameRu       String   @map("name_ru")
  price        Decimal  @db.Decimal(10, 2)
  cost         Decimal? @db.Decimal(10, 2)
  stock        Decimal  @default(0) @db.Decimal(10, 3)
  minStock     Decimal  @default(0) @db.Decimal(10, 3) @map("min_stock")
  unit         String   @default("шт")
  categoryId   Int      @map("category_id")
  active       Boolean  @default(true)
  internalCode String?  @map("internal_code") // existing scale PLU field

  // MXIK fields (new)
  mxikCode     String?  @map("mxik_code")     // e.g. "06111001018000000"
  mxikName     String?  @map("mxik_name")     // name from classifier
  packageCode  String?  @map("package_code")  // package code for OFD

  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  // ... relations unchanged
}
```

Run migration after:

```bash
npx prisma migrate dev --name add_mxik_to_products
```

---

## Step 3 — NestJS MXIK Module (VPS)

**Prompt for Claude Code:**

```
Create a NestJS module at src/server/modules/mxik/ with:
- mxik.module.ts
- mxik.service.ts  — wraps the "mxik" npm package (MxikClient), methods: search(query), getByCode(code)
- mxik.controller.ts — GET /mxik/search?q=, GET /mxik/code/:code, both protected by JwtAuthGuard + RolesGuard ADMIN only
Register MxikModule in AppModule.
```

**Reference implementation:**

```typescript
// src/server/modules/mxik/mxik.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { MxikClient } from 'mxik'

@Injectable()
export class MxikService {
  private client = new MxikClient()

  async search(query: string) {
    if (!query || query.length < 2) return []
    try {
      return await this.client.search(query)
    } catch {
      throw new HttpException('MXIK search failed', HttpStatus.BAD_GATEWAY)
    }
  }

  async getByCode(code: string) {
    try {
      return await this.client.code(code)
    } catch {
      throw new HttpException('MXIK code not found', HttpStatus.NOT_FOUND)
    }
  }
}
```

```typescript
// src/server/modules/mxik/mxik.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { MxikService } from './mxik.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '@prisma/client'

@Controller('mxik')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MxikController {
  constructor(private readonly mxikService: MxikService) {}

  @Get('search')
  search(@Query('q') query: string) {
    return this.mxikService.search(query)
  }

  @Get('code/:code')
  getByCode(@Param('code') code: string) {
    return this.mxikService.getByCode(code)
  }
}
```

```typescript
// src/server/modules/mxik/mxik.module.ts
import { Module } from '@nestjs/common'
import { MxikService } from './mxik.service'
import { MxikController } from './mxik.controller'

@Module({
  controllers: [MxikController],
  providers: [MxikService],
  exports: [MxikService],
})
export class MxikModule {}
```

---

## Step 4 — Add MXIK Endpoints to products DTO

**Prompt for Claude Code:**

```
In src/server/modules/products/dto/create-product.dto.ts and update-product.dto.ts,
add optional fields: mxikCode, mxikName, packageCode (all string, optional).
Update the products.service.ts create and update methods to persist these fields.
```

---

## Step 5 — React Hook for MXIK Search (Renderer)

**Prompt for Claude Code:**

```
Create src/renderer/hooks/useMxikSearch.ts — a React hook that:
- takes a debounce of 400ms
- calls GET /api/mxik/search?q={query} with auth token from localStorage
- returns { results, loading, search, clear }
- result items have shape: { code: string, name: string, packageCode?: string }
```

**Reference implementation:**

```typescript
// src/renderer/hooks/useMxikSearch.ts
import { useState, useCallback, useRef } from 'react'

export interface MxikResult {
  code: string
  name: string
  packageCode?: string
}

export function useMxikSearch() {
  const [results, setResults] = useState<MxikResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query || query.length < 2) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('auth_token') || ''
        const res = await fetch(
          `/api/mxik/search?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        // Normalize response from tasnif.soliq.uz format
        const normalized: MxikResult[] = (data?.data ?? data ?? []).map((item: any) => ({
          code: item.mxikCode ?? item.code ?? '',
          name: item.mxikName ?? item.name ?? '',
          packageCode: item.packageCode ?? '',
        }))
        setResults(normalized)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [])

  const clear = useCallback(() => setResults([]), [])

  return { results, loading, search, clear }
}
```

---

## Step 6 — MxikSelector Component

**Prompt for Claude Code:**

```
Create src/renderer/components/common/MxikSelector.tsx — a controlled input component that:
- shows a text input with placeholder "Search MXIK code (min 2 chars)..."
- displays a dropdown list of search results below the input
- on item click: calls onSelect(code, name, packageCode) and closes the dropdown
- shows currently selected code as a badge if value prop is set
- has a clear button to reset selection
- uses the useMxikSearch hook
```

**Reference implementation:**

```typescript
// src/renderer/components/common/MxikSelector.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useMxikSearch, MxikResult } from '../../hooks/useMxikSearch'

interface MxikSelectorProps {
  value?: string
  valueName?: string
  onSelect: (code: string, name: string, packageCode?: string) => void
  onClear: () => void
}

export function MxikSelector({ value, valueName, onSelect, onClear }: MxikSelectorProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { results, loading, search, clear } = useMxikSearch()
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    search(e.target.value)
    setOpen(true)
  }

  function handleSelect(item: MxikResult) {
    onSelect(item.code, item.name, item.packageCode)
    setQuery('')
    setOpen(false)
    clear()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Selected badge */}
      {value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <code style={{ fontSize: 12, background: '#e3f2fd', padding: '2px 8px', borderRadius: 4 }}>
            {value}
          </code>
          <span style={{ fontSize: 12, color: '#555' }}>{valueName}</span>
          <button
            onClick={onClear}
            style={{ fontSize: 11, color: '#f44336', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        placeholder="Search MXIK code (min. 2 chars)..."
        value={query}
        onChange={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        style={{ width: '100%' }}
      />

      {loading && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Searching...</div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {results.map((item) => (
            <li
              key={item.code}
              onClick={() => handleSelect(item)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.code}</div>
              <div style={{ color: '#555', marginTop: 2 }}>{item.name}</div>
              {item.packageCode && (
                <div style={{ color: '#999', fontSize: 11, marginTop: 2 }}>
                  Package: {item.packageCode}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

---

## Step 7 — Wire Into ProductForm

**Prompt for Claude Code:**

```
In src/renderer/pages/Products/ProductForm.tsx, add the MxikSelector component
inside the admin product form. It should update the form state fields:
mxikCode, mxikName, packageCode when a MXIK item is selected.
Place it in its own form section labeled "MXIK / IKPU Code".
```

**What to add to your form state:**

```typescript
const [formData, setFormData] = useState({
  // ...existing fields...
  mxikCode: product?.mxikCode ?? '',
  mxikName: product?.mxikName ?? '',
  packageCode: product?.packageCode ?? '',
})

// Handler for MxikSelector
function handleMxikSelect(code: string, name: string, packageCode?: string) {
  setFormData(prev => ({ ...prev, mxikCode: code, mxikName: name, packageCode: packageCode ?? '' }))
}

function handleMxikClear() {
  setFormData(prev => ({ ...prev, mxikCode: '', mxikName: '', packageCode: '' }))
}
```

**In the JSX:**

```tsx
<section>
  <h3>MXIK / IKPU Code</h3>
  <MxikSelector
    value={formData.mxikCode}
    valueName={formData.mxikName}
    onSelect={handleMxikSelect}
    onClear={handleMxikClear}
  />
</section>
```

---

## Step 8 — Update ProductList to Show MXIK Status

**Prompt for Claude Code:**

```
In src/renderer/pages/Products/ProductList.tsx, add a column "MXIK" to the products table.
Show a green check icon if mxikCode is set, or a yellow warning icon if not.
Admin users should see a "Set MXIK" button that opens ProductForm for that product.
```

---

## Step 9 — Include MXIK in Sale Receipts (OFD payload)

**Prompt for Claude Code:**

```
In src/main/sync/sales-sync.ts, when building the sale payload to send to VPS,
include mxikCode as "productCode" and packageCode per sale item.
In src/main/printer/templates.ts, add mxikCode to the receipt line item data
but do NOT print it on the customer receipt — only use it in the sync payload.
```

**Sale item structure for OFD:**

```typescript
// When syncing to VPS — each SaleItem should include:
interface OfdSaleItem {
  productName:     string
  productCode:     string   // mxikCode — e.g. "06111001018000000"
  packageCode:     string   // e.g. "796" (piece), "166" (kg)
  productBarCode:  string
  productQuantity: number
  price:           number   // in UZS
  sumPrice:        number
  vat:             number   // usually 0
  vatPercent:      number   // 0 or 12
}
```

---

## Step 10 — Add MXIK to SQLite Local Schema

Since the POS terminals also cache products locally in SQLite, make sure the new fields sync down.

**Prompt for Claude Code:**

```
In src/main/sync/products-sync.ts, update the product upsert to also
write mxikCode, mxikName, and packageCode from the VPS response into local SQLite.
```

---

## Quick Reference

| Thing | Value |
|---|---|
| API base URL | `https://tasnif.soliq.uz` |
| API key needed? | ❌ None |
| Government registration? | ❌ Not required |
| npm package | `mxik` |
| MXIK code format | 17-digit string, e.g. `06111001018000000` |
| Where it's stored | `Product.mxikCode` (PostgreSQL + SQLite) |
| Who can set it | Admin only |
| Required for OFD? | ✅ Yes, mandatory for fiscal receipts |
| Package code "796" | Piece (шт) |
| Package code "166" | Kilogram (кг) |

---

## Common Claude Code Prompts for This Feature

```
# After all files are created:
"Run the NestJS server and test GET /api/mxik/search?q=молоко — show me the raw response"

"Write a Prisma seed that adds mxikCode to the first 5 products in the database 
using real MXIK codes from the milk/bread/sugar categories"

"Add a bulk MXIK assignment page at /products/mxik-bulk where admin can see all 
products without mxikCode and assign them one by one using MxikSelector"

"Add validation in create-product.dto.ts that mxikCode must be exactly 17 digits if provided"

"Write a migration that adds a DB index on Product.mxikCode for faster OFD lookups"
```

---

## Troubleshooting

**`tasnif.soliq.uz` returns empty results**
→ The site occasionally has downtime. Add a try/catch in `MxikService` with a fallback message. The POS still works — MXIK is only required when issuing a fiscal receipt.

**MXIK not syncing to SQLite terminals**
→ Make sure `products-sync.ts` includes `mxikCode` in the upsert fields. Check with `prisma studio` on the terminal machine.

**OFD rejects the receipt**
→ Verify the `packageCode` is correct for the unit type. Piece = `796`, Kilogram = `166`, Litre = `111`.

**`mxik` npm package throws at runtime in Electron**
→ The `mxik` package runs on the NestJS VPS, not in Electron directly. The Electron app calls your own `/api/mxik/search` endpoint. Never import `mxik` in the renderer process.
