# One hourly pass: ssh to the runner, whose forced command runs pass.sh for
# the clone named. The script ends on that call, so the pass's status is the
# job's, and a failed or paused pass reads as failed in Runs.
#
# The key is the secret variable f/orchestrator/runner_ssh_key, the private
# key base64-encoded on one line, read by its path alone.
# pipefail: a failed read stops here, not at ssh with an empty key.
set -euo pipefail
key=$(mktemp)
trap 'rm -f "$key"' EXIT
printf 'Authorization: Bearer %s\n' "$WM_TOKEN" \
	| curl -fsS -H @- "$BASE_INTERNAL_URL/api/w/$WM_WORKSPACE/variables/get_value/f/orchestrator/runner_ssh_key" \
	| tr -d '"' | base64 -d >"$key"
# The runner's host key comes from a secret file, and its public half is
# pinned here, so another container answering as runner fails the pass.
ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/run/secrets/runner_known_hosts -o LogLevel=ERROR runner@runner harness
