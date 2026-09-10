# LAN multi-terminal ("main terminal") mode — planning brief

**Status:** not started. This is a design brief, not a task list. The stock-ownership question in
§3 decides the architecture, and nothing below it should be built until that is settled.

**Written:** 2026-09-10

---

## 1. The ask

Some shops want several POS monoblocks sharing one catalog and one set of sales, with no VPS:
one PC is the "main" one, the others point at it. The login screen's **Settings → server URL**
field already accepts a LAN address, so it looks like this is one configuration step away.

It is not. That field does something much narrower than it appears to.

## 2. What exists today

| Fact | Where |
|---|---|
| Each terminal reads/writes its **own** SQLite via IPC. `apiUrl` is never the data source. | `src/main/ipc/*-handlers.ts` |
| `apiUrl` is used only for sync, auth, and a few lookups | `src/main/sync/`, `auth-handlers.ts` |
| `shouldSync()` is **false** for an OFFLINE_ONLY store — sync never runs at all | `sync-policy.ts:20` |
| The LAN server binds `0.0.0.0` on `local_web_port` (default 5173), serving `/api/*` + `/web/` | `local-server/index.ts:115` |
| LAN tokens are stamped `audience: 'posgro-local-web'` **so a POS token cannot authenticate a browser and vice versa** | `local-server/auth.ts:26` |
| Stock is decremented on the selling terminal's own row | `sales-handlers.ts:219` |
| Receipt numbers are `{terminalId}{yyMMdd}{seq}`, counter per terminal in its own SQLite | `sales-handlers.ts:951` |
| There is **no** main-terminal concept anywhere — no `isMain`, no `mainTerminal` | grep, 2026-09-10 |

### 2.1 Why pointing `apiUrl` at the main PC today is worse than doing nothing

The LAN API is the **dashboard's** backend, not the terminal-sync backend. Of the endpoints the
POS calls on `apiUrl`:

| Endpoint | LAN server |
|---|---|
| `/auth/login` | exists |
| `/products?updatedAfter=`, `/categories`, `/settings`, `/suppliers`, `/store-config` | exist |
| `/sales/sync` | **404** — it has `POST /sales`, a different contract |
| `/users/sync`, `/smena/sync-bulk` | **404** |
| `/terminals/heartbeat`, `/terminals/status` | **404** |
| `/logs/upload`, `/marking-codes/*` | **404** |

`/auth/login` existing is the trap: **login succeeds, so it looks like it works**, while sales
silently never leave the terminal. Catalog would replicate one way and sales would not
consolidate at all. Do not ship this as a workaround.

---

## 3. The blocking question: who owns stock?

Two terminals each hold their own `stock` value for the same product. Both check availability
locally and both decrement locally. If both sell the last unit, **both succeed** — and there is
no safe way to merge that afterwards. Stock is not a set union; a decrement from a stale base is
simply wrong, and the shop finds out at stocktake.

This is the whole design. Three answers:

### Option A — The main terminal is the single source of truth *(recommended)*

Secondaries stop being independent databases. Stock-affecting operations (sale commit, arrival,
stocktake, price change) go to the main terminal synchronously over LAN; its SQLite is the only
place stock changes. Secondaries keep a local read cache for catalog and UI speed.

- **Cost:** a secondary cannot complete a sale while the LAN or the main PC is down.
- **Why it is still right:** a shop's own LAN is far more reliable than its internet, which is
  what offline-first was defending against. The failure is also *visible and immediate* ("main
  terminal unreachable") rather than silent divergence discovered weeks later.
- This is what most multi-till POS systems do, and for this reason.

### Option B — Every terminal keeps its own stock, reconcile later

Preserves offline-first for every terminal. Reintroduces exactly the double-sell above with no
correct merge. Would need per-terminal stock partitioning (each terminal allocated N units) to be
sound, which shopkeepers will not maintain.

**Not recommended.** It trades a visible failure for an invisible one.

### Option C — Don't build it

Tell these shops to run one terminal, or to go ONLINE and use the VPS. Honest, and cheaper than a
half-built A.

**Recommendation: A.** But it is a genuine architectural change — "offline-first" would come to
mean "the *shop* works offline", not "every terminal works independently". That reframing needs
explicit agreement before any code is written.

---

## 4. What A requires

1. **Terminal role.** A `role` on `local_config` (`MAIN` | `SECONDARY`) plus the main terminal's
   LAN address on the secondary. Set during the setup wizard, not by typing a URL into Settings.
2. **A third token audience.** `posgro-local-web` guards the browser. A secondary terminal is
   neither a browser nor a VPS client, so it needs its own audience (e.g. `posgro-lan-terminal`)
   with its own TTL. Reusing the dashboard audience would hand any phone on the Wi-Fi a
   terminal's privileges.
3. **Terminal-sync routes on the LAN server** — the 404 rows in §2.1, with the same contracts the
   VPS uses, so one client implementation serves both.
4. **A stock commit endpoint.** The main terminal must do the availability check and the decrement
   in one transaction and return the authoritative post-sale stock. `receiptNumberMutex`
   serialises within a process; across terminals the main terminal's request handling becomes the
   serialisation point.
5. **Unique `terminalId` enforcement.** See §5.
6. **Degraded mode.** What a secondary does when the main terminal is unreachable — refuse to
   sell, or queue non-stock operations only. Must be decided, not left to fall through.

---

## 5. Operational traps (whichever option is chosen)

- **Cloned disk images.** Receipt numbers are namespaced by `terminalId` with a per-terminal
  counter. Imaging one monoblock onto the others gives them the same `terminalId` and therefore
  **duplicate receipt numbers**, which only surfaces when you try to consolidate. Setup should
  refuse to start with a `terminalId` already present on the LAN.
- **DHCP.** The main PC's IPv4 changes on a lease renewal or router reboot and every secondary
  loses its server. Needs a static IP or a DHCP reservation, and that belongs in the install
  checklist. Consider mDNS discovery instead of a typed address.
- **Windows Firewall** blocks inbound `local_web_port` by default; the main PC needs an explicit
  rule.
- **Backups.** Under A the main terminal holds the shop's only copy of its data. Today every
  terminal is its own accidental backup. That has to be replaced deliberately.

---

## 6. Suggested phasing

- **Phase 0 (do first, cheap):** stop the current footgun. Either validate the Settings URL
  against what the terminal can actually use, or make sync failures visible instead of silent.
  A shop pointed at a main PC today loses sales silently.
- **Phase 1:** terminal role + discovery + unique-terminalId enforcement. No behaviour change yet.
- **Phase 2:** LAN terminal audience + the terminal-sync routes.
- **Phase 3:** stock commit moves to the main terminal; degraded mode.

---

## 7. Open questions

1. Is "the shop works offline, but a secondary needs the main PC" acceptable? (§3 — decides A vs C.)
2. How many terminals realistically — 2, or 5+? Decides whether discovery is worth building.
3. Does the main terminal double as a working till, or is it a back-office PC? Affects whether its
   availability is even under the shop's control.
4. Who is responsible for backups once one PC holds everything?
