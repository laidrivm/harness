# pre-pr-project-checks — design

## Context

See proposal.md, *Why*. What the change builds on:

- `bun/pre-pr.ts` reads `HEAD` and `git status --porcelain
  --untracked-files=no` before its one step. It spawns `bash diff-budget.sh`
  with inherited output and writes one record, with `rule: "diff-budget"`,
  unless the tree is dirty or there is no `HEAD`.
- `ran()` in `bun/gate-ledger.ts` matches a record by gate `pre-pr`, commit,
  checkout and, when one is given, outcome. It has three callers: the turn
  gate (any outcome), the goal check (`pass`) and `ranUnder()` (`pass`, read
  from the session user's ledger on the host, for the goal check and
  `ci-run-clone.ts`).
- `harness.bumpTest` is read through `read()` in `bun/config.ts`, which
  throws when the key is absent. `bump.ts verify` then refuses a blank value
  inline, because `sh -c ""` exits 0, and runs the command as
  `sh -c <value>` from the consumer's root.
- A full `bun test` of the harness takes 425–457 s, going by recent push logs.
- Six test files fabricate a runner record with `rule: "diff-budget"`, or with
  no rule at all in the `printf` stand-in in `bun/ci-run.test.ts`.

## Goals / Non-Goals

**Goals:** the runner's record of `HEAD` proves that the project's own checks
passed there as well as the budget, and no reader takes one step's record for
another's.

**Non-Goals:**

- No new `package.json` key and no `scripts` entry. `harness.bumpTest` is the
  list (answer 1 a).
- No change to the pre-push hook, CI, or any consumer's hooks (stage 2,
  question 28).
- No parsing of a step's output, and no per-step timeout.
- No list of required steps worked out from the diff. That is the
  `pre-pr-diff-paths` sibling's.

## Decisions

### The project checks are `harness.bumpTest`, run as `bump.ts` runs it

