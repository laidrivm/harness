# first-review-yield

## Why

Stage 2 of the roadmap closes only when five pull requests in a row have
passed the write gate without a bypass and their metric is counted: the share
of pull requests whose first review raised no finding of Major or above. The
pipeline-yield ledger, which the stage names as the baseline, records
findings per session and skill and almost never their severity, so it holds
no such share; nothing in the harness counts it today. On 2026-10-27 the user
chose CodeRabbit's first review on the pull request as the review (card
question 1 а) and the last 20 measured pull requests before the gate as the
baseline (question 2 в).

## What Changes

- `session-wrapup`'s step 5 gains one `first review` line: of the pull
  requests whose first CodeRabbit review landed since the previous yield
  entry, how many raised no Critical or Major finding, naming each one. The
  step names the `gh` reads that find the first reviewed commit and the bot's
  reviews of it, and tells the session to read each finding's severity word
  itself, not by a pattern, since the bot's markup has changed before.
- The skill's `allowed-tools` gains `Bash(gh api:*)` and
  `Bash(gh pr list:*)`, which those reads need.
- The baseline is computed once, by the same definition, and appended to
  the pipeline-yield ledger as an entry of its own. Read on 2026-10-27, 14
  of the last 20 measured pull requests, #309–#328, raised no Major or
  above; the apply step re-reads the window up to the gate (design.md,
  *Baseline*).
- No code: no script reads CodeRabbit's markup. The session that closes
  stage 2 picks the five pull requests from these lines and writes the
  roadmap's «value — date — source» line; that line is outside the tree.

Out of scope: `/code-review`'s local findings, whose severity the session
assigns itself (`code-review-replaces-cli`); the `coderabbit` skill, whose
step 1 still reads only the commit status and whose step 2 still quotes the
older severity markup — reported apart; an automatic count, which is the
roadmap's stage 13.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-rulebook`: a new requirement, *The yield ledger counts first reviews
  without a Major-or-above finding*, beside *The yield ledger counts captures
  by kind*.

## Impact

- `core/skills/session-wrapup/SKILL.md`: step 5, its example and
  `allowed-tools`. The skill reaches consumers through `sync`; a consumer
  without CodeRabbit writes `none reviewed`.
- A new test file pinning the skill's text, in the way
  `bun/transcript-archive-catch-up.test.ts` pins step 3's catch-up.
- `docs/context/pipeline-yield-<yyyy-mm>.md` of the apply month: the
  baseline entry.
- Order: applies after `work-finish` group 2 (`work.ts finish` and the ready
  guard), whose landing opens the measured window; the skill text does not
  depend on it (design.md, *Seams*).
