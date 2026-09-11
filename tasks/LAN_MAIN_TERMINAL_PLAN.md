# LAN multi-terminal ("main terminal") mode — design

**Status:** Phases 0–4 and the §11 pairing dialog implemented on `dev` (2026-09-10 → 2026-09-11) —
see §12 for what shipped, what changed from the design while building it, and what is still open.
A shop can pair a satellite from the login-screen gear, and the satellite shows only what it can
do. §11.3–11.4 (generation counter, planned handoff) are not started. §8 records what is
deliberately deferred and what must not be deferred.

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
  the main terminal has to serve them there as well — but the new gate must not switch a server on
  for every existing shop at upgrade. See §5.2.
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
2. **Run the LAN server on a main in ONLINE mode too** — the gate at `local-server/index.ts:79` is
   `mode === 'OFFLINE_ONLY'`, so an ONLINE terminal serves nothing. Without a change here, ONLINE
   multi-terminal cannot work at all.

   **Not** `mode === 'OFFLINE_ONLY' || isMain`, though: `isMain` defaults to true for every
   existing terminal (§10), so that would silently start an HTTP server on the LAN of every shop
   in the fleet on upgrade. Gate it on the shop actually having satellites — a flag set when the
   first satellite is paired, cleared when the last is removed:

   ```ts
   mode === 'OFFLINE_ONLY' || (isMain && servesSatellites)
   ```
3. **Terminal-sync routes on the LAN server** — the 404 list in §2, with the *same contracts the
   VPS uses*, so one client implementation serves both hops.

   They do **not** all belong in Phase 2, which became clear building them. `/terminals/heartbeat`
   and `/terminals/status` mean the same thing on a main as on the VPS and are done. `/sales/sync`
   does not: on the VPS it is `syncFromTerminal`, *record a sale that already happened*, whereas on
   a main the sale has not happened yet and must be **committed** — stock checked and decremented,
   receipt number issued, fiscalized (items 5, 6, 11). Building the VPS shape here first would
   leave a route that records sales without touching stock, which is precisely the bug §3 exists to
   prevent. It lands with Phase 3, and so do `/smena/sync-bulk` and `/users/sync`, which depend on
   the same commit path.

   `/logs/upload` is deferred for a different reason: a terminal keeps no queryable log copy
   (`logRoutes` in `routes/misc.ts` returns empty), so a satellite's logs reaching the vendor needs
   a forwarding queue on the main, not an endpoint.
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
reboot that moves the main terminal takes every satellite down at once.

Note the address belongs to the **main**, not the satellites: nothing addresses a satellite, so
those can stay on DHCP. Commands and the rest of the network setup are in §9.

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

---

## 9. Install checklist

Written down because it is the part that gets done from memory on a shop floor, and three of these
steps fail silently — the shop sees "it doesn't work on Wi-Fi" with nothing in any log.

**§9.1–9.3 already apply today** for the phone dashboard on an OFFLINE_ONLY store. **§9.4 onward
is for when Phases 1–3 land** — until then, pointing a second terminal at the main gets you the
§2.1 footgun, not a satellite.

### 9.1 On the main terminal — address

Give it an address that cannot move. A **DHCP reservation on the router** is better than a static
IP configured in Windows: it survives a reinstall and cannot collide with the router's pool.

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Select-Object IPAddress, InterfaceAlias
Get-NetAdapter | Select-Object Name, MacAddress          # for the reservation
```

Record the address — every satellite is configured against it.

### 9.2 On the main terminal — firewall

Windows blocks the inbound port by default. The network profile must be **Private**: shop Wi-Fi is
often classified Public, where the inbound policy is far harsher, and the rule below is scoped to
Private so the two must match.

```powershell
Get-NetConnectionProfile                                  # confirm: NetworkCategory = Private
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private

New-NetFirewallRule -DisplayName "POSGRO LAN server" -Direction Inbound `
  -Protocol TCP -LocalPort 5173 -Action Allow `
  -Profile Private -RemoteAddress LocalSubnet