The runner reads the key from the checkout's top level and runs `sh -c
<value>` with that directory as `cwd` and output inherited, the way `bump.ts`
does. The key already means "unit tests needing no database, Docker or
browser", which is what an agent's machine and the host can run. d2ass and
mellon already set it.

- *Alternative: a new `harness.checks` key.* That is two keys meaning almost
  the same thing, and a consumer without the new one fails from its first run.
- *Alternative: a `package.json` script by convention.* The harness has no
  `scripts`, and mellon's `check` script is already taken by a biome run that
  rewrites files.
- *Alternative: `git hook run pre-push`.* The consumers' pre-push hooks run
  Stryker and e2e against CouchDB, which the host cannot run.

The blank check moves out of `bump.ts verify` into `bun/config.ts`, as one
reader that returns the command or throws naming `harness.bumpTest`. Both
`bump.ts` and the runner call it, and `bump.ts` switches in the same change
(`core/rules.md`, *Write logic a second time only by lifting it into one
module*). The runner catches the throw, prints the message on stderr, and
counts the step as exit 2. A missing key therefore reads as `error` and never
as a pass.

### Both steps always run, and the exit is the worse one

The budget runs first, as it does today, and its line comes first. The
project checks run whatever the budget's outcome. Over budget is a reason to
re-cut, not a reason to skip the tests, and an agent that re-cuts needs to
know whether the tests pass. Each step's exit status maps to 0 (`pass`), 1
(`fail`) or 2 (`error`, which covers every other status, a signal included).
The runner exits with the largest. That keeps the spec's existing statuses for
the budget alone: 0, 1 and 2.

### One record per step, written once both have ended

Two records, `rule: "diff-budget"` and `rule: "project-checks"`, each with
its own outcome, both naming the commit read before either step ran (user
decision 2026-10-26). Both are written after the second step ends, in one
place, so a runner killed during the roughly 7-minute test run leaves no
record at all. A budget record alone would otherwise satisfy a reader that
asks only whether the runner ran.

The step ids live in one exported constant in `bun/gate-ledger.ts`
(`RUNNER_STEPS`). The runner takes its `rule` values from it, and the goal
check and `ranUnder()` take theirs from it too, so each name is written once.
That is where the module defining `ran()` already sits.

- *Alternative: one record per run, `pass` only when both steps pass.* The
  card's first comment recommended it (its item 4). It was superseded by the
  user's decision of 2026-10-26, because a per-run record cannot say which
  step failed, and slice item 2 writes per-step records into the same ledger.

### `ran()` gains an optional `rule`

`ran(commit, top, decision?, ledger?, rule?)`. Given a rule, only a record
whose `rule` equals it counts. Given none, any `pre-pr` record counts, as
today. The goal check asks
`RUNNER_STEPS.every(rule => ran(commit, top, "pass", undefined, rule))`.
`ranUnder()` reads the session user's ledger once and asks the same for every
step. The turn gate passes no rule: it asks whether the runner ran at the tip,
and the records are written together, so any one of them answers that. The
missing-record line keeps its wording, `no passing pre-PR run record for
<short>`. `bun/board-loop-isolation.test.ts` stubs that text, and the runner's
own output already says which step failed.

The parameter's meaning, an optional rule where none means any step, is the
one the `work-finish` sibling's design gives it. Whichever of the two changes
applies first adds it, and the other drops its task for it.

### Untracked, non-ignored files make the tree dirty

The dirty test becomes `git status --porcelain`, whose default untracked mode
lists untracked files and leaves out ignored ones (answer 2 a). When it prints
anything, the runner prints its no-record line followed by the porcelain lines
as git printed them. So it names each file, or a directory where git
collapses one, and adds no formatting of its own. The line still opens
`PRE-PR:` and is still not shaped like a gate line. Both steps still run, so
an agent sees the result before it commits.

The runner reads `HEAD` and the status a second time, after both steps and
before writing, and writes no record when either reading changed. A check
that writes into the tree, or a commit made during the roughly 7-minute run,
leaves no single commit the run vouches for. When the status changed, the
no-record line names what the second reading lists. That costs one more `git`
call, and the local review of this proposal asked for it. `git status` leaves
out what `.gitignore` covers, so a check whose output is ignored still
records.

### The sequence runs the runner once, after the last commit

`core/review-toolkit.md` step 1 becomes: look at the budget first with `bash
bun/diff-budget.sh` (`bash node_modules/harness/bun/diff-budget.sh` where the
harness is installed), which writes no record, and run the runner once, after
the sequence's last commit (answer 3 b). The step names the 600000 ms timeout,
or a background run, which the length of the test suite needs. On the docs
path, the clause "plus `bun test` when it adds or removes a directory under
`openspec/changes/`" goes, because the runner always runs the tests now. The
turn gate's refusal text keeps telling the agent to run the runner, which
stays correct.

### Taken while applying

- The runner's cases split by the cap: the diff budget's and the records'
  stay in `bun/pre-pr.test.ts`, the project checks' and the dirty trees' go
  to `bun/pre-pr-checks.test.ts`, and the spawn and ledger helpers both use
  are lifted into `bun/pre-pr.fixture.ts`. The goal check and `ranUnder()`
  cases sit in `bun/gate-ledger-rule.test.ts`, because `goal-check.test.ts`
  is at the cap.
- `runRecord` in `bun/goal-check.fixture.ts` returns one record per step, and
  the fixture's `ledger()` flattens an array, so its callers stay as they
  were.
- The old case *the commit is HEAD as the run began* is replaced by *a check
  that commits leaves no record*: a run whose `HEAD` moved now writes nothing.
- A missing or blank key, or a manifest that is not JSON, prints
  `PRE-PR: project checks not run: <the reader's message>` on stderr.
- When the tree differs before and after the steps, the no-record line names
  the second reading's lines, and the first's when the second is clean.
