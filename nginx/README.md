# nginx — POSGRO host configs

One file per host in `sites/`, shared fragments in `snippets/`. Deployed by
`scripts/deploy/production.sh`; the full migration context is in
[`tasks/DOMAIN_MIGRATION_POSGRO.md`](../tasks/DOMAIN_MIGRATION_POSGRO.md).

| File | Host | Serves |
|---|---|---|
| `sites-live.txt` | — | Which hosts get their **real** config vs. an ACME stub |
| `sites/pos.bobur-dev.uz.conf` | `pos.bobur-dev.uz` | **Legacy. Do not retire.** API + `/releases/` for unmigrated tills |
| `sites/api.posgro.uz.conf` | `api.posgro.uz` | `/api/`, `/uploads/`, `/health` — the value of `VPS_API_URL` |
| `sites/web.posgro.uz.conf` | `web.posgro.uz` | Dashboard at `/`, same-origin `/api` |
| `sites/panel.posgro.uz.conf` | `panel.posgro.uz` | `/releases/`, `/downloads/`, portal (Phase 3) |
| `sites/posgro.uz.conf` | `posgro.uz`, `www` | Static landing page |

The filename **is** the certificate name: the deploy script looks for
`/etc/letsencrypt/live/<filename without .conf>/`. Keep them in step.

`sites/pos.bobur-dev.uz.conf` is a byte-for-byte move of the old root `nginx.conf`. It is
deliberately **not** refactored onto the shared snippets — it is the only thing standing between
the installed fleet and a dead POS, so it changes only when there is a reason.

---

## Step 1 — DNS (manual, **in Cloudflare**)

> ⚠️ **`posgro.uz` is delegated to Cloudflare** — `jerry.ns.cloudflare.com` /
> `frida.ns.cloudflare.com`, with Cloudflare as the SOA primary. The registrar's own DNS panel
> edits a zone that nothing queries; records added there have no effect. Verified 2026-09-14 after
> a first attempt in the registrar panel produced NXDOMAIN at the authoritative servers.
>
> This is unlike `bobur-dev.uz`, which is on `ns1/ns2.eskiz.uz` — hence the old habit.
>
> Add records at **Cloudflare dashboard → posgro.uz → DNS → Records**.

Add these `A` records. **Additions only — nothing here can break what is currently working.**

| Name | Type | Record | Proxy status |
|---|---|---|---|
| `api` | A | `144.91.121.160` | **DNS only** |
| `web` | A | `144.91.121.160` | **DNS only** |
| `panel` | A | `144.91.121.160` | **DNS only** |
| `dev.api` | A | `144.91.121.160` | **DNS only** |
| `dev.web` | A | `144.91.121.160` | **DNS only** |
| `dev.panel` | A | `144.91.121.160` | **DNS only** |

### Why DNS only (grey cloud), not Proxied

The apex is already grey — `posgro.uz` answers `45.138.159.4` directly rather than a Cloudflare
edge IP — so this matches what is there. Turning the orange cloud on breaks three assumptions this
directory is built around:

- **100 MB request-body cap on Cloudflare's free plan.** The Phase 3 downloads feature uploads
  drivers and installers through the dashboard, and these configs budget 512 MB for it. Proxied,
  those uploads are rejected at the edge before nginx sees them.
- **TLS terminates at Cloudflare.** The Let's Encrypt certs here would then cover only the origin
  leg, and a zone set to "Flexible" SSL speaks plain HTTP to the origin — which the `:80` blocks
  redirect to HTTPS, producing a redirect loop.
- **Edge caching of `/releases/latest.yml`.** That file must never be stale or terminals miss a
  release. The config sends `no-store`; an edge cache is one more layer that has to honour it.

The landing page (`posgro.uz`) is static and can go behind the orange cloud later if you want the
CDN. `api`, `web` and `panel` should stay grey.

