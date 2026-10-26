# pre-pr-diff-paths — design

## Context

`bun/pre-pr.ts` runs the diff budget, passing its own arguments through, and
records the run. `bun/diff-budget.sh` resolves its base when given none:
`origin/HEAD`'s symbolic target, else `main`. The pre-push hook calls it with
no argument, and so does the runner today. No code anywhere classifies a diff
as code or documentation: not `.github/workflows`, not `.coderabbit.yaml`, not
`bun/turn-gate.ts`. What a "dependency manifest" is, only the `/warm` skill
knows. The pull request's state is read in one place, `readPullRequests()` in
`bun/pull-requests.ts`, over REST.

The card's answer of 26 October fixes the classification: two categories,
documentation (every path `*.md` or under `openspec/`) and everything else; a
branch of config alone is code. Stage 2's question 24 (a′) fixes the role of
the pull request's state: before it opens, the gate wants the local review on
the exact `HEAD`; once it is open, only the project checks.

## Goals / Non-Goals

**Goals:**

- One function both the runner and `work.ts finish` import, so the list the
  runner prints and the list `finish` checks cannot drift.
- The same base for the diff budget and the path read.

**Non-Goals:**

- Comparing the list with the gate ledger. `finish` does it, through `ran()`
  filtered by `rule`.
- Running any judgement step. The runner names them; the agent runs them, and
  the `Skill` hook records them (slice item 2).

## Decisions

### Classify by exemption: documentation is the enumerated side

A path is documentation when it ends in `.md` or starts with `openspec/`;
every other path is code (`core/rules.md`, *Scope a scan by what it exempts*).
A misread in the code direction costs one `/zombies` run; one in the
documentation direction drops a review, so the enumerated side is the one
whose misread is cheap. Enumerating code by extension was rejected: a new
extension would fall silently to documentation. The suffix is matched in
lower case only, so `README.MD` reads as code, on the cheap side.

### `--no-renames`, so a move counts on both sides

`git diff --name-only -z --no-renames --no-relative <base>...HEAD` lists a
renamed file as a deletion and an addition. A `.ts` file moved to `.md` keeps
its `.ts` path in the list, and the branch stays code. With rename detection
the list would hold only the new name, and git's `diff.renames` setting would
decide the outcome. The other two flags take two more settings out of the
answer: `-z` prints each path literally, NUL-separated, where `core.quotePath`
would quote a non-ASCII one and leave `package.json"` as its basename, and
`--no-relative` lists the whole repository where `diff.relative` and a run
from a subdirectory would leave out every path outside it.

### A manifest is `package.json` or `bun.lock`, by basename

Every consumer is on bun. A nested `package.json` counts, as `/warm` counts
one. `/warm` keeps its own wider list for when it is called. A change to the
`harness` keys of `package.json` brings a `/warm` run that finds no dependency
and ends quickly: a cost accepted over parsing the manifest's diff.

### The pull request's state is an input, read by the caller

`required(paths, open)` is pure. The runner reads `open` as "one of
`readPullRequests(<current branch>)` is `OPEN`", draft or not. A failed read,
a detached `HEAD` and a branch with no pull request all read as not open,
which requires more steps, never fewer. `finish` reads the pull request for
its own sequence already and passes the same fact. A pull request merged or
closed is not open: a branch reused after a merge is reviewed again.

### An unreadable diff requires every step

When the path read fails (the base cannot be resolved, git cannot start),
the path read returns `undefined`, never `[]`, which is a branch that changes
nothing, and `required` names every step for it, `warm` included — unless
the pull request is open, which requires the project checks alone whatever
the diff holds, so the open state is read first. The diff
budget reports the same failure as its `ERROR` line, so the runner already
exits non-zero; the list stays the safe one for whoever reads it.

### One base, from one script both callers run

