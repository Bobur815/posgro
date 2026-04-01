# Telegram Bot Integration

## Overview

The bot runs in **long-polling (pull) mode** via [Telegraf](https://telegraf.js.org/). It is registered as a NestJS module in `src/server/modules/telegram/` and serves two audiences:

| Role | Access |
|---|---|
| Admin / Super Admin / User | Analytics, stock overview, low-stock list, suppliers list, web panel link |
| Supplier | Own balance, last 10 transactions, own products, web panel link |

---

## File Structure

```
src/server/modules/telegram/
├── telegram.module.ts   — NestJS module, imports ProductsModule, InventoryModule,
│                          UsersModule, SuppliersModule, AnalyticsModule
├── telegram.service.ts  — Bot lifecycle, session management, handler registration
└── bot-commands.ts      — Pure message-formatting helpers (no side effects)
```

---

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=123456:ABC-...   # Required — bot disabled if missing
WEB_APP_URL=https://pos.bobur-dev.uz  # Shown as inline "Open web panel" button
```

If `TELEGRAM_BOT_TOKEN` is not set, the bot logs a warning and silently skips startup — no crash.

---

## Authentication Flow

1. User sends `/start` → bot deletes any existing session and requests a phone number via Telegram's native contact button.
2. User taps **Share contact** → bot receives the phone number.
3. `resolveIdentity()` normalises the number (with/without `+`) and queries:
   - `UsersService.findByPhoneAnyStore()` — matches ADMIN / USER / SUPER_ADMIN
   - `SuppliersService.findByPhoneAnyStore()` — matches SUPPLIER
4. If found: session is stored in an in-memory `Map<chatId, BotSession>` and the appropriate menu keyboard is shown.
5. If not found: user sees an info message with an inline web panel button.

> **Note:** Sessions are in-memory only. They reset on server restart. Users must `/start` again after a restart.

---

## BotSession Shape

```typescript
interface BotSession {
  phone: string;
  role: 'ADMIN' | 'USER' | 'SUPER_ADMIN' | 'SUPPLIER';
  userId?: string;       // set for non-supplier roles
  supplierId?: string;   // set for SUPPLIER role
  storeId: string;
  name: string;          // display name (nameRu)
}
```

---

## Keyboards & Commands

### Admin keyboard
| Button | Action |
|---|---|
| 📊 Bugungi tahlil / Аналитика | `AnalyticsService.getDailyAnalytics(storeId, today)` |
| 📦 Ombor / Остатки | `ProductsService.findAll(storeId, { active: true })` — up to 20 items |
| 🔴 Kam qolganlar / Мало на складе | `InventoryService.getLowStock(storeId)` |
| 👥 Ta'minotchilar / Поставщики | `SuppliersService.findAll(storeId, { active: true })` |
| 🌐 Veb-panel | Inline button → `WEB_APP_URL` |

### Supplier keyboard
| Button | Action |
|---|---|
| 💰 Mening balansim / Мой баланс | `SuppliersService.findById(supplierId, storeId)` → balance |
| 📋 Tranzaksiyalar | Same — last 10 transactions |
| 📦 Mening tovarlarim | Same — supplier's products |
| 🌐 Veb-panel | Inline button → `WEB_APP_URL` |

---

## Message Formatting (`bot-commands.ts`)

All messages are **bilingual**: Uzbek first, then Russian, separated by `―――`.

Key formatters:

| Function | Output |
|---|---|
| `msgTodayAnalytics(data)` | Sales count, revenue, avg transaction, top-3 products |
| `msgStockOverview(products)` | List of up to 20 products with stock + unit |
| `msgLowStock(products)` | Products where stock < minStock, or "all good" message |
| `msgSuppliersList(suppliers)` | Supplier names with balance (debt / overpayment / zero) |
| `msgSupplierBalance(name, balance)` | Single supplier balance with direction label |
| `msgSupplierTransactions(name, txs)` | Last 10 transactions with type label, amount, date |
| `msgSupplierProducts(products)` | Supplier's products with price and stock |
| `msgError(context?)` | Bilingual error message with optional context tag |

Transaction type labels (`TX_LABELS`): `PURCHASE`, `PAYMENT`, `RETURN`, `ADVANCE`, `ADJUSTMENT`.

---

## Push Notifications

The three public methods (`sendNotification`, `sendLowStockAlert`, `sendDailySummary`) exist for compatibility with existing callers but are **no-ops** — they only log in debug mode. The bot operates in **pull mode**: users query it rather than the server pushing alerts.

To enable real push alerts, implement these methods with `this.bot.telegram.sendMessage(chatId, text)` and maintain a list of subscribed chat IDs.

---

## Adding the Module

`TelegramModule` must be imported wherever the service is needed. It is self-contained — just add it to the root `AppModule` imports:

```typescript
// app.module.ts
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    // ...other modules
    TelegramModule,
  ],
})
export class AppModule {}
```
