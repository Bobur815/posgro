#!/bin/bash
# Wraps the official postgres docker-entrypoint.sh so that POSTGRES_PASSWORD
# is applied via ALTER USER on EVERY container start (not just fresh volumes).
# This prevents SCRAM-SHA-256 auth failures when an existing volume has a
# stale password that no longer matches the env var.
set -e

# Start postgres via the official entrypoint in the background.
# After initdb (or skipping it on existing volumes), it exec's into postgres,
# keeping the same PID — so POSTGRES_PID remains valid.
docker-entrypoint.sh postgres "$@" &
POSTGRES_PID=$!

# Forward stop signals to the postgres process.
_forward() { kill -s "$1" "$POSTGRES_PID" 2>/dev/null || true; }
trap '_forward SIGTERM' SIGTERM
trap '_forward SIGINT'  SIGINT
trap '_forward SIGQUIT' SIGQUIT

# Wait for postgres to accept local connections (unix socket = trust, no password needed).
echo "postgres-entrypoint: waiting for postgres to be ready..."
until pg_isready -U "$POSTGRES_USER" -q; do sleep 1; done

# Always sync password from POSTGRES_PASSWORD env var.
echo "postgres-entrypoint: syncing password for '$POSTGRES_USER'..."
psql -U "$POSTGRES_USER" \
  -c "ALTER USER \"$POSTGRES_USER\" WITH ENCRYPTED PASSWORD '$POSTGRES_PASSWORD';" \
  && echo "postgres-entrypoint: password synced." \
  || echo "postgres-entrypoint: WARNING — ALTER USER failed, continuing anyway."

# Hand off: wait for postgres to exit (PID is the same after exec inside entrypoint).
wait "$POSTGRES_PID"
