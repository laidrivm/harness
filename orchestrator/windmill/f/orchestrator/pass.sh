# One hourly pass: ssh to the runner, whose forced command runs pass.sh for
# the clone named. The script ends on that call, so the pass's status is the
# job's, and a failed or paused pass reads as failed in Runs.
#
# The key is the secret variable f/orchestrator/runner_ssh_key, the private
# key base64-encoded on one line, read by its path alone.
set -eu
key=$(mktemp)
trap 'rm -f "$key"' EXIT
printf 'Authorization: Bearer %s\n' "$WM_TOKEN" \
	| curl -fsS -H @- "$BASE_INTERNAL_URL/api/w/$WM_WORKSPACE/variables/get_value/f/orchestrator/runner_ssh_key" \
	| tr -d '"' | base64 -d >"$key"
# The runner is a compose service no outside host joins, and its host key
# changes with each image build, so no known_hosts is kept.
ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR runner@runner harness
