#!/bin/sh
# The persistent session, which the entrypoint starts as agent in tmux session
# `main` (session-runner-image design, *The start script*): pull and install in
# the clone, start claude with Remote Control as a new conversation, never
# --continue (user, 02.11, answer 1 a), pause 5 s once it exits, and again.
# A failed pull or install prints its line and starts claude all the same, on
# the tree and the dependencies the clone already holds. With no clone yet,
# claude starts in HOME, so the user can log in first.
#
# The clone is $HOME/harness, not a variable: the test runs this with a
# temporary HOME and stubs on PATH, and the session has no override to set.

# A failed credential fails the pull instead of waiting on a prompt nobody sees.
export GIT_TERMINAL_PROMPT=0
# The image pins claude; an update would land in ~/.local and outlive the pin.
export DISABLE_AUTOUPDATER=1

while :; do
	if [ -d "$HOME/harness/.git" ]; then
		cd "$HOME/harness" || exit 1
		git pull --ff-only || echo "session: git pull failed; starting claude anyway" >&2
		bun install --frozen-lockfile || echo "session: bun install failed; starting claude anyway" >&2
	else
		cd "$HOME" || exit 1
	fi
	claude --remote-control harness
	sleep 5
done
