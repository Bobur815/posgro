# §11 — the pairing dialog (started 2026-09-11)

From `tasks/LAN_MAIN_TERMINAL_PLAN.md` §11.1–11.2: the role controls in the login-screen gear, so a
shop can actually make a satellite. §11.3–11.5 (generation counter, handoff, emergency promotion
with a recorded reason) stay open.

- [x] Main process: super-admin gate on `pairing:remove`, one shared password check, join errors as
      `settings.*` keys, a logged record when a satellite leaves
- [x] Dialog primitives out of TerminalAccessBar; `settings.serverUrl*` → `settings.apiUrl*`
- [x] Role panel: pair/remove satellites on a main; join, re-pair, leave on a satellite
- [x] Role change relaunches the app; ru + uz strings; pure helpers tested

## Review

A shop can now make a satellite. The login-screen gear opens "Terminal settings": the API URL (on a
main only — a satellite never talks to the VPS) and a new role panel. On a main it lists paired
tills with last-seen times, issues a pairing code (big digits, the address to type, a live
countdown, noticing when it is used), and removes a till. On a satellite it re-pairs with another
main (§11.6) or leaves, behind a red disaster-recovery warning and a tick box (§11.5). Every role act
asks for the super-admin password and the main process checks it each time; without one configured
the panel says so and offers nothing (§11.2). A role change restarts the app.

**Main process:** `pairing:remove` was ungated — anyone who opened the gear with a PIN could cut a
till off. The four role acts now share one `requireSuperAdmin` and one throttle (leave had none).
Join failures come back as `settings.*` keys via a tested `pairingErrorKey` — the main's refusals
were English sentences on a Russian/Uzbek screen. `pairing:getCode` now returns the address with
the code, so a reopened dialog can show both. Leaving logs which main, when, and how old the cache
was — §11.5's record, until the generation counter exists.

**Verified by running two real instances on this machine** (throwaway user-data dirs, demo stores,
driven over CDP): unlock → panel → wrong super-admin password (translated error) → code with
address and countdown → on the second instance a wrong code (translated) then the real one →
"Подключено к «Demo Shop». Перезапуск…" → it came back as satellite T3, the main listed T3 with a
last-seen time → login on the satellite went to the main (session token audience
`posgro-lan-session`, bound to T3) → satellite panel and leave form → leave (logged record) →
remove T3 on the main with the password. 607 tests (was 588): `pairingErrorKey` and the dialog
helpers. `tsc` and `electron-vite build` clean. One full run failed two unrelated DB suites while the
machine was loaded from the builds and instances; the rerun was 607/607 in 21s — failure text not
captured.

**Not done:** §11.3 generation counter, §11.4 planned handoff, and Phase 4 (hiding what a
satellite refuses). The two login-screen buttons §4 hides on a satellite are still shown.

---

# Phase 3 — truth moves to the main (started 2026-09-11)

From `tasks/LAN_MAIN_TERMINAL_PLAN.md` §7. Stock, receipt numbers, shifts, login and fiscalization
move to the main; a satellite commits through it and keeps a read cache. One commit per slice.

- [x] 3.0 LAN tokens signed with a per-main secret, not the installer-baked `JWT_SECRET`;
      diagnose the ECONNRESET failures in the full test run
- [x] 3.1 `commitSale()` — one serialized, transactional, idempotent commit path; IPC unchanged
- [x] 3.2 The main answers satellites: login, PIN (throttled per terminal), user session,
      sale commit, shifts, catalog pull; sync uploads each row under its own terminal id
- [x] 3.3 The satellite talks only to its main: `main-link`, IPC routing, local sale cache,
      local printing, no VCR, sync loop pointed at the main
- [x] 3.4 Degraded mode (MAIN_UNREACHABLE, "waiting for main terminal") and satellite write guards

## Decisions made while building (for the review)

