#!/bin/sh
set -eu

: "${PORT:=10000}"
: "${WEB_ORIGIN:?WEB_ORIGIN must be configured.}"
: "${IDENTITY_HOSTPORT:?IDENTITY_HOSTPORT must be configured.}"
: "${SOCIAL_HOSTPORT:?SOCIAL_HOSTPORT must be configured.}"
: "${LEDGER_HOSTPORT:?LEDGER_HOSTPORT must be configured.}"
: "${AUTOMATION_SYNC_HOSTPORT:?AUTOMATION_SYNC_HOSTPORT must be configured.}"
: "${REDIS_URL:?REDIS_URL must be configured.}"

case "$REDIS_URL" in
  redis://*) redis_authority=${REDIS_URL#redis://} ;;
  *) echo "REDIS_URL must use Render's private redis:// connection." >&2; exit 1 ;;
esac
redis_authority=${redis_authority%%/*}
redis_authority=${redis_authority##*@}
case "$redis_authority" in
  *:*) REDIS_HOST=${redis_authority%:*}; REDIS_PORT=${redis_authority##*:} ;;
  *) REDIS_HOST=$redis_authority; REDIS_PORT=6379 ;;
esac
case "$REDIS_PORT" in
  ''|*[!0-9]*) echo "REDIS_URL has an invalid Redis port." >&2; exit 1 ;;
esac
if [ -z "$REDIS_HOST" ]; then
  echo "REDIS_URL has no Redis hostname." >&2
  exit 1
fi

export PORT WEB_ORIGIN IDENTITY_HOSTPORT SOCIAL_HOSTPORT LEDGER_HOSTPORT
export AUTOMATION_SYNC_HOSTPORT REDIS_HOST REDIS_PORT
export KONG_PROXY_LISTEN="0.0.0.0:${PORT}"
export KONG_DECLARATIVE_CONFIG="/tmp/kong.staging.yml"

envsubst '${WEB_ORIGIN} ${IDENTITY_HOSTPORT} ${SOCIAL_HOSTPORT} ${LEDGER_HOSTPORT} ${AUTOMATION_SYNC_HOSTPORT} ${REDIS_HOST} ${REDIS_PORT}' \
  < /opt/kong/kong.template.yml \
  > "${KONG_DECLARATIVE_CONFIG}"

exec /docker-entrypoint.sh kong docker-start
