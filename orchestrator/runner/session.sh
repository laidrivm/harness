#!/bin/sh
# The persistent session, which the entrypoint starts as agent in tmux session
# `main` (session-runner-image design, *The start script*): pull and install in
# the clone, install ponytail there, start claude with Remote Control continuing the directory's last
# conversation, or a new one where it has none (user, 03.11, reversing answer
# 1 a), pause 5 s once it exits, and again.
# A failed pull or install, of either kind, prints its line and starts claude all the same, on
# the tree and the dependencies the clone already holds. With no clone yet,
# claude starts in HOME, so the user can log in first.
#
# The clone is $HOME/harness, not a variable: the test runs this with a
# temporary HOME and stubs on PATH, and the session has no override to set.

# A failed credential fails the pull instead of waiting on a prompt nobody sees.
export GIT_TERMINAL_PROMPT=0
# The image pins claude; an update would land in ~/.local and outlive the pin.
export DISABLE_AUTOUPDATER=1
# The container sets no locale; the pass's sessions get the same one.
export LANG=C.UTF-8

# No exit on a failed cd: ending this script ends `main`, which nothing restarts but the container.
while :; do
	# -e: a worktree's or a separate gitdir's .git is a file.
	if [ -e "$HOME/harness/.git" ] && cd "$HOME/harness"; then
		git pull --ff-only || echo "session: git pull failed; starting claude anyway" >&2
		bun install --frozen-lockfile || echo "session: bun install failed; starting claude anyway" >&2
		# The project's settings alone left ponytail uninstalled from the second start on (2.1.316,
		# ship-ponytail D7); the marketplace and its tag come from those settings.
		# coreutils' timeout, so a network that hangs cannot hold the start; --foreground keeps claude
		# in the pane's foreground process group, where a tty read would otherwise stop it.
		timeout --foreground 120 claude plugin install ponytail@ponytail --scope project || echo "session: ponytail's install failed; starting claude anyway" >&2
	else
		cd "$HOME"
	fi
	# --continue exits 1 with "No conversation found to continue" where the directory has none
	# (probed on 2.1.316), which would restart every 5 s; any other failure must not start a new one.
	# Claude Code keeps a directory's transcripts under its real path (pwd -P, not $PWD) with every
	# other character a dash (both seen on the laptop, 2.1.316); sed, since GNU tr counts bytes.
	# shortcut: a directory holding only `claude -p` transcripts, which --continue skips, still
	# restarts every 5 s; read the transcripts when that is seen.
	set -- "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(pwd -P | sed 's/[^A-Za-z0-9]/-/g')"/*.jsonl
	if [ -e "$1" ]; then
		claude --continue --remote-control harness
	else
		claude --remote-control harness
	fi
	sleep 5
done
