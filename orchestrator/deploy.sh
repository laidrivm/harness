#!/usr/bin/env bash
# One run of harness-deploy.service, as root on the host, from the checkout's
# orchestrator/ (host-deploy design). When origin/main's head is neither the
# commit last deployed nor the one last rolled back, and its newest `test`
# check run from github-actions, across check suites and pages, concluded
# success (bun/green-run.ts decides), it fast-forwards the checkout to that
# head, tags the runner's running image as the previous one, and builds the
# images. Only while the persistent session is fresh (the
# managed hooks' ~/.harness-fresh in agent's home) does it bring the stack up,
# under every pass lock, restart the runner when up left it as it was, and
# wait two minutes at most for tmux session `main`; then it pushes the
# Windmill scripts and route while their token exists, records the head and
# prunes. A session that does not come back is rolled back once: the
# rolled-back record and the failure file first, then the previous image under
# the name and the runner up on it. A rollback step that fails is named in the
# failure file and left for the user; while the rolled-back record names the
# head, no run retries it (design, *Known limits of the light rollback*). A
# record that cannot be written is named there too, and the next run deploys
# the head again, its rollback included.
#
# The records are `deployed` and `rolled-back` in $STATE_DIRECTORY, systemd's
# StateDirectory, or /var/lib/harness-deploy for a run by hand. A fetch or a
# check read that fails exits 1 and writes nothing: the host is still on a
# working commit. A step after the fast-forward that fails writes the failure
# file ~/.harness-deploy-failed in agent's home, which the session's next start
# or prompt reports, and each clone's stop file, unless one exists, and exits
# 1; the next run starts again from the fetch. Every other run exits 0, a busy
# session's included.

# Compose names them after the project, `orchestrator`: <project>-<service>
# for a built image, <project>_<name> for a network or a volume.
image=orchestrator-runner
network=orchestrator_default

# The runner image's jq, so the host needs none of its own.
json() {
	docker run --rm -i --entrypoint jq "$image" "$@"
}

# A volume's directory on the host.
volume() {
	local dir
	dir=$(docker volume inspect -f '{{ .Mountpoint }}' "orchestrator_$1") && [ -d "$dir" ] && printf '%s\n' "$dir"
}

# 0 when the head's newest `test` run from github-actions, across its check
# suites, concluded success, 1 when it did not or there is none, 2 when the
# check runs could not be read. bun/green-run.ts decides, under the runner
# image's bun, over every page read so far, and exits 3 while it wants the
# next. It is the checkout's file, never the image's: a build that failed
# after the fast-forward, or a rollback, leaves the name on an image older
# than the rule. The read before the fast-forward runs the rule this script
# was read with; the read under the locks runs the head's, so a head that
# changes the rule's exit codes keeps their meaning for this script.
green() {
	local pages= body n=1
	while :; do
		body=$(curl -fsS --max-time 30 -H 'Accept: application/vnd.github+json' "$runs&per_page=100&page=$n") || return 2
		pages=${pages:+$pages,}$body
		printf '[%s]' "$pages" | docker run --rm -i \
			--mount "type=bind,source=${PWD%/*}/bun/green-run.ts,target=/green-run.ts,readonly" \
			--entrypoint bun "$image" /green-run.ts
		# Not green is 4, never 1, which bun and docker exit with on their own failures.
		case $? in
		0) return 0 ;;
		4) return 1 ;;
		3) n=$((n + 1)) ;;
		*) return 2 ;;
		esac
	done
}

# Writes the line $2 to a new file $1 in a volume a container's user can
# write, owned as $3 is. noclobber creates a missing file with O_EXCL and
# refuses an existing regular one, a symlink to one included, and chown -h
# changes the file, never a link's target.
# shortcut: bash opens an existing non-regular target (a symlink to a device
# or a FIFO, planted by the container's user after the caller's rm), so root
# can still write through one; drop to that user for the write if the session
# is ever treated as hostile.
put() {
	(set -C && printf '%s\n' "$2" >"$1") 2>/dev/null && chown -h --reference="$3" "$1"
}

# Says which step failed, writes the failure file in place of an older one,
# owned as agent's home is so the session's hook can move it aside, then each
# clone's stop file that does not exist yet, owned as the runner's home is,
# and fails.
failed() {
	echo "deploy: $1 failed at $head"
	local line runner agent dir name stop
	line="$(date -u +%Y%m%dT%H%M%SZ) deploy: $1 failed at $head"
	if ! agent=$(volume agent_home); then
		echo "deploy: no failure file written: the agent's volume cannot be found"
		return 1
	fi
	rm -f "$agent/.harness-deploy-failed" && put "$agent/.harness-deploy-failed" "$line" "$agent" ||
		echo "deploy: the failure file could not be written"
	if ! runner=$(volume runner_home); then
		echo "deploy: no stop file written: the runner's volume cannot be found"
		return 1
	fi
	for dir in "$agent"/clones/*/; do
		[ -d "$dir" ] || continue
		name=${dir%/}
		name=${name##*/}
		stop=$runner/orchestrator/$name.stop
		[ -e "$stop" ] && continue
		put "$stop" "$line" "$runner" || echo "deploy: the stop file $stop could not be written"
	done
	return 1
}

