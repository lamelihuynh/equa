#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS_ON_START:-false}" = "true" ]; then
  echo "Running database migrations..."
  node dist/database/migrate.js
  echo "Database migrations completed."
fi

exec node dist/main.js