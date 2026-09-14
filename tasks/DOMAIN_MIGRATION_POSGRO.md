# Domain Migration — `bobur-dev.uz` → `posgro.uz`

Written 2026-09-14 on branch `dev`. Decisions 1, 2, 5 and 6 are **settled** (§10); 3, 4 and 7 have
recommended defaults recorded there.

**Status: Phases 1 and 2 complete (2026-09-14).** `api`, `web` and `panel.posgro.uz` are live over
HTTPS, serving the same backend and the same releases directory as `pos.bobur-dev.uz`, verified
byte-identical. The old host now redirects its two human-facing paths to the new dashboard and
keeps serving `/api/`, `/releases/` and `/uploads/` unchanged for the fleet.

**Still no application code has changed, and no terminal points at the new hosts.** Everything so
far is nginx and DNS; `main` carries only the four infra commits.

Outstanding for you: the `CORS_ORIGINS` secret, the apex TTL, and — separately and more urgently
than this migration — `LICENSE_SIGNING_KEY` in the `ENV_FILE` secret, which blocks the 28 app
commits sitting on `dev`.

Next: Phase 3 — the panel app, the landing page, the dashboard's move to the root of its host
(vite `base` **and** `App.tsx` basename together), and the `handlers.ts:959` fix.

---

## 1. Target topology

| Host | Serves | Audience | TLS |
|---|---|---|---|
| `posgro.uz` (+ `www`) | Marketing landing page, "Login" button → `web.posgro.uz`. **Apex A record moves to the POS VPS.** | Public | needed |
| `web.posgro.uz` | Super-admin / store-owner React dashboard (`src/web`), **served at `/`, not `/web`** | Owners, super-admin | needed |
| `panel.posgro.uz` | Public download portal: latest POSGRO installer, printer drivers, scale tools, utilities. UZ/RU + dark/light. Also hosts `/releases/` (updater feed). | Anyone (cashiers, installers, resellers) | needed |
| `api.posgro.uz` | **The POS JSON API — `VPS_API_URL=https://api.posgro.uz/api`** | Electron tills | needed |
| `dev.{web,panel,api}.posgro.uz` | Staging (Decision 7) | Us | needed |
| `pos.bobur-dev.uz` | **Legacy — stays alive indefinitely.** API proxy + `/releases/`, 301s for everything else. | Unmigrated tills | keep renewing |

---

## 2. How `VPS_API_URL` actually flows through the POS app

This is the trace you asked for. There are **four** layers, and the later ones win.

### 2.1 Build-time bake

```
.env.pos  (VPS_API_URL=...)
   ↓ loadEnv('pos', cwd, '')                          electron.vite.config.ts:24
   ↓ define: { 'process.env.VPS_API_URL': '"..."' }   (APP_ENV_KEYS, lines 22-30)
   ↓ literal substitution into dist-electron/main/index.js
process.env.VPS_API_URL                               // inside the packaged main process
```

`APP_ENV_KEYS` in `electron.vite.config.ts:22` is the allow-list. `VPS_API_URL` is on it.
Only the **main** process gets these defines — the preload and renderer do not.

### 2.2 Hardcoded fallback

`src/main/config/app-config.ts:46`

```ts
vpsApiUrl: process.env.VPS_API_URL || 'https://pos.bobur-dev.uz/api',
```

Also echoed in the validation message at `app-config.ts:84`. `getAppConfig()` memoises the object;
`updateConfig()` mutates it in place; `resetConfig()` clears it.

### 2.3 Runtime override from SQLite — **this is the one that wins**

`src/main/index.ts:141-155` (`launchMainApp`)

```ts
const localConfig = await prisma.localConfig.findUnique({ where: { id: "config" } });
if (localConfig) {
  updateConfig({ terminalId, storeId, vpsApiUrl: localConfig.apiUrl });   // ← line 150
}
```

`local_config.api_url` is a `TEXT NOT NULL` column (`sqlite-client.ts:136`). It is written once at
setup (`setup-handlers.ts:182`, pinned to the URL setup actually authenticated against) and
thereafter only by the operator.

**Consequence — already recorded in memory as `pos_api_url_override.md`: editing `.env.pos` and
rebuilding does NOT move an existing terminal. The stored `api_url` overrides the baked value on
every launch.** A terminal only follows `.env.pos` if its SQLite has no `local_config` row, i.e. a
fresh install.

### 2.4 Operator-changeable at runtime — yes, confirmed

`config:updateLocalConfig` — `src/main/ipc/handlers.ts:970-1018`:

1. Reads `previousApiUrl`.
2. If changed, calls `probeApiUrl(newUrl)` → `GET {url}/health`. A **definitive** "this is not a
   POS server" rejects with `settings.apiUrlNotPosServer`. Unreachable does **not** block (a
   technician must be able to configure before the network is up).
3. Writes `local_config`, calls `updateConfig({ vpsApiUrl })`.
4. **Clears the server token** (`clearServerToken()` + deletes `system_settings.server_token`) —
   a token minted by the old server is meaningless to the new one.
5. Returns `requiresRestart` only when `storeId` changed.

UI entry points:
- `src/renderer/pages/Login/TerminalAccessBar.tsx:415-455` — the padlock → "server" dialog on the
  login screen. Blocked on satellites (they never talk to the VPS).