```

`-RemoteAddress LocalSubnet` keeps the port off any other network the machine later joins. It
matters: this port accepts PIN attempts (§6.10).

Confirm it is actually listening:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen
```

**5173 is the default, not a requirement** — `DEFAULT_PORT` (`local-server/index.ts:24`), overridden
by the `local_web_port` row in `system_settings`. There is no need to invent a port such as 8888;
if you do change it, change the firewall rule to match. Nothing in the UI writes that setting, so
it is an installer-level value.

### 9.3 On the router

- **Turn AP / client isolation OFF.** Most consumer routers and nearly every "guest" SSID isolate
  wireless clients from one another, so a satellite reaches the internet but not the main terminal.
  This is the single most common cause of "works on cable, not on Wi-Fi", and nothing on the
  Windows side can reveal it.
- Main and satellites on the **same SSID / VLAN / subnet**.
- Prefer **Ethernet for tills** where the building allows it — it removes both problems above and
  the latency variance on every sale commit, which now includes a LAN round trip.

### 9.4 On each satellite

- **Never clone the main's disk image.** Duplicate `terminalId` means duplicate receipt numbers
  (§6.2), discovered only at consolidation. Each terminal gets its own identity at setup.
- Set `isMain = false` and point `mainTerminalUrl` at the address from §9.1.
- No printer setup changes: a satellite keeps its own printer (§5.12).
- No `regos_vcr_*` settings: it does not fiscalize (§5.11).

### 9.5 Verify, from the satellite

```powershell
Test-NetConnection -ComputerName <main-ip> -Port 5173     # TcpTestSucceeded : True
```

If that fails, work through it in this order — cheapest first: AP isolation (§9.3), network
profile (§9.2), firewall rule (§9.2), then whether the server is listening at all (§9.2).

### 9.6 Not required — skip these

- **File and Printer Sharing / Network Discovery.** This is a plain HTTP server on a TCP port, not
  an SMB share.
- **A dedicated port** such as 8888 — see §9.2.
- **A static IP on satellites.** Nothing addresses them; only the main needs a fixed address.
- **HTTPS on the LAN.** Out of scope, but it is why §6.10's device token and rate limiting are
  requirements rather than nice-to-haves: PINs cross this wire in the clear.


---

## 10. Upgrading a shop that already runs several terminals

The common case in the field today is a shop with two terminals in ONLINE mode, both independent,
both syncing to the VPS. **That configuration must survive the upgrade untouched** — the release
goes to every terminal in the fleet, not only to shops that want satellites.

It does, on one condition.

### 10.1 The default decides everything

Every terminal that exists today is, in this design's terms, a main: independent, owns its stock,
syncs to the VPS. So:

```sql
ALTER TABLE local_config ADD COLUMN is_main INTEGER DEFAULT 1
```

**`DEFAULT 1`, not `0`.** With `1` the upgrade is behaviourally inert — a two-terminal shop becomes
a two-main shop, which §6.1 already permits and which is exactly what it was doing yesterday. With
`0` both terminals become satellites with no `mainTerminalUrl`, and the shop stops selling.

One character, whole-fleet blast radius. It deserves a test that starts from a pre-upgrade database
and asserts `isMain === true`, in the manner of `legacy-upgrade.test.ts`.

### 10.2 Three places must agree

The terminal's SQLite upgrade is hand-rolled probe-then-add (`sqlite-client.ts:356`, `runMigrations`):

```ts
try   { await prisma.$queryRaw`SELECT is_main FROM local_config LIMIT 1`; }
catch { await prisma.$executeRaw`ALTER TABLE local_config ADD COLUMN is_main INTEGER DEFAULT 1`; }
```

That covers an **existing** database. A **new** install goes through `CREATE TABLE IF NOT EXISTS
local_config` (`sqlite-client.ts:122`) instead, and Prisma reads
`prisma/schema.sqlite.prisma`. All three have to carry the column, or it reaches some terminals
and not others.

