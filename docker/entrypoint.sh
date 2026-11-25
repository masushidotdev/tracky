#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/tmp/tracky-runtime.dev.vars"
STATE_DIR="/tmp/wrangler-state"
UPSTREAM_HOST="127.0.0.1"
UPSTREAM_PORT="8787"
EDGE_HOST="0.0.0.0"
EDGE_PORT="3000"

# Validate required runtime secrets and materialize an allowlisted .dev.vars
# file with mode 0600 so secrets are never baked into the image or passed via argv.
node - "$ENV_FILE" <<'NODE'
const fs = require('node:fs');

const target = process.argv[2];
const required = [
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_COOKIE_PASSWORD',
  'WORKOS_REDIRECT_URI',
];
const optional = [
  'WORKOS_COOKIE_NAME',
  'WORKOS_COOKIE_DOMAIN',
  'APP_PUBLIC_URL',
];

const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());
if (missing.length > 0) {
  console.error(`[tracky] Missing required runtime environment variable(s): ${missing.join(', ')}`);
  console.error('[tracky] Copy .env.selfhost.example to .env and fill in your WorkOS AuthKit values.');
  process.exit(1);
}

if (process.env.WORKOS_COOKIE_PASSWORD.length < 32) {
  console.error('[tracky] WORKOS_COOKIE_PASSWORD must be at least 32 characters long.');
  process.exit(1);
}

const lines = [];
for (const key of [...required, ...optional]) {
  const val = process.env[key];
  if (val === undefined || val === '') continue;
  if (/[\r\n]/.test(val)) {
    console.error(`[tracky] Environment variable ${key} must not contain newline characters.`);
    process.exit(1);
  }
  lines.push(`${key}=${JSON.stringify(val)}`);
}

fs.writeFileSync(target, `${lines.join('\n')}\n`, { mode: 0o600 });
fs.chmodSync(target, 0o600);
NODE

mkdir -p "$STATE_DIR"

wrangler_pid=""
proxy_pid=""
shutting_down=0

forward_signal() {
  local sig="$1"
  shutting_down=1
  if [ -n "$proxy_pid" ]; then
    kill "-$sig" "$proxy_pid" 2>/dev/null || true
  fi
  if [ -n "$wrangler_pid" ]; then
    kill "-$sig" "$wrangler_pid" 2>/dev/null || true
  fi
}

trap 'forward_signal TERM' TERM
trap 'forward_signal INT' INT

is_pid_alive() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  if [ -r "/proc/${pid}/stat" ]; then
    local state
    state=$(awk '{print $3}' "/proc/${pid}/stat" 2>/dev/null || true)
    if [ "$state" = "Z" ]; then
      return 1
    fi
  fi
  return 0
}

/app/node_modules/.bin/wrangler dev \
  --config /app/dist/server/wrangler.json \
  --env-file "$ENV_FILE" \
  --ip "$UPSTREAM_HOST" \
  --port "$UPSTREAM_PORT" \
  --local \
  --live-reload=false \
  --show-interactive-dev-session=false \
  --persist-to "$STATE_DIR" &
wrangler_pid=$!

# Wait for Wrangler's loopback listener before exposing port 3000.
ready=0
for _ in $(seq 1 240); do
  if [ "$shutting_down" -eq 1 ]; then
    wait "$wrangler_pid" 2>/dev/null || true
    exit 0
  fi

  if ! is_pid_alive "$wrangler_pid"; then
    wait "$wrangler_pid" 2>/dev/null || true
    echo "[tracky] wrangler exited before becoming ready." >&2
    exit 1
  fi

  if node -e "const net = require('node:net'); const s = net.connect(${UPSTREAM_PORT}, '${UPSTREAM_HOST}', () => { s.end(); process.exit(0); }); s.setTimeout(500, () => { s.destroy(); process.exit(1); }); s.on('error', () => process.exit(1));" 2>/dev/null; then
    ready=1
    break
  fi

  sleep 0.25 &
  wait $! 2>/dev/null || true
done

if [ "$ready" -ne 1 ]; then
  echo "[tracky] Timed out waiting for wrangler on ${UPSTREAM_HOST}:${UPSTREAM_PORT}." >&2
  kill -TERM "$wrangler_pid" 2>/dev/null || true
  wait "$wrangler_pid" 2>/dev/null || true
  exit 1
fi

EDGE_HOST="$EDGE_HOST" \
EDGE_PORT="$EDGE_PORT" \
UPSTREAM_HOST="$UPSTREAM_HOST" \
UPSTREAM_PORT="$UPSTREAM_PORT" \
node /app/docker/edge.mjs &
proxy_pid=$!

set +e
wait -n "$wrangler_pid" "$proxy_pid"
exit_status=$?
set -e

if [ "$shutting_down" -eq 1 ]; then
  wait "$proxy_pid" 2>/dev/null || true
  wait "$wrangler_pid" 2>/dev/null || true
  exit 0
fi

echo "[tracky] Runtime process exited unexpectedly (status ${exit_status}); terminating container." >&2
kill -TERM "$proxy_pid" 2>/dev/null || true
kill -TERM "$wrangler_pid" 2>/dev/null || true
wait "$proxy_pid" 2>/dev/null || true
wait "$wrangler_pid" 2>/dev/null || true
exit 1