- `src/renderer/pages/Setup/SetupWizard.tsx:223` — `DEFAULT_SERVER_URL` for first-launch setup.

**So yes: you can repoint a live production till from its own screen without a rebuild.** That is
the migration lever for the field. See Phase 4.

### 2.5 Who consumes `vpsApiUrl` / `localConfig.apiUrl`

| Consumer | File |
|---|---|
| Login / token refresh | `src/main/ipc/auth-handlers.ts:98` |
| Product pull-sync | `src/main/sync/products-sync.ts` |
| Sales upload queue | `src/main/sync/upload-sync.ts`, `sales-sync.ts` |
| Smena sync | `src/main/sync/smena-sync.ts` |
| Marking-code checks | `src/main/ipc/marking-codes-handlers.ts`, `src/main/marking/circulation-check.ts` |
| Subscription / licence renew | `src/main/license/license.ts:108` → `{apiUrl}/licenses/renew`, `{apiUrl}/store-config` |
| Login banner fetch | `src/main/ipc/banner-handlers.ts` |
| Web-dashboard QR on the till | `src/main/ipc/handlers.ts:958` — `apiUrl.replace(/\/api\/?$/,'') + '/web'` ⚠️ |
| Diagnostics dump | `src/main/index.ts:129-135` |

⚠️ `handlers.ts:959` **derives the dashboard URL from the API URL by string surgery.** If the
dashboard moves to its own host (`web.posgro.uz`) this breaks — it would produce
`https://api.posgro.uz/web`. Must become an explicit, separately configured dashboard URL.

### 2.6 What does **not** follow `VPS_API_URL`

- **Auto-updater feed** — `src/main/updater/auto-updater.ts:9` is a hardcoded literal
  `https://pos.bobur-dev.uz/releases/`. Independent of the API URL entirely.
- **`electron-builder` publish target** — `electron-builder.config.js:80`.
- **Online probe** — `src/main/ipc/handlers.ts:36` `DEFAULT_ONLINE_PROBE_URL`.

---

## 3. Complete inventory of hardcoded references

### 3.1 Electron POS app (ships to customers — requires a release)

| File:line | Current | Action |
|---|---|---|
| `src/main/config/app-config.ts:46` | `https://pos.bobur-dev.uz/api` fallback | → `https://api.posgro.uz/api` |
| `src/main/config/app-config.ts:84` | same, in error text | → `https://api.posgro.uz/api` |
| `src/main/updater/auto-updater.ts:9` | `https://pos.bobur-dev.uz/releases/` | → `https://panel.posgro.uz/releases/` |
| `src/main/ipc/handlers.ts:36` | `DEFAULT_ONLINE_PROBE_URL` | → `https://api.posgro.uz` |
| `src/main/ipc/handlers.ts:959` | `apiUrl.replace(/\/api\/?$/,'') + '/web'` | **must change** — see §7.3.1 |
| `src/main/database/seed.ts:20` | `VPS_API_URL \|\| 'https://pos.bobur-dev.uz/api'` | → `https://api.posgro.uz/api` |
| `src/renderer/pages/Setup/SetupWizard.tsx:223` | `DEFAULT_SERVER_URL` | → `https://api.posgro.uz/api` |
| `src/renderer/pages/Login/TerminalAccessBar.tsx:431` | placeholder | → `https://api.posgro.uz/api` |
| `src/renderer/i18n/locales/ru.json:853` | `settings.apiUrlHint` example | → `https://api.posgro.uz/api` |
| `src/renderer/i18n/locales/uz.json:841` | `settings.apiUrlHint` example | → `https://api.posgro.uz/api` |
| `electron-builder.config.js:80` | `publish.url` | → `https://panel.posgro.uz/releases/` |
| `.env.pos` (untracked) | `VPS_API_URL` | → `https://api.posgro.uz/api` |
| `.env.example:28` | sample | → `https://api.posgro.uz/api` |
| **new** — `src/main/database/api-url-migration.ts` | — | one-shot repoint, §7.4.1 |

### 3.2 Server / infra

| File:line | Current | Action |
|---|---|---|
| ~~`nginx.conf`~~ → `nginx/sites/pos.bobur-dev.uz.conf` | `pos.bobur-dev.uz` server_name + cert paths | ✅ **done** — moved verbatim; new hosts added as `nginx/sites/*.conf` |
| `nginx.staging.conf` (same lines) | `dev.pos.bobur-dev.uz` | rewrite |
| ~~`scripts/deploy/production.sh:12`~~ | `NGINX_SITE=...` | ✅ **done** — now loops over `nginx/sites/*.conf` with an ACME-stub fallback |
| `scripts/deploy/staging.sh:13` | `NGINX_SITE="dev.pos.bobur-dev.uz"` | → new |
| `src/server/main.ts:22-24` | `useStaticAssets(webDist, { prefix: '/web' })` | keep `/web` on the origin; nginx maps `web.posgro.uz/` → `/web` (§7.3.2) |
| `src/server/main.ts:87-91` | SPA fallback bound to `/web` | unchanged (see §7.3.2) |
| `src/server/main.ts:36` | `CORS_ORIGINS` split | add all new hosts |
| `src/web/vite.config.ts:29,33,37` | dev proxy → `dev.pos.bobur-dev.uz` | → `https://dev.api.posgro.uz` |
| `src/web/vite.config.ts:46` | `base: '/web/'` | → `base: '/'` (§7.3.2) |
| `src/server/modules/telegram/telegram.service.ts:170` | `WEB_APP_URL` default | → `https://web.posgro.uz` |
| `src/telegram-bot/index.ts:97` | `WEB_APP_URL` default | → `https://web.posgro.uz` |
| `.env.telegram.example:13` | `WEB_APP_URL` | → `https://web.posgro.uz` |
| `scripts/upload-release.js:57` | cosmetic "live at" log | → panel URL |
| `scripts/seed-sqlite.ts:44` | dev seed `apiUrl` | → new API base |
| `nginx/sites/pos.bobur-dev.uz.conf:48` | `location = /` → `301 /web` | Phase 2 — becomes a 301 to `https://posgro.uz` |

