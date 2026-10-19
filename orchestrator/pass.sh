#!/usr/bin/env bash
# One tick of a host timer the user set up: one board-loop pass in one clone,
# at most one per repository at a time, and none after a failed pass until the
# user removes its stop file by hand.
#
#   pass.sh <clone>
#
# <clone> is one directory name under the clones directory, PASS_CLONES
# (~/clones by default). The state directory, PASS_STATE (~/orchestrator),
# holds <clone>.stop, locks/ and passes/, where each pass's whole output is
# kept. The secret files are read from PASS_SECRETS (/run/secrets).
#
# Exits 2 for a name that is no clone, 3 while the stop file exists, 0 while
# another pass holds the repository's lock, and otherwise the pass's status.
#
# CLAUDECODE is handed on, never checked here: the runner refuses it, and a
# second copy of that check would drift from the runner's.

clones=${PASS_CLONES:-$HOME/clones}
state=${PASS_STATE:-$HOME/orchestrator}
secrets=${PASS_SECRETS:-/run/secrets}
name=${1-}
dir=$clones/$name
stop=$state/$name.stop

# Writes the stop file: the UTC time, the status and the last line.
pause() {
	printf '%s exit %s: %s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$1" "$2" >"$stop"
}

# The whole value: one path segment, never `.`, `..` or an option. A clone's
# `.git` is a directory; a worktree's is a file, and no pass pushes from one.
segment='^[A-Za-z0-9][A-Za-z0-9._-]*$'
if [[ ! $name =~ $segment ]] || [ ! -d "$dir/.git" ]; then
	echo "orchestrator: no clone named '$name' under $clones" >&2
	exit 2
fi

if [ -e "$stop" ]; then
	echo "orchestrator: paused — $stop: $(head -n 1 "$stop"); remove it to resume"
	exit 3
fi

# The lock is the repository's, so a clone over HTTPS and one over SSH share
# it: scheme://host/<owner>/<repo> or user@host:<owner>/<repo>, `.git` dropped.
url=$(git -C "$dir" config --get remote.origin.url)
url=${url%.git}
part='[A-Za-z0-9][A-Za-z0-9._-]*'
repository="^([a-z][a-z0-9+.-]*://[^/]+/|[^/:]+:)($part)/($part)$"
if [[ ! $url =~ $repository ]]; then
	# Not the URL itself, which can carry a credential.
	echo "orchestrator: the origin of $dir names no owner and repository" >&2
	exit 2
fi
# GitHub reads both names case-blind.
key=$(printf '%s-%s' "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" | tr '[:upper:]' '[:lower:]')

mkdir -p "$state/locks" "$state/passes" || exit 1
lock=$state/locks/$key.lock
# Fd 9 holds the lock; the pass inherits it, so it is held until the pass and
# everything it started have exited.
exec 9>"$lock"
flock -n -E 75 9
held=$?
if [ "$held" = 75 ]; then
	echo "orchestrator: busy — $lock is held"
	exit 0
elif [ "$held" != 0 ]; then
	pause "$held" "orchestrator: flock failed on $lock"
	echo "orchestrator: flock failed on $lock"
	exit "$held"
fi

for file in claude_oauth_token gh_token; do
	# grep reads the file, so no token enters this shell's variables.
	if ! grep -q '[^[:space:]]' "$secrets/$file" 2>/dev/null; then
		pause 1 "orchestrator: $secrets/$file is missing or holds no token"
		echo "orchestrator: $secrets/$file is missing or holds no token"
		exit 1
	fi
done

# A dropped connection (an n8n restart) must not end the pass halfway.
trap '' HUP
log=$state/passes/$(date -u +%Y%m%dT%H%M%SZ)-$name.log
cd "$dir" || exit 1
# Only the child shell reads the tokens, so no command's arguments hold one.
# The output goes to the log, and reaches stdout once the pass ends, never
# through `tee`: a dropped connection would end `tee` on its next write, and
# the pass with it on its own.
env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 DISABLE_AUTOUPDATER=1 ${CLAUDECODE+"CLAUDECODE=$CLAUDECODE"} \
	bash -c 'CLAUDE_CODE_OAUTH_TOKEN=$(<"$1/claude_oauth_token") && GH_TOKEN=$(<"$1/gh_token") &&
		export CLAUDE_CODE_OAUTH_TOKEN GH_TOKEN && exec bun node_modules/harness/bun/board-loop.ts' pass "$secrets" \
	>"$log" 2>&1
status=$?

# Any non-zero status pauses: the runner exits 0 or 1, so another (127, a
# signal) means the pass did not run as designed.
if [ "$status" != 0 ]; then
	pause "$status" "$(tail -n 1 "$log")"
fi
cat "$log"
exit "$status"
