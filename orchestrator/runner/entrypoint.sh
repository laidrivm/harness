#!/bin/sh
# Writes runner's one authorized_keys line from the engine's public key, then
# runs the command (sshd). The key reaches pass.sh alone, with the words the
# engine sends split on spaces and globbing off: the engine can name a clone
# and its repository and nothing else, since pass.sh refuses a third word.
# It hands pass.sh the launcher, the key holder's mint and the App's id, read
# per call from its root-owned file (runner-isolation group 5), so a pass
# before the App's files are placed refuses, naming the setting.
#
# It installs sshd's one host key from a secret file, whose public half the
# engine pins, so a rebuild keeps the key and a stand-in on the network fails.
#
# A second key, the engine's for webhooks, reaches the event handler alone,
# with the engine's words as its one argument and the body on stdin
# (ci-run-agent design, *The engine's contract*).
#
# PUBKEY_FILE, HOSTKEY_FILE and EVENT_PUBKEY_FILE exist for the layout test; on
# the host they are the secret files.
set -eu

key=${PUBKEY_FILE:-/run/secrets/runner_ssh_pubkey}
host=${HOSTKEY_FILE:-/run/secrets/runner_host_key}
event=${EVENT_PUBKEY_FILE:-/run/secrets/runner_event_pubkey}
for f in "$key" "$host" "$event"; do
	if [ ! -s "$f" ]; then
		echo "entrypoint: $f is missing or empty" >&2
		exit 1
	fi
done

install -o root -g root -m 0600 "$host" /etc/ssh/ssh_host_ed25519_key

install -d -o runner -g runner -m 0700 /home/runner/.ssh
printf 'restrict,command="set -f; PASS_CLONES=/home/agent/clones PASS_AS_AGENT=\\"sudo -n -u agent /opt/orchestrator/as-agent\\" HARNESS_GITHUB_APP_MINT=\\"sudo -n -u keyholder /opt/orchestrator/mint\\" HARNESS_GITHUB_APP_ID=$(cat /etc/orchestrator/app/id 2>/dev/null) exec /opt/orchestrator/pass.sh $SSH_ORIGINAL_COMMAND" %s\n' "$(head -n 1 "$key")" >/home/runner/.ssh/authorized_keys
printf 'restrict,command="exec bun /opt/orchestrator/bun/on-event.ts \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' "$(head -n 1 "$event")" >>/home/runner/.ssh/authorized_keys
chown runner:runner /home/runner/.ssh/authorized_keys
chmod 0600 /home/runner/.ssh/authorized_keys

exec "$@"
