#!/bin/sh
set -e

# Ensure uploads dir exists and is writable by node user, regardless of host bind-mount ownership
mkdir -p /app/uploads
chown -R node:node /app/uploads

exec su-exec node "$@"
