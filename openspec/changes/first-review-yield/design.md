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
   because the bot moved from one to the other on 2026-10-27 — on a success
   result only: the check run's `conclusion` or the status's `state` is
   `success`, which the reads below select, since the text alone is not the
   outcome (CodeRabbit on #329, deferred to apply). Its findings
   are the bot's reviews with that `commit_id`, inline and in the body; none
   is zero findings, as the bot's walkthrough comment says where its
   `Commit` names that commit: «No actionable comments were generated in the
   recent review» (#325). A pull request with no such commit — skipped, rate
   limited, never run — is named unmeasured and counted in neither number.
   A commit's check run counts for this pull request only when its summary
   links `/pull/<n>` of it: a stacked branch carries a commit the bot
   reviewed for another pull request (#306 holds #305's `ee1597a`), and
   without the check the walk would stop there and read this one as clean.
   The older commit status names no pull request, so it counts only when
   `commits/<sha>/pulls` lists this pull request alone — for `ee1597a` it
   lists #305 — and no commit of the baseline window was shared.
3. **A Major or above is the bot's Critical or Major label**, never
   re-graded, and a dismissed one still counts — as the `captures` line
   counts a declined capture, the line measures what the step raised.
4. **The session reads the severity word, not a pattern.** Step 5 tells it
   to take, for each finding, the word the bot labels it with — after its
   icon or in its category line — and names both forms as examples, not as
   the definition. A finding with no word gets the kind its heading implies
   (`⚠️ Potential issue` → Major), as the `coderabbit` skill's step 2 does,
   and the pull request's mark gains `inferred` — `#a (Major+, inferred)`,
   or `#a (inferred)` where the inferred kind is below Major. Rejected: a
   script matching CodeRabbit's markup — the format has already changed
   once, and the roadmap puts an automatic count at stage 13.
5. **Which pull requests a line covers.** Those whose first review
   completed on or after the day before the date in the previous entry's
   heading — the heading holds a local date, GitHub's times are UTC — and
   that no earlier `first review` line in `docs/context/pipeline-yield-*.md`
   names as measured. A pull request named only as unmeasured is read again,
   since a draft at one wrap-up is reviewed by the next. The margin day and
   the name check together keep a pull request out of two lines written one
   after the other. The reads, in the order the step names them, with gh's
   own `{owner}/{repo}` placeholder so a consumer needs no other tool to
   name its repository:

   ```bash
   gh pr list --state all --search "updated:>=<since>" --limit 1000 --json number
   gh pr list --state open --limit 1000 --json number
   gh api 'repos/{owner}/{repo}/pulls/<n>/commits' --paginate --jq '.[].sha'
   gh api 'repos/{owner}/{repo}/commits/<sha>/check-runs?filter=all' --paginate --jq '.check_runs[] | select(.name == "CodeRabbit" and .conclusion == "success") | [.completed_at, .output.summary] | @tsv'
   gh api 'repos/{owner}/{repo}/commits/<sha>/statuses' --paginate --jq '.[] | select(.context == "CodeRabbit" and .state == "success") | [.created_at, .description] | @tsv'
   gh api 'repos/{owner}/{repo}/commits/<sha>/pulls' --jq '.[].number'
   gh api 'repos/{owner}/{repo}/pulls/<n>/reviews' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]" and .commit_id == "<sha>") | [.id, .body] | @tsv'
   gh api 'repos/{owner}/{repo}/pulls/<n>/reviews/<id>/comments' --paginate --jq '.[].body'
   gh api 'repos/{owner}/{repo}/issues/<n>/comments' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | .body'
   ```

   `<since>` is that day before, and on the first entry ever, today. The
   candidates are the union of the first two reads' numbers, each pull
   request once: a review completing adds no
   update to its pull request, so one opened before `<since>` and first
   reviewed after it is missing from the `updated:` search while it stays
   open, and closing it is an update. The candidates are cut by the
   first-review time the check-run or status read gives; `--limit 1000`
   because gh's default of 30 is the cut-off that the goal check once read as the
   whole list (#131). `filter=all` and the `statuses` list, not the latest
   check run and the combined status: one commit holds several CodeRabbit
   results — `c59320a` a skipped run and then a completed one, `ee1597a`
   a draft skip, a run in progress and a completion — and the latest alone
   can hide the completed one. The commits are walked oldest first and the walk stops at the
   first `Review completed` that counts for this pull request (decision 2).
   The line reads
   `- first review: k of n without Major+ — #a, #b (Major+), #c (unmeasured)`,
   or `- first review: none reviewed`. `allowed-tools` gains
   `Bash(gh api:*)` and `Bash(gh pr list:*)`, the two the `coderabbit` skill
   already holds; the command guard passed each of these reads on
   2026-10-27 and 28, as a `gh api` call with no method and no field.
6. **Stage 2's count is the closing session's, not the skill's** (decision
   6 on the card). «Without bypass» means the pull request was opened and
   marked ready after `work-finish` group 2 (`work.ts finish` and the ready
   guard) merged, and the gate ledger holds a `pre-pr` `pass` record under
   `project-checks` whose `commit` is the first reviewed commit and whose
   `at` precedes the switch to ready that review followed — the last
   `ready_for_review` before it in
   `gh api 'repos/{owner}/{repo}/issues/<n>/events' --paginate` (paginated,
   or one past the first page is missed), or the pull request's
   `created_at` where there is none — what
   the ready gate is to require (stage 2, question 24). The five are consecutive
   by first-review time, harness pull requests only. The closing session
   takes them from the `first review` lines, counting a pull request named
   in two entries once — two sessions on parallel branches each append to
   their own copy of the ledger file. The lines hold no time, so it orders
   the pull requests by the first-review time it re-reads with step 5's
   check-run and status reads; the line's format stays as it is. It checks
   each in the gate ledger by `commit` alone, under any `project`: a
   subagent's run in a scratch clone
   records the clone's path, not the main checkout's, and a commit names one
   tree whichever checkout ran it — CodeRabbit's ask on #329 to match the
   repository too was rejected for this (user, answer а). The ledger is this
   laptop's; a pull request whose runner ran elsewhere counts as bypassed
   until the VPS writes one. It then writes under stage 2 in the roadmap the
   line «value — date — source» (roadmap question 12), through the Notion
   connector until `notion-bot` writes it. No new ledger record is needed.
7. **The baseline is written once, as its own entry** in the pipeline-yield
   ledger of the month it is written in, so the first gated count has
   something to sit beside. The user's window is the last 20 measured pull
   requests before the gate, and the gate is `work-finish` group 2's merge,
   which had not happened when this was proposed: task 2.1, run after the
   merge, re-read the window ending at it, so the pull requests between
   #328 and the gate fall in the baseline rather than in neither window;
   *Baseline* below is that re-read. The entry holds no `gates` line, so
   step 5 takes the gates line's start, `<gates-since>`, from the previous
   entry that holds one: otherwise the baseline's date would end the
   ledger's gate window without a line counting it (local review on the
   apply pull request).

## Baseline

The last 20 measured pull requests whose first review completed before
`work-finish` group 2 merged (#332, 2026-10-28 15:28:45 UTC), re-read by
task 2.1 on 2026-10-28 with step 5's reads:
**13 of 20 without Major+ (65 %)** — #316–#335, first reviews from
2026-10-26 23:27 to 2026-10-28 14:10 UTC, in that order. Not rough: every
finding carried a severity word, and no commit of the window was shared
with another pull request. The provisional read of 2026-10-27 was 14 of 20
over #309–#328; the seven pull requests up to the gate pushed out #309–#315
(two of them with a Major), and three of the seven raised one. No pull
request opened before the gate was first reviewed after it, so none falls
between the windows.

| PR | first reviewed commit | Major+ |
| --- | --- | --- |
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
| #329 | `c59320a` | yes (3 Major) |
| #331 | `1f2df1a` | no (1 Minor) |
| #333 | `9b05956` | no (no review) |
| #334 | `31c2da5` | no (no review) |
| #335 | `36d3779` | no (no review) |
| #330 | `2120465` | yes (3 Major, 2 Minor) |
| #332 | `88bfbb1` | yes (2 Major, 2 Minor) |

How it was read: three GraphQL reads of #296–#328, each pull request's
commits with their `CodeRabbit` status and check runs, and the bot's reviews
with their comments; the first reviewed commit and its reviews were selected
by decision 2, and the severity word after each finding's icon was read and
checked by hand. Those reads saw only the latest result per commit, so
every result was re-read for each commit before a first reviewed one —
`statuses` for #309–#317, all check runs naming the pull request for
#318–#328 — and no first reviewed commit moved. Every one of #296–#328 was
measured. Order is by the time
of the commit's first `CodeRabbit` status or check run, which is approximate
but does not move the window's edge: #308, the next older, was first
reviewed at 20:39. The 13 older ones (#296–#308) are outside the window;
#299 and #308 among them raised a Major. The card's exploration had
estimated about 14 of 20.

Task 2.1 read #329–#335, every pull request opened before the gate, with
step 5's `gh` reads, success results only: each first reviewed commit's
check run links its own `/pull/<n>`, and every comment of the bot's reviews
of it carries its severity word. The window's new edge holds: #315, the
next older, was first reviewed at 2026-10-26 22:52, before #316's 23:27;
#336 and later were opened after the gate.

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
  the first reviewed commit, and a wrap-up covers only the pull requests
  first reviewed since the previous entry, which on this repository has
  been a dozen or two a day.
- [Two parallel branches each write a line naming the same pull request] →
  the closing session counts it once (decision 6).
- [A consumer without CodeRabbit] → the skill reaches d2ass and mellon through
  `sync`; with no bot, the line reads `none reviewed`.
