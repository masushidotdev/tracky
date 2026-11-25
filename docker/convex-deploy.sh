#!/usr/bin/env sh
set -eu

MODE="${1:-deploy}"
ADMIN_KEY_FILE="${CONVEX_ADMIN_KEY_FILE:-/run/convex-admin/admin_key}"
ENV_TMP="/tmp/convex-env-sync.vars"

cleanup() {
  rm -f "$ENV_TMP"
}
trap cleanup EXIT INT TERM

load_admin_key() {
  if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
    if [ ! -r "$ADMIN_KEY_FILE" ]; then
      echo "[convex-${MODE}] Admin key file not readable at $ADMIN_KEY_FILE" >&2
      exit 1
    fi
    CONVEX_SELF_HOSTED_ADMIN_KEY=$(tr -d '\r\n' < "$ADMIN_KEY_FILE")
    export CONVEX_SELF_HOSTED_ADMIN_KEY
  fi

  if [ -z "${CONVEX_SELF_HOSTED_URL:-}" ] || [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
    echo "[convex-${MODE}] CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY are required." >&2
    exit 1
  fi
}

case "$MODE" in
  deploy)
    load_admin_key

    if [ -z "${WORKOS_CLIENT_ID:-}" ] || [ -z "${WORKOS_API_KEY:-}" ] || [ -z "${WORKOS_WEBHOOK_SECRET:-}" ]; then
      echo "[convex-deploy] WORKOS_CLIENT_ID, WORKOS_API_KEY, and WORKOS_WEBHOOK_SECRET are required by @convex-dev/workos-authkit." >&2
      exit 1
    fi

    # Build a mode-0600 file of allowlisted Convex backend env vars so secrets are
    # synced before pushing auth.config.ts and never exposed in command arguments.
    node - "$ENV_TMP" <<'NODE'
const fs = require('node:fs');

const target = process.argv[2];
const allowlist = [
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_WEBHOOK_SECRET',
  'ENABLE_BANKING_APP_ID',
  'ENABLE_BANKING_API_BASE',
  'ENABLE_BANKING_PRIVATE_KEY',
  'ENABLE_BANKING_REDIRECT_URL',
  'ENABLE_BANKING_RETURN_URL',
  'AI_GATEWAY_API_KEY',
  'OPENROUTER_API_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_WEBHOOK_URL',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
];

const lines = [];
const synced = [];
for (const key of allowlist) {
  const val = process.env[key];
  if (val === undefined || val === '') continue;
  lines.push(`${key}=${JSON.stringify(val)}`);
  synced.push(key);
}

fs.writeFileSync(target, `${lines.join('\n')}\n`, { mode: 0o600 });
fs.chmodSync(target, 0o600);
console.log(`[convex-deploy] Syncing Convex env vars: ${synced.join(', ')}`);
NODE

    echo "[convex-deploy] Applying Convex environment variables to ${CONVEX_SELF_HOSTED_URL}..."
    ./node_modules/.bin/convex env set --from-file "$ENV_TMP" --force
    rm -f "$ENV_TMP"

    echo "[convex-deploy] Pushing Convex schema, components, and functions..."
    ./node_modules/.bin/convex deploy --yes --skip-workos-check --typecheck=disable

    echo "[convex-deploy] Deployment complete."
    ;;
  backfill)
    load_admin_key
    echo "[convex-backfill] Running auth:backfillUsers against ${CONVEX_SELF_HOSTED_URL}..."
    ./node_modules/.bin/convex run auth:backfillUsers
    echo "[convex-backfill] Backfill triggered (runs asynchronously in Convex)."
    ;;
  *)
    echo "[convex-deploy] Unknown mode: $MODE (expected 'deploy' or 'backfill')" >&2
    exit 1
    ;;
esac
