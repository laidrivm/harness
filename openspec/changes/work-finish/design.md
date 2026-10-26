# work-finish — design

## Context

See proposal.md, *Why*. The parts exist: `ready()` (`bun/ci-run-draft.ts`),
`readPullRequests()` over REST (`bun/pull-requests.ts`), `waiting()`
(`bun/notion-bot.ts`) behind the ask settings (`bun/notion-ask.ts`), and
`ran()` (`bun/gate-ledger.ts`), which matches a `pre-pr` record by commit,
checkout and outcome but not by step. Three facts shape the rest:

- Git runs `.githooks/pre-push` even when the push updates nothing: probed
  2026-10-26, a second `git push -u origin HEAD` ran the hook with an empty
  standard input, then printed `Everything up-to-date`.
- `bun/pre-pr.test.ts` pins that the hook's text holds no `pre-pr`.
- `bun/settings.ts` lets the `Bash` matcher hold the bootstrap alone
  (`sole`), and `bun/sync-settings.ts` keeps every hook that neither ends with
  `# harness-managed` nor equals a `HOOKS` text.

## Goals / Non-Goals

**Goals:** one command ends the work on a branch, in the order the user set
on 2026-10-25 (push while draft, ready right after); the two acts that take a
pull request out of draft — a hand-run ready, and a push into one already
out — are refused; every refusal is one ledger record.

**Non-Goals:** beyond the proposal's list, the board loop's own push, which
roadmap stage 7 removes, and checking that `--card` names the branch's card —
the gate holds a mistake of order, not a wrong argument (stage 2, question
23 в).

## Decisions

### The sequence and where each refusal sits

`bun/work.ts` reads the arguments with `util.parseArgs` in strict mode (stage
2, question 18) and calls `finish()` in `bun/work-finish.ts`. `finish()` runs:

1. Refusals that need no network: a tracked file differs from `HEAD`; `HEAD`
   names no branch, or names `main`.
2. The evidence for `HEAD` (*The evidence seam* below).
3. The branch's pull requests, read once. Unreadable: refuse. One open and
   not a draft: refuse, naming `gh pr ready <n> --undo`. None open and no
   `--title`/`--body-file`: refuse.
4. The push, `git push -u origin HEAD`, never `--force`, never
   `--no-verify`, so the pre-push hook runs `bun test` and the draft check —
   skipped when `git ls-remote origin refs/heads/<branch>` already names
   `HEAD`, since git would run the whole test suite for a push of nothing.
5. With no open pull request, `gh pr create --draft -R <repo> --base main
   --head <branch> --title <t> --body-file <f>`, then the same REST read
   again for its number. The base is named: without `--base`, `gh` prefers a
   branch's `gh-merge-base` setting to the default branch (CodeRabbit on
   #308), and `main` is the branch step 1 already treats as the base.
6. The card's comments through the ask settings, then `ready()` unless
   `waiting()` says a question waits. The settings read and the client move
   out of `ask()` into one export of `bun/notion-ask.ts` that both call, so
   the ask command and `finish` read the same integration the same way.

Every refusal of `finish()` comes before step 4, so it changes nothing in
git, GitHub or Notion and writes only its ledger record (*Records*). The
hooks refuse on their own: the draft check inside step 4's push, the ready
guard outside `finish` altogether, each with its record too. The Notion
read is last, after the push and its test run, so it sees a question posted
meanwhile. Step 3 refuses a ready pull request itself although the pre-push
hook would: with nothing to push `finish` skips the push, so the hook never
sees it, and refusing first saves a full test run. Both read it through one `readyOne(pulls)` in
`bun/pull-requests.ts`, the open pull request that is not a draft, so the
two refusals cannot drift apart.

Output is one `finish:` line per step and a last line that says the outcome:
`finish: ready #7`, `finish: draft #7 — a question waits on <card>`,
`finish: refused — <why>`, or `finish: draft #7 — <what failed>`. Exit 0 for
ready or a waiting question, 1 for a refusal or a failure, 2 for the usage.
Rejected: a `start` subcommand — `gh pr ready <n> --undo` is one line, and
the pre-push refusal makes forgetting it fail loudly at the first push.

### The evidence seam

`unproven(commit, top, opening)` in `bun/work-finish.ts` answers what the
branch still owes for `commit`, as lines. Until the required-steps change
lands (card `3f739875c31b81e6b473f8a1fb6fa5b3`, its question 1 still open),
it is a working stub: the pre-PR runner's passing `diff-budget` record of
`commit` in `top`, read as the goal check reads it, and `opening` is unused.
That change replaces the body and keeps the call: `opening` true asks for
project checks and the local review on `HEAD`, false for project checks
alone (stage 2, question 24). The records from the `Skill` hook (slice item
2) reach `finish` only through it.

### `ran()` filters by step

`ran()` gains a `rule` parameter; the goal check, `ranUnder()` and
`unproven()` pass `diff-budget`, and the turn gate, asking only whether the
runner ran, passes none. It ships here only if this change merges before the
slice's items 1 and 2 (user, 2026-10-26).

