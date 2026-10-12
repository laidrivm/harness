# pre-pr-run-record — design

## Context

`bun/turn-gate.ts` decides at `Stop` from three inputs: a per-session mark of
`HEAD` in the OS temp directory, the task lists in git at the mark and at the
tip, and the final message, which it searches for a gate line. Nothing that
runs a step of the sequence leaves a trace the gate can read. The diff budget
is `bun/diff-budget.sh`. It exits 0 for `PASS` or `WARN`, 1 for `FAIL`, and 2
when it cannot measure. Three places call it: the pre-push hook, CI, and an
agent by hand.

`gate-decision-ledger` adds `bun/gate-ledger.ts`, which appends JSON lines to
`${XDG_STATE_HOME:-~/.local/state}/harness/gates.jsonl` and never throws. Its
step 2 also edits `decide()` in the turn gate. The motivation is in
proposal.md, *Why*, and the requirements are in the three delta specs.

## Goals / Non-Goals

**Goals:** a record that only running the step can produce, keyed to a commit,
and a turn gate that requires it for the tip.

**Non-Goals:** everything listed in proposal.md, *Non-goals*. In addition, no
reader of the ledger is added beyond the turn gate, and no `package.json`
script is added in the harness or in any consumer.

## The card's open questions

The card lists what explore had to settle. Each is answered here or deferred
to a named follow-up (proposal.md, *Non-goals*):

- **What the runner runs on** — a bun script. See *A bun script, and the agent
  keeps the judgement steps*.
- **Checking a finding apart from fixing it** — deferred to *Verdict before
  fix*. It changes skills in the shared skills repo, not the runner.
- **Ticks set by result** — deferred to *Ticks by result*. It needs the runner
  to run arbitrary `Verify:` lines, which is the project-checks follow-up's
  ground.
- **What becomes of the doc** — the doc names the runner as step 1. The step
  list moves into code with *The runner owns the branching*, and until then
  the doc keeps it.
- **What the turn gate reads, and how a record is tied to `HEAD`** — the
  ledger, by commit. See the decisions below.
- **Consumers** — the runner reaches them inside the package, and the turn
  gate names its path. Project commands come from `"harness"` keys in the
  project-checks follow-up.
- **Swarm** — the runner already takes no input, prompts for nothing and
  answers through its exit status and the record, so it runs the same way
  without a person present. Running the judgement steps without one is the
  *Swarm* follow-up.

## Decisions

### A bun script, and the agent keeps the judgement steps

`bun/pre-pr.ts` runs the deterministic step and records it. The agent goes on
invoking `/zombies`, `/triage` and `/coderabbit-local` as today.

- *Alternative: Claude Code's `Workflow` tool*, a script that spawns subagents
  with typed answers. Running one needs the user's explicit opt-in. This
  session's `workflow-authoring` skill states that loading it "does not itself
  authorize running one". A step that has to run on every completed group
  cannot wait for a consent prompt, and nobody is there to answer one in an
  unattended run.
- *Alternative: a bun script that launches the agent with `claude -p`.* The
  classifier refuses those sessions, as the card records. A runner whose agent
  step is refused is a runner that cannot finish.
- The hybrid costs nothing that either alternative would save, because the
  judgement steps are already skills the agent runs. What it adds is the
  record.

### The record goes to the gate ledger, with one new field

