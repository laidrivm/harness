#!/bin/sh
# Writes runner's one authorized_keys line from the engine's public key, then
# runs the command (sshd). The key reaches pass.sh alone, with the clone name
# the engine sends: the engine can name a clone and nothing else.
#
# PUBKEY_FILE exists for the layout test; on the host it is the secret file.
set -eu

key=${PUBKEY_FILE:-/run/secrets/runner_ssh_pubkey}
if [ ! -s "$key" ]; then
	echo "entrypoint: $key is missing or empty" >&2
	exit 1
fi

install -d -o runner -g runner -m 0700 /home/runner/.ssh
printf 'restrict,command="PASS_CLONES=/home/agent/clones /opt/orchestrator/pass.sh \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' "$(head -n 1 "$key")" >/home/runner/.ssh/authorized_keys
chown runner:runner /home/runner/.ssh/authorized_keys
chmod 0600 /home/runner/.ssh/authorized_keys

exec "$@"
