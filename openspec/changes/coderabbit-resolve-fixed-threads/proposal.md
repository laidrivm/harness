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
  run, `completed` with the conclusion `success` and the title `Finished`,
  and leaves the head's commit status empty (#318, #319, #321;
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

- `bun bun/work.ts resolve --pr <n> --head <sha> --comment <id> …`: resolves,
  through `resolveReviewThread` under `gh`'s identity, the bot's unresolved
  threads the named ids open, on the current branch's open pull request while
  its head is `--head`, refusing the whole call over an id it cannot place.
  The command guard is not changed: the mutation runs inside the process, as
  `finish`'s push does.
- The `coderabbit` skill still writes nothing to GitHub. It names the
  `resolve` command for the threads it fixed whole; the session runs it once
  the fix is on the head. `@coderabbitai resolve` and `approve` stay
  forbidden.
- Step 1 reads the head, then its `CodeRabbit` check runs and status, then
  the reviews; check runs count by the one rule `finish-review-arrives` sets
  and `bun/coderabbit-run.ts` holds (`REVIEWED`). The head counted with no
  review object gets the same disposition and re-fetch.
- Step 2 reads each finding's severity word, with both markups shown as
  examples, never as a pattern; the gate-line legend names `success` and the
  check run.
- `core/review-toolkit.md` and `core/git-and-prs.md` say the same; the
  broken code span is rejoined.
- The Safety rule in `core/rules.md` naming `finish` as the one script
  granted a push is reworded to name `resolve` too, in the wording the user
  approved on 31.10 (`design.md`).

Not in this change: a second `bun/` reader of the check runs (the skill's own
`gh api` read is pinned to `finish-review-arrives`' rule by a test); resolving
from the board loop's runner; whether the App's token can resolve a thread
and whether the last resolve brings the approval — stage 2.5's probe, step 7.

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
  table), and `core/rules.md` (its last Safety rule).
- A thread is resolved under the identity `gh` holds — the user's on the
  laptop. It writes no text, and the user decided it on 31.10.
