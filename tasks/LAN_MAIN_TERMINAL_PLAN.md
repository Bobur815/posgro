# LAN multi-terminal ("main terminal") mode — design

**Status:** design agreed 2026-09-10 (§1). Not started. §8 holds the questions still open — none
of them block Phase 0 or 1.

---

## 1. Decisions

| Decision | |
|---|---|
| Works in **both** OFFLINE_ONLY and ONLINE mode | not an offline-only feature |
| Two roles, flagged by `isMain` | `true` = main, `false` = satellite |
| A main terminal keeps **every** function it has today | and doubles as a working till |
| The main terminal is the **source of truth** | satellites hold no independent truth |
| Satellites reach the main by **static IP** over Wi-Fi or cable | no discovery/mDNS to build |
| A satellite **never talks to the VPS** — in either mode | its only server is the main terminal |
| A satellite has no `settings.webAdminOnPhone` button | `TerminalAccessBar.tsx:391` |
| A satellite has no `subscription.status` button | `TerminalAccessBar.tsx:400` |
| A satellite does not serve the web admin at all | cashier station, not an admin station |
| **Only the main fiscalizes** (REGOS VCR) | it runs the only VCR; §5.11 |
| **Every terminal prints its own receipt**, satellites included | at its own till, on its own printer; §5.12 |
| Expect **5+ terminals** per store | concurrency is a real design input, not a corner case |
| Several `isMain=true` terminals in one store stay allowed | they behave exactly as today — see §6.1 |
| A satellite depends on the main being up | accepted; degraded mode defined in §5.9 |
| Backups are the **main terminal's** responsibility | §6.6 |

The satellite rule collapses to one sentence, which is what makes this tractable:

> **A satellite's server is the main terminal, always. The main terminal's server is the VPS, or
> nothing.**

---

## 2. What exists today

| Fact | Where |
|---|---|
| Each terminal reads/writes its **own** SQLite via IPC. `apiUrl` is never the data source. | `src/main/ipc/*-handlers.ts` |
| `apiUrl` is used only for sync, auth, and a few lookups | `src/main/sync/`, `auth-handlers.ts` |
| `shouldSync()` is **false** for an OFFLINE_ONLY store — sync never runs at all | `sync-policy.ts:20` |
| **The LAN server runs only in OFFLINE_ONLY mode** | `local-server/index.ts:79` |
| It binds `0.0.0.0` on `local_web_port` (default 5173), serving `/api/*` + `/web/` | `local-server/index.ts:115` |
| LAN tokens are stamped `audience: 'posgro-local-web'` **so a POS token cannot authenticate a browser and vice versa** | `local-server/auth.ts:26` |
| Stock is decremented on the selling terminal's own row | `sales-handlers.ts:219` |
| Receipt numbers are `{terminalId}{yyMMdd}{seq}`, counter per terminal in its own SQLite | `sales-handlers.ts:951` |
| There is no main-terminal concept anywhere — no `isMain`, no `mainTerminal` | grep, 2026-09-10 |

Two of those rows drive most of the work below:

- **The LAN server does not run in ONLINE mode.** Since satellites must work in ONLINE mode too,
  the main terminal has to serve them there as well. The gate at `local-server/index.ts:79`
  becomes "OFFLINE_ONLY **or** `isMain`".
- **The LAN API is the dashboard's API, not the terminal-sync API.** Of what the POS calls on
  `apiUrl`: `/auth/login`, `/products?updatedAfter=`, `/categories`, `/settings`, `/suppliers`
  and `/store-config` exist; `/sales/sync`, `/users/sync`, `/smena/sync-bulk`,
  `/terminals/heartbeat`, `/logs/upload` and `/marking-codes/*` are **404**.

### 2.1 The footgun that exists right now

Because `/auth/login` exists on the LAN server and `/sales/sync` does not, a shop that points a
second terminal at the main PC **today** logs in successfully, pulls the catalog, and silently
never consolidates a single sale. This is why Phase 0 (§7) comes before any of the real work.

---

## 3. Why the main terminal owns stock

Settled, recorded so it is not relitigated: two terminals each hold their own `stock` row, each
checks availability locally, each decrements locally. If both sell the last unit **both succeed**,
and there is no correct merge afterwards — a decrement from a stale base is simply wrong, and the
shop discovers it at stocktake.

Centralising stock on the main terminal is what removes that class of bug. The price is that a
satellite cannot sell while the main is down, which is accepted: a shop's own LAN is far more
reliable than its internet, and the failure is loud and immediate rather than silent divergence
found weeks later.

