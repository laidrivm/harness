# The runner the engine reaches over SSH: git, gh, bun, node, claude,
# openspec, actionlint, gitleaks, tmux, flock, jq and sshd, and the users
# runner, agent and the key holder (design.md, *The pass runs in a runner
# container*; runner-isolation, *Three users*; session-runner-image, *The
# image's tools and their pins*). Built with orchestrator/ as context.
#
# shortcut: the tool downloads are x86-64 only, the spike host's; an arm64
# host needs the arm64 names and the arm64 Claude checksum.

# A real Node for Stryker in pre-push and for bunx's `env node` packages; 24
# LTS, the laptop's. Its one binary is copied below.
# moved by hand — nothing updates this pin
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS node

# The two linters .githooks/gates.sh runs when present, at the images and
# digests .github/workflows/lint.yml runs: moved with lint.yml's, and
# layout-runner.test.ts fails while the two differ. Both static Go builds.
# moved by hand — nothing updates this pin
FROM rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 AS actionlint
# moved by hand — nothing updates this pin
FROM zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS gitleaks

# Bun is the image's own, CI's 1.4.2.
# moved by hand — nothing updates this pin
FROM oven/bun:1.4.2-debian@sha256:4f6e31d1a54d6a3dd312daef655fc998101b5043d52e12592ac293ef04b9bc73

# moved by hand — nothing updates this pin
ARG GH_VERSION=2.97.0
# moved by hand — nothing updates this pin
ARG CLAUDE_VERSION=2.1.316
# The linux-x64 checksum in that release's manifest.json.
# moved by hand — nothing updates this pin
ARG CLAUDE_SHA256=fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824
# moved by hand — nothing updates this pin
ARG OPENSPEC_VERSION=1.14.0

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl git jq libstdc++6 openssh-server sudo tmux util-linux \
	&& rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" | tar -xz -C /tmp \
	&& install -D -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/libexec/gh/gh \
	&& rm -rf /tmp/gh_*

RUN curl -fsSLo /usr/local/bin/claude "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}/linux-x64/claude" \
	&& echo "${CLAUDE_SHA256}  /usr/local/bin/claude" | sha256sum -c - \
	&& chmod 0755 /usr/local/bin/claude

# The base's bun-as-node fallback sits after /usr/local/bin on PATH, so this
# node is the one every `env node` finds, openspec's bin among them.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=actionlint /usr/local/bin/actionlint /usr/local/bin/actionlint
# CI's actionlint runs shellcheck over `run:` scripts, and skips it when absent.
COPY --from=actionlint /usr/local/bin/shellcheck /usr/local/bin/shellcheck
COPY --from=gitleaks /usr/bin/gitleaks /usr/local/bin/gitleaks

RUN BUN_INSTALL=/usr/local bun add -g "@fission-ai/openspec@${OPENSPEC_VERSION}"

# A binary that cannot run here, a missing library or a wrong architecture, fails the build.
RUN node --version && actionlint -version && shellcheck --version && gitleaks version && claude --version

# git's credential helper is the gh wrapper, so the session user's git mints
# per call as its gh does, and runner's git takes GH_TOKEN as before: the
# github.com lines gh's setup-git writes, naming the wrapper where setup-git
# would write the real gh's path (session-runner-image design). gist.github.com
# gets no helper: nothing here reaches a gist over git.
RUN git config --system credential.https://github.com.helper '' \
	&& git config --system --add credential.https://github.com.helper '!/usr/local/bin/gh auth git-credential'

# The uids are fixed: the host README makes the secret files owned by runner's,
# and the App's key by the key holder's. runner is not in agent's group
# and never enters agent's home: every command in a clone goes through the
# launcher. The App's id and repository list are root's; the key's
# directory is the key holder's (runner-isolation design, *The key holder*).
RUN useradd --create-home --uid 1500 --user-group --shell /bin/bash runner \
	&& useradd --create-home --uid 1501 --user-group --shell /bin/bash agent \
	&& useradd --system --no-create-home --home-dir /var/lib/orchestrator-key --uid 1502 --user-group --shell /usr/sbin/nologin keyholder \
	&& chmod 0750 /home/agent /home/runner \
	&& install -d -o agent -g agent -m 0750 /home/agent/clones \
	&& install -d -o keyholder -g keyholder -m 0700 /var/lib/orchestrator-key \
	&& install -d -m 0755 /etc/orchestrator/app /opt/orchestrator/hooks \
	&& mkdir -p /run/sshd \
	&& rm -f /etc/ssh/ssh_host_* \
	&& printf 'PasswordAuthentication no\nAllowUsers runner\nHostKey /etc/ssh/ssh_host_ed25519_key\n' >/etc/ssh/sshd_config.d/runner.conf

COPY --chmod=0755 pass.sh /opt/orchestrator/pass.sh
COPY --chmod=0755 stop.sh /opt/orchestrator/stop.sh
COPY --chmod=0644 clone-name.sh /opt/orchestrator/clone-name.sh
COPY --chmod=0755 runner/entrypoint.sh /opt/orchestrator/entrypoint.sh
COPY --chmod=0440 runner/sudoers /etc/sudoers.d/orchestrator
COPY --chmod=0755 as-agent /opt/orchestrator/as-agent
COPY --chmod=0755 mint /opt/orchestrator/mint
COPY --chmod=0755 reach-check.sh /opt/orchestrator/reach-check.sh
COPY --chmod=0755 runner/gh /usr/local/bin/gh
# The event handler's code, root-owned, from compose's named context `bun`
# (ci-run-agent design, *The engine's contract*): it reads the webhook secret,
# so it never runs from a clone agent can write.
COPY --from=bun . /opt/orchestrator/bun/

ENTRYPOINT ["/opt/orchestrator/entrypoint.sh"]
CMD ["/usr/sbin/sshd", "-D", "-e"]
