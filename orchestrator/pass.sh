#!/usr/bin/env bash
# One tick of a host timer the user set up: one board-loop pass in one clone,
# at most one per repository at a time, and none after a failed pass until the
# user removes its stop file by hand.
#
#   pass.sh <clone> [<owner>/<repo>]
#
# <clone> is one directory name under the clones directory, PASS_CLONES
# (~/clones by default). <owner>/<repo> is the repository the engine's job
# names, and the clone's origin must name the same one. The state directory, PASS_STATE (~/orchestrator),
# holds <clone>.stop, locks/ and passes/, where each pass's whole output is
# kept. The secret files are read from PASS_SECRETS (/run/secrets). GitHub is
# reached as the App alone: HARNESS_GITHUB_APP_ID and HARNESS_GITHUB_APP_MINT,
# the key holder's mint command, must be set, and reach the pass with no key path.
#
# On the host PASS_AS_AGENT names the launcher that runs a command as the
# session user. With it set, the pass runs in a push clone under PASS_PUSH
# (~/push), from its harness checkout under PASS_HARNESS (~/harness) at main's pin,
# and every bun the runner starts keeps the tree's bunfig.toml and .env out;
# a pin it cannot check out exits 1, as a failed pass does. There the job must
# name the repository, since `agent` writes the clone's origin, and both runner
# clones are reset each pass to hooks under PASS_HOOKS (/opt/orchestrator/hooks),
# an empty root-owned directory.
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
named=${2-}
dir=$clones/$name
stop=$state/$name.stop
# Git reads `GIT_DIR`, `GIT_CONFIG_*` and the rest over any clone's own config, so the
# reset below holds only when none is inherited; the runner's ~/.gitconfig still applies.
unset "${!GIT_@}"

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

# Without the shared guard an empty pattern would match every name.
. "$(dirname "${BASH_SOURCE[0]}")/clone-name.sh" || exit 2
if [[ ! $name =~ $segment ]]; then
	echo "orchestrator: no clone named '$name' under $clones" >&2
	exit 2
