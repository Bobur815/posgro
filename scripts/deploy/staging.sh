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

echo "🔎 Validate .env"
test -s .env                 || { echo "❌ .env is empty";       exit 1; }
grep -q '^JWT_SECRET='  .env || { echo "❌ JWT_SECRET missing";  exit 1; }
grep -q '^DB_PASSWORD=' .env || { echo "❌ DB_PASSWORD missing"; exit 1; }

# Staging must never long-poll the production bot: two pollers on one token get 409 Conflict
# from Telegram and neither works reliably — and the one that breaks is production's.
#
# docker-compose.staging.yml already blanks TELEGRAM_BOT_TOKEN via an `environment:` override,
# which is the documented guard. This strip is the second layer, kept because both deploys write
# .env from the same secrets.ENV_FILE and the blast radius of getting it wrong is production.
# It does not touch TELEGRAM_BOT_TOKEN_STAGING, so staging can still run a bot of its own.
sed -i '/^TELEGRAM_BOT_TOKEN=/d' .env

echo "🌐 Deploy nginx configs"

mkdir -p downloads-staging   # tools served at dev.panel.posgro.uz/downloads/

# One file per host, gated on nginx/sites-live-staging.txt — the same arrangement as production
# (scripts/deploy/production.sh), for the same reasons: the deploy runs as `bobur`, whose sudo is
# NOPASSWD for only nginx, `systemctl reload nginx`, cp and ln, and who cannot read
# /etc/letsencrypt/live at all. Probing the filesystem for a certificate reports "missing" for
# every host including live ones, so the gate is an explicit list.
sudo cp nginx/snippets/*.conf /etc/nginx/snippets/

for conf in nginx/sites-staging/*.conf; do
  host="$(basename "$conf" .conf)"
  installed="/etc/nginx/sites-available/${host}"
  names="$(awk '/^[[:space:]]*server_name[[:space:]]/{sub(/^[[:space:]]*server_name[[:space:]]+/,"");sub(/;.*$/,"");print;exit}' "$conf")"
  names="${names:-$host}"

  if grep -qxF "$host" nginx/sites-live-staging.txt 2>/dev/null; then
    sudo cp "$conf" "$installed"
    echo "  ✅ ${host}"
  elif grep -q 'ssl_certificate' "$installed" 2>/dev/null; then
    echo "  ⚠️  ${host} — already serving TLS but not in nginx/sites-live-staging.txt; LEFT UNTOUCHED."
  else
    stub="$(mktemp)"
    cat > "$stub" <<STUB
# AUTO-GENERATED BOOTSTRAP STUB — no TLS certificate for ${host} yet.
# Issue one, then add "${host}" to nginx/sites-live-staging.txt and deploy again:
#   sudo certbot certonly --webroot -w /var/www/certbot --cert-name ${host} -d ${names// / -d }
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
    echo "  ⏳ ${host} — not in sites-live-staging.txt, ACME stub installed"
  fi

  sudo ln -sf "$installed" "/etc/nginx/sites-enabled/${host}"
done

if ! sudo nginx -t; then
  echo "❌ nginx config test failed — NOT reloading; the running config is untouched."
  echo "   Most likely: a host in nginx/sites-live-staging.txt has no certificate yet."
  exit 1
fi
sudo systemctl reload nginx

# A reload normally picks up a brand-new HTTPS server block, but this has been seen not to take
# on the first deploy after a promotion — hence the original restart fallback, kept here. Only
# `reload` is in the NOPASSWD allowlist, so the restart is attempted non-interactively and falls
# back rather than hanging on a password prompt.
while read -r host; do
  case "$host" in ''|\#*) continue ;; esac
  if ! sudo nginx -T 2>/dev/null | grep -q "ssl_certificate.*${host}/"; then
    echo "⚠️  ${host} is promoted but not being served — trying a restart"
    sudo -n systemctl restart nginx 2>/dev/null || {
      echo "   restart not permitted by sudoers; add '/bin/systemctl restart nginx' to the"
      echo "   NOPASSWD line, or restart nginx by hand."
    }
    break
  fi
done < nginx/sites-live-staging.txt

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
