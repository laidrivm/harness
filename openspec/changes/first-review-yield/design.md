# first-review-yield — design

## Context

See proposal.md — *Why*. `session-wrapup`'s step 5 writes the pipeline-yield
entry: a line per review skill that ran, a `gates` line from the gate ledger
(`gate-ledger`, *The wrap-up reports the gate decisions*) and a `captures`
line (`agent-rulebook`, *The yield ledger counts captures by kind*). Its
`allowed-tools` holds no `gh`. The ledger has no pull request numbers and no
review findings, so the share must be read from GitHub.

What GitHub holds, read on 2026-10-27:

- CodeRabbit marks a reviewed commit `Review completed`: as the commit status
  `CodeRabbit` up to #317, as a check run of that name from #318 on. A draft
  head reads `Review skipped: draft pull request`.
- A review with findings is a review object from `coderabbitai[bot]` whose
  `commit_id` is the reviewed commit; its inline comments hold the findings,
  its body the nitpicks and the findings outside the diff. A review with no
  findings submits no object (#325: three commits, a completed check run,
  no review).
- Severity is a word on each finding: Critical, Major, Minor or Trivial. On
  every first review from #297 to #328 it follows an icon,
  `<picture>…</picture> Major**`; the `coderabbit` skill's step 2 still
  quotes the older form, `_🟠 Major_` in a category line. The markup has
  changed at least once, the word has not.

## Goals / Non-Goals

**Goals:** each wrap-up records, for the pull requests first reviewed since
the previous entry, how many raised no Major or above; a baseline exists by
the same definition before the gate; the session closing stage 2 can count
five gated pull requests from those lines and the ledger.

**Non-Goals:** a script or a ledger record for the count; the local
`/code-review` findings; repairing the `coderabbit` skill's step 1 (status
only) and step 2 (old markup), which is reported apart; consumers' pull
requests counting toward stage 2.

## Decisions

