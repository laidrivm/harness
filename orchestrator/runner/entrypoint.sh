#!/bin/sh
# Writes runner's one authorized_keys line from the engine's public key, then
# runs the command (sshd). The key reaches pass.sh alone, with the words the
# engine sends split on spaces and globbing off: the engine can name a clone
# and its repository and nothing else, since pass.sh refuses a third word.
#
# It installs sshd's one host key from a secret file, whose public half the
# engine pins, so a rebuild keeps the key and a stand-in on the network fails.
#
# PUBKEY_FILE and HOSTKEY_FILE exist for the layout test; on the host they are
# the secret files.
set -eu

key=${PUBKEY_FILE:-/run/secrets/runner_ssh_pubkey}
host=${HOSTKEY_FILE:-/run/secrets/runner_host_key}
for f in "$key" "$host"; do
	if [ ! -s "$f" ]; then
		echo "entrypoint: $f is missing or empty" >&2
		exit 1
	fi
done

install -o root -g root -m 0600 "$host" /etc/ssh/ssh_host_ed25519_key

install -d -o runner -g runner -m 0700 /home/runner/.ssh
printf 'restrict,command="set -f; PASS_CLONES=/home/agent/clones exec /opt/orchestrator/pass.sh $SSH_ORIGINAL_COMMAND" %s\n' "$(head -n 1 "$key")" >/home/runner/.ssh/authorized_keys
chown runner:runner /home/runner/.ssh/authorized_keys
chmod 0600 /home/runner/.ssh/authorized_keys

exec "$@"
