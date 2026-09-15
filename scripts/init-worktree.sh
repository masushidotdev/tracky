#!/usr/bin/env bash
# Bootstrap a worktree (or an ephemeral cloud checkout) for an agent session.
#
# Shared by every harness:
#   - Codex        -> .codex/environments/environment.toml passes $CODEX_WORKTREE_PATH
#   - Claude Code  -> scripts/claude-worktree-create.sh (WorktreeCreate hook)
#   - manual       -> ./scripts/init-worktree.sh [worktree-path]
#
# The script is idempotent: it records the deployment it provisioned in
# node_modules/.tracky-worktree-init and exits early on a second run.
#
# Knobs (all optional):
#   TRACKY_WORKTREE_NAME                    override the derived worktree slug
#   TRACKY_AGENT_SLUG                       override the derived harness slug
#   TRACKY_CONVEX_PROJECT                   team:project reference (default your-team:tracky)
#   TRACKY_WORKTREE_CONVEX=0                skip Convex provisioning, install deps only
#   TRACKY_WORKTREE_DEPLOYMENT_EXPIRATION   passed to `convex deployment create` (default "in 14 days")
#   TRACKY_WORKTREE_FORCE=1                 run even in the main checkout / when already initialized
set -euo pipefail

# Every diagnostic goes to stderr: the WorktreeCreate hook reserves stdout for
# the worktree path it has to hand back to Claude Code.
exec 1>&2

log() { printf '[init-worktree] %s\n' "$*"; }

CONVEX_PROJECT_REF="${TRACKY_CONVEX_PROJECT:-your-team:tracky}"
DEPLOYMENT_EXPIRATION="${TRACKY_WORKTREE_DEPLOYMENT_EXPIRATION:-in 14 days}"
SETUP_CONVEX="${TRACKY_WORKTREE_CONVEX:-1}"
FORCE="${TRACKY_WORKTREE_FORCE:-0}"
MARKER="node_modules/.tracky-worktree-init"

slugify() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -e 's/[^a-z0-9][^a-z0-9]*/-/g' -e 's/^-//' -e 's/-$//'
}

detect_agent() {
  if [ -n "${TRACKY_AGENT_SLUG:-}" ]; then
    printf '%s' "$TRACKY_AGENT_SLUG"
  elif [ -n "${CODEX_WORKTREE_PATH:-}" ] || [ -n "${CODEX_HOME:-}" ]; then
    printf 'codex'
  elif [ -n "${CLAUDECODE:-}" ] || [ -n "${CLAUDE_PROJECT_DIR:-}" ] || [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    printf 'claude'
  else
    printf 'agent'
  fi
}

AGENT="$(detect_agent)"

WORKTREE_PATH="${1:-${WORKTREE_PATH:-${CODEX_WORKTREE_PATH:-${CLAUDE_PROJECT_DIR:-$PWD}}}}"
cd "$WORKTREE_PATH"
WORKTREE_PATH="$(pwd -P)"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # Nota: niente caratteri non ASCII subito dopo una variabile, bash su macOS li
  # inghiotte nel nome della variabile.
  log "${WORKTREE_PATH} non e' un checkout git, esco."
  exit 0
fi

GIT_DIR_PATH="$(git rev-parse --path-format=absolute --git-dir)"
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"

# The main checkout holds the developer's own .env.local and Convex deployment;
# never re-point it at an agent deployment unless explicitly forced.
if [ "$GIT_DIR_PATH" = "$GIT_COMMON_DIR" ] &&
  [ "$WORKTREE_PATH" = "$MAIN_CHECKOUT" ] &&
  [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] &&
  [ -z "${CODEX_WORKTREE_PATH:-}" ] &&
  [ "$FORCE" != "1" ]; then
  log "checkout principale rilevato, salto l'init (TRACKY_WORKTREE_FORCE=1 per forzare)."
  exit 0
fi

derive_name() {
  if [ -n "${TRACKY_WORKTREE_NAME:-}" ]; then
    printf '%s' "$TRACKY_WORKTREE_NAME"
    return
  fi
  # Codex nests the checkout one level below the workspace directory.
  if [ "$AGENT" = "codex" ] && [ -n "${CODEX_WORKTREE_PATH:-}" ]; then
    printf '%s' "$(basename "$(dirname "$WORKTREE_PATH")")"
    return
  fi
  local candidate branch
  candidate="$(basename "$WORKTREE_PATH")"
  if [ "$WORKTREE_PATH" != "$MAIN_CHECKOUT" ]; then
    printf '%s' "$candidate"
    return
  fi
  # Cloud sessions run in a plain clone, so fall back to the branch name.
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf '')"
  case "$branch" in
  "" | HEAD | main | master) printf '%s-%s' "$candidate" "$(date +%y%m%d-%H%M%S)" ;;
  *) printf '%s' "${branch#worktree-}" ;;
  esac
}

