#!/bin/sh
# The failed deploy's report, which the managed SessionStart and
# UserPromptSubmit hooks both run (deploy-failure-told design, *One report
# script, both hooks run it*): when deploy.sh's failure file is in agent's
# home, it prints a line asking the session to tell the user and the file,
# then moves the file aside so the next start or prompt is quiet.
#
# It exits 0 whatever the move does: Claude Code keeps a hook's output only on
# exit 0, and a file the move leaves in place is reported again at the next
# start or prompt, the louder failure.
f=$HOME/.harness-deploy-failed
[ -e "$f" ] || exit 0
echo 'A deploy of the harness failed: report it to the user in chat, quoting the line below.'
cat "$f"
mv "$f" "$f.reported"
exit 0
