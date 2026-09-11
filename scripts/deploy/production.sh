#!/usr/bin/env bash
#
# Production deploy — runs ON the VPS, invoked by .github/workflows/deploy.yml
# once the checkout is up to date and .env is in place (mode 0600).
#
# Takes no secrets on argv: everything sensitive is read from ./.env. Keep it that
# way — this box is shared, and process arguments are world-readable via `ps`.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

NGINX_SITE="pos.bobur-dev.uz"

echo "🔎 Validate .env"
echo ".env size: $(wc -c < .env) bytes, $(wc -l < .env) lines"
echo "Keys present: $(grep -v '^#' .env | grep '=' | cut -d= -f1 | tr '\n' ' ')"

test -s .env                 || { echo "❌ .env is empty";       exit 1; }
grep -q '^JWT_SECRET='  .env || { echo "❌ JWT_SECRET missing";  exit 1; }
grep -q '^DB_PASSWORD=' .env || { echo "❌ DB_PASSWORD missing"; exit 1; }

# Telegram bot runs on the UZ VPS only — strip the token so NestJS keeps it disabled.
sed -i '/^TELEGRAM_BOT_TOKEN=/d' .env

echo "🌐 Deploy nginx config"
sudo cp nginx.conf "/etc/nginx/sites-available/${NGINX_SITE}"
sudo ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
sudo nginx -t
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
