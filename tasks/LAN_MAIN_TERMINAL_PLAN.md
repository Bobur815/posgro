# LAN multi-terminal ("main terminal") mode — design

**Status:** design agreed and complete, 2026-09-10 (§1). Not started. Nothing is blocking
implementation — §8 records what is deliberately deferred and what must not be deferred.

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
| A satellite prints even when the VCR would print | the fiscal device is at the main, not its till; §6.7 |
| Expect **5+ terminals** per store | concurrency is a real design input, not a corner case |
| Several `isMain=true` terminals in one store stay allowed | they behave exactly as today — see §6.1 |
| A satellite depends on the main being up | accepted; degraded mode defined in §5.9 |
| **Satellite users authenticate against the main, every time** | no local password fallback; §6.9 |
| **PIN unlock goes to the main too** | no local credential path at all on a satellite; §5.13, §6.10 |
| **A satellite opens its own shift** | `Smena` already carries `terminalId`; §5.14 |
| **Read-only work continues when the main is unreachable** | price lookups, today's sales; §5.9 |
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
| Prints shift (X/Z) reports | yes | **yes — for its own shift** |
| Opens its own shift | yes | **yes** |
| User login | local `users` table | **against the main, every time** |
| Works with the main unreachable | n/a | read-only only — §5.9 |

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
9. **Degraded mode — read-only, not offline-selling.** When the main is unreachable a satellite
   keeps working for **price lookups and viewing today's sales**, and refuses to commit a sale
   behind a clear "main terminal unreachable" banner, keeping the already-open cart and retrying.
   Explicitly *not* "sell anyway and reconcile later", which reintroduces the double-sell §3
   exists to prevent.

   This means a satellite is **not** a thin client: it must keep a local read cache of the catalog
   and prices, and a local copy of the sales it originated, or there is nothing to read when the
   main is down. The main returning the committed sale (item 12) is what populates the latter.
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

    The one behavioural change is that the `vcrPrintsReceipt()` skip at `sales-handlers.ts:38`
    becomes main-only — a satellite prints regardless, because the fiscal device is not at its
    till. See §6.7.
13. **All login goes to the main — password *and* PIN.** Password is a re-point: the main's
    `/auth/login` already uses the same `users` table and bcrypt hashes
    (`local-server/routes/auth.ts`), it just needs the terminal audience from item 4 rather than
    the browser's.

    **PIN needs a new endpoint.** There is no PIN route on the LAN server today, and PIN
    verification cannot be a lookup: PINs are bcrypt-hashed and deliberately not unique, so
    `findUserIdByPin()` compares the candidate against *every* active user with a PIN
    (`auth-handlers.ts:103`). That loop moves to the main.

    This also forces a distinction item 4 should make explicit: the terminal token is a **device**
    credential, established when the satellite is paired, not something a user login produces.
    It has to already exist for the satellite to ask "is this PIN valid?" at all — and it is what
    stops any phone on the Wi-Fi from asking the same question (§6.10).

    No local credential path remains on a satellite. See §6.9 for what that means during an outage.
14. **Shifts stay per terminal.** `Smena` already has `terminalId` and is indexed
    `[terminalId, status]` (`schema.sqlite.prisma:174,188`), so a satellite opening its own shift
    needs no schema change — only that the shift is created on the main and carries the
    satellite's `terminalId`. `/smena/sync-bulk` and every reconciliation report must group by it,
    and a satellite's X/Z report covers its own shift alone.

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

### 6.7 A VCR that prints the receipt itself — settled

`printSaleReceipt()` opens with `if (await regosVcrService.vcrPrintsReceipt()) return;`
(`sales-handlers.ts:38`) — in some configurations the fiscal device prints the paper and the app
deliberately does not. That device is attached to the **main**.

**Decision: a satellite always prints the app receipt, even when `vcrPrintsReceipt()` is true.**
The skip becomes main-only:

```ts
if (isMain && await regosVcrService.vcrPrintsReceipt()) return;
```

Otherwise a satellite's customer would be sent to the main terminal to collect their paper.

The one consequence to expect: in such a shop the two tills hand out different-looking receipts —
the VCR's own at the main, the app's at each satellite. Both are valid; it is worth telling the
shop so it is not reported as a bug.

### 6.8 Fiscalization is now shop-wide, not per-till

Today a REGOS failure stops one till. Under this design it stops **every** till, because the main
holds the only VCR. Given the fiscal path's history on this deployment, the retry and queue
behaviour deserves more care here than it needed when the blast radius was one terminal — a
satellite must not lose a completed sale because the main's VCR was briefly unhappy.

### 6.9 Read-only mode only helps a session that already exists

"Authenticate against the main every time" and "read-only work continues when the main is down"
interact in a way worth designing for rather than discovering: **a cashier who is not already
signed in cannot sign in at all** while the main is unreachable, so they get neither selling nor
the read-only fallback.

The likely shape of this in a real shop is the 7am one — satellites powered on before the main, or
the main not switched on at all. The read-only mode is then unreachable precisely when someone is
standing there trying to start the day.

Worth deciding as part of Phase 3, and cheap either way:

- an already-open session survives the main going away and degrades to read-only (this is the
  decision as stated), **and**
- a satellite shows "waiting for main terminal" on the login screen rather than a failed-password
  error, so the cause is obvious.

If losing the read-only fallback at cold start turns out to matter, the smallest fix is caching
the last successful login's bcrypt hash for that user — but that is a real weakening of "against
the main every time", so it should be a deliberate follow-up, not slipped in.

### 6.10 A 4-digit PIN becomes a network credential

This is the one consequence of the design that genuinely weakens something, so it should be built
with the mitigation rather than after it.

Today a PIN is a local unlock: `PIN_PATTERN` allows **1 to 4 digits**
(`auth-handlers.ts:70`), and `auth:loginWithPin` is **not throttled** — which is fine, because an
attacker has to be standing at the terminal. `AttemptThrottle` exists but guards the manager
override, not PIN login (`auth-handlers.ts:73`).

Routing PIN to the main turns it into a network credential over plain HTTP on the shop LAN. At
most 10,000 combinations, and each attempt costs the main a bcrypt compare *per user with a PIN* —
so a brute force is simultaneously a denial of service against the terminal that now runs the
whole shop.

Required alongside item 13, not later:

- the PIN endpoint accepts **only a paired terminal's device token** — never an unauthenticated
  caller, and never the browser audience
- per-terminal rate limiting with lockout; `AttemptThrottle` already exists and should be reused
  rather than reinvented
- log failed PIN attempts with the originating `terminalId`, so a shop can see it happening

Worth considering separately: 4 digits is short for something that now crosses a wire. Raising the
minimum length is a product decision, not a blocker for this design.

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

## 8. Deferred, and what must not be

Nothing is blocking. Every question raised during design has been answered, and the two items that
would otherwise get decided by accident during implementation are written down as requirements
instead:

- **§6.10** — the PIN endpoint must ship with its rate limiting and device-token guard, not after.
- **§6.9** — a satellite must degrade an already-open session rather than dropping it, and say
  "waiting for main terminal" on the login screen instead of showing a password error.

Two things are deliberately left for later, and neither changes the design:

1. **PIN length.** Four digits is short for a credential that now crosses a wire (§6.10). Raising
   the minimum is a product decision.
2. **A cached-credential fallback** for cold start during a main outage (§6.9). It is a real
   weakening of "against the main every time", so it should only happen if the 7am case turns out
   to hurt in practice — as a deliberate follow-up, never slipped in.