### 3.3 Docs (update, not load-bearing)

`CLAUDE.md` (105, 117, 126, 136, 140, 152), `POSGRO_ANALYSIS.md`, `README.md`,
`MULTI_STORE_SETUP.md`, `docs/telegram-bot-integration.md`, `tasks/*.md`.

### 3.4 Confirmed safe — no action

- **Uploaded images.** `site-config.controller.ts:170` returns `/uploads/${filename}` — **relative**.
  Banner records in PostgreSQL hold no absolute host. Nothing to rewrite in the DB.
- **Web dashboard API base.** `src/web/src/api/client.ts:21` — `import.meta.env.VITE_API_URL ?? "/api"`,
  i.e. same-origin by default. Fine while the dashboard is proxied to the API; becomes a
  **required** env var if `web.posgro.uz` and the API are different origins (Decision 2 → CORS).
- **Signed licences.** `src/main/license/license.ts` verifies a signature over store identity, not a
  hostname. Moving domains does not invalidate any issued licence.

---

## 4. DNS

Current `posgro.uz` records (from your screenshot):

```
posgro.uz.        A      45.138.159.4      ← NOT the POS VPS
www.posgro.uz.    CNAME  posgro.uz.
ftp.posgro.uz.    A      45.138.159.4
posgro.uz.        MX     1 SMTP.GOOGLE.COM.
posgro.uz.        TXT    "v=spf1 include:_spf.google.com ~all"
```

The POS VPS is **144.91.121.160**. `45.138.159.4` is the registrar's shared hosting, given the
`ftp.` record. **Decision 5: everything moves to the POS VPS.**

