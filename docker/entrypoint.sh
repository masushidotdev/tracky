#!/usr/bin/env sh
set -eu

ENV_FILE="/tmp/tracky-runtime.dev.vars"
STATE_DIR="/tmp/wrangler-state"

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

exec /app/node_modules/.bin/wrangler dev \
  --config /app/dist/server/wrangler.json \
  --env-file "$ENV_FILE" \
  --ip 0.0.0.0 \
  --port 3000 \
  --local \
  --live-reload=false \
  --show-interactive-dev-session=false \
  --persist-to "$STATE_DIR"