SLUG="$(slugify "$(derive_name)")"
OWNER="$(slugify "${USER:-$(whoami 2>/dev/null || printf 'agent')}")"
DEPLOYMENT_REF="$CONVEX_PROJECT_REF:dev/$OWNER-$AGENT/$SLUG"

if [ -f "$MARKER" ] && [ "$FORCE" != "1" ]; then
  log "worktree già inizializzato ($(cat "$MARKER")), esco."
  exit 0
fi

log "harness=$AGENT worktree=$WORKTREE_PATH slug=$SLUG"

# --- dependencies ------------------------------------------------------------
if [ -d node_modules ]; then
  log "node_modules già presente, salto l'installazione."
elif [ "$WORKTREE_PATH" != "$MAIN_CHECKOUT" ] &&
  [ -d "$MAIN_CHECKOUT/node_modules" ] &&
  cmp -s package-lock.json "$MAIN_CHECKOUT/package-lock.json" &&
  cp -Rc "$MAIN_CHECKOUT/node_modules" node_modules 2>/dev/null; then
  # APFS clonefile: stesso lockfile, copia istantanea e senza traffico di rete.
  log "node_modules clonato dal checkout principale."
else
  rm -rf node_modules
  log "npm ci..."
  npm ci
fi

# --- env file ----------------------------------------------------------------
# Any Convex coordinate copied in from the main checkout must go: the deploy key
# in particular wins over CONVEX_DEPLOYMENT and would point the agent at the
# developer's own deployment.
if [ -f .env.local ]; then
  if grep -qE '^(CONVEX_DEPLOYMENT|CONVEX_DEPLOY_KEY|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' .env.local; then
    grep -vE '^(CONVEX_DEPLOYMENT|CONVEX_DEPLOY_KEY|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' .env.local >.env.local.tmp
    mv .env.local.tmp .env.local
    log "rimosse le coordinate Convex ereditate da .env.local."
  fi
fi

# --- Convex deployment -------------------------------------------------------
if [ "$SETUP_CONVEX" != "1" ]; then
  log "TRACKY_WORKTREE_CONVEX=$SETUP_CONVEX, salto il provisioning Convex."
  exit 0
fi

if [ -z "${CONVEX_ACCESS_TOKEN:-}" ] && [ ! -f "${HOME:-}/.convex/config.json" ]; then
  log "nessuna auth Convex (né CONVEX_ACCESS_TOKEN né ~/.convex/config.json): salto il provisioning."
  log "le dipendenze sono pronte; \`npx convex login\` o CONVEX_ACCESS_TOKEN per completare."
  exit 0
fi

log "creo il deployment $DEPLOYMENT_REF ..."
if ! npx convex deployment create --type=dev "$DEPLOYMENT_REF" --select --expiration "$DEPLOYMENT_EXPIRATION"; then
  log "create fallita, provo a selezionare un deployment esistente con lo stesso riferimento..."
  npx convex deployment select "$DEPLOYMENT_REF"
fi

npx convex deployment token create agent-token --save-env

log "push delle funzioni sul deployment..."
npx convex dev --once

CONVEX_URL="$(grep -E '^VITE_CONVEX_URL=' .env.local | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -n "$CONVEX_URL" ]; then
  HTTP_ACTIONS_URL="${CONVEX_URL/.convex.cloud/.convex.site}"
  npx convex env set ENABLE_BANKING_REDIRECT_URL "$HTTP_ACTIONS_URL/enablebanking/callback"
  npx convex env set TELEGRAM_WEBHOOK_URL "$HTTP_ACTIONS_URL/telegram-webhook"
  log "URL delle HTTP action: $HTTP_ACTIONS_URL"
else
  log "VITE_CONVEX_URL assente da .env.local: env var basate su URL non impostate."
fi

printf '%s\n' "$DEPLOYMENT_REF" >"$MARKER"
log "worktree pronto."
