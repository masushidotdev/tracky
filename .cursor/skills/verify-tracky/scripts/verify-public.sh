#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

PORT="${TRACKY_VERIFY_PORT:-4173}"
EVIDENCE_DIR="${TRACKY_EVIDENCE_DIR:-/tmp/tracky-verify-evidence}"
HOST="127.0.0.1"
BASE_URL="http://${HOST}:${PORT}"
SERVER_LOG="${EVIDENCE_DIR}/wrangler-dev.log"
DEV_VARS_PATH="${ROOT_DIR}/dist/server/.dev.vars"
CREATED_DEV_VARS=0
SERVER_PID=""

cleanup() {
  local exit_code=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ "$CREATED_DEV_VARS" = "1" ]; then
    rm -f "$DEV_VARS_PATH"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

mkdir -p "$EVIDENCE_DIR"

echo "== Doctor =="
node scripts/check-node-version.mjs
npm run security:convex-runtime

if curl -s -o /dev/null --connect-timeout 1 "${BASE_URL}/" 2>/dev/null; then
  echo "FAIL: ${BASE_URL} is already accepting connections; stop the existing process or set TRACKY_VERIFY_PORT." >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/dist/server/wrangler.json" ]; then
  echo "== Building production Worker artifact (CLOUDFLARE_ENV=) =="
  CLOUDFLARE_ENV= npm run build
fi

if [ ! -f "$DEV_VARS_PATH" ]; then
  CREATED_DEV_VARS=1
  if [ -f "$ROOT_DIR/.dev.vars" ]; then
    cp "$ROOT_DIR/.dev.vars" "$DEV_VARS_PATH"
  else
    cat <<VARS > "$DEV_VARS_PATH"
# Temporary verification scaffolding created by verify-public.sh (removed on cleanup)
WORKOS_CLIENT_ID=client_synthetic_verify_00000000
WORKOS_API_KEY=sk_test_synthetic_verify_00000000
WORKOS_COOKIE_PASSWORD=synthetic_verify_cookie_password_32chars_min
WORKOS_REDIRECT_URI=${BASE_URL}/callback
VARS
  fi
fi

echo "== Launching built Worker via wrangler dev on ${BASE_URL} =="
setsid npx wrangler dev --config dist/server/wrangler.json --ip "$HOST" --port "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "wrangler dev exited unexpectedly. Log:" >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi
  if curl -sf -o /dev/null "${BASE_URL}/robots.txt"; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" != "1" ]; then
  echo "wrangler dev did not become ready in time." >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

SUMMARY="${EVIDENCE_DIR}/summary.txt"
{
  echo "Tracky public Worker verification"
  echo "Timestamp: $(date -Iseconds)"
  echo "Commit: $(git rev-parse --short HEAD)"
  echo "Node: $(node -v)"
  echo "Base URL: ${BASE_URL}"
  echo ""
} > "$SUMMARY"

check_route() {
  local path="$1"
  local expected_code="$2"
  local safe_name
  safe_name="$(echo "$path" | sed 's#^/#root_#; s#[^a-zA-Z0-9_-]#_#g')"
  local hdr_file="${EVIDENCE_DIR}/headers-${safe_name}.txt"
  local body_file="${EVIDENCE_DIR}/body-${safe_name}.out"
  local code
  code="$(curl -sS -o "$body_file" -D "$hdr_file" -w "%{http_code}" "${BASE_URL}${path}")"
  local location
  location="$(grep -i '^location:' "$hdr_file" | tr -d '\r' | sed 's/^location:[[:space:]]*//i' || true)"
  echo "${path} -> HTTP ${code} (expected ${expected_code})${location:+ location=${location}}" | tee -a "$SUMMARY"
  if [ "$code" != "$expected_code" ]; then
    echo "FAIL: ${path} returned ${code}, expected ${expected_code}" >&2
    cat "$SERVER_LOG" >&2 || true
    exit 1
  fi
}

echo "== Verifying routes =="
check_route "/" "200"
check_route "/it" "200"
check_route "/it/" "307"
check_route "/pricing" "200"
check_route "/faq" "200"
check_route "/robots.txt" "200"
check_route "/sitemap.xml" "200"
check_route "/privacy" "404"
check_route "/terms" "404"
check_route "/app" "307"

echo "== Verifying security headers on / =="
for header in "x-content-type-options: nosniff" "x-frame-options: DENY" "referrer-policy: no-referrer" "cache-control: private, no-store"; do
  if ! grep -qi "^${header}" "${EVIDENCE_DIR}/headers-root_.txt"; then
    echo "FAIL: missing security header '${header}' on /" >&2
    exit 1
  fi
done
if ! grep -qi "^content-security-policy:.*frame-ancestors 'none'" "${EVIDENCE_DIR}/headers-root_.txt"; then
  echo "FAIL: missing CSP frame-ancestors 'none' on /" >&2
  exit 1
fi
echo "Security headers verified on /" | tee -a "$SUMMARY"

if ! grep -qi "api\.workos\.com/user_management/authorize" "${EVIDENCE_DIR}/headers-root_app.txt"; then
  echo "FAIL: /app 307 Location does not point to WorkOS authorize" >&2
  exit 1
fi
echo "AuthKit unauthenticated /app -> WorkOS authorize redirect verified" | tee -a "$SUMMARY"

CHROME_BIN=""
for candidate in /usr/bin/google-chrome /opt/ungoogled-chromium/chrome "$(command -v chromium 2>/dev/null || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    CHROME_BIN="$candidate"
    break
  fi
done

if [ -n "$CHROME_BIN" ]; then
  echo "== Capturing headless Chrome DOM & screenshot via ${CHROME_BIN} =="
  "$CHROME_BIN" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --window-size=1280,900 --dump-dom "${BASE_URL}/" > "${EVIDENCE_DIR}/home-dom.txt" 2>"${EVIDENCE_DIR}/chrome-dom.log" || true
  "$CHROME_BIN" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --window-size=1280,900 --screenshot="${EVIDENCE_DIR}/home.png" "${BASE_URL}/" 2>"${EVIDENCE_DIR}/chrome-shot.log" || true
  if grep -q "<title>Tracky" "${EVIDENCE_DIR}/home-dom.txt"; then
    echo "Headless Chrome DOM rendered Tracky title + screenshot saved to ${EVIDENCE_DIR}/home.png" | tee -a "$SUMMARY"
  else
    echo "WARN: Headless Chrome DOM did not contain expected <title>Tracky" | tee -a "$SUMMARY"
  fi
else
  echo "Headless Chrome not found; skipped browser render capture" | tee -a "$SUMMARY"
fi

echo "== Done. Evidence preserved in ${EVIDENCE_DIR} =="