This has bitten before: `createSchemaIfNeeded` returned early when `local_config` already existed,
so `audit_logs` never reached upgraded terminals and killed the shift panel on one store — the
subject of `legacy-upgrade.test.ts`. Same shape of bug, same place.

### 10.3 What does *not* change

- **No PostgreSQL migration.** `isMain` is terminal-local; the VPS does not need to know which
  terminal is main for any of this. So the server deploy carries no schema risk.
- **Receipt numbers.** Item 6 moves numbering to the main only for *satellite* sales. Two mains
  keep their own counters and their own `terminalId` prefixes, exactly as today.
- **Stock.** Two mains keep independent stock, as today — including today's double-sell (§6.1).
  The upgrade neither fixes nor worsens it.
- **Rollback is safe.** An extra column is invisible to an older build, so downgrading the app
  does not require touching the database.

### 10.4 Check before upgrading a multi-terminal shop

**Confirm the terminals have distinct `terminalId`s.** If they were set up by cloning a disk image
they already share one, which means they are already issuing duplicate receipt numbers today
(§6.2) — the upgrade will not cause that, but it is worth finding before adding terminals to the
shop. On the VPS, duplicate `receipt_number` values within a store are the giveaway.

---

## 11. Changing a terminal's role

### 11.1 Where it lives

The login-screen gear (`TerminalAccessBar.tsx:383`), which today opens a dialog labelled
`settings.serverUrl` and edits `localConfig.apiUrl`. Two changes:

- **Relabel `settings.serverUrl` → `settings.apiUrl`** in `ru.json` and `uz.json` — three keys:
  `serverUrl`, `serverUrlHint`, `serverUrlInvalid`. The field always wrote `apiUrl`; the label was
  the only thing calling it something else.
- **Add a Role section**: Main / Satellite, plus the main's address when Satellite is chosen.

It stays on the login screen deliberately. A terminal being repaired or repointed is exactly the
case where nobody can sign in, so hiding this behind a login would put it out of reach when it is
needed. That is also why it must be gated properly:

### 11.2 The gate is the super-admin password, not the terminal PIN

`auth:verifyTerminalAccess` (`auth-handlers.ts:681`) accepts **a PIN or any active ADMIN's
password** — appropriate for editing a URL, far too weak for handing the shop's source of truth to
a different machine.

Use `auth:verifySuperAdminPassword` (`auth-handlers.ts:723`) instead. It already exists, is already
rate-limited through `overrideThrottle`, and starts no session.

Two consequences to build for:

- It **returns false when no super-admin password is configured** — deliberately, so a missing
  configuration is not an open door. So **a shop cannot use satellites without one set.** Pairing
  must refuse with that reason rather than silently falling back to the weaker gate.
- Keep the existing unlock for the API URL field so today's behaviour is unchanged, and prompt for
  the super-admin password only when Role actually changes. Raising the bar on the whole dialog
  would be defensible, but it is a separate decision and should not ride along.

### 11.3 The generation counter is what prevents two mains

A `mainGeneration` integer on `local_config`, incremented on every promotion. A satellite records
the highest generation it has seen from its main and **refuses to talk to a main presenting a lower
one**.

Without it, an old main that comes back from repair simply starts serving again, and any satellite
still pointed at it silently resumes writing to a stale source of truth — a second, divergent
shop. The counter makes that refusal automatic instead of relying on whoever did the repair
remembering.

This is scoped per pairing: a shop deliberately running two independent mains (§6.1) has two
unrelated lineages, and a satellite only ever compares generations from the main it is paired with.

### 11.4 Planned handoff — the main is still reachable

The case that matters most, because scheduled maintenance is the common one.

1. On the satellite: Role → **Main**, super-admin password.
2. It asks the current main for a full snapshot — catalog, stock, open shifts, and every sale it
   does not already hold — and for a demotion at generation *N+1*.