1. **The first review is CodeRabbit's, on the pull request** (user, card
   question 1 а). It measures what the pre-PR sequence let through, and the
   bot grades the baseline and the window alike. `code-review-replaces-cli`
   (#328) made `/code-review` the local reviewer with a severity the session
   assigns; that does not move this metric, which counts no local finding.
   Rejected: the local review (no severity of its own, fixed before the pull
   request opens, prose in the PR body) and both (a second number that
   decides nothing).
2. **The first reviewed commit is the earliest commit of the pull request
   that reads `Review completed`**, from the check run or the status — both,
   because the bot moved from one to the other on 2026-10-27. Its findings
   are the bot's reviews with that `commit_id`, inline and in the body; none
   is zero findings. A pull request with no such commit — skipped, rate
   limited, never run — is named unmeasured and counted in neither number.
   A commit shared with another pull request (a stacked branch, #305 and
   #306) counts under each pull request's own reviews of it.
3. **A Major or above is the bot's Critical or Major label**, never
   re-graded, and a dismissed one still counts — as the `captures` line
   counts a declined capture, the line measures what the step raised.
4. **The session reads the severity word, not a pattern.** Step 5 tells it
   to take, for each finding, the word the bot labels it with — after its
   icon or in its category line — and names both forms as examples, not as
   the definition. A finding with no word gets the kind its heading implies
   (`⚠️ Potential issue` → Major), marked `(inferred)`, as the `coderabbit`
   skill's step 2 does. Rejected: a script matching CodeRabbit's markup — the
   format has already changed once, and the roadmap puts an automatic count
   at stage 13.
5. **Which pull requests a line covers.** Those whose first review
   completed on or after the date in the previous entry's heading, found
   from `gh pr list --state all --search "updated:>=<since>"`, less any the
   previous entry's `first review` line already names — the heading holds a
   date, not a time. The reads, in the order the step names them:

   ```bash
   gh pr list --repo <owner/repo> --state all --search "updated:>=<since>" --limit 100 --json number
   gh api repos/<owner/repo>/pulls/<n>/commits --paginate --jq '.[].sha'
   gh api repos/<owner/repo>/commits/<sha>/check-runs --jq '.check_runs[] | select(.name == "CodeRabbit") | .output.summary'
   gh api repos/<owner/repo>/commits/<sha>/status --jq '.statuses[] | select(.context == "CodeRabbit") | .description'
   gh api repos/<owner/repo>/pulls/<n>/reviews --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]" and .commit_id == "<sha>") | .id, .body'
   gh api repos/<owner/repo>/pulls/<n>/reviews/<id>/comments --paginate --jq '.[].body'
   ```

   The commits are walked oldest first and the walk stops at the first
   `Review completed`. The line reads
   `- first review: k of n without Major+ — #a, #b (Major+), #c (unmeasured)`,
   or `- first review: none reviewed`. `allowed-tools` gains
   `Bash(gh api:*)` and `Bash(gh pr list:*)`, the two the `coderabbit` skill
   already holds; the command guard reads a `gh api` call with no method and
   no field as a read.
6. **Stage 2's count is the closing session's, not the skill's** (decision
   6 on the card). «Without bypass» means the pull request was opened and
   marked ready after `work-finish` group 2 (`work.ts finish` and the ready
   guard) merged, and the gate ledger holds a `pre-pr` `pass` record under
   `project-checks` whose `commit` is the first reviewed commit — what the
   ready gate is to require (stage 2, question 24). The five are consecutive
   by first-review time, harness pull requests only. The closing session
   takes them from the `first review` lines, checks each in the ledger, and
   writes under stage 2 in the roadmap the line «value — date — source»
   (roadmap question 12), through the Notion connector until `notion-bot`
   writes it. No new ledger record is needed.
7. **The baseline is written once, as its own entry** in
   `docs/context/pipeline-yield-2026-10.md`, so the first gated count has
   something to sit beside (*Baseline* below).

## Baseline

The last 20 measured pull requests before the gate, read on 2026-10-27,
after #328 merged: **14 of 20 without Major+ (70 %)** — #309–#328, first
reviews from 2026-10-26 20:48 to 2026-10-27 21:32 UTC. Not rough: every
finding carried a severity word.

| PR | first reviewed commit | Major+ |
| --- | --- | --- |
| #309 | `a89ffa9` | no (2 Minor) |
| #310 | `15c98e0` | no (2 Minor) |
| #311 | `76bbaff` | no (no review) |
| #312 | `ba1328b` | no (3 Minor) |
| #313 | `36b0f3f` | no (1 Minor) |
| #314 | `9f66516` | yes (1 Major) |
| #315 | `b841b7e` | yes (1 Major) |
| #316 | `3af9c77` | yes (1 Major) |
| #317 | `3fa8a90` | yes (1 Minor, 1 Major) |
| #318 | `9c91b6c` | yes (1 Trivial, 1 Major) |
| #319 | `11e575f` | no (1 Minor) |
| #320 | `c7dbafa` | no (1 Minor) |
| #321 | `9fe93d5` | no (1 Trivial, 1 Minor) |
| #322 | `62d8820` | no (2 Minor) |
| #323 | `0a207f9` | no (3 Minor) |
| #324 | `06165f8` | no (no review) |
| #325 | `34738ad` | no (no review) |
| #326 | `6d369e6` | no (1 Minor) |
| #327 | `4bcede2` | no (no review) |
| #328 | `a191163` | yes (3 Major) |

How it was read: three GraphQL reads of #296–#328, each pull request's
commits with their `CodeRabbit` status and check runs, and the bot's reviews
with their comments; the first reviewed commit and its reviews were selected
by decision 2, and the severity word after each finding's icon was read and
checked by hand. Every one of #296–#328 was measured. Order is by the time
of the commit's first `CodeRabbit` status or check run, which is approximate
but does not move the window's edge: #308, the next older, was first
reviewed at 20:39. The 13 older ones (#296–#308) are outside the window;
#299 and #308 among them raised a Major. The card's exploration had
estimated about 14 of 20.

## Seams

- `work-finish` group 2 opens the measured window and gives «without
  bypass» its meaning; this change applies after it in prose, not `after:`,
  since that change is not archived. Its `unproven()` stub asks for the
  runner's `diff-budget` record; decision 6 asks for `project-checks`, which
  the same runner run writes. Until the required-steps card makes `finish`
  ask for it too, a pull request `finish` let through on a failed
  `project-checks` counts as bypassed, which is what the stage means.
- Card *measurement procedure* (`40639875c31b81f6bc99cd58d90c3c5a`): its
  items 1 and 2 — how the five are ordered, and that they are counted in the
  harness only — are resolved here by decision 6.
- The rotation card (`40639875c31b81f99c03d0bb8c93a1ba`, #328): its question
  4 б grades the local review; with decision 1 that grading does not reach
  this metric.
- The status-gate card (`notion-bot`, proposed in parallel): the roadmap
  line goes through the connector until that bot writes it.

## Conflict check

`openspec show <change> --json --deltas-only` on 2026-10-27 over every open
change on `origin/main`: `code-review-replaces-cli` (`agent-autonomy`,
`local-review-loop`, `pre-pr-runner`), `host-deploy` (`orchestrator`),
`judgement-step-record` (`gate-ledger`, `harness-updates`), `work-finish`
(`commit-gates`, `gate-ledger`, `pre-pr-runner`, `work-finish`). No open
pull request carried a change directory. None touches `agent-rulebook`: no
contradiction, and no order beyond the prose one above.

## Risks / Trade-offs

- [CodeRabbit's quota leaves a pull request unreviewed] → it is named
  unmeasured and breaks no series; the five take longer to gather.
- [The bot's markup changes again] → the session reads the word; the
  examples in the step are named as examples.
- [The step costs several `gh` reads per pull request] → the walk stops at
  the first reviewed commit, and a wrap-up covers the pull requests of one
  session.
- [A consumer without CodeRabbit] → the skill reaches d2ass and mellon through
  `sync`; with no bot, the line reads `none reviewed`.
