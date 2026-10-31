# coderabbit-resolve-fixed-threads

## Why

CodeRabbit's Automatic Approvals (#347) approve a pull request only once every
one of the bot's threads is resolved, and the bot does not resolve the thread
of a finding that was fixed: on #347 two fixed threads stayed open until the
user resolved them by hand. The `coderabbit` skill forbids resolves outright
("Never post to the PR … no resolves"), so every agent pull request with a
fixed finding waits on the user for an approval the fix already earned (card
*Let the coderabbit step resolve the threads of the findings it fixed*,
40839875c31b818f8dcac82c117c0abc, user 29.10 and 31.10).

The same skill misreads the bot it serves in two places (card *Make the
coderabbit skill read the head's status before the reviews*,
40539875c31b8168a338eb254c353d08, discarded by the user on 31.10 into this
change):

- Since 27.10 CodeRabbit reports a finished review as a `CodeRabbit` check
  run, `completed`/`success` with the summary `Result: Success - Review
  completed`, and leaves the head's commit status empty (#318, #319, #321;
  #355's head reads the same on 31.10). Step 1 counts the head only by the
  status, so a head with no findings reads as unreviewed: the agent on #319
  stopped on `OPEN — no CodeRabbit review` over a finished review.
- Since #297 (25.10) each finding opens `**<picture>…</picture> Major** ·
  **<category>** · **<effort>**`, severity first, where step 2 still shows
  `_🟠 Major_` in the middle of the line.
- Step 1 reads the reviews before the head's state, so a review posted
  between the two calls is missed by the first pass; the gate-line legend
  never names `success`; `agent-autonomy` gives the head counted by its
  state, with no review object, neither the dispose-and-re-fetch duty nor a
  scenario; and a code span in `core/review-toolkit.md` is broken by a line
  wrap.

## What Changes

- `bun bun/work.ts resolve --pr <n> --comment <id> [--comment <id> …]`: a new
  subcommand that resolves, through GraphQL's `resolveReviewThread` and under
  whatever identity `gh` holds, the threads whose first comment is each named
  id — only on the open pull request of the current branch, only a thread a
  `coderabbitai` login opened, skipping one already resolved. Any id it cannot
  place refuses the whole call before it changes anything. The command guard
  is not changed: the mutation runs inside the process, as `finish`'s push
  does, and `Bash(bun bun/work.ts *)` already allows the call.
- The `coderabbit` skill still writes nothing to GitHub itself. It ends a
  run that applied fixes by naming the comment ids whose every finding it
  fixed, as the `resolve` command to run once the fix is pushed; the session
  pushes with `finish`, then runs it. A thread whose finding was skipped or
  rejected stays the user's. `@coderabbitai resolve` and `approve` stay
  forbidden.
- Step 1 reads the head commit, then its `CodeRabbit` check run and commit
  status, then the reviews; the head counts as reviewed by a review on it, by
  the status `success`/`Review completed`, or by the check run
  `completed`/`success` whose summary opens `Result: Success - Review
  completed`. The head counted with no review object gets the same
  disposition and single re-fetch.
- Step 2 reads each finding's severity word, with both markups shown as
  examples, never as a pattern; the gate-line legend names `success` and the
  check run.
- `core/review-toolkit.md` and `core/git-and-prs.md` say the same; the
  broken code span is rejoined.
- The Safety rule in `core/rules.md` naming `finish` as the one script
  granted a push is reworded to name `resolve` too — proposed wording in
  `design.md`, applied only once the user approves it.

Not in this change: a `bun/` reader of CodeRabbit's check run (the sibling
change `finish-review-arrives`, card 40739875c31b811bb7d7e83e7dca89de, adds
one for `finish`; the skill is prose and reads the check run with its own
`gh api` call); whether the App's token can resolve a thread, and whether the
last resolve alone brings the approval — both checked live in stage 2.5's
probe (step 7).

## Capabilities

### New Capabilities

- `work-resolve`: the command that resolves the threads of the bot's
  findings a session fixed — what it reads, what it refuses, what it
  changes.

### Modified Capabilities

- `agent-autonomy`: the bot's review counts on the head by its check run as
  well as its status, the head's state is read before the reviews, and the
  head counted without a review object is disposed of and re-fetched like a
  landed review.
- `local-review-loop`: the threads of fixed findings are resolved through
  `work.ts resolve` once the fix is on the pull request, and no other thread
  by an agent.

## Impact

- New: `bun/work-resolve.ts` and its tests.
- Changed: `bun/work.ts` (dispatch and usage), `core/skills/coderabbit/SKILL.md`,
  `bun/command-guard-gh-api.test.ts` (the skill's check-run read passes),
  `core/review-toolkit.md`, `core/git-and-prs.md`, `README.md` (the command
  table), and, once approved, `core/rules.md`.
- A thread is resolved under the identity `gh` holds — the user's on the
  laptop. It writes no text, and the user decided it on 31.10.
