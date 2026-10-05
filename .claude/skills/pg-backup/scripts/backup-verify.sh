#!/usr/bin/env bash
# Runs ON the VPS from a compose project dir (~/posgro or ~/posgro-staging).
set -euo pipefail

SERVICE="${PG_SERVICE:-postgres}"
OUT_DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/$(basename "$PWD")-$(date +%Y%m%d-%H%M%S).dump"

# `< /dev/null` on every exec: this script is usually piped in (`bash -s < backup-verify.sh`), and an
# exec that reads stdin would swallow the rest of the script — the dump is written, nothing after runs.
docker compose exec -T "$SERVICE" sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -Fc "${POSTGRES_DB:-posgro}"' < /dev/null > "$FILE"
[ -s "$FILE" ] || { echo "FAIL: empty dump" >&2; exit 1; }

MAJOR="$(docker compose exec -T "$SERVICE" sh -c 'echo "$PG_MAJOR"' < /dev/null | tr -d '\r')"
[ -n "$MAJOR" ] || { echo "FAIL: cannot detect Postgres major version" >&2; exit 1; }

CHK="pgcheck-$$"
docker run -d --rm --name "$CHK" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=check "postgres:${MAJOR}-alpine" > /dev/null
trap 'docker rm -f "$CHK" > /dev/null 2>&1 || true' EXIT
until docker exec "$CHK" pg_isready -U postgres -d check > /dev/null 2>&1; do sleep 1; done

docker exec -i "$CHK" pg_restore -U postgres -d check --no-owner < "$FILE"
docker exec "$CHK" psql -U postgres -d check -c 'ANALYZE' > /dev/null
echo "Top tables by rows:"
docker exec "$CHK" psql -U postgres -d check -At -c \
  "select relname || ': ' || n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 10"

echo "RESTORE OK: $FILE ($(du -h "$FILE" | cut -f1))"