3. The old main writes generation *N+1*, flips itself to Satellite pointed at the new main, and
   stops serving.
4. Remaining satellites are repointed at the new address (§11.6).

No data is lost, because the truth is transferred while both machines are up. The old main can
then go for service, and comes back as an ordinary satellite.

### 11.5 Emergency promotion — the main is dead

Allowed, because a shop that cannot sell is not an acceptable outcome, but it is a
**disaster-recovery action and must read like one**. The promoted terminal has only its read cache
and the sales it originated; the other tills' sales since the last sync are not on it, and its
stock figures are as stale as its last pull.

The dialog states exactly that before proceeding — what it has, what it is missing, and that the
old main will need manual reconciliation — and requires an explicit acknowledgement, not just the
password.

On confirmation it bumps `mainGeneration` and records why: promoted from incomplete state, at what
time, from a cache last refreshed when. That record is what the reconciliation later works from.

**The old main must not be returned to service as-is.** Its data has to be reconciled and the
machine re-paired as a satellite. The generation guard (§11.3) stops it re-serving satellites, but
nothing stops someone selling on it directly, so this belongs in the service procedure as well as
in code.

One mitigation worth stating: **in ONLINE mode the VPS already holds the old main's sales up to its
last successful sync**, which bounds the loss to the window since then. In OFFLINE_ONLY there is no
such copy, which raises the stakes on §6.6 backups considerably.

### 11.6 Repointing the other satellites

After any promotion the remaining satellites still point at the old address. With the Role section
in the gear dialog this is a per-terminal edit — four of them in a five-till shop, done at the
login screen without signing in.

Acceptable, and the honest starting point. If it proves annoying in the field, the improvement is
to let a satellite hold several candidate addresses and use whichever answers with the highest
generation — the counter already makes that safe. Not worth building until asked for.

---

## 12. Implementation status

### 12.1 What shipped

| Phase | Commits | What |
|---|---|---|
| 0 | `cc0bf20` | A server URL the terminal could log into but never sync to is refused (`/health` probe) |
| 1 | `92eacd0` | `isMain` + `mainTerminalUrl` in all three places §10.2 requires; unique `terminalId` at setup |
| 2 | `eb54de9` `b6b2579` `7815200` `3c26f57` `4c30577` | LAN server on a main with satellites; pairing codes and device secrets; the terminal audience; heartbeat/status; the satellite side of joining |
| 3.0 | `b8693a9` | LAN tokens signed with a per-main key; the dashboard can no longer read local-only settings |
| 3.1 | `956d50c` | `sales/commit-sale.ts` — one serialized, transactional, idempotent commit path |
| 3.2 | `9b64786` | The main answers satellites: login, PIN (§6.10), user session, sales, shifts, catalog |
| 3.3 | `b2a674e` | The satellite side: `lan/main-link.ts`, IPC routing, local cache and printing, sync to the main |
| 3.4 | `359b22d` | Degraded mode (banner, login message) and the satellite write guard |
| §11 | `82ba622` | The pairing dialog in the login-screen gear: pair, remove, re-pair, leave — every act behind the super-admin password; a role change restarts the app |
| 4 | (this commit) | Trim: a satellite is "admin-locked" like a cashier-only store, plus hidden login-bar buttons, settings tiles, shop reports and VCR receipt actions; its drawer/scale toggles work |

Proven end to end in `src/main/lan/satellite.e2e.test.ts`: a real main (LAN server + database)
and a satellite with its own database, in one process, over HTTP — catalog pull, login, shift,
sale, return, a lost response that must not sell twice, a deactivated cashier, and the main
switched off.

### 12.2 Where the build departed from the design

- **§5.2's gate** is paired satellites (or an open pairing code), not `isMain` — `isMain` defaults
  to true fleet-wide, so gating on it would have opened a port in every shop.
