#!/usr/bin/env bash
# Claude Code `WorktreeRemove` hook, the counterpart of
# scripts/claude-worktree-create.sh.
#
# Deliberately non-destructive: `git worktree remove` without --force, so a
# worktree with uncommitted or untracked work is kept and only reported. The
# branch is left alone; the Convex deployment expires on its own (the CLI has no
# `deployment delete`).
set -euo pipefail

log() { printf '[worktree-remove] %s\n' "$*" >&2; }

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

CWD="$(json_field cwd)"
[ -n "$CWD" ] || CWD="$PWD"
MAIN_CHECKOUT="$(dirname "$(git -C "$CWD" rev-parse --path-format=absolute --git-common-dir)")"

WORKTREE_DIR="$(json_field worktree_path)"
[ -n "$WORKTREE_DIR" ] || WORKTREE_DIR="$(json_field worktreePath)"
[ -n "$WORKTREE_DIR" ] || WORKTREE_DIR="$(json_field path)"
if [ -z "$WORKTREE_DIR" ]; then
  NAME="$(json_field name)"
  [ -n "$NAME" ] && WORKTREE_DIR="$MAIN_CHECKOUT/.claude/worktrees/$NAME"
fi

if [ -z "$WORKTREE_DIR" ] || [ ! -d "$WORKTREE_DIR" ]; then
  log "nessun worktree da rimuovere (payload: $PAYLOAD)"
  exit 0
fi

if git -C "$MAIN_CHECKOUT" worktree remove "$WORKTREE_DIR" 2>/dev/null; then
  log "rimosso $WORKTREE_DIR"
else
  log "$WORKTREE_DIR contiene lavoro non committato: lo lascio sul disco."
  log "per rimuoverlo: git worktree remove --force \"$WORKTREE_DIR\""
fi