### The pre-push draft check

`bun/push-draft.ts`, the hook's first command: `bun bun/push-draft.ts "$@"`.
Its name keeps the hook's text free of `pre-pr`. It reads the records on
standard input, `<local ref> <local sha> <remote ref> <remote sha>`, and
keeps each record whose remote ref is `refs/heads/<branch>`, taking the
branch from that remote ref, never the local one — `git push origin
feat/x:release` updates `release` — and whose local sha is not all zeros, as
a deletion lands nothing for review. A push to a tag is no branch update. The repository comes from the remote's
URL, `$2`, through `remoteRepository()`, and only on the host `github.com`;
any other remote, a fixture's local path among them, passes unread.
`readPullRequests()` takes that repository as a parameter, defaulting to
`originRepository()`, so the hook makes no git call: inside a hook git's own
environment is set, and a worktree's is the trap `core/rules.md` names.

A read that fails refuses, naming `gh auth status` — stage 2 says an error
closes the write, and an unread state is never a draft. Question 26 asked
for the check here only if `isDraft` is cheap: one REST read took 0.67 s on
2026-10-26, against a hook that then runs the whole suite. Rejected: reading
the checked-out branch instead of the records, which names the wrong branch
for `git push origin other`, and costs a read for a push of nothing.

### The ready guard, harness-only

`bun/ready-guard.ts`, a `PreToolUse` hook with no matcher, registered in the
harness's own `.claude/settings.json` as
`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/ready-guard.ts"; if [ -f
"$g" ]; then bun "$g"; fi`, with no `# harness-managed` mark and no entry in
`HOOKS`. That is stage 2's question 28 a″, re-checked here as it asked:
`sync-settings` keeps an unmarked hook, so a consumer never receives it and
the harness keeps it across a sync, and no key in `package.json` is needed.
The matcher stays empty because `settings.ts` lets the `Bash` matcher hold
the bootstrap alone; the loop guard already runs that way, at one bun start
per tool call. The path is the pin's, as `harness-updates` requires.

It passes every event that is not a Bash call, and an unreadable one, which
the command guard already blocks. It walks the line with `commands()` and
`invocations()`, as the command guard does, and refuses where
`ghFinishes(rest)`, exported from `bun/command-guard-gh.ts` beside
`ghPublish()` and reusing its subcommand reader, finds `pr create`, or `pr
ready` without `--undo`. `--undo=false` is no undo. It does not descend into
`sh -c` or `eval`: it holds a forgotten order, not an intent to get round it
(stage 2, question 23; roadmap clarification 11). The requirement states that
exception, a test pins it, and a `shortcut:` comment names when to lift it:
the first refusal walked past that way. Rejected: the
check inside `command-guard.ts`, which every consumer runs; an environment
switch in the settings, a key by another name.

`gh pr create` is refused whole, a draft too: an open pull request moves
the opening gate's evidence from the local review to CodeRabbit (question
24), so a draft opened by hand would let `finish` skip the review owed for
opening.

### Records

Each refusal is `record(gate, "block", id, event, commit)` under gate
`finish`, `push-draft` or `ready-guard`, one id per reason. A failure after
the push — the push, the create, the Notion read, the ready — is no refusal
and records nothing.

### Two steps

Group 1 ships the pre-push check, `readyOne()`, the repository parameter and
`ran()`'s filter: it holds alone, since `gh pr ready --undo` stays allowed.
Group 2 ships `work.ts finish`, the ready guard, the allow entry and the
prose. The guard cannot ship first: until `finish` exists it would leave no
way to mark a pull request ready.

## Risks / Trade-offs

- [The draft check fails closed, so a GitHub outage or a missing `gh` login
  stops every push to a GitHub branch, the user's own included] → the
  refusal names `gh auth status`; a push to GitHub during an outage fails
  anyway.
- [The ready guard holds only once the pin moves past group 2's merge, while
  the draft line leaves `core/rules.md` in that group] → the pin bump
  follows the merge; the pre-push refusal, run from the tree, holds from the
  merge.
- [A wrong `--card` marks ready while the right card's question waits] → as
  the card names it: the gate holds a mistake of order, not of argument.
- [A host clone with `core.hooksPath` set pushes through the draft check]
  → the CI flow drafts its pull request before it pushes, and the board loop
  takes no ready one.
- [Sub-agents move to worktrees (card `40539875c31b8147818fcdcc791611f2`)]
  → `finish` reads everything from its working directory; a push from a
  worktree waits on that card.

## Migration Plan

After group 2 merges and the pin moves: the sub-agent brief and the
orchestrator replace `gh pr create` and `gh pr ready <n>` with `bun
bun/work.ts finish --card <id> …`; `gh pr ready <n> --undo` stays. A live
probe on one card: a refused push into a ready pull request, a finish that
opens a draft and marks it ready, one that leaves it a draft behind a
question. Rollback: revert the registration line in the harness's settings
and the hook's first line.