fi
part='[A-Za-z0-9][A-Za-z0-9._-]*'
# On the host the job's name is the only one `runner` owns; nothing of the clone is read without it.
if [ $# -gt 2 ] || { { [ -n "${PASS_AS_AGENT-}" ] || [ $# = 2 ]; } && [[ ! $named =~ ^($part)/($part)$ ]]; }; then
	echo "orchestrator: the job names no <owner>/<repo> for '$name'" >&2
	exit 2
fi
named=$(printf '%s' "$named" | tr '[:upper:]' '[:lower:]')
# On the host the clone is the session user's, so every look at it, this check included, runs as
# that user, through the launcher PASS_AS_AGENT names (its words, split on spaces).
as=()
if [ -n "${PASS_AS_AGENT-}" ]; then
	read -ra as <<<"$PASS_AS_AGENT"
	as+=("$dir")
fi
# A clone's `.git` is a directory; a worktree's is a file, and no pass pushes from one.
if ! "${as[@]}" test -d "$dir/.git"; then
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
origin=$("${as[@]}" git -C "$dir" config --get remote.origin.url)
url=${origin%.git}
repository="^([a-z][a-z0-9+.-]*://[^/]+/|[^/:]+:)($part)/($part)$"
if [[ ! $url =~ $repository ]]; then
	# Not the URL itself, which can carry a credential.
	echo "orchestrator: the origin of $dir names no owner and repository" >&2
	exit 2
fi
# GitHub reads both names case-blind.
owner=$(printf '%s' "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')
repo=$(printf '%s' "${BASH_REMATCH[3]}" | tr '[:upper:]' '[:lower:]')
# The host alone: scheme, credential and port dropped.
host=${BASH_REMATCH[1]#*://}
host=${host%[/:]}
host=${host##*@}
host=$(printf '%s' "${host%%:*}" | tr '[:upper:]' '[:lower:]')
# `+` is in neither name's character set, so no two pairs share a key.
key=$owner+$repo
# A session can point its clone's origin anywhere; a pass then would clone and run what it names.
if [ -n "$named" ] && [ "$owner/$repo" != "$named" ]; then
	mkdir -p "$state" || exit 1
	halt "the clone $dir names $owner/$repo, not $named, the repository the job names"
fi
# The push clone fetches and publishes on GitHub, so a clone on another host would work from another repository.
if [ -n "${PASS_AS_AGENT-}" ] && [ "$host" != github.com ]; then
	mkdir -p "$state" || exit 1
	halt "the clone $dir fetches from $host, not github.com, where the push clone publishes"
fi

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
# stop.sh finds the pass here. The forced command makes pass.sh a session
# leader, so its pid names the process group TERM ends.
printf '%s %s\n' "$$" "$name" >"$lock.pid"

# grep reads the file, so no token enters this shell's variables.
grep -q '[^[:space:]]' "$secrets/claude_oauth_token" 2>/dev/null || halt "$secrets/claude_oauth_token is missing or holds no token"
# The host reaches GitHub as the App alone, through the key holder's mint: no token file of the user's is read.
for setting in HARNESS_GITHUB_APP_ID HARNESS_GITHUB_APP_MINT; do
	[ -n "${!setting-}" ] || halt "$setting is unset — the host pushes and reads as the GitHub App alone"
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
	hooks=${PASS_HOOKS:-/opt/orchestrator/hooks}
	# A listing that fails prints nothing, which must not read as empty.
	if [ ! -d "$hooks" ] || ! entries=$(ls -A "$hooks") || [ -n "$entries" ]; then
		halt "the hooks directory $hooks is missing, unreadable or not empty"
	fi
	# Rewrites a runner clone's config to what this script sets, $2 its remote, and empties its hooks,
	# before any git command there: a forced checkout leaves both as the root session may have left them.
	reset() {
		{ [ -d "$1/.git" ] || { mkdir -p "$1" && git init -q --template= "$1"; }; } &&
			printf '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\thooksPath = %s\n%s' "$hooks" "${2-}" >"$1/.git/config" &&
			rm -rf "$1/.git/hooks" && mkdir "$1/.git/hooks" || halt "the clone $1 could not be reset"
	}
	reset "$push" "$(printf '[remote "origin"]\n\turl = https://github.com/%s.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n' "$owner/$repo")"
	reset "$harness"
	# A `contents` read token for the fetch alone, so a private repository answers it: it reaches git as
	# environment variables of that one command, never an argument, and the pass's environment never holds it.
	# shellcheck disable=SC2086 # the mint command is words, split as `minted()` splits it
	token=$($HARNESS_GITHUB_APP_MINT "$owner/$repo" contents=read) && [ -n "$token" ] ||
		halt "the mint command could not mint a contents read token for $owner/$repo"
	header="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$token" | base64 -w0)"
	unset token
	{ GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader GIT_CONFIG_VALUE_0=$header git -C "$push" fetch -q origin &&
		git -C "$push" checkout -qf --detach origin/main; } ||
		halt "the push clone $push could not check out origin/main"
	pin=$(git -C "$push" show origin/main:package.json | jq -r '.devDependencies.harness // empty')
	# The whole value: github:<owner>/<repo>#<a full commit>.
	[[ $pin =~ ^github:($part)/($part)#([0-9a-f]{40})$ ]] || halt "the harness pin '$pin' on main names no full commit"
	sha=${BASH_REMATCH[3]}
	# Fetched from the remote the pin names each pass, so a pin that moved is there before the checkout.
	git -C "$harness" fetch -q "https://github.com/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}.git" "$sha" &&
		git -C "$harness" checkout -qf --detach "$sha" && git -C "$harness" clean -qfdx ||
		halt "the harness pin '$pin': its commit could not be fetched and checked out"
	loop=$harness/bun/board-loop.ts
	here=$push
	flags=(--config=/dev/null --no-env-file)
	named=("HARNESS_AS_AGENT=$PASS_AS_AGENT" "HARNESS_CLONE=$dir")
fi

# A dropped connection (a Windmill restart) must not end the pass halfway.
trap '' HUP
log=$state/passes/$(date -u +%Y%m%dT%H%M%SZ)-$name.log
# gh's config is a fresh empty directory, never ~/.config/gh, whose stored login would hand the pass a token.
gh=$(mktemp -d "$state/gh.XXXXXX") || halt "no empty gh config directory could be made under $state"
cd "$here" || exit 1
# Only the child shell reads the token, so no command's arguments hold one.
# The output goes to the log, and reaches stdout once the pass ends, never
# through `tee`: a dropped connection would end `tee` on its next write, and
# the pass with it on its own.
env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 DISABLE_AUTOUPDATER=1 ${CLAUDECODE+"CLAUDECODE=$CLAUDECODE"} "${named[@]}" \
	GH_CONFIG_DIR="$gh" HARNESS_GITHUB_APP_ID="$HARNESS_GITHUB_APP_ID" HARNESS_GITHUB_APP_MINT="$HARNESS_GITHUB_APP_MINT" \
	bash -c 'CLAUDE_CODE_OAUTH_TOKEN=$(<"$1/claude_oauth_token") && export CLAUDE_CODE_OAUTH_TOKEN &&
		shift && exec bun "$@"' pass "$secrets" "${flags[@]}" "$loop" \
	>"$log" 2>&1
status=$?
# Before the lock frees, so no marker outlives its pass to name a reused pid.
rm -f "$lock.pid"
rm -rf "$gh"

# Any non-zero status pauses: the runner exits 0 or 1, so another (127, a
# signal) means the pass did not run as designed.
if [ "$status" != 0 ]; then
	pause "$status" "$(tail -n 1 "$log")"
fi
cat "$log"
exit "$status"