> ⚠️ **Edit this zone in Cloudflare, not in the registrar's DNS panel.** `posgro.uz` is delegated
> to `jerry`/`frida.ns.cloudflare.com` (Cloudflare is the SOA primary). Records added in the
> registrar's own panel sit in a zone nothing queries — confirmed 2026-09-14, when six records
> added there returned NXDOMAIN straight from the authoritative servers. `bobur-dev.uz` is on
> `ns1/ns2.eskiz.uz`, which is where the habit comes from.
>
> Add every record as **DNS only (grey cloud)**. Proxying imposes a 100 MB request-body cap on the
> free plan (breaking the Phase 3 driver uploads), moves TLS termination off our Let's Encrypt
> certs, and puts an edge cache in front of `/releases/latest.yml`. Details in
> [`nginx/README.md`](../nginx/README.md#step-1--dns-manual-in-cloudflare).

### Final record set

```
posgro.uz.            A      144.91.121.160   ← CHANGED from 45.138.159.4
www.posgro.uz.        CNAME  posgro.uz.       ← unchanged, follows the apex
web.posgro.uz.        A      144.91.121.160   ← new
panel.posgro.uz.      A      144.91.121.160   ← new
api.posgro.uz.        A      144.91.121.160   ← new
dev.api.posgro.uz.    A      144.91.121.160   ← new, staging
dev.web.posgro.uz.    A      144.91.121.160   ← new, staging
dev.panel.posgro.uz.  A      144.91.121.160   ← new, staging
ftp.posgro.uz.        A      45.138.159.4     ← LEFT ALONE
posgro.uz.            MX     1 SMTP.GOOGLE.COM.   ← DO NOT TOUCH
posgro.uz.            TXT    "v=spf1 ..."         ← DO NOT TOUCH
```

Notes:
- Mail is unaffected. `MX` and `SPF` are independent of the `A` record — Google Workspace keeps
  delivering through the apex change.
- `ftp.posgro.uz` still points at the old hosting. Leave it until you have confirmed nothing you
  need lives there; it costs nothing to keep.
- **Add the subdomains first, verify, and flip the apex last.** Subdomain additions are pure
  additions and cannot break anything currently working; the apex flip is the only step with a
  blast radius.
- **Before flipping the apex, lower its TTL to 300 at least 24h in advance**, then raise it back
  to 3600 once the new site is confirmed good. This is what makes the rollback in §11 fast.
- Check what is actually on the old apex before cutting it over, so you know what you are
  replacing: `curl -sI https://posgro.uz` and `curl -sI http://45.138.159.4`.

---

## 5. Nginx & TLS

✅ **Done.** One file per host so certs and roots stay independent — see
[`nginx/README.md`](../nginx/README.md) for the full runbook:

```
nginx/sites/posgro.uz.conf         → landing page, static root /var/www/posgro-landing
nginx/sites/web.posgro.uz.conf     → dashboard at /, + /api + /uploads proxied (same-origin)
nginx/sites/panel.posgro.uz.conf   → download portal at /, + /releases/ + /downloads/
nginx/sites/api.posgro.uz.conf     → /api/*, /uploads/, /health
nginx/sites/pos.bobur-dev.uz.conf  → legacy, moved verbatim; 301s added in Phase 2
nginx/snippets/posgro-ssl.conf     → TLS params + security headers
nginx/snippets/posgro-proxy.conf   → proxy headers and timeouts
```

The **filename is the certificate name** — the deploy script looks for
`/etc/letsencrypt/live/<basename>/`. `scripts/deploy/production.sh` now loops over the directory
and installs an HTTP-only ACME stub for any host whose cert is not issued yet, because one missing
`fullchain.pem` fails `nginx -t` for the entire server.

Certificates:

```bash
sudo certbot --nginx -d posgro.uz -d www.posgro.uz
sudo certbot --nginx -d web.posgro.uz
sudo certbot --nginx -d panel.posgro.uz
sudo certbot --nginx -d api.posgro.uz
sudo certbot --nginx -d dev.api.posgro.uz -d dev.web.posgro.uz -d dev.panel.posgro.uz
```

Run these **after** DNS has propagated (`dig +short web.posgro.uz` must return 144.91.121.160) —
HTTP-01 validation fails otherwise. Keep the existing `pos.bobur-dev.uz` cert renewing; it is
load-bearing for Phase 2.

Other nginx notes:
- `client_max_body_size 25M` (`nginx/sites/pos.bobur-dev.uz.conf:45`) is far too small for installer/driver uploads on
  the panel. Raise to **512M** on the upload route only.
- `/releases/` currently aliases `/home/bobur/releases/`. If downloads move to `panel.posgro.uz`,
  that alias moves with it — and `pos.bobur-dev.uz/releases/` must keep serving the same directory
  (see Phase 2).
- `location = / { return 301 /web; }` gets deleted once `/` belongs to the landing page.

---

## 6. The one thing that can brick the field

**Every installed till has `https://pos.bobur-dev.uz/api` written into its own SQLite
`local_config.api_url`, and every installed build has `https://pos.bobur-dev.uz/releases/` compiled
into its updater.**

If `pos.bobur-dev.uz` stops resolving:
- tills cannot sync, cannot log in online, cannot renew their licence → after the offline grace
  window they start blocking;
- and they cannot receive the update that would have fixed it, because the update feed is on the
  dead host.

**Therefore: `pos.bobur-dev.uz` must keep working — DNS, cert, and `/releases/` — until every
terminal is confirmed migrated.** Budget for keeping it alive at least 6 months, and treat the
domain as non-expendable infrastructure, not a legacy alias.

Safest order: **new hosts up → ship a release that points at them → migrate tills → only then even
consider retiring the old host.**

---

## 7. Phased plan

### Phase 0 — Decisions (blocking)
Answer §10. Lower `posgro.uz` apex TTL to 300 if the apex is moving.

### Phase 1 — Stand up the new hosts alongside the old (no client change)

**Configs written 2026-09-14. Runbook: [`nginx/README.md`](../nginx/README.md).**

| | Step | Who |
|---|---|---|
| ☑ | Add `A` records for `api`, `web`, `panel`, `dev.*` → 144.91.121.160, **in Cloudflare**, grey cloud | done 2026-09-14, all six verified authoritative |
| ☑ | Split nginx into `nginx/sites/*.conf` + `nginx/snippets/` | done |
| ☑ | Teach `scripts/deploy/production.sh` to loop the directory, gated on `nginx/sites-live.txt` | done |
| ☑ | Cherry-pick the infra commits onto `main` (`114cf77`, `46221ff`) — **not** a full `dev` merge, see below | done |
| ☑ | Deploy #1 — ACME stubs for the four new hosts, legacy untouched | done |
| ☑ | `certbot certonly --webroot --cert-name <host>` for `api`, `web`, `panel` | done, expire 2026-12-13 |
| ☑ | Promote those three in `nginx/sites-live.txt`, deploy #2 | done |
| ☑ | Verify both feeds and both APIs are byte-identical | **verified** — see below |
| ☐ | Set the apex TTL to 5 min (do **not** change its value yet) | **you**, Cloudflare |
| ☐ | Add the new hosts to `CORS_ORIGINS` in the `ENV_FILE` GitHub secret | **you** |

### Phase 1 verification, 2026-09-14

| Check | Result |
|---|---|
| `api.posgro.uz/api/health` · `/health` | 200 · 200 (the `= /health` → `/api/health` fix works) |
| `web.posgro.uz/web/` + its `/web/assets/*.js` | 200 + 200 (1.25 MB) — **this is the working dashboard URL today** |
| `web.posgro.uz/` (root) | 200, but **renders blank** — see the correction below |
| `web.posgro.uz/some/deep/route` | 200 — SPA fallback serves index.html |
| `panel.posgro.uz/` · `/releases/latest.yml` | 200 · 200 |
| `/uploads/banner-*.jpg` over **both** hosts | 200 / 1 507 524 bytes on each — identical |
| Updater feed, old vs new host | **byte-identical** (v1.28.0) |
| `/api/health`, old vs new host | **byte-identical** |
| `pos.bobur-dev.uz` throughout | 200 — never interrupted |

**Correction (found during Phase 2):** the Phase 1 checks above prove nginx *serves* the dashboard
at the root, not that the app *mounts* there. It does not. `src/web/src/App.tsx:67` pins
`BrowserRouter basename="/web"` — verified as `basename:"/web"` inside the deployed bundle — so at
`/` the router matches no route and renders null. **The working dashboard URL is
`https://web.posgro.uz/web/`.** Phase 3 must change the vite `base` **and** that basename together.
Lesson for the rest of this migration: an HTTP 200 says a file was served; it says nothing about
whether a client-side app rendered.

**Only the two infra commits went to `main`.** `main` was 28 commits behind `dev`, and those 28
include the licence enforcement (`bb0fcb2`, `77ecccd`, `5d22ea6`) while `LICENSE_SIGNING_KEY` is
**absent from the production `.env`** — shipping them would start the countdown on every till
(see `subscription_license_rollout` in memory). They stay on `dev` until that key is in the
`ENV_FILE` secret and the release is made deliberately. No application code changed in Phase 1.

The new hosts serve the **same** backend and the **same** `/home/bobur/releases/` directory as
`pos.bobur-dev.uz`. Both hostnames answer; nothing in the field changes.

Three things that make the first deploy safe:
- A host gets its real config only when listed in `nginx/sites-live.txt`; otherwise an HTTP-only
  ACME stub. The real config names a `fullchain.pem` that does not exist until certbot has run,
  and **one missing certificate fails `nginx -t` for the whole server**, which would take the live
  API down.
- **The gate is a manifest, not a filesystem probe.** The deploy runs as `bobur` and
  `/etc/letsencrypt/live` is `drwx------ root:root`, so `[ -d /etc/letsencrypt/live/$host ]` is
  false for *every* host — including live ones. The first draft of this script probed that way and
  would have stubbed `pos.bobur-dev.uz`, taking the fleet offline on the next nightly cron. The
  script also refuses to overwrite any config already containing `ssl_certificate` that is missing
  from the manifest, so a forgotten entry cannot down a working host.
- `sites/pos.bobur-dev.uz.conf` is a byte-for-byte move of the old root `nginx.conf` — not
  refactored onto the shared snippets. The file the fleet depends on does not change in this phase.

`bobur`'s sudo is `NOPASSWD` for only `nginx`, `systemctl reload nginx`, `cp`, `ln`. No `mkdir`,
no `tee` — every privileged step is a `cp` into an existing directory. Keep it that way.

The apex (`posgro.uz`) is deliberately left pointing at 45.138.159.4 for now; its config ships but
will sit as a stub until the record moves. Flip it last.

**Ship nothing to tills in this phase.** Prove the new hosts serve identical bytes first.

### Phase 2 — Make the old host permanently redundant, not dead

Redundant for **people**, unchanged for **machines**. The split is the whole point.

| Path | Phase 2 | Why |
|---|---|---|
| `/api/*` | **unchanged proxy** | Every till in the field still has this host in `local_config.api_url`. A 301 on a POST carrying a bearer token is a bug you do not want to debug in a shop. |
| `/releases/` | **unchanged** | Compiled into every installed updater. It is the only channel that can deliver the release that repoints a till (§6). |
| `/uploads/` | **unchanged** | Tills resolve banner images against their own API origin (`banner-handlers.ts:85-88`). A redirect here blanks the login banner on unmigrated terminals. |
| `/web` | **301 → `https://web.posgro.uz$request_uri`** | Browser SPA only. `$request_uri` preserves path and query, so bookmarks and deep links survive. |
| `/` | **301 → `https://web.posgro.uz/web/`** | Was `301 /web`; same destination, now on the new host. |

The `/web` target **keeps the `/web` prefix**: the dashboard's router is pinned to it
(`basename="/web"`), so `web.posgro.uz/` renders nothing until Phase 3 moves it. Phase 3 changes
this to a bare host redirect.

Free side effect worth noting: the till's dashboard QR is built as `apiUrl` minus `/api` plus
`/web` (`handlers.ts:959`), which on an unmigrated terminal is exactly
`https://pos.bobur-dev.uz/web`. Scanning it now lands on the new dashboard — with no terminal
touched, no release, and no change to `handlers.ts` yet.

`/` points at `https://posgro.uz` once the landing page exists; not before, since the apex still
serves the old shared hosting.

#### Phase 2 verification, 2026-09-14 — **complete**

```
MACHINE PATHS (must never redirect)
  pos.bobur-dev.uz/api/health                200
  pos.bobur-dev.uz/releases/latest.yml       200
  pos.bobur-dev.uz/uploads/banner-*.jpg      200

HUMAN PATHS (must redirect, preserving path + query)
  pos.bobur-dev.uz/                    301 → https://web.posgro.uz/web/
  pos.bobur-dev.uz/web                 301 → https://web.posgro.uz/web
  pos.bobur-dev.uz/web/products?x=1    301 → https://web.posgro.uz/web/products?x=1

CHAIN   one 301, then 200 — terminates, no loop
FEEDS   latest.yml md5 identical on pos.bobur-dev.uz and panel.posgro.uz
STAGING dev.pos.bobur-dev.uz/api/health 200 — untouched
```

One operational consequence: `web.posgro.uz` is a different origin from `pos.bobur-dev.uz`, so the
dashboard session in `localStorage` does not travel with the redirect. Everyone signs in once more
on the new host.

### Phase 3 — Build the new surfaces
- `panel.posgro.uz` (§8).
- Landing page (§9).
- Super-admin "Tools & Downloads" management page (§8.3).
- Move the dashboard to the root of its host (§7.3.2).
- Fix `handlers.ts:959` (§7.3.1).

#### 7.3.1 The till's dashboard QR must stop guessing

`src/main/ipc/handlers.ts:958-959` builds the "open the dashboard on your phone" QR by stripping
`/api` off the terminal's own API URL:

```ts
url = `${localConfig.apiUrl.replace(/\/api\/?$/, "")}/web`;
```

With the API on `api.posgro.uz` and the dashboard on `web.posgro.uz`, that yields
`https://api.posgro.uz/web` — a 404 on a QR code a shop owner scans with their phone.

Replace the derivation with an explicit value, resolved in this order:

1. `local_config.web_url` if the operator set one (new nullable column, `sqlite-client.ts`
   migration in the same style as `main_terminal_url` at line 807);
2. the `webUrl` returned by `GET /store-config` — the server already answers this endpoint
   (`license.ts:126`) and knows its own dashboard address, so a future move needs no client release;
3. the compile-time default `https://web.posgro.uz`.

The `OFFLINE_ONLY` branch above it (the terminal serving its own dashboard on the LAN) is
unaffected — leave it exactly as it is.

#### 7.3.2 Dashboard at `/` instead of `/web`

Cheapest correct split: **nginx owns the public path, NestJS keeps serving at `/web` internally.**
That way the dashboard moves without touching the SPA fallback or risking the LAN/OFFLINE_ONLY
dashboard, which is served by the terminal's own local server and must keep working at `/web/`.

- `src/web/vite.config.ts:46` — `base: '/web/'` → `base: '/'` so asset URLs are host-root-relative.
- `src/server/main.ts:22-24, 87-91` — unchanged; still `prefix: '/web'`.
- `nginx/web.posgro.uz.conf`:
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3001/web/;   # trailing slash matters
      # ... standard proxy headers
  }
  # Same-origin API and uploads — Decision 3. No CORS, no cross-origin auth.
  location /api/     { proxy_pass http://127.0.0.1:3001; ... }
  location /uploads/ { alias /home/bobur/posgro/uploads/; expires 7d; }
  ```
- `src/web/src/api/client.ts:21` — **unchanged.** `VITE_API_URL ?? "/api"` keeps resolving
  same-origin, so tokens, cookies and CORS all stay exactly as they are today.

⚠️ Verify the LAN dashboard (`OFFLINE_ONLY` store, terminal-served at `http://<ip>:<port>/web/`)
still loads after the `base` change — a root-relative base is correct for `web.posgro.uz` but the
local server serves under `/web/`. If it breaks, the local server needs a rewrite rule of its own,
or the build produces two bases. **Test this on staging before shipping.**

### Phase 4 — Ship the POS release and migrate the field
1. Change every reference in §3.1; set `.env.pos`; bump the version (**one bump at deploy**, per
   `version_bump_at_deploy.md`, not one per change).
2. `npm run deploy:pos` — uploads to `/home/bobur/releases/`, which **both** hosts serve. Old
   terminals fetch it from `pos.bobur-dev.uz/releases/`, which still works. This is the critical
   property: the migrating update is delivered over the old channel.
3. After the update installs, each terminal still has the **old** `api_url` in SQLite (§2.3).
   The one-shot migration in §7.4.1 moves it; the padlock → server dialog remains available for
   manual override, and for your first hand-migrated production store.
4. Track migration: add the terminal's `api_url` to whatever it already reports to the
   `/terminals` heartbeat, so the super-admin dashboard can show "N tills still on the old host."

#### 7.4.1 One-shot `api_url` repoint (Decision 6)

New module, `src/main/database/api-url-migration.ts`, called from `launchMainApp()` in
`src/main/index.ts` **after** `getPrismaClient()` and **before** the `updateConfig(...)` at line
150, so the rewritten value is the one loaded into the in-memory config on that same boot.

```ts
const LEGACY_API_URLS = [
  'https://pos.bobur-dev.uz/api',
  'https://pos.bobur-dev.uz/api/',
  'https://pos.bobur-dev.uz',
];
const NEW_API_URL = 'https://api.posgro.uz/api';
```

Rules, all of them load-bearing:
- **Exact match only.** Normalise trailing slash and lowercase the host, then compare against the
  list. Anything else — a LAN address, a self-hosted server, a typo'd variant — is left untouched.
  Never pattern-match on a substring.
- **Satellites are skipped entirely.** `isMain === false` terminals never talk to the VPS
  (`src/main/lan/role.ts`); rewriting their config is meaningless and risks confusing pairing.
- **Clear `server_token`** the same way `config:updateLocalConfig` does (`handlers.ts:1005-1007`):
  `clearServerToken()` plus `systemSetting.deleteMany({ where: { key: 'server_token' } })`.
  A token from the old host is not valid at the new one.
- **No `/health` probe.** `probeApiUrl` is right for operator input; here a flaky first boot must
  not leave the till stranded on a host we are trying to retire. The value is one we control.
- **Idempotent and self-silencing.** After the rewrite the old value no longer matches, so it
  cannot run twice. Record `api_url_migrated_at` in `system_settings` anyway — it is what tells you,
  from a support log, whether a given till moved and when.
- **Log loudly**: `[migration] api_url repointed pos.bobur-dev.uz → api.posgro.uz`. This line in a
  terminal's electron-log is the evidence you will want when a shop calls.
- **Unit test it** — `api-url-migration.test.ts` next to `license.test.ts`, covering: exact legacy
  match rewrites; a custom/LAN URL is untouched; a satellite is untouched; the token is cleared;
  running twice changes nothing.

Because the rewrite fires on the first launch **after** the update, and the update is delivered
over the old host's `/releases/` (which keeps serving), the whole chain works without anyone
visiting a shop.

### Phase 5 — Staging
Mirror everything on `dev.api` / `dev.web` / `dev.panel.posgro.uz` (Decision 7). Update
`src/web/vite.config.ts` proxy targets and `scripts/deploy/staging.sh`. Do Phases 1–4 on staging
first, end to end — including a real Electron build with
`VPS_API_URL=https://dev.api.posgro.uz/api`, a real sync, and the one-shot migration firing against
a SQLite seeded with the legacy URL.

### Phase 6 — Retire (not before every till reports the new host)
Keep `pos.bobur-dev.uz` resolving and renewing indefinitely regardless. Retirement means "no longer
the documented address", not "switched off".

---

## 8. `panel.posgro.uz` — download portal spec

### 8.1 What it is
A small public single-page site. No login. Two things on it:
1. **Download POSGRO** — the latest installer, version + release date + size, read live from
   `/releases/latest.yml`.
2. **Tools** — printer drivers, scale utilities (RLS1000), fiscal/VCR tools, manuals. Everything
   here is **uploaded from the super-admin dashboard**, never committed to the repo.

### 8.2 Recommended implementation
A **new Vite + React app at `src/panel/`**, built to `dist/panel`, served by the existing NestJS at
a `/panel` static prefix and exposed at the root of `panel.posgro.uz` by nginx — the same
nginx-owns-the-public-path arrangement as the dashboard (§7.3.2): `base: '/'` in its vite config,
`proxy_pass http://127.0.0.1:3001/panel/;` in nginx.

Reasons for a separate app rather than a route inside `src/web`:
- `src/web` is behind a login and ships the whole admin bundle; the panel must be public and small.
- Different base path, different SEO and caching posture.
- It can still reuse what exists: `@theme` (`src/renderer/theme/themes.ts` already exports
  `lightTheme` **and** `darkTheme`), `@i18n` (`src/renderer/i18n/locales/{ru,uz}.json`), and
  `@components/common`. The aliases in `src/web/vite.config.ts:12-21` are the template to copy.

Requirements you specified:
- **Languages:** UZ + RU. Add a `panel` namespace to the two existing locale files rather than a
  third locale system. Persist choice in `localStorage`; default from `navigator.language`,
  falling back to **UZ** (public-facing site in Uzbekistan) — note the dashboard defaults to RU.
- **Theme:** dark/light toggle. `darkTheme` already exists — wire it through the existing
  `ThemeProvider`. Default should follow `prefers-color-scheme`, with an explicit override
  persisted in `localStorage`.

### 8.3 Backend: a "Downloads" module
New NestJS module, `src/server/modules/downloads/`:

```
GET    /api/downloads               public        → list of published tools
GET    /api/downloads/latest-app    public        → version, size, url, releasedAt (from latest.yml)
POST   /api/downloads               SUPER_ADMIN   → multipart upload
PUT    /api/downloads/:id           SUPER_ADMIN   → edit metadata / reorder / publish toggle
DELETE /api/downloads/:id           SUPER_ADMIN
```

New PostgreSQL model (needs a migration — staging first, per CLAUDE.md):

```prisma
model DownloadItem {
  id        String   @id @default(cuid())
  slug      String   @unique
  titleRu   String
  titleUz   String
  descRu    String?
  descUz    String?
  category  String          // DRIVER | TOOL | MANUAL | OTHER
  fileName  String
  filePath  String          // relative, e.g. /downloads/xprinter-v3.2.zip
  fileSize  Int
  mimeType  String
  version   String?
  iconUrl   String?
  sortOrder Int      @default(0)
  published Boolean  @default(true)
  downloads Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Storage: a **new** `DOWNLOADS_DIR` (default `/home/bobur/posgro/downloads`), bind-mounted like
`uploads` in `docker-compose.yml`. Keep it separate from `uploads/` (product and banner images) —
different size profile, different retention, different nginx caching.

Follow the existing multer pattern in `site-config.controller.ts:8-10,160-171`, but:
- raise the size limit and the nginx `client_max_body_size` on that route to **512M**;
- **allow-list** extensions (`.exe .msi .zip .pdf .rar .7z`) — never accept arbitrary uploads;
- store the path **relative**, exactly as banners do (§3.4), so the next domain move is free.

Admin UI: a new page at `src/web/src/pages/Admin/DownloadsPage.tsx`, next to `LoginBannerPage.tsx`.

### 8.4 Layout recommendation
```
┌──────────────────────────────────────────────────────┐
│  POSGRO          Tools   Docs   Support    UZ|RU  ☾  │
├──────────────────────────────────────────────────────┤
│                                                      │
│     POSGRO kassa dasturi                             │
│     [ ⬇ Yuklab olish  v1.14.2 · 94 MB · Windows ]    │
│     Oxirgi yangilanish: 14.09.2026                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Drayverlar        Utilitalar        Qollanmalar     │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐    │
│  │ 🖨 Xprinter│      │ ⚖ RLS1000│      │ 📄 Manual│    │
│  │  v3.2 ⬇  │      │  v1.4 ⬇  │      │  PDF ⬇   │    │
│  └──────────┘      └──────────┘      └──────────┘    │
└──────────────────────────────────────────────────────┘
```
Hero = one unmistakable primary download. Everything else is a card grid grouped by `category`,
each card showing size and version so a shop on a slow connection knows what it is committing to.

---

## 9. `posgro.uz` landing page — recommendations

You are designing this in Claude Design; these are the constraints that matter for wiring it up.

**Must-haves for integration:**
- A **Login** button in the header → `https://web.posgro.uz`. Also put one in the footer.
- A **Download** CTA → `https://panel.posgro.uz`. Keep it visually secondary to Login; owners
  arriving at the site are usually logging in, not installing.
- UZ/RU toggle and the same dark/light treatment as the panel, so the three sites feel like one
  product.
- Static output only — no API calls. It must stay up even if the API is down, which is exactly
  when people will visit looking for support contact details.

**Content recommendations (Uzbek grocery-retail market):**
1. Hero — one sentence on what it is, in Uzbek first. Screenshot of the till screen, not an
   abstract illustration.
2. **Offline-first** as the headline feature. Internet drops in Uzbek shops; "works with no
   internet, syncs when it returns" is your strongest single claim, and it is true.
3. Compliance block — fiscal receipts (REGOS/OFD), marking codes (Asl-Belgisi), MXIK/tasnif. Shop
   owners buy POS software to stay legal first and to count money second.
4. Hardware — scales (Rongta), thermal and label printers, scanners.
5. Pricing — Starter / Pro / VIP. The prices already live in `site-config`
   (`SubscriptionPlanPrices`); for a static page, hardcode them and accept a manual edit when they
   change, or fetch from the site-config endpoint with a hardcoded fallback.
6. Contact — Telegram (`@Bobur_AbuAbdulaziz`) and a phone number. Telegram converts far better than
   a contact form here.

**Hosting:** static files on the POS VPS under nginx (`/var/www/posgro-landing`), deployed by the
same pipeline. Do not put it behind NestJS — it has no reason to share a runtime with the API.
The apex `A` record moves to 144.91.121.160 as part of Phase 1 (§4); flip it last.

---

## 10. Decisions

### Settled (2026-09-14)

| # | Decision | Answer |
|---|---|---|
| 1 | API host | **`api.posgro.uz`** — `VPS_API_URL=https://api.posgro.uz/api`. Marketing uptime is decoupled from till uptime. |
| 2 | Dashboard path | **Root of `web.posgro.uz`.** `base: '/'` in vite, nginx maps `/` → the Nest `/web` prefix (§7.3.2). |
| 5 | Landing page host | **Repoint the apex to the POS VPS** (144.91.121.160). Static files under nginx, same deploy pipeline. `MX`/`TXT`/`ftp.` untouched. |
| 6 | Till migration | **Automatic one-shot + manual override.** Exact-match rewrite on boot, clears the server token, logged, idempotent (§7.4.1). |

### Defaults I have assumed — tell me if you want them different

| # | Question | Assumed answer |
|---|---|---|
| 3 | Is the dashboard cross-origin from the API? | **No.** `web.posgro.uz` proxies `/api` and `/uploads` to the same backend, so `src/web` stays same-origin: no `VITE_API_URL`, no CORS work, no credentialed cross-origin auth, no change to `client.ts`. This is why Decision 2 costs so little. |
| 4 | How long does `pos.bobur-dev.uz` live? | **Indefinitely.** Keep the DNS, the cert renewal, the API proxy and `/releases/`. It is the only delivery channel for the update that migrates a till, so it is infrastructure, not a legacy alias (§6). |
| 7 | Staging naming | **Three hosts** — `dev.api`, `dev.web`, `dev.panel.posgro.uz` — mirroring production exactly. One certbot run covers all three, so the saving from a single host is not worth losing prod parity. |

---

## 11. Rollback

Each phase is independently reversible until Phase 4 ships:

| Phase | Rollback |
|---|---|
| 1–3 | Delete the new nginx server blocks. The old host never stopped serving; nothing in the field ever pointed at the new hosts. |
| 4 | The previous installer is still in `/home/bobur/releases/` — re-upload it as `latest` and patch `latest.yml`. Tills that already ran the one-shot are on `api.posgro.uz`, which still works, so this is recovery from a *bad build*, not from the migration itself. |
| One-shot gone wrong | It only ever writes one known value, so the reverse is a single `UPDATE local_config SET api_url=...` — but the real safety net is that `api.posgro.uz` and `pos.bobur-dev.uz` serve the same backend from Phase 1 onward. Either value works. |
| DNS apex | Restore `A 45.138.159.4`. This is why the TTL drops to 300 first. |

The genuinely one-way step is customers learning the new address. Everything technical can be
walked back as long as `pos.bobur-dev.uz` is still answering.