# 0 while the managed hooks' mark is in $agent: set on startup and /clear,
# removed by the first message, so a restart then ends no turn.
fresh() {
	[ -e "$agent/.harness-fresh" ] && return 0
	echo "deploy: the session is at work; $head waits for a fresh one"
	return 1
}

# Takes each lock file it is handed, blocking, then reads the check again,
# looks for the mark again, removes an older failure file, brings the stack
# up, and restarts the runner when up left $container, the one tagged, as it
# was, so the session starts again on the updated clone. Each level holds its
# file on fd 9: bash keeps the enclosing level's open on another descriptor
# while the inner one runs, so every lock stays held until the calls return.
# Returns 3 when the check is no longer green or the session is at work, and
# 4 when the check cannot be read.
locked() {
	if [ $# = 0 ]; then
		green
		case $? in
		1)
			echo "deploy: the test check of $head is no longer green; nothing brought up"
			return 3
			;;
		2)
			echo "deploy: the check runs of $head could not be read again"
			return 4
			;;
		esac
		# Again, since a message may have come during the hold or the read.
		fresh || return 3
		# This head supersedes an older failure, and the restarted session's
		# start can run before the wait for main sees it.
		rm -f "$agent/.harness-deploy-failed"
		step=up
		docker compose up -d || return 1
		local now
		now=$(docker compose ps -aq runner) || return 1
		[ "$now" = "$container" ] || return 0
		step="the restart"
		docker compose restart runner || return 1
		return 0
	fi
	local file=$1
	shift
	# The gate is held already, and an unmatched glob names no file.
	if [ "$file" = "$gate" ] || [ ! -e "$file" ]; then
		locked "$@"
		return
	fi
	{ flock 9 && locked "$@"; } 9<"$file"
}

# The run's one rollback. rolled-back and the failure file come before up, so
# the restored session's start finds the failure and, once rolled-back is
# written, no later run deploys the head again; a tag or an up that fails is
# named in the same file and left for the user. A rolled-back that cannot be
# written is named beside the step in every failure line, since each replaces
# the one before in the failure file; it is written before the first failed
# call because each clone's stop file keeps that first line. The next run then
# deploys the head again. When the image did not change, the tag and up change
# nothing.
rollback() {
	local also=
	printf '%s\n' "$head" >"$state/rolled-back" || {
		echo "deploy: $head could not be recorded as rolled back"
		also=" and the rolled-back record"
	}
	failed "the wait for main$also"
	docker tag "$image:previous" "$image" || {
		failed "the tag back$also"
		return
	}
	docker compose up -d runner || failed "the rollback's up$also"
}