- **§5.4 needed a fourth credential.** The device token says which till; a *user session* token
  (`posgro-lan-session`, bound to that till, re-checked against `users` on every request) says who
  is at it. Without it the main would accept whatever cashier id a satellite asserted.
- **LAN tokens could be forged with the installer's `JWT_SECRET`**, which is baked into every
  build. Now a per-main random key, local-only. Found while building §6.10's device-token guard,
  which it would otherwise have made meaningless.
- **Products cross the wire by barcode, not id.** A till that sold independently before pairing
  keeps its own ids, so the same number can name different products on each side.
- **A commit carries a satellite-generated id** — the idempotency key that makes a retry after a
  lost response return the same sale instead of selling twice.
- **§6.5's cursor trap was real on the main itself**: products-sync copied the VPS's `updatedAt`,
  so the column mixed two clocks. The main now stamps its own.
- **No users table travels to a satellite** (`/terminal/sync/users` was dropped) — login is on the
  main, so no satellite needs anyone's password hash.
- **§5.3's `/sales/sync` shape was never built.** A satellite's sale is committed on the main, not
  recorded after the fact; the VPS-shaped route would have recorded sales without touching stock.

### 12.3 Still open

Needed before a shop can use this:

- ~~**§11 gear dialog**~~ — done (`TerminalRolePanel.tsx`). Verified by pairing two real instances
  on one machine. The sign-out-after-joining concern is met by restarting the app on any role
  change. §11.5's emergency promotion ships as "stop being a satellite" with its warning,
  acknowledgement and a logged record; the generation bump waits for §11.3.
- ~~**Phase 4 trim**~~ — done. Verified on two real instances: the satellite shows POS, shift,
  products (read-only), receipts, marking check, and its own printer/scale/labels/update settings;
  the main still shows everything.

Decisions still open, found while trimming:

- **Machine settings, fleet-wide or satellites only.** `cash_drawer_enabled`,
  `bulk_weigh_enabled` and `price_tag_templates` are each till's own on a satellite
  (`SATELLITE_MACHINE_SETTINGS`), but still sync through the VPS between mains, so one main's
  drawer toggle reaches the others. Making them local-only everywhere would fix that and change what
  a freshly set-up terminal inherits.
- **`receipt_width` per till.** A satellite prints with its main's paper width; a till whose printer
  differs gets a broken layout. It belongs with the question above.
- **A satellite's cached fiscal status goes stale.** A sale that fiscalized after the main's 10s
  wait still reads "not fiscalized" at the satellite that rang it up.

Deferred, each a known gap rather than a bug:

- **Pre-weighed labels** (`weighedItems:*`) are per-till. A label printed at one till and scanned at
  another is not found; its SOLD mark is not recorded on the main.
- **`markingCodes:check`** consults the till's own SoldMarkingCode table and the VPS; a satellite has
  no VPS token, so a marked item sold at one till is not caught as already-sold at another.
- **`/logs/upload`** from satellites needs a forwarding queue on the main (§5.3).
- **The VPS dashboard's terminal list** does not see satellites; their heartbeat goes to the main.
- **Satellite sync interval** is the same 5 minutes as VPS sync; a price change on the main reaches
  a satellite's display within that. Commits always use the main's figures, so this is cosmetic.
- **§11.3 `mainGeneration`**, promotion and handoff (§11.4–11.5).

Noticed along the way, outside this work:

- `local-server/routes/sales.ts` (dashboard sale delete) restores `quantity`, not
  `quantity × piecesPerUnit` — box lines under-restore stock.
- `config:getLocalConfig` returns the whole `local_config` row to the renderer, including the
  super-admin password hash that `sync-service.ts` is careful to keep in the main process.

### 12.4 Before promising 5+ tills

§6.4 still stands: every satellite sale is a write on the main's SQLite. `commitSale` serializes
them in one queue, which is correct but means throughput is one sale at a time — tested at 10
concurrent commits, not measured on shop hardware under a real lunchtime queue.