The runner appends through `gate-decision-ledger`'s writer. The record has
gate `pre-pr`, rule `diff-budget` (the step's id) and decision `pass`, `fail`
or `error`, which come from exit status 0, 1 or anything else. It also carries
`commit`, the full id `HEAD` named when the run began. The `gate-ledger`
delta admits that field for a gate that reads a commit.

- *Alternative: a file of its own* in the state directory or beside the turn
  gate's mark. That is a second journal, which the card rules out. It would
  also drop out of the wrap-up's counts, which read the ledger and nothing
  else.
- *Alternative: `git notes` on the commit.* The record would then live inside
  the repository, where a `--mirror` push or a notes refspec can publish it.
  It would also be a second journal.
- *Alternative: match a record by time*, as one newer than the tip's committer
  date, which needs no new field. But a committer date can be set to anything,
  is stored to the second, and is copied by an amend or a rebase. The rule on
  reading a value from the structure that holds it points to the commit id.

### The turn gate matches the commit, never the session or the project

A record discharges a turn when its gate is `pre-pr` and its `commit` equals
the tip. The record also holds `session` and `project`. The runner has no
hook event, so it passes `CLAUDE_CODE_SESSION_ID` from the Bash environment as
the session when that variable is set. The gate matches neither field:

- The runner can be run by a subagent. A subagent's session id is not the
  one the main session's `Stop` event carries. That variable is present in
  this session's Bash environment, `CLAUDE_CODE_CHILD_SESSION` beside it.
- The writer's project comes from `CLAUDE_PROJECT_DIR`, which the Bash tool's
  environment lacks (measured by `gate-decision-ledger`). The runner would
  record its working directory, and a session started in a subdirectory names
  another path at `Stop`.
- Accepted cost: two clones at one commit share a record, so a run in one
  discharges a turn in the other. It is the same commit, which is the thing
  the diff budget measures.

### No record over a tree that differs from `HEAD`

`git status --porcelain --untracked-files=no` that prints anything means no
record. Today's step reads only the committed range, so the guard looks
stricter than it needs to be. It is set now because the project-checks
follow-up will add steps that read the working tree. A record whose meaning
changes when a step joins would leave records written under the old meaning
in the ledger. A forgotten `git add` is also the commonest reason a run and a
commit disagree.

### The runner is a separate entry point from `bun/diff-budget.sh`

If the budget script wrote the record itself, the pre-push hook, which calls
it, would write one on every push. `commit-gates` refuses to let a push
discharge the sequence. Keeping the record in the runner means the hook and
CI stay unchanged, and they still never produce it.

### The ledger is read only when a record could matter

`decide()` reads `gates.jsonl` only after it has found a completed group and a
gate line. That is the one path where the answer can change the decision, and
it is rare (`gate-decision-ledger`'s design puts the batch read it already
pays there at 14 ms). The read takes the path from the writer's module, so
one place names the file. A line that does not parse as JSON is skipped, not
fatal: the writer appends from several processes, and one torn line must not
hide the records around it.

### The refusal names the runner as the project reaches it

The turn gate builds the runner's path from its own directory, relative to the
event's `cwd`. That gives `bun/pre-pr.ts` in the harness and
`node_modules/harness/bun/pre-pr.ts` in a consumer, with no table to keep in
step. The harness has no `scripts` block, so `bun run …` names nothing here.
The `bun run diff-budget` that `core/review-toolkit.md` names today fails in
the harness and in mellon. That defect is reported separately and not fixed
here.

## Measurements

Consumers, read-only, on 2026-10-12:

- Both pin harness `1cf6eb1` and register both turn-gate halves (two
  `turn-gate` hooks each in `.claude/settings.json`).
- `bash node_modules/harness/bun/diff-budget.sh` runs in both and prints a
  `PASS` line. Each has a `harness.diffBudgetExclude` key, so the runner's
  one step can measure there.
- mellon's `openspec/changes/` holds only `archive/`, so no turn qualifies
  there and nothing changes until it has a change. d2ass has active changes.
  After its next pin bump, its turns that complete a group are asked for the
  runner, once per mark.

## Risks / Trade-offs

- [An agent runs the runner, then makes the last commit] → The record names the
  earlier commit, and the gate refuses once with the tip and the path. The doc
  says to run the runner again after the sequence's final commit.
- [A consumer bumps before it reads the new doc line] → The refusal itself
  names the command, and the once-per-mark bound limits the cost to one
  refusal.
- [The ledger is unwritable, so every run goes unrecorded] → Each qualifying
  turn is refused once, then released. `gate-decision-ledger` records that
  release, which makes the failure visible in the wrap-up's counts rather
  than silent.
- [Records from other projects in one file] → The read scans the whole file.
  It is kilobytes a month (`gate-decision-ledger`, *Rotation* non-goal), so the
  scan stays below the git reads on the same path.

## Migration Plan

Apply after `gate-decision-ledger` step 2 merges. Archive after
`gate-decision-ledger` is archived, since the `gate-ledger` delta here
modifies a requirement that change adds (`openspec validate` already reports
that archive would refuse it before then). Rolling back means reverting the
commit: the turn gate goes back to reading gate lines alone, and the `pre-pr`
records left in the ledger stay behind, unread.
