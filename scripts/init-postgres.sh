#!/bin/bash
# Runs inside the postgres container on fresh volume creation only
# (docker-entrypoint-initdb.d scripts are skipped if data dir already exists).
#
# Re-applies POSTGRES_PASSWORD via ALTER USER so that the superuser password
# is guaranteed to match the env var even if the volume was seeded by an older
# image that used a different default. Prevents SCRAM-SHA-256 auth failures on
# a fresh `docker compose up`.
set -e

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname   "$POSTGRES_DB" \
  -c "ALTER USER \"${POSTGRES_USER}\" WITH ENCRYPTED PASSWORD '${POSTGRES_PASSWORD}';"

echo "init-postgres.sh: password for '${POSTGRES_USER}' confirmed."
