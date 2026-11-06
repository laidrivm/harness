# VPS session rules

The runner image copies this file to `/etc/claude-code/CLAUDE.md`, the
managed memory every Claude Code session and subagent in the runner container
loads. Its name is not `CLAUDE.md`, so a session working in the repository
does not load it as a directory's memory. A session cannot edit the installed
copy: change it by a pull request here. It holds only what `core/` and the
mechanisms do not, and binds the attended session the user drives and its
subagents. A session that runs unattended (`core/autonomy.md`), such as the
board loop's `claude -p`, loads this file too, but follows `core/autonomy.md`
wherever the two differ.

1. Reply to the user in Russian; repo artefacts stay in British English.
2. Run at most two subagents that run tests at once — `bun test`, the pre-PR
   sequence, or a push whose pre-push hook runs; a third waits, and a
   subagent leaves nothing running in the background after its report — the
   host has 2 vCPU and 3.5 GiB.
3. Run tests, fixes, pushes and reviews in subagents, one fresh worktree
   subagent per pull request; the main session dispatches and reports.
4. Act on the `next:` line `bun bun/work.ts status` prints.
5. Ask the user every question on the card, through the ask command
   `bun/notion-ask.ts`, never only in chat; a one-line pointer to the card in
   chat is fine.
6. On a refusal by the command guard, a hook or a permission entry, stop and
   tell the user in chat what was refused; never retry it another way.
7. Write each command for the user as one runnable command on its own line,
   with no comment or placeholder on it, and say whether it runs on the host
   or in the container.
8. Write «можно вливать» only once `gh pr checks` shows every check of the
   pull request passed, CodeRabbit has reviewed its head commit, and every
   finding has a disposition.
9. Run each git command as its own Bash call, with no `;`, `&&`, pipe or
   `$(…)`, and with `git -C` only where `core/rules.md` asks for it, a commit
   or push in another checkout — a compound call can miss the allow list, and
   its prompt is a manual step.
10. Each time you ask the user for a manual step, or the user reports one —
    `/clear`, a login, an ssh to the host, a review restart, a message only
    to wake you — append `<yyyy-mm-dd> — <card id> — <step>` to
    `~/manual-steps.log`; an answer to a question and a merge are not steps.
11. At the first wrap-up seven or more days after the first line of
    `~/manual-steps.log`, count its lines and the cards that reached done in
    that span, write «<шаги/карточки> — <дата> — ~/manual-steps.log, N шагов
    на M карточек» under the metric on the roadmap's stage 2.5 page, or in
    chat when the session cannot edit the page, then rename the log to
    `~/manual-steps-<date of its first line>.log`, so the next count starts
    from an empty log.
12. Expect an empty `GH_TOKEN` and no `~/.config/gh`: `gh` and git over HTTPS
    get a GitHub App token the wrapper at `/usr/local/bin/gh` mints per call,
    hands git only through the credential helper's stdout, and never writes
    to disk — never run `gh auth login` or `gh auth token`, print or write a
    token, or set `GH_TOKEN` yourself.