---

## 4. The two roles

| Capability | `isMain = true` | `isMain = false` |
|---|---|---|
| Owns stock, prices, catalog | **yes — source of truth** | no; asks the main |
| Sells | yes (doubles as a till) | yes, via the main |
| Syncs to the VPS (ONLINE) | yes | **never** |
| Serves other terminals | yes (LAN server, both modes) | no |
| Serves the web admin / phone QR | yes | **no** |
| `settings.webAdminOnPhone` button | shown | **hidden** |
| `subscription.status` button | shown | **hidden** |
| `settings.serverUrl` button | shown (VPS URL) | shown, but points at the main terminal |
| Fiscalization (REGOS VCR) | **yes — the only VCR** | no; the main fiscalizes on its behalf |
| Prints receipts | yes | **yes — its own printer, its own till** |
| Prints weight labels | yes | yes (same printer unless `label_printer_name` is set) |
| Bulk weighing / `BulkWeighModal` | yes | yes |
| Prints shift (X/Z) reports | yes | follows shift ownership — §8.2 |

---

## 5. What has to be built

1. **Role on `local_config`:** `isMain: boolean`, plus `mainTerminalUrl` on a satellite. Chosen in
   the setup wizard, not by typing a URL into the Settings dialog.
2. **Run the LAN server on a main in ONLINE mode too** — change the gate at
   `local-server/index.ts:79` from `mode === 'OFFLINE_ONLY'` to `mode === 'OFFLINE_ONLY' || isMain`.
   Without this, ONLINE multi-terminal cannot work at all.
3. **Terminal-sync routes on the LAN server** — the 404 list in §2, with the *same contracts the
   VPS uses*, so one client implementation serves both hops.
4. **A third token audience.** `posgro-local-web` guards the browser. A satellite is neither a
   browser nor a VPS client, so it needs its own (e.g. `posgro-lan-terminal`) with its own TTL.
   Reusing the dashboard audience would hand any phone on the Wi-Fi a terminal's privileges.
5. **Stock commit on the main.** Availability check and decrement in one transaction, returning
   the authoritative post-sale stock. The main's request handling is the serialisation point.
6. **Receipt numbers issued by the main**, keyed by the requesting terminal's `terminalId`, so the
   existing `{terminalId}{yyMMdd}{seq}` scheme survives and the counter has exactly one home. This
   also makes the cloned-image collision in §6.2 impossible by construction.
7. **Point the satellite's sync client at the main** rather than the VPS, in both modes.
8. **Two-hop replication in ONLINE mode:** VPS → main → satellite. See the cursor trap in §6.5.
9. **Degraded mode.** Define precisely what a satellite does when the main is unreachable —
   proposal: refuse to start a sale with a clear "main terminal unreachable" banner, keep the
   already-open cart, and retry. Explicitly *not* "sell anyway and reconcile later", which is
   Option B from the previous draft and reintroduces the double-sell.
10. **Hide the two buttons** on a satellite (`TerminalAccessBar.tsx:391` and `:400`).
11. **Fiscalization stays on the main.** Skip `regosVcrService.start()` on a satellite
    (`index.ts:179`) and drop the `regos_vcr_*` settings from its setup — the VCR is a *local*
    service on `127.0.0.1:22298`, so a satellite has nothing to talk to. A satellite's sale must
    carry its originating `terminalId` into the fiscal record, or every receipt in the shop
    fiscalizes as if the main rang it up.
12. **Printing stays local — the fiscal *data* is what travels.** A satellite keeps its own
    printer and prints its own receipt at its own till, exactly as it does today. What it cannot
    do is produce the fiscal fields, so **the sale-commit response must carry `regosQrCodeUrl` and
    `regosReceiptNo` back** with the sale; without them the customer gets paper with no Soliq OFD
    QR and loses the 1% cashback.

    The sequencing already exists and should be preserved rather than reinvented:
    `printSaleReceipt()` (`sales-handlers.ts:37`) awaits the in-flight fiscalization so the QR
    lands on the paper, and **a failed fiscalization still prints** — the customer must not be
    held up by a fiscal problem. Over the LAN that becomes: the main commits, fiscalizes, and
    returns; the satellite prints whatever came back, fiscal or not.

    Satellites therefore keep `PRINTER_NAME` and the printer setup step, and bulk weighing works
    at a satellite because the label printer resolves the same way it does today.

---

## 6. Risks and traps

