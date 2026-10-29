# ci-evidence-on-main

## Why

Nothing on GitHub stops a pull request reaching `main` with a red `test`:
the `main` ruleset requires one approval and no status check, and #241 merged
on 23 October while `test` was still running and then failed. The one
approval is given by nobody — the user cannot approve their own pull request
and merges through the admin bypass. Once an agent identity with no bypass
merges, as the GitHub App on the VPS will, the ruleset is what holds it, so
the ruleset has to ask for the evidence: CI green, and a reviewed head.

## What Changes

- The user adds `test` and `budget` to the existing ruleset `main` as
  required status checks, source GitHub Actions, with *Require branches to
  be up to date* off, and keeps *Require a pull request* with one approval
  (card answers 1 б, 2 а, 3 б; assumption 5). The admin bypass stays the
  user's; an agent identity has none. A pull request over 800 lines still
  merges once its body carries `oversize: <reason>`, which
  `bun/diff-budget.sh` turns into `OVERRIDE` and exit 0. This is a GitHub
  setting, so it is a task for the user, not code.
- `.coderabbit.yaml` turns on CodeRabbit's Automatic Approvals
  (`reviews.auto_approvals.enabled: true`). The bot requests changes on a
  review with actionable findings and approves only when the latest commit
  has a completed review, every required thread is resolved and no
  pre-merge check fails; that approval counts toward the ruleset's one
  (card answer 4). CodeRabbit is not made a required check. Draft reviews
  stay off (`reviews.auto_review.drafts` is not set).
- `bun/review-config.test.ts` pins both settings, read from the config the
  bot parses.
- `core/git-and-prs.md` says, in one paragraph, what a merge into `main`
  requires and how a dismissed finding's thread gets resolved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: the harness's `.coderabbit.yaml` no longer only
  points the bot at the rulebook; a new requirement fixes that it turns on
  Automatic Approvals and leaves draft reviews off, and that a test pins
  both.

## Non-goals

- Making the `CodeRabbit` check run required: it passes on `skipped`
  («Draft PR not reviewed», «Review skipped») and `neutral` («rate
  limited»), exactly where no review happened (card answer 4).
- The `coderabbit` skill's stance that it never resolves a thread or posts
  to the pull request — unchanged.
- Noticing that CodeRabbit skipped a head: the card *Notice when CodeRabbit
  skips*.
- d2ass and mellon, which have rulesets of their own.

## Impact

- Edited: `.coderabbit.yaml`, `bun/review-config.test.ts`,
  `core/git-and-prs.md`.
- GitHub settings (the user): the ruleset `main`.
- Consumers: `core/git-and-prs.md` reaches them through `sync.ts` on their
  next bump. `.coderabbit.yaml` is the harness's own and is not synced.