deploy() {
	cd "$(dirname "${BASH_SOURCE[0]}")" || return 1
	local state=${STATE_DIRECTORY:-/var/lib/harness-deploy}
	mkdir -p "$state" || return 1

	git fetch -q origin || {
		echo "deploy: the fetch failed"
		return 1
	}
	head=$(git rev-parse --verify -q origin/main) || {
		echo "deploy: origin/main names no commit"
		return 1
	}
	if [ "$head" = "$(cat "$state/deployed" 2>/dev/null)" ]; then
		echo "deploy: $head is deployed"
		return 0
	fi
	# Retried, it would recreate the broken runner every tick.
	if [ "$head" = "$(cat "$state/rolled-back" 2>/dev/null)" ]; then
		echo "deploy: $head was rolled back; the next head deploys, or removing $state/rolled-back retries it"
		return 0
	fi
	local url part='[A-Za-z0-9][A-Za-z0-9._-]*'
	url=$(git config --get remote.origin.url)
	url=${url%.git}
	if [[ ! $url =~ ^(https://github\.com/|ssh://git@github\.com/|git@github\.com:)($part)/($part)$ ]]; then
		echo "deploy: the checkout's origin names no repository on GitHub"
		return 1
	fi
	runs="https://api.github.com/repos/${BASH_REMATCH[2]}/${BASH_REMATCH[3]}/commits/$head/check-runs?check_name=test&filter=latest"
	green
	case $? in
	1)
		echo "deploy: the test check of $head has not passed"
		return 0
		;;
	2)
		echo "deploy: the check runs of $head could not be read"
		return 1
		;;
	esac

	# The merge alone reports success over a local commit, and leaves an edit
	# or an untracked file the build would take in.
	local tree
	git merge -q --ff-only origin/main && tree=$(git status --porcelain --untracked-files=normal) && [ -z "$tree" ] &&
		[ "$(git rev-parse HEAD)" = "$head" ] || {
		failed "the fast-forward"
		return 1
	}
	# The running container's image, not the name's: a build that waited for
	# a fresh session has moved the name already. With no container, a stack
	# brought down, the name's image is the one up would have brought back.
	local source=$image
	container=$(docker compose ps -aq runner) &&
		{ [ -z "$container" ] || source=$(docker inspect -f '{{ .Image }}' "$container"); } &&
		docker tag "$source" "$image:previous" || {
		failed "the tag"
		return 1
	}
	docker compose build || {
		failed "the build"
		return 1
	}

	local agent
	agent=$(volume agent_home) || {
		failed "the mark"
		return 1
	}
	# Each head built while the session is at work moves the name, and the
	# image it left would wait for a deploy to be pruned.
	fresh || {
		prune
		return 0
	}

	# Every pass lock, from the host: the gate first, which pass.sh takes
	# before its own, then each repository's lock file.
	local runner
	runner=$(volume runner_home) || {
		failed "the lock"
		return 1
	}
	gate=$runner/orchestrator/locks/gate.lock
	# runner's, as the locks/ pass.sh makes, since a pass opens it for writing.
	if [ ! -e "$gate" ]; then
		mkdir -p "${gate%/*}" && : >>"$gate" && chown --reference="$runner" "$runner/orchestrator" "${gate%/*}" "$gate" || {
			failed "the lock"
			return 1
		}
	fi
	step="the lock"
	{ flock 9 && locked "${gate%/*}"/*.lock; } 9<"$gate"
	case $? in
	0) ;;
	3) return 0 ;;
	4) return 1 ;;
	*)
		failed "$step"
		return 1
		;;
	esac

	# main every 5 s, 120 s at most.
	local polls=25
	until docker compose exec -T -u agent runner tmux has-session -t main >/dev/null 2>&1; do
		polls=$((polls - 1))
		if [ "$polls" = 0 ]; then
			rollback
			return 1
		fi
		sleep 5
	done

	if [ ! -e secrets/windmill_deploy_token ]; then
		echo "deploy: no secrets/windmill_deploy_token; the Windmill push is skipped"
	else
		push || return 1
	fi

	printf '%s\n' "$head" >"$state/deployed" || {
		failed "the record"
		return 1
	}
	echo "deploy: $head deployed"
	prune
}

# A rebuild leaves the old image dangling, and the disk is small.
prune() {
	docker image prune -f >/dev/null || echo "deploy: the prune failed; the old images stay"
}

# The engine wait and the push, each in a one-off container.
push() {
	# The CLI moves with the engine: its version is the server's image tag.
	local server version
	server=$(docker compose config --format json | json -r '.services.windmill_server.image')
	if [[ ! $server =~ :([0-9]+\.[0-9]+\.[0-9]+)(@sha256:[0-9a-f]{64})?$ ]]; then
		failed "the push"
		return 1
	fi
	version=${BASH_REMATCH[1]}
	# up -d does not wait for the engine, which has no health check.
	docker run --rm --network "$network" --entrypoint curl "$image" -fsS -o /dev/null \
		--retry 60 --retry-delay 2 --retry-max-time 120 --retry-all-errors http://engine:8080/api/version || {
		failed "the push"
		return 1
	}
	# The token is read inside the container, into its environment, so no
	# process's arguments carry it; --mount fails on a missing file where -v
	# would create a directory in its place.
	docker run --rm --network "$network" \
		--mount "type=bind,source=$PWD/windmill,target=/windmill" \
		--mount "type=bind,source=$PWD/secrets/windmill_deploy_token,target=/run/secrets/windmill_deploy_token,readonly" \
		-w /windmill -e WM_WORKSPACE=harness-admin -e BASE_INTERNAL_URL=http://engine:8080 --entrypoint sh "$image" \
		-c 'WM_TOKEN=$(cat /run/secrets/windmill_deploy_token) && export WM_TOKEN && exec bun x "windmill-cli@$1" sync push --yes --skip-secrets --include-triggers' \
		push "$version" || {
		failed "the push"
		return 1
	}
}

# Bash has read the whole body before the fast-forward rewrites this file, so
# a run is one version end to end, and `exit` reads nothing after it.
deploy "$@"
exit
