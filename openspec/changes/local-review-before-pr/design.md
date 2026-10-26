# local-review-before-pr — design

## Context

`core/review-toolkit.md` is the one place that says when `/coderabbit-local`
runs: step 5 of *The pre-PR sequence*, and one pass on the documentation
branch's path. No harness script runs the CLI or reads its gate line to decide
a push — `bun/turn-gate.ts` asks for some gate line, never this one — so the
change is prose and the tests that pin it. `core/git-and-prs.md` says nothing
about a local review on a fix push and needs no edit; its bullet on
re-checking the pull request's state before every push is where the state
this change reads already comes from.

The user's answers on the card (2026-10-26): 1 а — path by steps; 2 да — no
local review on a fix push into an open pull request; 3 — the usage cap is the
user's setting, which the agent need not know; 4 — once `/code-review` is
enabled its findings carry CodeRabbit's scale through a `severity` field in a
`claude -p --json-schema` run and follow the same policy. Stage 2's answer 24
а′ states step 1 by the pull request's state: no pull request yet → local
review on the exact `HEAD`; a pull request open → CodeRabbit reviews the head.

## Goals / Non-Goals

**Goals:**

- No `/coderabbit-local` on a push into an open pull request (step 1).
- A written, repeatable measurement of `/code-review` beside
  `/coderabbit-local` on five to ten real pull requests, ending in a tally
  the user decides step 2 on.

**Non-Goals:**

- Replacing `/coderabbit-local`, and the `--json-schema` invocation with its
  `severity` enum: that is the change step 2 opens if the user enables it,
  together with `orchestrator/runner/Dockerfile` and `orchestrator/README.md`
  losing the CLI.
- The CodeRabbit usage cap, a billing setting outside the agent's reach.
- A reviewer interface (the card's decision 5: one reviewer on the pull
  request).

## Decisions

1. **Open means open, draft included.** A draft is open: CodeRabbit reviews
   its head when it is marked ready, which every pull request reaches before
   merge. The first push of a branch precedes its pull request, so it still
   gets the local review. A branch whose pull request was closed unmerged has
   none open and gets it again. The alternative — skipping only on a push
   that carries review fixes — needs the agent to classify its own push,
   which answer 24 а′ rejected.
2. **Only step 5 goes.** `/zombies`, `/warm` and `/triage` still run on a
   push into an open pull request, and the runner's record is still
   needed: the card's step 1 and answer 2 remove the local review alone, and
   the others cost no CodeRabbit allowance.
3. **The measurement runs at the commit of the CLI's first pass, in a fresh
   subagent, at effort `high`.** The same commit makes the two lists
   comparable. A fresh subagent gives the reviewer a context that did not
   write the code, which is the separate context the card's option names;
   the session's own context would review its own reasoning. `high` is named
   because `/code-review` with no level reuses the last one typed, which
   would make the runs incomparable.
4. **Both reviewers' verified findings are applied.** The branch ships either
   way, and leaving a known defect in to keep the experiment clean would
   ship it. The question the tally answers is whether `/code-review` flags
   what `/coderabbit-local` flags, which the same-commit lists answer
   directly; what CodeRabbit then raises on the pull request is what both
   missed.
5. **No severity during the measurement.** The tally compares verified
   defects. `/code-review` is no gate while measured, so the Major-and-above
   dismissal rule has nothing to hold: the CLI's gate line still decides.
   The `severity` enum (answer 4) belongs to the run that will gate.
6. **The tally lives on the pull requests.** Each measured pull request's
   body carries a `Review measurement` section: one line per verified defect,
   its file and line, what it was, and which local reviewer flagged it (CLI,
   `/code-review`, both). The session that opens a pull request is the one
   that knows the local findings, and the body sits next to the CodeRabbit
   review it is compared with. Measured pull requests are counted with
   `gh pr list --repo <repo> --state all --search '"Review measurement"
   in:body'`. Rejected: the pipeline-yield ledger, which `session-wrapup`
   alone appends to per session, so a pull request's two halves would land
   in different entries; and a new ledger file, which is new state for five
   rows.
7. **The fifth files a card; the tenth stops.** The session that opens the
   fifth measured pull request files an `idea` card on the Harness board
   with the tally per pull request — only the CLI, only `/code-review`, both,
   and what CodeRabbit raised on the pull request and the agent applied —
   for the user to decide step 2 on. The user's criterion (card, question 1):
   `/code-review` finds what CodeRabbit finds, or more. A subagent without
   Notion access names the card in its report, and its caller files it. Ten
   bounds the subscription the second review spends while the decision
   waits. The change that acts on the decision removes the requirement,
   whichever way it goes.
8. **`/ponytail-review`'s record is no evidence about `/code-review`.** The
   `/code-review` bullet says so: that plugin was tuned to shape, not
   defects, and the code it read was written under the same plugin (the
   card's correction of 2026-10-26).

## Seams with the changes in flight

- *Judgement steps get a ledger record from a `Skill` hook* (stage 2, slice
  item 2): it records `/coderabbit-local` as invoked. After this change a push
  into an open pull request has no such record, by design; a `/code-review`
  run during the measurement may be recorded too, harmlessly.
- *Required steps from the diff* and *the draft rule inside `work.ts finish`*
  (slice item 3): `finish` must not require the local review once a pull
  request is open — the same answer 24 а′ this change writes into the doc.
  Whichever merges second reads the other; neither is named in `after:`,
  since the branch holds neither directory.
- *Project checks in `pre-pr.ts`* (slice item 1): no overlap — the runner
  runs no reviewer. Stage 2's *Потом* item 4, the runner launching the
  reviewer itself, waits on step 2's decision.
- `host-deploy` edits `orchestrator/README.md`, which only step 2 would touch.

Conflict check (stage-2 question 14 б, by hand): `openspec show
<change> --json --deltas-only` for every open change. On `origin/main`,
`host-deploy` touches `orchestrator` only; no open pull request held a change
directory when this was written. No shared capability, so no contradiction.

## Risks / Trade-offs

- A fix push without a local review can add a round on the pull request. The
  round caps (3 soft, 5 hard) still hold, and roadmap question 8 revisits the
  policy if stage 8's metric shows too many rounds.
- A large piece of work pushed into a draft reaches CodeRabbit with no local
  review — accepted by answer 24 а′.
- The measurement spends subscription on a second review per branch, bounded
  at ten pull requests.
- Applying both reviewers' fixes hides what CodeRabbit on the pull request
  would have caught after `/code-review` alone. The same-commit comparison is
  the direct answer to the user's question; the residual is reported, not
  inferred.
- The brief subagents work from (outside this tree) restates the sequence
  and must drop step 5 for a fix push; the session that briefs them owns it.