**Do not change yet:**
- `posgro.uz` `A` → still `45.138.159.4`. The apex moves **last** (plan §4). Set its TTL to
  **5 min** now (Cloudflare's minimum explicit TTL) so the eventual flip — and its rollback —
  take five minutes, not an hour.
- `MX`, `TXT (SPF)` → never. Google Workspace mail is independent of the `A` record.
- `ftp.posgro.uz` → leave on the old hosting.

Verify before going further. Query the **authoritative** servers, not a resolver — a resolver can
hold a negative (NXDOMAIN) answer for the length of the zone's SOA minimum, which makes a correct
record look missing:

```bash
for h in api web panel dev.api dev.web dev.panel; do
  printf '%-24s %s\n' "$h.posgro.uz" "$(dig +short @jerry.ns.cloudflare.com $h.posgro.uz A)"
done
```

PowerShell equivalent:

```powershell
'api','web','panel','dev.api','dev.web','dev.panel' | ForEach-Object {
  $h = "$_.posgro.uz"
  $a = Resolve-DnsName $h -Type A -Server jerry.ns.cloudflare.com -EA SilentlyContinue |
       Where-Object Type -eq 'A'
  '{0,-24} {1}' -f $h, $(if ($a) { $a.IPAddress -join ',' } else { 'MISSING' })
}
```

All six must print `144.91.121.160`. `MISSING` here means the record is genuinely absent from the
live zone — check you are in the Cloudflare dashboard and not the registrar's DNS panel.

## Which config a host gets — `sites-live.txt`

A host listed in [`sites-live.txt`](sites-live.txt) gets its **real** config. Everything else gets
an HTTP-only **ACME bootstrap stub** that answers `/.well-known/acme-challenge/` and `503`s the
rest.

The real config names a `fullchain.pem` that does not exist until certbot has run, and **one
missing certificate fails `nginx -t` for the entire server** — which would take the live API down
with it. Hence the stub, and hence the deliberate three-step promotion below.

> **Why a manifest instead of detecting the certificate?** The deploy runs as `bobur`, and
> `/etc/letsencrypt/live` is `drwx------ root:root`. A filesystem probe like
> `[ -d /etc/letsencrypt/live/$host ]` is therefore false for **every** host, including ones that
> are live — so probing would have stubbed `pos.bobur-dev.uz` and dropped the whole fleet.
>
> As a second guard, the script refuses to overwrite a config that already contains
> `ssl_certificate` when the host is missing from the manifest: it warns and leaves it alone.
> Forgetting a manifest entry cannot take a working host offline.

### Sudo is narrow — keep it that way

`bobur` has `NOPASSWD` for exactly `/usr/sbin/nginx`, `/bin/systemctl reload nginx`,
`/usr/bin/cp`, `/usr/bin/ln` (plus two `chown`/`chmod` rules for `uploads/`). **No `mkdir`, no
`tee`, no `systemctl restart`.** Anything privileged the deploy needs must be a `cp` into a
directory that already exists. If you add a step that needs a new directory, create it by hand
once rather than widening sudo.

## Step 2 — First deploy: installs ACME stubs

Trigger the production deploy (GitHub Actions → *Deploy POSGRO Backend* → Run workflow), or on
the VPS directly:

```bash
cd ~/posgro && ./scripts/deploy/production.sh
```

None of the new hosts are in `sites-live.txt` yet, so each gets a stub:

```
  ✅ pos.bobur-dev.uz
  ⏳ api.posgro.uz — not in sites-live.txt, ACME stub installed
  ⏳ web.posgro.uz — not in sites-live.txt, ACME stub installed
  ⏳ panel.posgro.uz — not in sites-live.txt, ACME stub installed
  ⏳ posgro.uz — not in sites-live.txt, ACME stub installed
```

Production is untouched throughout: `pos.bobur-dev.uz` is in the manifest and gets exactly the
config it has today (the file is a byte-for-byte move of the old `nginx.conf`).

## Step 3 — Issue certificates

On the VPS, once the stubs are live:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d api.posgro.uz
sudo certbot certonly --webroot -w /var/www/certbot -d web.posgro.uz
sudo certbot certonly --webroot -w /var/www/certbot -d panel.posgro.uz
```

`certonly --webroot`, **not** `--nginx`: `--nginx` rewrites the config files in place, and the
next deploy would overwrite its edits, silently reverting TLS. `certonly` only writes to
`/etc/letsencrypt/` and leaves our configs alone.

Skip `posgro.uz` here — its apex still points elsewhere, so HTTP-01 cannot validate. It gets its
certificate after the apex flip.

## Step 4 — Promote and deploy again

Add the three hosts to [`sites-live.txt`](sites-live.txt), commit, and deploy:

```
pos.bobur-dev.uz
api.posgro.uz
web.posgro.uz
panel.posgro.uz
```

Each now gets its real config, `nginx -t` passes, and nginx reloads.

If `nginx -t` fails here, the script exits **before** reloading, so the running config is
untouched and the site stays up. The usual cause is a host promoted in the manifest whose
certificate was not actually issued — fix the manifest or run certbot, then deploy again.

## Step 5 — Verify

```bash
curl -sS -o /dev/null -w '%{http_code}  %{url_effective}\n' \
  https://api.posgro.uz/health \
  https://api.posgro.uz/api/health \
  https://web.posgro.uz/ \
  https://panel.posgro.uz/releases/latest.yml

# The decisive check: the updater feed must be identical over old and new hosts.
diff <(curl -sS https://pos.bobur-dev.uz/releases/latest.yml) \
     <(curl -sS https://panel.posgro.uz/releases/latest.yml) && echo "feeds identical"

# And the API must answer the same on both.
diff <(curl -sS https://pos.bobur-dev.uz/api/health) \
     <(curl -sS https://api.posgro.uz/api/health) && echo "api identical"
```

Expected: `200` for all four, and both diffs clean. `panel.posgro.uz/` returns the literal
`POSGRO panel` until Phase 3 — a `200` with that body is correct there, not a stand-in for a
missing site.

**Do not point any terminal at the new hosts yet.** Phase 1 ends here: the new hosts answer, the
old host is untouched, and nothing in the field has changed.

---

## Also required in Phase 1 — `CORS_ORIGINS`

`src/server/main.ts:36` reads `CORS_ORIGINS` from the environment. Add the new hosts to the
`ENV_FILE` **GitHub secret** (Settings → Secrets and variables → Actions), keeping the existing
values:

```
CORS_ORIGINS=https://pos.bobur-dev.uz,https://web.posgro.uz,https://api.posgro.uz,https://panel.posgro.uz,https://posgro.uz
```

The deploy writes `.env` from that secret, so this takes effect on the next deploy. Same-origin
requests from `web.posgro.uz` do not need it (that host proxies `/api` itself), but it keeps the
door open for a cross-origin tool and costs nothing.

---

## Gotchas

- **`limit_req_zone` names must be unique across all files.** Every file in `sites-enabled` is
  included into the same `http{}` block, so a duplicate zone name is a startup error. Legacy uses
  `pos_api`; `api.posgro.uz` uses `posgro_api`. Pick a new name for any new host.
- **`include snippets/...` resolves against the nginx prefix** (`/etc/nginx`), which is where the
  deploy script copies them.
- **`web.posgro.uz` works both before and after the Phase 3 `base` change** — see the comment at
  the top of that file. Do not delete its `location /web` block.
- **`api.posgro.uz` must keep serving `/uploads/`.** The terminal builds the banner image URL from
  its own API URL with `/api` stripped (`src/main/ipc/banner-handlers.ts:85-88`), so the images
  are fetched from the API host, not the dashboard host.
- **The app registers only `/api/health`** (`src/server/main.ts:85`). The legacy block's
  `location /health` proxies to `:3001/health` and has always returned 404; the new hosts proxy
  `= /health` to `/api/health` instead. Nothing depended on the broken one —
  `probeApiUrl()` asks for `${apiUrl}/health`, i.e. `/api/health`, via the `/api/` block.
- **Default server for unmatched `Host`/SNI may shift.** With no explicit `default_server`, nginx
  uses the first-loaded matching block, and `sites-enabled` loads alphabetically — so
  `api.posgro.uz` now sorts ahead of `pos.bobur-dev.uz`. Consequence is limited to requests with
  a `Host` we do not serve (they get a redirect, or a cert-name mismatch), which is what they
  already got. Check what is actually in play before assuming:
  ```bash
  sudo nginx -T | grep -n default_server        # Debian's sites-enabled/default usually has one
  ```
  If you want it pinned, add `default_server` to the legacy host's `listen` lines — but that is
  a change to the one file the fleet depends on, so only do it for a real reason.
- **Staging is untouched.** `nginx.staging.conf` and `scripts/deploy/staging.sh` still use the
  old single-file layout; they move in Phase 5.
