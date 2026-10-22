#!/usr/bin/env bash
# Stops the pass running in one clone, by hand. The user runs it on the runner,
#
#   docker compose exec -u runner runner /opt/orchestrator/stop.sh <clone>
#
# never on the host, whose kill would miss the runner's PID namespace, and as
# runner, so the stop file has the owner one from pass.sh has. The engine's
# key cannot reach it: that key runs pass.sh alone.
#
# pass.sh, once it holds its repository's lock, writes `<pid> <clone>` to
# `<lock>.pid`; the pid leads the pass's process group. With no pass holding
# that lock this drops the stale marker, prints `idle` and signals nothing.
# Otherwise it writes the stop file first, then sends TERM to the group and
# waits for the lock, so a tick that takes the freed lock is paused until the
# user removes the file.
#
# Exits 2 for a bad name, 1 when the group cannot be signalled, and otherwise 0.

state=${PASS_STATE:-$HOME/orchestrator}
name=${1-}
# Without the shared guard an empty pattern would match every name.
. "$(dirname "${BASH_SOURCE[0]}")/clone-name.sh" || exit 2
if [ $# != 1 ] || [[ ! $name =~ $segment ]]; then
	echo "orchestrator: no clone named '$name'" >&2
	exit 2
fi

marker=
for file in "$state"/locks/*.pid; do
	# A pid of 0 or none would signal this script's own group.
	if read -r group owner <"$file" && [[ $group =~ ^[1-9][0-9]*$ ]] && [ "$owner" = "$name" ]; then
		marker=$file
		break
	fi
done 2>/dev/null
if [ -z "$marker" ]; then
	echo idle
	exit 0
fi

exec 9>"${marker%.pid}"
if flock -n 9; then
	rm -f "$marker"
	echo idle
	exit 0
fi
echo 'stopped by hand' >"$state/$name.stop"
if ! kill -TERM -- "-$group"; then
	echo "orchestrator: the pass's process group $group could not be signalled; $state/$name.stop pauses the next tick" >&2
	exit 1
fi
flock 9
rm -f "$marker"
echo "orchestrator: stopped the pass in $name; remove $state/$name.stop to resume"
