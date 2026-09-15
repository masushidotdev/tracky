#!/usr/bin/env bash
# Claude Code `WorktreeCreate` hook: creates the worktree, seeds it with the
# gitignored files listed in .worktreeinclude, runs scripts/init-worktree.sh,
# and prints the worktree path on stdout (the only thing allowed on stdout).
#
# Replacing the built-in creation logic is what lets a single bootstrap script
# serve both Codex and Claude Code; the trade-off is that Claude Code no longer
# reads .worktreeinclude itself, so this script does it.
set -euo pipefail

log() { printf '[worktree-create] %s\n' "$*" >&2; }

PAYLOAD="$(cat)"

json_field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$PAYLOAD" | jq -r --arg k "$1" '.[$k] // empty'
  else
    printf '%s' "$PAYLOAD" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const value = JSON.parse(s)[process.argv[1]];
          if (value != null) process.stdout.write(String(value));
        } catch {}
      });
    ' "$1"
  fi
}

NAME="$(json_field name)"
CWD="$(json_field cwd)"
AGENT_ID="$(json_field agent_id)"

[ -n "$CWD" ] || CWD="$PWD"
[ -n "$NAME" ] || NAME="session-$(date +%y%m%d-%H%M%S)"

MAIN_CHECKOUT="$(dirname "$(git -C "$CWD" rev-parse --path-format=absolute --git-common-dir)")"
WORKTREE_DIR="$MAIN_CHECKOUT/.claude/worktrees/$NAME"
BRANCH="worktree-$NAME"

# Same refusal as Claude Code's built-in creation: a symlink here would place
# the worktree outside the repository.
for candidate in "$MAIN_CHECKOUT/.claude" "$MAIN_CHECKOUT/.claude/worktrees" "$WORKTREE_DIR"; do
  if [ -L "$candidate" ]; then
    log "rifiuto di creare il worktree: ${candidate} e' un symlink."
    exit 1
  fi
done

# Best-effort refresh of origin/HEAD, capped at 5s like the built-in "fresh" base.
fetch_origin_head() {
  local pid waited=0
  git -C "$MAIN_CHECKOUT" fetch --quiet origin >/dev/null 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 5 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

if [ -d "$WORKTREE_DIR" ]; then
  log "riuso il worktree esistente $WORKTREE_DIR"
elif git -C "$MAIN_CHECKOUT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  log "aggiungo il worktree sul branch esistente $BRANCH"
  git -C "$MAIN_CHECKOUT" worktree add "$WORKTREE_DIR" "$BRANCH" >&2
else
  # Default to the local HEAD, not Claude Code's own "fresh" default: a worktree
  # asked for mid-session should carry the commits of the branch in progress.
  # Uncommitted changes never follow, whichever base is used.
  if [ "${TRACKY_WORKTREE_BASE_REF:-head}" = "fresh" ]; then
    fetch_origin_head
    BASE_REF="$(git -C "$MAIN_CHECKOUT" rev-parse --verify --quiet origin/HEAD || true)"
  fi
  [ -n "${BASE_REF:-}" ] || BASE_REF="$(git -C "$MAIN_CHECKOUT" rev-parse HEAD)"
  log "creo il worktree $WORKTREE_DIR da $BASE_REF"
  git -C "$MAIN_CHECKOUT" worktree add -b "$BRANCH" "$WORKTREE_DIR" "$BASE_REF" >&2
fi

# Seed gitignored files (.env.local and friends) listed in .worktreeinclude.
if [ -f "$MAIN_CHECKOUT/.worktreeinclude" ]; then
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    case "$pattern" in '' | '#'*) continue ;; esac
    for source in "$MAIN_CHECKOUT"/$pattern; do
      [ -f "$source" ] || continue
      target="$WORKTREE_DIR/${source#"$MAIN_CHECKOUT/"}"
      [ -e "$target" ] && continue
      mkdir -p "$(dirname "$target")"
      cp "$source" "$target"
      log "copiato ${source#"$MAIN_CHECKOUT/"}"
    done
  done <"$MAIN_CHECKOUT/.worktreeinclude"
fi

# Subagent and background-session worktrees are short-lived and usually only
# need dependencies; provisioning a Convex deployment for each one would be slow
# and would pile up deployments. Set TRACKY_WORKTREE_CONVEX=1 to opt in.
if [ -n "$AGENT_ID" ]; then
  export TRACKY_WORKTREE_CONVEX="${TRACKY_WORKTREE_CONVEX:-0}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TRACKY_WORKTREE_NAME="$NAME" "$SCRIPT_DIR/init-worktree.sh" "$WORKTREE_DIR" ||
  log "init-worktree.sh è fallita: il worktree esiste ma va completato a mano."

printf '%s\n' "$WORKTREE_DIR"
