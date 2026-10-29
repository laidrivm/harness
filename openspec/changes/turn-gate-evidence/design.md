# turn-gate-evidence — design

## Context

See proposal.md, *Why*. Today `GATE_LINE` plus `ran(end, top)` passes on any
`pre-pr` record of the tip, whatever its step or outcome; `reported()` is
exported only for four test files.

## User's answers, 28.10

1. а — delete the `BLOCKED` exit and `NAMED_BLOCK` too: the hook reads no
   text; a blocked turn costs one refusal, then the mark releases it.
2. а — the turn gate checks only the runner's records of the turn's last
   commit; judgement-step records are not its business.
3. б — `unproven()` in `work.ts finish` is not filled here: card
   `40739875c31b81a2b885cca94a3fd1ad` holds it, taken on a seen skip.
4. Moot while `unproven()` reads no skill records; on that card too.
5. а — the five skills keep their gate lines as a report; `core/autonomy.md`'s
   "every gate line reads `PASS`" and `session-wrapup`'s count stay; the
   README and `core/review-toolkit.md` stop calling them machine-checked.

Assumptions accepted: 6 — the `commit-gates` scenarios about gate lines are
rewritten to the runner's record, not added to; 7 — the mark, one refusal per
mark and the `/goal` round ceiling stay.

## Decisions

**D1. No field of the message is read.** The early return on a missing
`last_assistant_message` goes with it: that fail-open existed because the
escape from a refusal was text in the message, and the escape is now the
runner. `openspec` refuses a `MODIFIED` that drops a scenario, so the
scenarios about gate lines and `BLOCKED` keep their names with bodies
rewritten (assumption 6).

**D2. The evidence is a passing record of every runner step**,
`pre-pr-runner`'s "passing run record": a `pass` record per step for the
commit, not one run's records. Rejected: a run id that ties the steps to one
run (CodeRabbit on #346; user, 29.10, 1 а). Rejected: "any record", which with a
gate line beside it let a failed run pass because the line reported the
failure; with no line it would end a turn on a failed step in silence. The
goal check and `finish` ask the same, so one run meets all three. A step with
no passing record for the tip costs one refusal, as answer 1 accepts for a
blocked turn; an earlier pass at that commit still counts after a later fail.

**D3. One export.** The goal check and `ranUnder()` each copy
`RUNNER_STEPS.every((rule) => ran(commit, top, "pass", ledger, rule))`; it
becomes `passed(commit, top, ledger?)` in `gate-ledger.ts`, and both switch.
`work-finish.ts` keeps its `filter`, which names the missing steps.

**D4. One refusal text**, naming the groups, the tip and the runner's path,
saying the refusal is not repeated for this turn, so a turn blocked on the
user ends at its next stop — and telling it to end that stop on its whole
final message again: the board loop's launcher and the `/goal` condition read
the continued turn's last message (`BLOCKED —`, `QUESTION:`, `PR-TITLE:`), and
a bare acknowledgement there would lose the question (local review, Major).

**D5. Names stay.** The requirement keeps *A turn that commits reports its
gates before it ends*, cited by name in archived changes. `stage-goal`'s
"SHALL NOT be a gate line that the turn gate accepts" and *The line the turn
gate reads* turn vacuous once the gate accepts no line. A `MODIFIED` copy of
that requirement is ~100 lines and would take this proposal over the 800-line
budget, so the apply pull request adds that `stage-goal` delta (task 1.4)
beside the test it moves.

## Consumers

d2ass and mellon register `node_modules/harness/bun/turn-gate.ts` and get
the change on their next pin bump. Read on 2026-10-28, both pins (`f2fc4fa`,
`dc107b3`) already refuse a reported turn without a runner record of the tip,
and ship `bun/pre-pr.ts` with a `harness.bumpTest`. For them: no gate line is
needed to end a turn; both runner steps must have passed at the tip, where
any record did; a `BLOCKED` ending or a failed step costs one refusal —
mellon's project checks fail without a CouchDB, so a session there pays it
until it runs them against one. The registration text is unchanged.

## Conflict check (roadmap Q14 б)

Against `origin/main` `c015e4c` and the open pull requests (#342 alone):

- `notion-status-gate` (group 3 open then): its `gate-ledger` delta copies
  *Every gate refusal is recorded* with "because its final message reported"
  and *A turn refused, then let through*'s "ends with gate lines". Both
  deltas say to re-copy against the live spec before archiving, so whichever
  archives second keeps the other's edits. It archived first, on
  2026-10-29, and this change's delta was re-copied from the synced text
  then, keeping its two edits. Its code imports
  `groups`/`complete` from `turn-gate.ts`, which stay.
- `first-review-yield` (#342): `session-wrapup` step 5 and `agent-rulebook`,
  neither touched here. The stage's five pull requests count once the
  self-pin passes this change's apply merge.
- `host-deploy`: `orchestrator` and host scripts; no turn gate, gate line or
  `BLOCKED` in it.
- `finish-without-card`: `work-finish`; `finish` is left alone (answer 3 б).

No `after:` is needed.

## Risks / Trade-offs

- [A release no longer means only a refusal walked past] → a turn blocked on
  the user, one whose step keeps failing and one that ignored the refusal all
  record `released`; `gate-ledger` says so: a count of releases bounds
  bypasses from above.
- [A branch with a valid `oversize:` override] → `pre-pr.ts` passes no
  `PR_BODY`, so its diff budget records `fail` and each group it completes
  costs one refusal, as `finish` and the goal check refuse it already.
  Accepted here.
- [The harness's sessions run the old hook until the self-pin moves] → the
  live probe, group 2, runs after the bump.

Rollback is a revert of group 1; the ledger and the marks keep their format.
