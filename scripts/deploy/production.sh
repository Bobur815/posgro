#!/usr/bin/env bash
#
# Production deploy — runs ON the VPS, invoked by .github/workflows/deploy.yml
# once the checkout is up to date and .env is in place (mode 0600).
#
# Takes no secrets on argv: everything sensitive is read from ./.env. Keep it that
# way — this box is shared, and process arguments are world-readable via `ps`.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

echo "🔎 Validate .env"
echo ".env size: $(wc -c < .env) bytes, $(wc -l < .env) lines"
echo "Keys present: $(grep -v '^#' .env | grep '=' | cut -d= -f1 | tr '\n' ' ')"

test -s .env                 || { echo "❌ .env is empty";       exit 1; }
grep -q '^JWT_SECRET='  .env || { echo "❌ JWT_SECRET missing";  exit 1; }
grep -q '^DB_PASSWORD=' .env || { echo "❌ DB_PASSWORD missing"; exit 1; }

# Telegram bot runs on the UZ VPS only — strip the token so NestJS keeps it disabled.
sed -i '/^TELEGRAM_BOT_TOKEN=/d' .env

echo "🌐 Deploy nginx configs"

# This deploy runs as `bobur`, whose sudo is NOPASSWD for exactly: nginx, `systemctl reload
# nginx`, cp, ln (plus two chown/chmod rules for uploads/). No mkdir, no tee. Every privileged
# step below therefore goes through `cp` into a directory that already exists.
mkdir -p downloads                       # tools served at panel.posgro.uz/downloads/ (Phase 3)

sudo cp nginx/snippets/*.conf /etc/nginx/snippets/

# Which hosts get their real config, and which get an HTTP-only ACME bootstrap stub.
#
# The real config for a host names a fullchain.pem that does not exist until certbot has run,
# and ONE missing certificate fails `nginx -t` for the whole server — which would take the live
# API down with it. So a host is only installed for real once it is listed in sites-live.txt.
#
# The list is explicit rather than probed: /etc/letsencrypt/live is drwx------ root:root, so
# `[ -d /etc/letsencrypt/live/$host ]` is false for EVERY host when run as bobur — including
# hosts that are live. Probing would have stubbed pos.bobur-dev.uz and dropped the fleet.
for conf in nginx/sites/*.conf; do
  host="$(basename "$conf" .conf)"
  installed="/etc/nginx/sites-available/${host}"

  # First server_name in the file, for the stub and the certbot hint it prints. awk with `exit`
  # rather than `sed ... | head -1`: under `set -o pipefail` a closed pipe can hand back SIGPIPE
  # and abort the whole deploy.
  names="$(awk '/^[[:space:]]*server_name[[:space:]]/{sub(/^[[:space:]]*server_name[[:space:]]+/,"");sub(/;.*$/,"");print;exit}' "$conf")"
  names="${names:-$host}"

  if grep -qxF "$host" nginx/sites-live.txt 2>/dev/null; then
    sudo cp "$conf" "$installed"
    echo "  ✅ ${host}"

  elif grep -q 'ssl_certificate' "$installed" 2>/dev/null; then
    # Serving TLS already but absent from the manifest — almost certainly someone forgot to add
    # it. Downgrading it to a stub would take a working host offline, so refuse to touch it.
    echo "  ⚠️  ${host} — already serving TLS but not in nginx/sites-live.txt; LEFT UNTOUCHED."
    echo "      Add it to that file so this deploy manages it again."

  else
    stub="$(mktemp)"
    cat > "$stub" <<STUB
# AUTO-GENERATED BOOTSTRAP STUB — no TLS certificate for ${host} yet.
# Issue one, then add "${host}" to nginx/sites-live.txt and deploy again:
#   sudo certbot certonly --webroot -w /var/www/certbot -d ${names// / -d }
server {
    listen 80;
    listen [::]:80;
    server_name ${names};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 503;
    }
}
STUB
    chmod 644 "$stub"
    sudo cp "$stub" "$installed"
    rm -f "$stub"
    echo "  ⏳ ${host} — not in sites-live.txt, ACME stub installed"
  fi

  sudo ln -sf "$installed" "/etc/nginx/sites-enabled/${host}"
done

if ! sudo nginx -t; then
  echo "❌ nginx config test failed — NOT reloading; the running config is untouched."
  echo "   Most likely: a host in nginx/sites-live.txt has no certificate yet."
  echo "   Remove it from that file, or run certbot for it, then deploy again."
  exit 1
fi
sudo systemctl reload nginx

echo "🐘 Ensure postgres is running"
docker compose up -d postgres

echo "⏳ Waiting for postgres to be ready..."
DB_USER_VAL=$(grep '^DB_USER=' .env | cut -d= -f2-)
timeout 60 bash -c '
  until docker compose exec -T postgres pg_isready -U "$1" >/dev/null 2>&1; do sleep 2; done
' _ "$DB_USER_VAL" \
  || { echo "❌ Postgres failed to start"; docker compose logs postgres; exit 1; }

echo "🔑 Syncing DB password via local socket..."
# Piped over stdin, never as an argument — `psql -c "...PASSWORD '...'"` would put the
# credential straight into the process table.
DB_PASS_VAL=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
printf "ALTER USER %s WITH ENCRYPTED PASSWORD '%s';\n" "\"$DB_USER_VAL\"" "$DB_PASS_VAL" \
  | docker compose exec -T postgres psql -U "$DB_USER_VAL" -f - \
  && echo "✅ Password synced" \
  || echo "⚠️  Password sync failed — will attempt migration anyway"

echo "🐍 Ensure ocr-python is running"
docker compose up -d ocr-python
echo "⏳ Waiting for ocr-python to be healthy..."
timeout 90 bash -c 'until docker compose ps ocr-python | grep -q "healthy"; do sleep 3; done' \
  || { echo "❌ ocr-python failed to become healthy"; docker compose logs ocr-python; exit 1; }

echo "🐳 Docker Compose: build & up"
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)
docker compose build api
docker compose up -d --no-deps api

echo "⏳ Waiting for api to be healthy..."
timeout 120 bash -c 'until docker compose ps api | grep -q "healthy"; do sleep 3; done' \
  && echo "✅ API is healthy" \
  || { echo "❌ API failed to become healthy"; docker compose logs --tail=100 api; docker compose ps; exit 1; }

echo "✅ Status"
docker compose ps
docker compose logs -n 100 api || true
