# The runner the engine reaches over SSH: git, gh, bun, claude, openspec,
# coderabbit, flock and sshd, and the users runner and agent (design.md,
# *The pass runs in a runner container*). Built with orchestrator/ as context.
#
# shortcut: the tool downloads are x86-64 only, the spike host's; an arm64
# host needs the arm64 names and the arm64 Claude checksum.

# Bun is the image's own, CI's 1.4.2.
# moved by hand — nothing updates this pin
FROM oven/bun:1.4.2-debian@sha256:4f6e31d1a54d6a3dd312daef655fc998101b5043d52e12592ac293ef04b9bc73

# moved by hand — nothing updates this pin
ARG GH_VERSION=2.97.0
# moved by hand — nothing updates this pin
ARG CLAUDE_VERSION=2.1.308
# The linux-x64 checksum in that release's manifest.json.
# moved by hand — nothing updates this pin
ARG CLAUDE_SHA256=356733f185fa988e6bf3aa9a555269fdd167982a2e2a80d3c8a78037bb92ad58
# moved by hand — nothing updates this pin
ARG OPENSPEC_VERSION=1.14.0
# moved by hand — nothing updates this pin
ARG CODERABBIT_VERSION=0.9.1

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl git openssh-server sudo unzip util-linux \
	&& rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" | tar -xz -C /tmp \
	&& install -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
	&& rm -rf /tmp/gh_*

RUN curl -fsSLo /usr/local/bin/claude "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}/linux-x64/claude" \
	&& echo "${CLAUDE_SHA256}  /usr/local/bin/claude" | sha256sum -c - \
	&& chmod 0755 /usr/local/bin/claude

RUN curl -fsSL https://cli.coderabbit.ai/install.sh \
	| CODERABBIT_VERSION="${CODERABBIT_VERSION}" CODERABBIT_INSTALL_DIR=/usr/local/bin CR_CLI_SKIP_LOGIN=1 sh

# openspec's bin runs under `node`, which here is bun.
RUN [ -e /usr/local/bin/node ] || ln -s bun /usr/local/bin/node; \
	BUN_INSTALL=/usr/local bun add -g "@fission-ai/openspec@${OPENSPEC_VERSION}"

# setup-git writes the credential helper to the building user's config; moved
# to the system config so runner's git takes GH_TOKEN as well. The token here
# only satisfies gh's login check and is never stored.
RUN GH_TOKEN=unused gh auth setup-git && mv /root/.gitconfig /etc/gitconfig

# runner's uid is fixed: the host README makes the secret files owned by it.
# agent shares its home with runner through agent's group.
RUN useradd --create-home --uid 1500 --user-group --shell /bin/bash runner \
	&& useradd --create-home --uid 1501 --user-group --shell /bin/bash agent \
	&& usermod -aG agent runner \
	&& chmod 0750 /home/agent /home/runner \
	&& install -d -o agent -g agent -m 0750 /home/agent/clones \
	&& echo 'runner ALL=(agent) NOPASSWD: /opt/orchestrator/as-agent' >/etc/sudoers.d/as-agent \
	&& chmod 0440 /etc/sudoers.d/as-agent \
	&& mkdir -p /run/sshd \
	&& rm -f /etc/ssh/ssh_host_* \
	&& printf 'PasswordAuthentication no\nAllowUsers runner\nHostKey /etc/ssh/ssh_host_ed25519_key\n' >/etc/ssh/sshd_config.d/runner.conf

COPY --chmod=0755 pass.sh /opt/orchestrator/pass.sh
COPY --chmod=0755 stop.sh /opt/orchestrator/stop.sh
COPY --chmod=0644 clone-name.sh /opt/orchestrator/clone-name.sh
COPY --chmod=0755 runner/entrypoint.sh /opt/orchestrator/entrypoint.sh

ENTRYPOINT ["/opt/orchestrator/entrypoint.sh"]
CMD ["/usr/sbin/sshd", "-D", "-e"]