- A `git status` that fails counts as a dirty tree, named `git status
  failed`, in the runner and in the goal check alike (CodeRabbit on #316).
- The runner runs the diff budget from the top level too, since its `.`
  pathspec counts only the directory it starts in (CodeRabbit on #316).

## Seams with the slice's siblings

- **`work-finish`** (slice item 3, the draft rule inside `work.ts finish`,
  card 40439875c31b81bdb3dbef4d044a28be): its proposal adds `ran()`'s `rule`
  and an ADDED requirement in `pre-pr-runner`, *A run record counts only for
  its own step*. That requirement says the goal check and `finish` ask for the
  diff budget's record. Once this change merges, both ask for every runner
  step, and that sentence goes out of date. This change applies first (its
  card: item 3 reads this record when it opens a pull request and marks it
  ready). So `work-finish` re-words that sentence to "every runner step", and
  passes `RUNNER_STEPS` from `unproven()`, when it merges `main` after this
  change. That is order through prose: there is no contradiction in
  behaviour, since both filter by rule.
- **`pre-pr-diff-paths`** (slice item 3, required steps from the diff, card
  3f739875c31b81e6b473f8a1fb6fa5b3): it applies after this change. Its
  project-checks id should be `RUNNER_STEPS`' `project-checks`, imported
  rather than defined a second time. It also drops the docs path's `bun test`,
  which this change has already removed from `core/review-toolkit.md`.
- **`judgement-step-record`** (slice item 2, the `Skill` hook, card
  3f739875c31b8186a781c910dd7160a4): its records carry the skill's name as
  their `rule`. If it writes them under the gate `pre-pr`, the turn gate's
  rule-less ask would accept one as a runner record. So that change either
  uses its own gate name or has the turn gate pass `RUNNER_STEPS`. That change
  decides which. The `ran()` filter it needs is the same one.
- **Reviewer rotation** (`local-review-before-pr`): no shared capability and
  no shared code.
- **Stage 2, question 28 recheck** (sync-settings): this change registers no
  hook. `bun/sync-settings.ts` keeps any hook that neither ends with the
  harness mark nor equals a `HOOKS` text, so a hook only the harness's own
  settings hold survives a sync. Question 28 a″ holds, with no key in
  `package.json`.

## Conflict check (stage 2, roadmap question 14 b)

`openspec show pre-pr-project-checks --json --deltas-only` touches
`pre-pr-runner` (three MODIFIED) and `stage-goal` (one MODIFIED). On
`origin/main` the only open change is `host-deploy`, which touches
`orchestrator` alone: no shared capability. The one open pull request, #308
(`spec/work-finish`), adds *A run record counts only for its own step* to
`pre-pr-runner` (see *Seams*: order through prose). If `work-finish` archives
first, that requirement is live before this change archives, and this change
then gains a MODIFIED copy of it that says "every runner step". The
siblings' working copies show `pre-pr-runner` in `pre-pr-diff-paths` too
(three ADDED: the steps the diff requires, the open-PR rule, and one base).
Neither sibling restates a requirement this change modifies, so there is no
contradiction, and the order goes through prose. `local-review-before-pr`
touches `local-review-loop` only. `stage-goal` is shared with none.

## Risks / Trade-offs

- [The runner now takes about 7 minutes here] → it runs once per sequence, and
  the doc names the timeout or a background run. Anything longer than 10
  minutes runs in the background only.
- [`sh -c` is dash on Linux] → the value is passed through untouched, as
  `bump.ts` passes it. The tests use `true`, `false`, `exit 3` and a `kill`
  of the runner, all of which behave the same under dash and bash.
- [A test run inside `bun test`] → the fabricated manifest sets `bumpTest` to
  `true`, and the cases that need another value pass their own.
- [A flaky test passes on a second run at the same commit] → the earlier
  `fail` record stays, and the later `pass` satisfies the goal check, which
  is how the budget's records already behave. CI is still the required check.
- [Passes from two runs at one commit combine] → accepted: each step passed
  at that commit, and the user rejected a shared run id (card item 9 a,
  2026-10-26), so the records keep no `run` field.
- [A consumer without `harness.bumpTest`] → the step gives `error` and the
  goal check stays open, naming nothing new. d2ass and mellon already have
  the key, and the harness gains it in this change.
- [An untracked file left by a tool] → the runner names it, and the agent
  commits it or ignores it. That is the intended behaviour (answer 2 a).
- [A test suite that leaves files in the tree never records] → the second
  reading names them, and the project ignores them. Task 1.7's live run on
  this checkout shows whether the harness's own suite leaves any.

## Migration Plan

One group, one pull request, `feat/pre-pr-project-checks`. It needs no
rollout step, and a revert restores the single-step runner and the rule-less
`ran()`. Ledger records already written stay readable: a `diff-budget` record
from before the change is still a valid diff budget record.