### 6.1 Several main terminals in one store

Allowed by decision, and it does preserve today's behaviour — but it also preserves today's
**double-sell**: two mains each own their own stock rows and neither arbitrates. In ONLINE mode
the VPS partially papers over it, because the product pull overwrites local stock; in OFFLINE_ONLY
nothing does.

Not a blocker, but it should be a deliberate configuration rather than an accident: the setup
wizard should warn when a second main is registered on a LAN that already has one, and the
recommended layout for a 5+ terminal shop is **one main, many satellites**.

### 6.2 Cloned disk images

Imaging one monoblock onto the others gives them the same `terminalId`, and therefore duplicate
receipt numbers, discovered only at consolidation. Setup must refuse a `terminalId` already
present on the LAN. Item 6 in §5 removes the collision itself; this check still catches the
identity confusion.

### 6.3 Static IP

Chosen deliberately over discovery. It must be a real static lease — a DHCP renewal or router
reboot that moves the main terminal takes every satellite down at once. This belongs in the
install checklist with the firewall rule for `local_web_port`, which Windows blocks inbound by
default.

### 6.4 SQLite write contention at 5+ terminals

Every satellite sale becomes a write on the main's single SQLite file, on top of the main's own
till traffic. `receiptNumberMutex` (`sales-handlers.ts:925`) only serialises within one process —
which the main now is for the whole shop, so that part holds. What needs checking under load is
WAL behaviour and lock timeouts with concurrent writers, before promising 5+.

### 6.5 The two-hop sync cursor

Product pull already had a cursor bug once: it used the *terminal's* clock, so after a clock
change server-bumped rows were skipped entirely. Two-hop replication doubles the chance of
repeating it. The satellite's cursor must be expressed in the **main's** clock/`updatedAt`, never
its own.

### 6.6 The main is now a single point of failure

Today every terminal is its own accidental backup. Under this design the main holds the shop's
only copy, and it is also a working till — so it is exposed to spills, power cuts and being
switched off at closing time like any other till. Automatic local backup is no longer optional.

---

### 6.7 A VCR that prints the receipt itself

`printSaleReceipt()` opens with `if (await regosVcrService.vcrPrintsReceipt()) return;`
(`sales-handlers.ts:38`) — in some configurations the fiscal device prints the paper and the app
deliberately does not.

That device is attached to the **main**. So in a shop configured that way, a satellite's receipt
would emerge at the main terminal, which is exactly the layout §5.12 is designed to avoid. Either
those shops are not candidates for satellites, or a satellite must print the app receipt even when
`vcrPrintsReceipt()` is true. Worth settling before Phase 3 — it is a one-line branch, but only if
someone has decided which way it goes.

### 6.8 Fiscalization is now shop-wide, not per-till

Today a REGOS failure stops one till. Under this design it stops **every** till, because the main
holds the only VCR. Given the fiscal path's history on this deployment, the retry and queue
behaviour deserves more care here than it needed when the blast radius was one terminal — a
satellite must not lose a completed sale because the main's VCR was briefly unhappy.

## 7. Phasing

- **Phase 0 — stop the current footgun (do first, small).** A shop pointed at a main PC today
  loses sales silently (§2.1). Either reject a server URL the terminal cannot actually use, or
  surface sync failures instead of swallowing them.
- **Phase 1 — identity.** `isMain` + `mainTerminalUrl` + setup wizard + duplicate-`terminalId`
  check. No behaviour change yet.
- **Phase 2 — serving.** LAN server on a main in both modes; the terminal audience; the
  terminal-sync routes.
- **Phase 3 — truth.** Stock commit and receipt numbering move to the main; satellite sync client
  re-pointed; degraded mode.
- **Phase 4 — trim.** Hide the satellite-inapplicable UI; stop the web admin on satellites.

---

## 8. Still open

1. **Where do satellite users authenticate?** Against the main every time (simple, but no login
   while the main is down — though a satellite cannot sell then anyway), or against a cached
   users table replicated from the main?
2. **Shift (smena) ownership.** Does a satellite open its own shift, or join the main's? Affects
   `/smena/sync-bulk` and every reconciliation report.
3. **Exact degraded-mode surface.** §5.9 proposes refuse-to-sell; confirm whether a satellite
   should still allow read-only work (price lookups, viewing today's sales).
4. **Shops whose VCR prints the receipt itself** (§6.7) — does a satellite print the app receipt
   anyway, or are those shops simply not candidates for satellites?
