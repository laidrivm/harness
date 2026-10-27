# code-review-replaces-cli

## Why

Five pull requests (#317, #318, #319, #320, #322) ran Claude's `/code-review
high` beside CodeRabbit's local CLI at the same commit. `/code-review` alone
flagged 18 verified defects, the CLI alone 1, both 6; and the CLI draws on the
CodeRabbit allowance that the review on the pull request also needs, which
already reads "0 included reviews remain" (card *Decide the reviewer
rotation's step 2 from the first five measured PRs*). On 2026-10-27 the user
chose answer 1 а without its SHA add-on: `/code-review` replaces
`/coderabbit-local` as the local reviewer now, the measurement ends, and
CodeRabbit on the pull request stays as it is. The SHA record is dropped
because, since #320, a subagent works in its own worktree, where
`/code-review` reads the branch's tree rather than the main checkout's.

## What Changes

- Step 5 of the pre-PR sequence, and the one pass a documentation branch
  gets, run `/code-review high` instead of `/coderabbit-local`, under the
  same conditions: only while no pull request is open on the branch, a draft
  counting as open, and a state the read could not get running it. It reads
  the diff against the base the runner measured from, and a review whose
  findings name no file that diff changes counts as one that did not return.
- The disposal policy `/coderabbit-local` had moves to `/code-review`
  unchanged: a verified finding is applied without asking, dismissing a
  Major or above goes to the user, at most three reviews, Minor findings
  reported once. `/code-review` names no severity, so the session grades
  each finding on CodeRabbit's ladder, Trivial to Critical (the user's
  answer 4 б, 2026-10-27). The
  session writes the `CODE-REVIEW gate:` line itself, since the built-in
  skill prints none.
- The measurement of `/code-review` beside the CLI ends: no fresh-subagent
  run at the CLI's first commit, no `## Review measurement` section, no tally
  card.
- The runner's last line names `code-review` where it named
  `coderabbit-local`, so the `Skill` hook's ledger record of the call
  (`judgement-step-record`) is the step's evidence.
- `/coderabbit-local` stays as a skill a session may run on request, in no
  sequence and no gate, so a consumer that runs it by hand keeps it.

Out of scope: CodeRabbit on the pull request and `/coderabbit` (unchanged);
the arguments that post findings (`--comment`, `--fix`, `ultra --post`), which
card *Refuse posting arguments to /code-review in a PreToolUse hook on Skill*
holds; a `claude -p --json-schema` run that types each finding's severity,
which waits for the runner launching the reviewer itself; the CLI in
`orchestrator/runner/Dockerfile`, which the kept skill still uses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: *The local review runs after triage and before the
  push* replaces *The gate runs after triage and before the push* whole,
  naming `/code-review high` as the local review and trading the scenario *The
  CLI is unavailable* for *The review does not return*, which a `MODIFIED`
  block cannot do; *Claude's review is measured beside the CLI before it may
  replace it* is removed; *The local review passes the guidelines the PR bot
  reads* becomes *The CLI review passes the guidelines the PR bot reads*,
  since `/code-review` passes no `--config`.
- `pre-pr-runner`: *The runner names the steps the branch requires from its
  diff* and *An open pull request requires the project checks alone* name
  `code-review` for `coderabbit-local`.
- `agent-autonomy`: the three scenarios of *Three classes say what an
  unattended session does at a step that names the user* that name
  `/coderabbit-local` name `/code-review`.

## Impact

- `core/review-toolkit.md`: the `/coderabbit-local` and `/code-review`
  bullets, step 5, the documentation-branch paragraph, and the `/coderabbit`
  bullet's reference to the local terms.
- `bun/pre-pr-steps.ts` and its tests: the step id.
- `bun/review-docs.test.ts`: the cases pinning the measurement give way to
  cases pinning `/code-review` as the local review.
- `core/autonomy.md`: the two exceptions an unattended pull request opens
  over name `CODE-REVIEW` for `CODERABBIT-LOCAL`.
- `README.md`: the sentence on `Skill(code-review)` for unattended sessions.
- Order: after `pre-pr-diff-paths`, whose archive (#324, merged) synced the two
  `pre-pr-runner` requirements and the `local-review-loop` requirement this
  change modifies (design.md, *Conflict check*).
