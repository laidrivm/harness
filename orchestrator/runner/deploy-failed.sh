#!/bin/sh
# The failed deploy's report, which the managed SessionStart and
# UserPromptSubmit hooks both run (deploy-failure-told design, *One report
# script, both hooks run it*): when deploy.sh's failure file is in agent's
# home, it moves the file aside, then prints a line asking the session to tell
# the user and the file, so the next start or prompt is quiet.
#
# It exits 0 whatever the move does: Claude Code keeps a hook's output only on
# exit 0, and a file the move leaves in place is reported again at the next
# start or prompt, the louder failure.
#
# shortcut: every `claude` agent runs in the container runs it, a board-loop
# pass's `claude -p` too, which would take the report from the session; passes
# are off until stage 7 removes them (host-deploy design).
f=$HOME/.harness-deploy-failed
[ -e "$f" ] || exit 0
# Moved before it is read, so a failure the deploy writes meanwhile is the
# next report's, never moved aside unread. A directory at the destination
# would take the file inside it, so it counts as a move that failed.
if [ ! -d "$f.reported" ] && mv "$f" "$f.reported"; then
	f=$f.reported
fi
echo 'A deploy of the harness failed: report it to the user in chat, quoting the line below.'
cat "$f" || echo "(the line could not be read from $f)"
exit 0