The base rule moves out of `bun/diff-budget.sh` into `bun/diff-base.sh`,
which prints the base and nothing else. `diff-budget.sh` calls it when given
no argument, so the pre-push hook and CI behave as before. The runner takes
its first argument as the base, or runs `diff-base.sh` once, and passes that
one value to the diff budget and to the path read. A copy of the rule in
TypeScript was rejected: the bash rule and its copy would drift, and a
mismatch would make the budget and the step list read different diffs
(`core/rules.md`, *Write logic a second time only by lifting it into one
module*).

### Step ids are the names the ledger records carry

A judgement step's id is its skill's name — `zombies`, `triage`, `warm`,
`coderabbit-local` — which is the `rule` the `Skill` hook writes (stage 2,
question 30, variant a). The project checks' id is the `rule` of the record
`pre-pr-project-checks` makes the runner write for them. The module exports
the ids as constants, and the runner's project-checks record takes its `rule`
from the constant, so the name is defined once. Two tests pin the names where
they are defined: each judgement id names a `core/skills/<id>/SKILL.md` whose
`name:` is that id, and the record a runner run writes carries the project
checks' id. The diff budget is not a required step: it gates the push and CI
on its own (`change-slicing`), and its record keeps the `rule` it has.

### The list is the runner's last line, not a gate line

The runner prints `PRE-PR steps: <id>, <id>, …` on every run, an open pull
request's included, after every step has run. It is the same `PRE-PR:` family
as its no-record line, so the turn gate's `GATE_LINE` never reads it as a
report. The runner's exit status is unchanged by it.

## Seams with the sibling changes

The siblings' slugs below are the working names their cards give; none is on
`main` yet.

- **`pre-pr-project-checks`** (slice item 1): runs the project checks on every
  run and writes one record per step. This change applies after it merges: it
  takes that record's `rule` into the exported constant, and dropping the
  documentation path's `bun test` rests on the checks running every time.
- **`judgement-step-record`** (slice item 2): the `Skill` hook writes
  `{rule: <skill name>, commit: HEAD of the hook's cwd}`. The ids here are
  those names; nothing here reads the hook.
- **The draft-rule change** (`work.ts finish`): owns the order sign-off → push
  → pull request → ready and the refusal. Its `finish` imports `required`, the
  path read and the base script from here, run from the subagent's worktree
  so `HEAD` is that branch's. If it applies first, it carries a stub that
  requires the project checks alone and deletes it when this change merges.
- **Reviewer rotation**: decides who reviews and when; the open-PR branch of
  `required` is its step 1 (no `/coderabbit-local` on fix pushes into an open
  pull request) and changes no classification.
- **`ran()` filtered by `rule`**: ships with whichever slice change merges
  first; this change does not call `ran()`.

## Conflict check (stage 2, roadmap question 14 b)

On `origin/main` the only open change is `host-deploy`, whose deltas touch
`orchestrator` alone; no pull request was open when this was proposed. The
siblings' cards name deltas to `pre-pr-runner` (items 1 and 2, the draft-rule
change) and, for the rotation, `local-review-loop`. This change only adds
requirements to `pre-pr-runner` and modifies none of its four, so a sibling's
`MODIFIED` of *The runner runs the deterministic step itself* does not collide
with it. Its `MODIFIED` of *The gate runs after triage and before the push* in
`local-review-loop` is the one to re-read against the rotation's delta when
that one is proposed; the conclusion goes into this section then.

## Risks / Trade-offs

- [A consumer on another ecosystem gets no `/warm`] → none today; the
  manifest list widens by name when one arrives.
- [The runner gains a network read per run] → `readPullRequests()` is time-
  limited and a failure reads as not open; the list only grows.
- [The skill names change] → the pinning test fails on the rename.
- [`diff-base.sh` is called from a consumer's tree] → it sits beside
  `diff-budget.sh` in `node_modules/harness/bun/`, and the caller finds it by
  its own directory, as the runner finds `diff-budget.sh` today.

## Migration Plan

One group, one pull request, cut after `pre-pr-project-checks` merges.
Rollback is a revert: nothing reads the new line but agents and `finish`.
