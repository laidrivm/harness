#!/usr/bin/env bash
# One run of harness-deploy.service, as root on the host, from the checkout's
# orchestrator/ (host-deploy design). When origin/main's head is not the
# commit last deployed and its latest `test` check run from github-actions
# concluded success, it fast-forwards the checkout to that head, builds the
# images, brings the stack up while it holds every pass lock, pushes the
# Windmill scripts and route, and only then records the head.
#
# The record is $STATE_DIRECTORY/deployed, systemd's StateDirectory, or
# /var/lib/harness-deploy/deployed for a run by hand. A fetch or a check read
# that fails exits 1 and pauses nothing: the host is still on a working commit.
# A step after the fast-forward that fails writes each clone's stop file,
# unless one exists, and exits 1; the next run starts again from the fetch.
# Every other run exits 0.

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

# 0 when a latest `test` run from github-actions concluded success for the
# head, 1 when none did, 2 when the check runs could not be read.
green() {
	local body
	body=$(curl -fsS --max-time 30 -H 'Accept: application/vnd.github+json' "$runs") || return 2
	printf '%s' "$body" | json -e 'any(.check_runs[]; .app.slug == "github-actions" and .conclusion == "success")' >/dev/null
	case $? in
	0) return 0 ;;
	1) return 1 ;;
	*) return 2 ;;
	esac
}

# Says which step failed, writes each clone's stop file that does not exist
# yet, owned as the runner's home is, and fails.
failed() {
	echo "deploy: $1 failed at $head"
	local runner agent dir name stop
	if ! runner=$(volume runner_home) || ! agent=$(volume agent_home); then
		echo "deploy: no stop file written: the runner's and the agent's volumes cannot be found"
		return 1
	fi
	for dir in "$agent"/clones/*/; do
		[ -d "$dir" ] || continue
		name=${dir%/}
		name=${name##*/}
		stop=$runner/orchestrator/$name.stop
		[ -e "$stop" ] && continue
		printf '%s deploy: %s failed at %s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$1" "$head" >"$stop" &&
			chown --reference="$runner" "$stop" || echo "deploy: the stop file $stop could not be written"
	done
	return 1
}

# Takes each lock file it is handed, blocking, then reads the check again and
# brings the stack up. Each level holds its file on fd 9: bash keeps the
# enclosing level's open on another descriptor while the inner one runs, so
# every lock stays held until the calls return. Returns 3 when the check is no
# longer green and 4 when it cannot be read.
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
		step=up
		docker compose up -d || return 1
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
	docker compose build || {
		failed "the build"
		return 1
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

	# A rebuild leaves the old image dangling, and the disk is small.
	docker image prune -f >/dev/null || echo "deploy: the prune failed; the old images stay"

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

	printf '%s\n' "$head" >"$state/deployed" || return 1
	echo "deploy: $head deployed"
}

# Bash has read the whole body before the fast-forward rewrites this file, so
# a run is one version end to end, and `exit` reads nothing after it.
deploy "$@"
exit