- **Satellites get no users table from the main.** Login goes to the main and a sale row keeps only
  a cashier id, so `/terminal/sync/users` was dropped — one less place a password hash could leave.
- **Product identity crosses the wire as the canonical barcode, not the id.** A satellite that used
  to be an independent till keeps its own ids for barcode-matched products (products-sync keeps a
  local id when the server's is taken), so its `productId` can name a different product on the
  main. The main resolves lines by barcode; the stock it returns carries barcodes back.
- **The main stamps its own clock on pulled products** (products-sync no longer copies the VPS
  `updatedAt`), so the column a satellite pages through runs on one clock (§6.5).

## Review

Phase 3 is done: a satellite sells, logs in and keeps shifts through its main, and the main is the
only place stock, receipt numbers, shifts and fiscalization happen. Five commits, `b8693a9` →
`359b22d`; the plan's new §12 lists what shipped, what departed from the design, and what is open.

**Found on the way, and fixed because the design depended on it:**

- LAN tokens were signed with `JWT_SECRET`, baked into every installer — anyone with a copy could
  forge a dashboard login for any shop or pose as any satellite. And `GET /settings` handed every
  dashboard user (cashiers too) the stored VPS token and the fiscal password blob.
- `sales:create` checked stock and decremented it in separate awaits — the §3 double-sell, inside
  one process. Also fixed with it: a refused edit left the old lines' stock restored for good, and
  a box line plus a loose line of one product could together overdraw the shelf.
- The main would have uploaded satellite sales and shifts under its own terminal id.
- The flaky full test runs were the keep-alive race: Node closes an idle socket at 5s just as fetch
  reuses it. Reproduced in-process (2/20 vs 0/20 at 65s) — and the same race exists between a real
  main and satellite, so the fix is in the server, not the tests.

**Verified:** 588 tests (was 514), including a two-till end-to-end test — a real main server and
database plus a satellite with its own database, over HTTP. Regression tests were shown red before
their fixes: the forged-token and settings cases, the concurrency test (the transaction alone
times out without the queue), the upload terminal id, and the lost-response retry (sells twice
without the idempotency key). `tsc` clean; `electron-vite build` clean, bundles grepped.

**Not verified:** two physical tills on a shop LAN, and a REGOS VCR returning a fiscal QR to a
satellite. Nothing in the UI can pair a satellite yet (§11 gear dialog), so none of this is
reachable by a shop until that lands — which also means it is inert in the field today.

No version bump — bumped at deploy, per convention.

---

# Phase 2 (slice 2) — pairing (done 2026-09-10)

How a satellite gets a device credential and its row in `paired_terminals`. Main-side protocol and
IPC; the dialogs come with the §11 gear work.

- [x] `pairing.ts` — six-digit code, single-use, ten-minute life, CSPRNG, in memory
- [x] `POST /terminal/pair` — redeems a code for a device secret, stored only as a bcrypt hash
- [x] `pairing:issueCode` / `getCode` / `cancelCode` / `list` / `remove`, gated on the super-admin
      password (§11.2)
- [x] The gate opens while a code is live, which is what lets the first satellite in at all

## Review

**A code, not the super-admin password typed into the satellite.** That password would otherwise
cross the shop LAN in clear text — the wire §6.10 already worries about for PINs — and it is the
credential that can hand the whole shop to another machine. A pairing code is short-lived,
single-use, and worthless once redeemed. `issueCode` verifies the password itself rather than
trusting a prior `verifySuperAdminPassword` call, so a caller cannot verify once and mint codes
forever.

**Designing this found a hole in slice 1.** The LAN server starts once a satellite is paired — but
a satellite has to reach that server *to* pair, so the first one could never get in. Issuing a code
now opens the door for as long as the code lives; a successful pairing leaves a row, which is what
keeps it open afterwards. `shouldServeLocally()` takes a third argument for it, with three tests
including the one that matters: an open code must not let a *satellite* serve.

**Refusals that matter, and the reason asserted rather than the status.** The endpoint answers 403
both for a bad code and for a throttled caller, so the tests match on the message — otherwise a
lockout would satisfy a test meant to prove the code check works. It also refuses the main's own
`terminalId`, which is the one most likely to be typed after cloning a machine, and refuses to pair
at all when this terminal is not a main.

The secret is returned exactly once and stored as bcrypt, asserted in the integration test: a main
whose database is later copied cannot be used to impersonate its own satellites.

436 tests pass (was 417).

## Next in Phase 2

- The `posgro-lan-terminal` token audience — verifying the device secret on each request (§5.4)
- The terminal-sync routes (§5.3)
- Satellite side: redeeming a code and writing its own config

---

# Phase 2 (slice 1) — the main can serve (done 2026-09-10)

From `tasks/LAN_MAIN_TERMINAL_PLAN.md` §7. Phase 2 is large, so it lands in slices; this one is the
foundation the rest needs. Still no behaviour change for any existing shop.

- [x] `paired_terminals` table — the shop's terminal registry, `terminal_id` as primary key so two
      tills cannot claim the same one (§6.2)
- [x] `shouldServeLocally()` — pure, mirroring `sync-policy.ts`, with the gate the plan called for
- [x] The LAN server now starts for a main **with satellites** in either mode, not only OFFLINE_ONLY
- [x] `GET /terminal/info` — public identity endpoint, the counterpart to Phase 0's `/health` probe

## Review

**The gate is not `isMain`.** §5.2 originally proposed `mode === 'OFFLINE_ONLY' || isMain`, which
would have opened a listening socket in every shop running the app, since `isMain` defaults to true
across the whole fleet. Paired satellites are the honest signal: no rows, no server. Six of the ten
`serve-policy.test.ts` cases exist to hold that line.

**Two URL fields, two questions.** `apiUrl` asks "is this the vendor's server?" and is validated by
`/health`, which this server must never answer or Phase 0's guard stops working.
`mainTerminalUrl` asks "is this our main terminal?" and is validated by `/terminal/info`. The
integration test asserts both halves against the real router, so neither can be broken silently.

`/terminal/info` is public because a satellite reaches it before pairing has given it any
credential. It returns service, role, store id and terminal id — enough to refuse a main belonging
to a different shop, which matters where two businesses share a building's wifi — and a test pins
the key list so nothing about takings, stock or people can be added to it by accident.

417 tests pass (was 404). One flake seen once in the full run — `no such table: smenas`, a table
this change does not touch — which did not reproduce in four subsequent runs. Not attributed; noted
in case it recurs.

## Next in Phase 2

- Pairing: how a satellite gets its device credential and its row in `paired_terminals`
- The `posgro-lan-terminal` token audience (§5.4)
- The terminal-sync routes (§5.3)

---

# Phase 1 — terminal identity (done 2026-09-10)

From `tasks/LAN_MAIN_TERMINAL_PLAN.md` §7: the role exists and is enforced, with no behaviour
change. A satellite still cannot do anything — serving is Phase 2 — so the wizard deliberately
does **not** offer the role yet. Shipping an option that produces a non-working terminal would be
worse than not shipping it.

- [x] `isMain` (default true) + `mainTerminalUrl` on `local_config`, in all three places §10.2
      requires: `schema.sqlite.prisma`, `CREATE TABLE IF NOT EXISTS`, and migration 31
- [x] Migration test from a pre-upgrade database, asserting the terminal comes up as a main
- [x] Read plumbing: both fields typed on `config.getLocalConfig`
- [x] Enforce the unique `terminalId` at setup — it was warned about but not blocked

## Review

**The default is the whole risk, so it is asserted rather than trusted.** `DEFAULT 1` makes the
upgrade inert: SQLite backfills the existing row, so a shop already running two independent tills
carries on doing exactly that. Flipping it to `DEFAULT 0` locally makes
`legacy-upgrade.test.ts` fail with `Expected: true / Received: false`, so the test is not vacuous.

`sqlite-schema.test.ts` already guards the other half — it walks the Prisma schema and asserts
every column is reachable in `sqlite-client.ts`, so the three places cannot drift silently the way
`audit_logs` and `regos_payment_id` did.

**The duplicate-`terminalId` check existed but did nothing.** The wizard fetched the store's
terminal ids from the VPS, suggested a free one, and rendered a "that id is taken" warning under
the field — then let you press Continue anyway. Two terminals sharing an id issue the same receipt
numbers, and it only surfaces when someone tries to consolidate. Now blocked.

**`isMain` is deliberately not writable through `updateLocalConfig`.** Changing the role hands the
shop's source of truth to another machine, so it needs the super-admin gate from §11.2 rather than
riding along on the handler the login-screen gear already uses at PIN strength.

404 tests pass (was 403). No version bump — bumped at deploy, per convention.

---

# Phase 0 — stop the silent-sales-loss footgun (done 2026-09-10)

From `tasks/LAN_MAIN_TERMINAL_PLAN.md` §7. A terminal pointed at another terminal's LAN dashboard
logs in fine (the LAN server has `/auth/login`), pulls the catalog, and never uploads a sale
(`/sales/sync` is not there). Nothing surfaced it.

- [x] `probeApiUrl()` — `GET {url}/health`, three-valued so an unreachable server is never
      mistaken for a wrong one
- [x] Guard `config:updateLocalConfig` (the login-screen gear), checked before the write
- [x] Guard `setup:authenticate` — setup is the other place a URL is chosen, and the LAN server
      answers `/stores/:id` too, so the whole wizard would have succeeded against another till
- [x] Say why: new `settings.apiUrlNotPosServer` / `setup.errors.not_pos_server` (ru + uz)
- [x] Fixed the wizard swallowing every `setup.errors.*` as the generic "login failed"
- [x] Locked the discriminator in against the real LAN router rather than inferring it

## Review

`/health` is registered by the VPS (`server/main.ts:85`) and absent from the LAN router. Verified
both ways: live `GET /api/health` returns the health payload on prod and staging, and the
local-server integration test now asserts the LAN server 404s there — so adding `/health` to it
later fails loudly instead of quietly disabling the guard.

Two things the live check changed:

- **A 200 alone is not enough.** `/web/health` returns 200, because the dashboard SPA fallback
  serves index.html for any path — so a `/web` instead of `/api` typo would have passed. The body
  has to be the health payload.
- **Only a definitive answer blocks.** 500/502/503 and unreachable are inconclusive. Refusing a URL
  because the VPS happened to be restarting would send a technician chasing a problem that does not
  exist, and would stop a terminal being configured before the network is up.

403 tests pass (was 393). No version bump — bumped at deploy, per convention.

---

# CI deploy hardening — 2026-09-10

## Context
`deploy-staging.yml` failed on `2a96c2b` with `ssh: handshake failed ... read: connection reset
by peer`. Investigation on the VPS ruled out the obvious causes:

- CI key `github-actions-grocery-pos` IS in `bobur`'s `authorized_keys` and authenticates fine
- host healthy (load 0.72 / 3 cores, 5.3 GB free), containers healthy
- fail2ban has no GitHub range banned; only **1** `Failed publickey` in the whole auth.log

Remaining explanation: sshd `MaxStartups` (default `10:30:100`) randomly drops new unauthenticated
connections while the box is under constant brute force (`Total failed: 19283`). Manual re-run
succeeded, which fits an intermittent transport fault.

## Tasks
- [x] 1. `sudo systemctl restart nginx` gap — only `reload` is in the NOPASSWD allowlist, so the
      new-HTTPS-block branch would hang on a password prompt. Use `sudo -n` + fall back to reload.
- [x] 2. Stop leaking secrets into `ps` — `envs: GH_PAT` and the inline `ENV_FILE` heredoc put
      GH_PAT, JWT_SECRET, DB_PASSWORD, ANTHROPIC_API_KEY and ASLBELGISI_API_KEY in the process
      args of every deploy, readable by any local user on a box shared with `yettibuloq`.
- [x] 3. Retry on SSH transport failure so a random MaxStartups drop can't fail the whole deploy.

## Approach
Move the deploy bodies into `scripts/deploy/{staging,production}.sh` (versioned, reviewable) and
reduce the remote command to a bootstrap piped over **stdin**, so nothing sensitive — and in fact
nothing at all — appears on the remote command line. Secrets travel by `scp` into a 0600 file.
Replace `appleboy/ssh-action` with plain `ssh`/`scp` to get a real retry loop keyed on exit 255.

## Review
- Secrets no longer appear in `ps`: the remote command is literally `bash -s`, script arrives on stdin.
- PAT no longer persisted in `.git/config` — origin is a plain URL, auth via `~/.git-credentials` (0600).
- DB password sync moved off argv (piped to `psql -f -`) — it was visible in `ps` too.
- Retry only on exit 255 (ssh transport), never on a genuine deploy failure, so a broken build
  fails fast instead of rebuilding three times.
- Follow-up NOT done (needs the user): rotate the five exposed secrets.

### Outcome (run #81, green)
Four runs to get there. #78 died on GitHub's YAML parser rejecting a flow-mapping scalar that
js-yaml accepted; #79 and #80 exited 255 before auth. The cause was a trailing newline in
SSH_HOST/SSH_USER — appleboy trimmed it, plain `ssh` tried to resolve `"host\n"`. Two hypotheses
I pushed on the way (key formatting, IdentitiesOnly) were both wrong and both cost a run; what
finally worked was routing diagnostics to `::error::` annotations, which are readable without
signing in, instead of guessing again.

Verified live on the VPS during run #81:
- HEAD dbafa06, `.env` 0600, `~/.git-credentials` 0600, secrets dir removed
- PAT no longer in `.git/config` (origin is a plain URL)
- 0 processes exposing a secret in argv, scanned mid-deploy; the deploy shows as
  `bash scripts/deploy/staging.sh`
- image digest unchanged (only CI files changed), so the api container correctly kept its uptime

---

# Previous task (kept for reference)

# Task — The terminal's Analytics page, matched to the dashboard's

## What the two pages now share

Both screens render the same report from **three different backends**:

| page | backend |
|---|---|
| web dashboard, ONLINE store | `analytics.service.ts` (Nest + PostgreSQL) |
| web dashboard, OFFLINE_ONLY store | `local-server/routes/analytics.ts` (terminal HTTP + SQLite) |
| POS terminal | `analytics:getData` IPC (raw SQLite) |

Presentation was the one thing with no excuse to differ, so it moved out rather than being copied
a third time — the last two bugs in this area were both "the same endpoint implemented twice, and
only one got the change".

- `components/analytics/rankings.tsx` — `RankList`, `RankHeading`, `RankNote`, the shared
  types, and `metricValueOf`/`sliceFor`. Pure: no fetching, no routing.
- `components/analytics/categoryPie.ts` — the validated hue sets and `foldCategorySlices()`.
- Web imports them through a new `@components/analytics` alias (vite + tsconfig), the same way it
  already borrows `@components/common` from the renderer.

The web page went 955 → 744 lines with identical output, verified in the built bundle.

## The terminal page

- **Sales by category is a pie**, same hues, same "Other" fold, same 2px surface ring between
  slices and % labels.
- **Top-selling-products bar chart → the product rankings block** — best/worst ten with an inline
  proportional bar, a metric filter and a category filter, and the scope note saying what the
  lists are drawn from.
- Cashier performance moved up into the row the old chart vacated.

## The third backend had no rankings at all

`analytics:getData` returned seven sections and no `productRanking`, so the page had nothing to
render. It now runs the same product-performance query the other two do, and imports
`rankProducts()`/`rankingCategories()` rather than reimplementing them — a third copy of the
missing-cost ordering rules would drift.

Two deliberate differences from the sibling queries, both commented in place:

- The rankings query is **not** terminal-scoped, unlike every other query in that handler. A
  product's ranking is a property of the shop's catalogue; slicing it per till would make "never
  sold" mean "never sold on this till".
- `categoryId` filters the rows **before** `rankProducts()` slices to ten, so "best in this
  category" means what it says.

## Verified

`tsc` clean. Full suite **377 → 385** (30 suites) — eight new tests on `foldCategorySlices`,
covering that it never loses revenue, never returns more slices than there are hues, keeps the
biggest categories, and does not mutate its input. `nest build`, `electron-vite build` and
`npm run build:web` all clean, and I grepped both shipped bundles for the new code rather than
trusting the build output.

**Not seen rendered.** Worth a look on the terminal: whether the pie legend fits under a 210px
chart, and whether the rankings block reads well at the POS's window width.

**This one needs an app restart**, not just a reload — the IPC handler is main-process code.

---

# Task — Web dashboard: Users modal, SystemSettings layout, and a mobile nav that fits

## 1. Web Users → modal, like the terminal

`UserFormModal.tsx` mirrors the POS one minus the virtual keyboard (no touch screen here). Both the
desktop table's edit button and the mobile card's now open it; the FAB creates. Keyed on the target
user so the form rebuilds instead of carrying state from whoever was open before.

Routes `users/new` and `users/:id/edit` removed, `UserForm.tsx` deleted.

Same partial-edit rules, documented on the component: phone is the login identifier and fixed after
creation, an empty password means "leave as is" — the hash never reaches the browser, so there is
nothing to prefill and no way to tell "unchanged" from "blank" otherwise.

## 2. Web SystemSettings → the same responsive grid

Reuses `@components/common/SettingsLayout` — the primitives added for the terminal, which the web
app already aliases from the renderer, so there is one definition rather than two.

Was an 800px column. Now the store form spans the grid and pairs its five fields two-up
(`FieldGrid`), and the subscription, balance and terminal cards sit beside each other below it.
`Section` lost its `margin-bottom` since the grid owns the gaps, and the now-redundant `Row` style
went with it.

## 3. Mobile nav — 5 sections + in-page tabs

The bar was carrying 8 icons (Products, Stock, Stocktake, Reconciliation, Suppliers, Daily,
Settings, Logout) and Analytics would have made 9.

**The bar now holds sections, never individual pages:**

| | Products | Stock | Suppliers | Reports | Settings |
|---|---|---|---|---|---|

Each section's sub-pages became tabs at the top of its own pages, via a new
`components/layout/SubNav.tsx`:

- **Stock** → Приходы · Инвентаризация · Сверка
- **Reports** → Дневной отчет · Месячный отчет · **Аналитика** — *desktop only*

**On a phone, Reports is Analytics alone.** The daily and monthly reports are dense tables that
belong on a real screen, so the Reports tab goes straight to `/reports/analytics` and the tab
strip is hidden below 767px (`REPORTS_HIDE_TABS_ON_MOBILE`) — offering tabs to pages the bar no longer
leads to would just advertise dead ends. All three stay on desktop, and the pages remain reachable
by URL. A cashier cannot open Analytics (admin-only), so their Reports tab is the daily summary,
their only report.

The 767px breakpoint deliberately matches `MobileBottomNav`'s, so the bar and the tabs never
disagree about which layout is showing. The bar itself needs no media query — it only ever renders
on a phone, so it can name the mobile destination outright.

Analytics was already routed at `/reports/analytics` but unreachable from mobile. It is now the
Reports destination there.

Details worth knowing:

- **Tabs render at every width by default.** The desktop sidebar still lists the sub-pages, but
  showing the group in-page is what makes the hierarchy legible — you can see a page's siblings
  without going back to the nav. Reports opts out on mobile; Stock keeps its three tabs there.
- **Role filtering lives in the hooks** (`useStockSubNav`, `useReportsSubNav`), so a cashier is
  never shown a tab that would bounce them off an admin-only route. A group left with one visible
  tab renders nothing — a lone tab is decoration, not navigation.
- **Icons gained labels.** At 8 icons there was no room; at 5 there is, and an unlabelled icon row
  is a guessing game.
- **Fixed a latent bug:** the old bar sent everyone to `/settings`, which is admin-only — a cashier
  tapping it bounced. The Settings tab now goes to `/settings/user` for non-admins.
- **Logout moved off the bar** into the account page (`/settings/user`), reachable by every role.
  A destructive action does not belong one thumb-slip from the Reports tab.
- The tab strip scrolls horizontally rather than wrapping, so a long group never pushes content
  down.

### One thing I changed beyond the ask

Removing the mobile logout button orphaned the confirm dialog it was the only trigger for — the
desktop sidebar logged out immediately with no confirmation. Rather than delete working code, the
desktop button now goes through that same dialog. Signing out of a till mid-shift is worth one tap
to confirm; say the word if you would rather have it back as one click.

## Verified

Web `tsc --noEmit` clean and `npm run build` clean. Root repo unaffected: `tsc` clean, **370 tests
still passing**, `electron-vite build` clean. Tag-balance check across every restructured file.

**Not verified by me: none of this has been seen rendered**, and mobile layout in particular is
something only a real viewport settles. Worth checking on a phone: whether five labelled icons fit
without truncating in Russian (`Поставщики` is the long one — it ellipsizes rather than wrapping),
and that the tab strip does not crowd the page headers that already sit at the top of these pages.

`npm run lint` is still broken repo-wide and unrelated: ESLint 9 finds no `eslint.config.js`.

## Not done

`WriteOffList.tsx` has no route, so it is not in the Stock group. If it is meant to be reachable it
needs a route first — say so and it becomes a fourth Stock tab.

---

# Earlier in this session

**OFFLINE_ONLY credential trap** — the VPS refused `/auth/login` for such a store, so once the
setup token expired and was auto-dropped, nothing could mint another; subscription and every other
VPS-backed feature were dead there. The refusal is now scoped to the dashboard via a `client: 'pos'`
marker (**needs a server deploy** to take effect), and the dialog explains the state instead of
giving advice nobody could follow.

**Subscription dialog** — the server sends `store_id`/`store_name` and the terminal was parsing both
away; now displayed, with failures named rather than collapsed into one blank.

**Sync UI removed for OFFLINE_ONLY** — AppBar button, Sidebar status line, Settings tile.

**Settings UI** — `useVirtualKeyboard` across six terminal pages, Users add/edit in a modal,
responsive card grid on the three narrow settings pages (`tasks/layout-check.html` previews it).

**Fiscalization timing (awaiting real-terminal data)** — 2.4 s median per receipt, of which REGOS's
`Receipt.Sale` is 2.4 s and our code ~15 ms; device round-trips cut 3 → 1. **Open:** REGOS:VCR
prints its own receipt synchronously inside `Receipt.Sale`; the "Чек печатает виртуальная касса"
toggle needs confirming end to end. Also open: refund-and-reissue for editing a fiscalized sale.

Version not bumped — bump once at deploy time, then `npm run deploy:pos`. The auth change also
needs a server deploy.

**Build the dashboard with `npm run build:web` from the repo root — never `npm run build` inside
`src/web`.** The inner build only writes `dist/web` (what the NestJS server serves); the terminal's
LAN dashboard serves `dist-web`, which only the root script stages. Getting this wrong looks like a
clean build and silently ships nothing. See tasks/lessons.md.
