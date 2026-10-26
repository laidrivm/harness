# work-finish

## Why

The draft rule — a pull request is a draft while an agent works on it, and
goes ready only once that work ends with no question to the user open on its
card — is prose on the laptop (`core/rules.md`, Process; `core/git-and-prs.md`;
the sub-agent brief), and prose did not hold it: on #256, #264 and #265 agents
waited about an hour for a review that would never come, and the agent on
#258 marked its pull request ready before its own report. The user asked for
the rule to be held by something firmer than their attention (card *Hold an
agent to the PR's draft rule*, 2026-10-25).

Stage 2 of the roadmap settles how (its questions 18, 24, 26 and 28, and
roadmap question 13): opening a pull request and marking it ready pass
through harness code, a push into a draft is free, a push into an open pull
request that is not a draft is refused, and whether a question is open is
read from the card by `waiting()` in `bun/notion-bot.ts`, never from the
model's text. This change is the draft rule's half of the stage's slice item
3, `work.ts finish`.

## What Changes

- `bun bun/work.ts finish --card <id> [--title <t> --body-file <f>]`, its
  arguments read by a strict `util.parseArgs`: it checks the evidence for
  `HEAD`, pushes the branch while its pull request is a draft, opens the pull
  request as a draft when the branch has none open, and marks it ready unless
  a question waits on the card. A refusal writes nothing; a card it cannot
  read leaves the draft and exits non-zero.
- The evidence check is a stub until the required-steps change lands: the
  pre-PR runner's passing record for `HEAD`, as the goal check reads it.
- The pre-push hook refuses a push into an open pull request that is not a
  draft, naming `gh pr ready <n> --undo`, before it runs `bun test`. A push
  into a draft, or into a branch with no open pull request, goes through.
- A harness-only hook refuses a hand-run `gh pr ready` without `--undo`, and
  a hand-run `gh pr create`, pointing at `work.ts finish`. It is registered
  in the harness's own `.claude/settings.json` only, never in the set
  `sync-settings` writes into a consumer (stage 2, question 28 a″).
- `ran()` in `bun/gate-ledger.ts` matches a run record by its step's `rule`
  too, so one step's record never counts as another's (user, 2026-10-26).
- `core/rules.md` drops the draft rule's Process line, which the two
  refusals and `finish` mechanise, and the Safety rule against running a
  guarded act through a script names `bun/work.ts finish` as the one script
  the allow list grants it. `core/git-and-prs.md`'s pull request bullet
  points at `finish`.

Not in this change: the required steps derived from the diff and their
evidence (card `3f739875c31b81e6b473f8a1fb6fa5b3`, whose question 1 is still
open), `work.ts take` (card `40439875c31b810d8562f984ab8bc84a`), a Stop hook
catching a start without a finish (comment item 3 on the card, variant б),
the host's key-holder command, and cloud sessions, where `gh pr ready` reads
GraphQL.

Order against the neighbouring changes, none of which has a directory yet:
whichever of this change and `work.ts take` merges first creates
`bun/work.ts`, and the other adds its subcommand there; the `ran()` fix
ships with whichever of this change and the slice's items 1 and 2 merges
first, and the others reuse it; the required-steps change replaces the
stub's body and keeps its call; sub-agent worktrees (card
`40539875c31b8147818fcdcc791611f2`, slice item 0) change where `finish` runs
from, not what it does.

## Capabilities

### New Capabilities

- `work-finish`: the command that ends an agent's work on a branch — the
  evidence check, the push, the draft pull request and the ready switch — and
  the refusals that keep that switch its own.

### Modified Capabilities

- `commit-gates`: the pre-push hook also refuses a push into an open pull
  request that is not a draft, and reads the ref-update records to find it.
- `gate-ledger`: the pre-push draft check, the ready guard and `finish`
  record their refusals like every other gate.
- `pre-pr-runner`: a run record counts as evidence only for its own step.

## Impact

- New: `bun/work.ts`, `bun/work-finish.ts`, `bun/push-draft.ts`,
  `bun/ready-guard.ts`, and their tests.
- Changed: `.githooks/pre-push`, `bun/command-guard-gh.ts` (one exported
  check, reusing its subcommand reader), `bun/pull-requests.ts`
  (`readPullRequests` takes the repository to read), `bun/gate-ledger.ts`
  (`ran()`), `.claude/settings.json` (the harness-only registration and
  `Bash(bun bun/work.ts *)`), `bun/self-pin.test.ts`, `bun/settings.test.ts`,
  `core/rules.md`, `core/git-and-prs.md`.
- The ready guard runs from the pin, so it holds sessions only after the pin
  moves past the merge; `finish` and the pre-push check run from the tree.
- Every push into a ready pull request is refused, the user's own included:
  `gh pr ready <n> --undo` first.
