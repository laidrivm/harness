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
# On the host PASS_AS_AGENT names the launcher that runs a command as the
# session user. With it set, the pass runs in a push clone under PASS_PUSH
# (~/push), from its harness checkout under PASS_HARNESS (~/harness) at main's pin,
# and every bun the runner starts keeps the tree's bunfig.toml and .env out;
# a pin it cannot check out exits 1, as a failed pass does.
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

# Pauses, says why and exits 1: a host that cannot start the pass as designed.
halt() {
	pause 1 "orchestrator: $1"
	echo "orchestrator: $1"
	exit 1
}

# The whole value: one path segment, never `.`, `..` or an option. A clone's
# `.git` is a directory; a worktree's is a file, and no pass pushes from one.
segment='^[A-Za-z0-9][A-Za-z0-9._-]*$'
if [[ ! $name =~ $segment ]] || [ ! -d "$dir/.git" ]; then
	echo "orchestrator: no clone named '$name' under $clones" >&2
	exit 2
fi

# Exits 3 while the stop file exists.
paused() {
	[ -e "$stop" ] || return 0
	echo "orchestrator: paused — $stop: $(head -n 1 "$stop"); remove it to resume"
	exit 3
}
paused

# The lock is the repository's, so a clone over HTTPS and one over SSH share
# it: scheme://host/<owner>/<repo> or user@host:<owner>/<repo>, `.git` dropped.
# On the host the clone is the session user's, so even this lookup runs as
# that user, through the launcher PASS_AS_AGENT names (its words, split on spaces).
as=()
if [ -n "${PASS_AS_AGENT-}" ]; then
	read -ra as <<<"$PASS_AS_AGENT"
	as+=("$dir")
fi
origin=$("${as[@]}" git -C "$dir" config --get remote.origin.url)
url=${origin%.git}
part='[A-Za-z0-9][A-Za-z0-9._-]*'
repository="^([a-z][a-z0-9+.-]*://[^/]+/|[^/:]+:)($part)/($part)$"
if [[ ! $url =~ $repository ]]; then
	# Not the URL itself, which can carry a credential.
	echo "orchestrator: the origin of $dir names no owner and repository" >&2
	exit 2
fi
# GitHub reads both names case-blind.
owner=$(printf '%s' "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')
repo=$(printf '%s' "${BASH_REMATCH[3]}" | tr '[:upper:]' '[:lower:]')
key=$owner-$repo

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
# Again under the lock: a pass that failed after the first check wrote its
# stop file before it let the lock go.
paused

for file in claude_oauth_token gh_token; do
	# grep reads the file, so no token enters this shell's variables.
	grep -q '[^[:space:]]' "$secrets/$file" 2>/dev/null || halt "$secrets/$file is missing or holds no token"
done

# On the host the pass runs the runner's own checkout of the harness, at the
# commit main pins, in a push clone of the runner's, never a file of the
# session's clone; and its bun keeps the tree's bunfig.toml and .env out.
loop=node_modules/harness/bun/board-loop.ts
here=$dir
flags=()
named=()
if [ -n "${PASS_AS_AGENT-}" ]; then
	# Two segments: a hyphen inside a name would make `<owner>-<repo>` name two repositories.
	push=${PASS_PUSH:-$HOME/push}/$owner/$repo
	# Per repository, as the lock is: a shared checkout could move to another pin under a running pass.
	harness=${PASS_HARNESS:-$HOME/harness}/$owner/$repo
	if [ ! -d "$push/.git" ]; then
		{ mkdir -p "${push%/*}" && git clone -q --template= "$origin" "$push"; } || halt "the push clone $push could not be made"
	fi
	{ git -C "$push" fetch -q origin && git -C "$push" checkout -qf --detach origin/main; } ||
		halt "the push clone $push could not check out origin/main"
	pin=$(git -C "$push" show origin/main:package.json | jq -r '.devDependencies.harness // empty')
	# The whole value: github:<owner>/<repo>#<a full commit>.
	[[ $pin =~ ^github:($part)/($part)#([0-9a-f]{40})$ ]] || halt "the harness pin '$pin' on main names no full commit"
	sha=${BASH_REMATCH[3]}
	# Fetched from the remote the pin names each pass, so a pin that moved is there before the checkout.
	{ [ -d "$harness/.git" ] || { mkdir -p "${harness%/*}" && git init -q "$harness"; }; } &&
		git -C "$harness" fetch -q "https://github.com/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}.git" "$sha" &&
		git -C "$harness" checkout -qf --detach "$sha" && git -C "$harness" clean -qfdx ||
		halt "the harness pin '$pin': its commit could not be fetched and checked out"
	loop=$harness/bun/board-loop.ts
	here=$push
	flags=(--config=/dev/null --no-env-file)
	named=("HARNESS_AS_AGENT=$PASS_AS_AGENT" "HARNESS_CLONE=$dir")
fi

# A dropped connection (an n8n restart) must not end the pass halfway.
trap '' HUP
log=$state/passes/$(date -u +%Y%m%dT%H%M%SZ)-$name.log
cd "$here" || exit 1
# Only the child shell reads the tokens, so no command's arguments hold one.
# The output goes to the log, and reaches stdout once the pass ends, never
# through `tee`: a dropped connection would end `tee` on its next write, and
# the pass with it on its own.
env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 DISABLE_AUTOUPDATER=1 ${CLAUDECODE+"CLAUDECODE=$CLAUDECODE"} "${named[@]}" \
	bash -c 'CLAUDE_CODE_OAUTH_TOKEN=$(<"$1/claude_oauth_token") && GH_TOKEN=$(<"$1/gh_token") &&
		export CLAUDE_CODE_OAUTH_TOKEN GH_TOKEN && shift && exec bun "$@"' pass "$secrets" "${flags[@]}" "$loop" \
	>"$log" 2>&1
status=$?

# Any non-zero status pauses: the runner exits 0 or 1, so another (127, a
# signal) means the pass did not run as designed.
if [ "$status" != 0 ]; then
	pause "$status" "$(tail -n 1 "$log")"
fi
cat "$log"
exit "$status"
