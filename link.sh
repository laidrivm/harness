#!/usr/bin/env bash
# link.sh — symlinks skills from the central skills repo into a project (or globally).
#
# Usage (run from the skills repo root, or from anywhere):
#   ./link.sh <skill> <path-to-project>   # link one skill into <project>/.claude/skills/<skill>
#   ./link.sh all <path-to-project>       # link every skill in the repo
#   ./link.sh <skill>|all global          # same, but into ~/.claude/skills
#   ./link.sh <skill>|all <dest> --unlink # remove the link(s)
#
# Examples:
#   ./link.sh triage /Project/d2ass
#   ./link.sh all /Project/d2ass
#   ./link.sh all /Project/d2ass --unlink

set -euo pipefail

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

[ $# -ge 2 ] || usage
SKILL="$1"
DEST="$2"
ACTION="${3:-link}"

# Skills live under core/skills/ of the repo containing this script
SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)/core/skills"

# Resolve the target skills directory
if [ "$DEST" = "global" ]; then
  TARGET_DIR="$HOME/.claude/skills"
else
  [ -d "$DEST" ] || { echo "Error: project '$DEST' not found." >&2; exit 1; }
  TARGET_DIR="$(cd "$DEST" && pwd)/.claude/skills"
fi

# Compute the relative path from the link's directory to a skill (portable for git).
# realpath --relative-to comes with GNU coreutils; on stock macOS fall back to python.
relpath() {
  if realpath --relative-to=/ / >/dev/null 2>&1; then
    realpath --relative-to="$TARGET_DIR" "$1"
  else
    python3 -c "import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))" "$1" "$TARGET_DIR"
  fi
}

# link_one <skill-name> — create the symlink for a single skill
link_one() {
  local name="$1"
  local src="$SKILLS_DIR/$name"
  local link="$TARGET_DIR/$name"

  [ -d "$src" ] || { echo "Error: skill '$name' not found in $SKILLS_DIR" >&2; return 1; }
  [ -f "$src/SKILL.md" ] || echo "Warning: $src has no SKILL.md — Claude Code won't pick it up." >&2

  local rel
  rel="$(relpath "$src")"

  if [ -L "$link" ]; then
    local current
    current="$(readlink "$link")"
    if [ "$current" = "$rel" ]; then
      echo "Already linked: $link -> $rel"
      return 0
    fi
    echo "Error: $link already points to '$current'. Remove it first with --unlink." >&2
    return 1
  elif [ -e "$link" ]; then
    echo "Error: $link exists and is not a symlink (a local copy of the skill?) — not overwriting." >&2
    return 1
  fi

  ln -s "$rel" "$link"
  echo "Linked: $link -> $rel"
}

# unlink_one <skill-name> — remove the symlink for a single skill
unlink_one() {
  local name="$1"
  local link="$TARGET_DIR/$name"

  if [ -L "$link" ]; then
    rm "$link"
    echo "Removed link: $link"
  elif [ -e "$link" ]; then
    echo "Error: $link exists but is not a symlink — leaving it alone." >&2
    return 1
  else
    echo "No link found: $link"
  fi
}

# Build the list of skills to process: every core/skills/ dir with a SKILL.md, or the named one
if [ "$SKILL" = "all" ]; then
  SKILLS=()
  for dir in "$SKILLS_DIR"/*/; do
    [ -f "$dir/SKILL.md" ] && SKILLS+=("$(basename "$dir")")
  done
  [ ${#SKILLS[@]} -gt 0 ] || { echo "Error: no skills (dirs with SKILL.md) found in $SKILLS_DIR" >&2; exit 1; }
else
  SKILLS=("$SKILL")
fi

mkdir -p "$TARGET_DIR"

FAILED=0
for name in "${SKILLS[@]}"; do
  if [ "$ACTION" = "--unlink" ]; then
    unlink_one "$name" || FAILED=1
  else
    link_one "$name" || FAILED=1
  fi
done
exit $FAILED
