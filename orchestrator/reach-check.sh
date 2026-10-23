#!/bin/sh
# Task 5.5's check (runner-isolation spec, *The session user reads no secret
# file*), run in the runner container as root:
#
#   docker compose exec runner /opt/orchestrator/reach-check.sh
#
# As agent it reads every secret file the runner mounts and the App's key, and
# as runner the key, each into /dev/null. Exits 0 when every read failed, and 1
# naming each file one could read, the key when it is absent, or the user it
# cannot switch to.
#
# REACH_SECRETS, REACH_KEY and the two REACH_AS_* prefixes exist for its test.
secrets=${REACH_SECRETS:-/run/secrets}
key=${REACH_KEY:-/var/lib/orchestrator-key/app.pem}
as_agent=${REACH_AS_AGENT-runuser -u agent --}
as_runner=${REACH_AS_RUNNER-runuser -u runner --}

if [ ! -e "$key" ]; then
	echo "reach-check: $key is absent — place the App's key first (README step 11)"
	exit 1
fi
# A switch that cannot run would read below as every read refused.
for user in agent runner; do
	if [ "$user" = agent ]; then as=$as_agent; else as=$as_runner; fi
	if ! $as true >/dev/null 2>&1; then
		echo "reach-check: cannot switch to $user"
		exit 1
	fi
done
status=0
for f in "$secrets"/* "$key"; do
	[ -e "$f" ] || continue
	# Unquoted: each prefix is words.
	if $as_agent cat "$f" >/dev/null 2>&1; then
		echo "reach-check: agent reads $f"
		status=1
	fi
done
if $as_runner cat "$key" >/dev/null 2>&1; then
	echo "reach-check: runner reads $key"
	status=1
fi
[ "$status" = 0 ] && echo "reach-check: no secret file is readable as agent, and the App's key not as runner"
exit "$status"
