#!/usr/bin/env bash
#
# Staging deploy — runs ON the VPS, invoked by .github/workflows/deploy-staging.yml
# once the checkout is up to date and .env is in place (mode 0600).
#
# Takes no secrets on argv: everything sensitive is read from ./.env. Keep it that
# way — this box is shared, and process arguments are world-readable via `ps`.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

COMPOSE="docker-compose.staging.yml"
NGINX_SITE="dev.pos.bobur-dev.uz"

echo "🔎 Validate .env"
test -s .env                 || { echo "❌ .env is empty";       exit 1; }
grep -q '^JWT_SECRET='  .env || { echo "❌ JWT_SECRET missing";  exit 1; }
grep -q '^DB_PASSWORD=' .env || { echo "❌ DB_PASSWORD missing"; exit 1; }

# Telegram bot runs on the UZ VPS only — strip the token so NestJS keeps it disabled.
sed -i '/^TELEGRAM_BOT_TOKEN=/d' .env

echo "🌐 Deploy nginx config"
sudo cp nginx.staging.conf "/etc/nginx/sites-available/${NGINX_SITE}"
sudo ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"

if [ -f "/etc/letsencrypt/live/${NGINX_SITE}/fullchain.pem" ]; then
  sudo nginx -t || exit 1
  if sudo nginx -T 2>/dev/null | grep -q "ssl_certificate.*${NGINX_SITE}"; then
    sudo systemctl reload nginx
  else
    # First deploy of a new HTTPS server block. `systemctl restart nginx` is NOT in
    # the NOPASSWD sudoers allowlist (only `reload` is), so ask non-interactively and
    # fall back to reload rather than hang forever on a password prompt.
    sudo -n systemctl restart nginx 2>/dev/null || {
      echo "⚠️  restart not permitted by sudoers — falling back to reload"
      echo "   To allow it: add '/bin/systemctl restart nginx' to the NOPASSWD line"
      sudo systemctl reload nginx
    }
  fi
else
  echo "⚠️  SSL cert not found for ${NGINX_SITE} — skipping nginx reload"
  echo "   Run once on the VPS: sudo certbot --nginx -d ${NGINX_SITE}"
fi

echo "🐘 Ensure staging postgres is running"
docker compose -f "$COMPOSE" up -d postgres

echo "⏳ Waiting for staging postgres..."
DB_USER_VAL=$(grep '^DB_USER=' .env | cut -d= -f2-)
timeout 60 bash -c '
  until docker compose -f "$1" exec -T postgres pg_isready -U "$2" >/dev/null 2>&1; do
    sleep 2
  done
' _ "$COMPOSE" "$DB_USER_VAL" \
  || { echo "❌ Staging postgres failed"; docker compose -f "$COMPOSE" logs postgres; exit 1; }

echo "🔑 Syncing DB password..."
# Piped over stdin, never as an argument — `psql -c "...PASSWORD '...'"` would put the
# credential straight into the process table.
DB_PASS_VAL=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
printf "ALTER USER %s WITH ENCRYPTED PASSWORD '%s';\n" "\"$DB_USER_VAL\"" "$DB_PASS_VAL" \
  | docker compose -f "$COMPOSE" exec -T postgres psql -U "$DB_USER_VAL" -f - \
  && echo "✅ Password synced" \
  || echo "⚠️  Password sync skipped"

echo "🐳 Build & deploy staging api"
docker compose -f "$COMPOSE" build api
docker compose -f "$COMPOSE" up -d --no-deps api

echo "⏳ Waiting for staging api..."
timeout 120 bash -c '
  until docker compose -f "$1" ps api | grep -q "healthy"; do sleep 3; done
' _ "$COMPOSE" \
  && echo "✅ Staging API is healthy" \
  || { echo "❌ Staging API failed"; docker compose -f "$COMPOSE" logs --tail=100 api; exit 1; }

echo "✅ Staging status"
docker compose -f "$COMPOSE" ps
