# stage-goal — design

## Context

The motivation is in proposal.md, *Why*, and the requirements are in
`specs/stage-goal/spec.md`.

**What `/goal` is, per the docs** (the *Keep Claude working toward a goal*
page, and the hooks guide's *Stop hook hits the block cap*, both read on
2026-10-12). `/goal <condition>` sets one goal per session. It is "a wrapper
around a session-scoped prompt-based Stop hook". After each turn, the small
fast model judges the condition against the conversation and returns *not yet
met*, *met* or *impossible*. That model "doesn't run commands or read files
independently". The docs give no turn or time limit, only a clause in the
condition ("or stop after 20 turns") that the evaluator judges. A resume
restores an active goal "but resets the turn count". `/clear` removes it, and
it works in `claude -p`. Claude Code ends a run after a `Stop` hook blocks
eight times in a row with no tool call between the blocks
(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises that). Evaluation is skipped while a
sub-agent or a background shell runs. The docs do not say whether `/goal`
runs inside a sub-agent.

**What was measured.** Four `claude -p --model haiku` probes ran on Claude Code
2.1.296 on 2026-10-12, in scratch directories outside every repository. Each
had a logging `UserPromptSubmit` and `Stop` hook.

| Probe | Goal | What happened |
|---|---|---|
| 1 | append one line per turn until 3 lines, "or stop after 6 turns"; every append denied | 1 `UserPromptSubmit`, 21 `Stop` events, each after the first with `stop_hook_active: true`. The evaluator never judged the 6-turn clause met. The block cap ended the run ("blocked the turn from ending 9 consecutive times"). `-p` exited 0, subtype `success`, empty result. |
| 2 | the same goal, appends allowed | Met in 3 rounds. 1 `UserPromptSubmit`, 3 `Stop` events. `-p` exited 0, subtype `success`. |
| 3 | 5 lines, with `--max-turns 3` | `-p` exited 1, subtype `error_max_turns`, after 1 line. |
| 4 | 6 lines, plus a command `Stop` hook printing `{"continue": false, "stopReason": "goal-ceiling: probe"}` on its second continued stop | Ended at 3 lines. The goal's own hook was blocking, and `continue: false` still ended the run. `-p` exited 0, subtype `success`, and the reason reached only the transcript's `stop_hook_summary`. |

The session transcript holds the evaluator's verdicts as `goal_status`
attachments (`met`, `condition`, `reason`). That format is undocumented.

Three facts follow, and the design rests on them:

- A goal run is **one prompt and many stops**. The turn gate's mark is written
  once per run, so its "at most once per mark" bound covers the whole run.
- **No exit status says whether a goal was met.** Probes 1, 2 and 4 all exit 0
  with `success`.
- **`continue: false` from a command `Stop` hook ends a goal run**, even while
  the goal's own hook is blocking.

**Consumers, read-only, 2026-10-12.** d2ass and mellon each register exactly
one `Stop` hook, the bootstrap's `turn-gate.ts stop` text, and exactly one
`UserPromptSubmit` hook, its `mark` text. Neither has a `Stop` hook of its own
that could produce continued stops, and neither sets
`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` in its tracked settings.

**What this builds on.** `gate-decision-ledger` adds `bun/gate-ledger.ts` and
its record. `pre-pr-run-record` adds the `commit` field and the runner's
`pre-pr` record with outcome `pass`, `fail` or `error`. It also adds the turn
gate's read of the ledger for a record whose `commit` is the tip, which skips
torn lines.

## Goals / Non-Goals

**Goals:** one script that decides each stage the same way for a goal's
condition, for a launcher afterwards and for the wrap-up's counts; a ceiling
that holds whether a person launched the session or a script did.

**Non-Goals:** anything that reads `goal_status` from a transcript. A
`"harness"` key for the ceiling's value. A stage criterion for explore.

## Decisions

### The criterion is a script's verdict that the evaluator only has to match

The evaluator cannot read a file. What it can do reliably is see whether one
command's last line says `goal met`. So the condition hands it exactly that,
and the script does the judging. The criteria, per stage:

- **propose:** `openspec/changes/<change>/proposal.md` is in `HEAD`. A split
  proposal's first pull request carries `proposal.md`, so this holds. The
  runner's `fail` on an unsplit proposal over budget is what forces the
  split.
- **apply `<step>`:** the step-th `## ` group of `tasks.md`, in order, is
  complete, per `git-and-prs.md`'s "one PR per group, in the order the groups
  appear". The group test is `turn-gate.ts`'s exported `complete()`, so
  "complete" has one definition.
- **archive:** the change's directory is gone from `openspec/changes/`, and
  `openspec/changes/archive/*-<change>/` exists.
- **every stage:** a `pre-pr` record of `pass` whose `commit` is `HEAD`, read
  the way `pre-pr-run-record` reads it. An open pull request whose head is
  `HEAD`, from `gh pr list --head <branch> --state open --json headRefOid`. No
  tracked file differs from `HEAD`.

"Pre-PR" is no stage of its own. The run record is its evidence, and every
stage requires it. Explore gets no criterion. An unattended exploration has so
far run as the first half of a proposal (this change's own run did), and its
outcome, a decision, lives in the proposal that the `propose` goal checks.

- *Alternative: name the three checks in the condition and let the evaluator
  combine them.* That judges three outputs instead of one line, and leaves
  nothing in the ledger.
- *Alternative: a harness command `Stop` hook that judges the stage itself,
  with no `/goal`.* That is the goal mechanism of our own that the user
  declined. It would also miss the evaluator's useful part, the reason it
  hands back for the next turn.
- *Alternative: open pull request not required; push alone.* An interactive
  stage waits for the user's go-ahead before opening one
  (`feature-workflow.md`, Stage 3). An unattended one has nobody to wait for,
  and a stage that ended pushed but without its pull request is the "halfway"
  this change exists for. Goals are for unattended stages
  (`An unattended stage runs under one goal on the check`), so the pull
  request is required.

### The check's line is no gate line

`turn-gate.ts` accepts `^\W*[A-Z][A-Z-]* gate: (PASS|OPEN|BLOCKED)`. A `GOAL
gate: PASS` line would end a turn that completed a group without the sequence's
lines. That is harmless once `pre-pr-run-record` also demands a record, but the
check would still be standing in for lines it did not report. `goal met` and
`goal open` are lowercase and say no `gate:`. A test pins that `reported()`
rejects both.

### The check and the counter are two modules, and no second hook

The check is `bun/goal-check.ts`, a CLI. The round counter is
`bun/goal-rounds.ts`: the constant and two exported functions,
`countRound(event, mark)` and `resetRounds(mark)`, which `turn-gate.ts` calls
from `stop` and `mark` with the session's mark path, so the session id is
checked in one place. The counter lives beside the mark, in
`<store>/<session>.rounds`. A separate file leaves the mark's
`<sha>[ refused]` format and its parser alone. `turn-gate.ts` stays the
`commit-gates` gate and gains about ten lines. After `gate-decision-ledger` and
`pre-pr-run-record` it is still under the 300-line cap that `bun/file-size.ts`
sets. That is re-measured at apply (task 2.3).

Apply moved the counter out of `goal-check.ts`, where this decision first put
it. That file's top level runs the check, so an import from `turn-gate.ts`
would have run it, and the check already imports `turn-gate.ts`. Guarding it
meant re-indenting the whole CLI and keeping a circular import.

- *Alternative: a new `bun/goal-ceiling.ts` registered as a second `Stop`
  hook.* `bun/bootstrap.ts`'s `HOOKS`, `sync.ts`, `check.ts` and both
  consumers' settings would each gain an entry, and the count would need its
  own reset on a prompt, which is exactly what the turn gate's `mark` already
  is.
- *Alternative: `--max-turns` on the launch.* Probe 3 shows that it holds, but
  it exists only in `-p`. It counts model calls, not goal rounds, and it
  records nothing. A launcher may still pass it. It bounds a single turn that
  never stops, which the ceiling cannot see.

### The ceiling is twenty continued stops, and it ends the session

Rounds, not calls: a stage that works well takes one round, and every extra
round is the evaluator saying "not yet". Twenty, because the block cap (eight)
already ends the rounds that make no tool call, so what remains is rounds that
call tools without meeting the criterion. Twenty such rounds against a check
that names what is missing is a stage that will not converge unattended.
Measured by comparison: the finished propose and apply sub-agents of the
2026-10-12 overnight run took 57–95 model calls each, all in one round. The
value is a constant in `bun/goal-rounds.ts`, fixed by the requirement and named
nowhere else.

At the ceiling the turn gate prints `{"continue": false, "stopReason":
"goal-ceiling: …"}` and exits 0. Exit 2 would discard stdout, and a refusal
would only hand the goal another round. The ceiling is checked before
`decide()`. A session that is ending gains nothing from a refusal, and the
ledger's `ceiling` record already marks the stage unfinished. The goal stays
set (probe 4), so `--resume` carries it on, with Claude Code's own count and
this one both reset by the resume's prompt.

- *Alternative: the condition's own "or stop after N turns" clause.* Probe 1
  ignored it for 21 rounds.
- *Alternative: stop blocking at the ceiling, and let the goal decide.* The
  goal's own hook blocks regardless, so nothing ends.

### The outcome is the check rerun for the target, never a transcript read

After the session ends, the launcher runs the check for its own stage, change
and step, and its exit status is the outcome: 0 finished, 1 not. The ledger
records each verdict for counting. `goal`/`<stage>`/`met` or `open` comes from
the check, with `commit`. `goal`/`rounds`/`ceiling` comes from the turn gate,
without a commit, because the ceiling reads none. The wrap-up's gates line
(`gate-decision-ledger`) counts these with no new reader. A record names no
change or step, so two targets at one commit, such as steps of two changes,
leave records that cannot be told apart. That is why no launcher decides from
one.

- *Alternative: read `goal_status` from the transcript.* Its format is
  undocumented, and the transcript is pruned.
- *Alternative: a goal journal of its own.* `gate-decision-ledger` is the
  only journal.
- *Alternative: add the change and step to the record.* `gate-ledger`'s *A
  record holds no command text* admits six fields and the commit, and nothing
  else. Putting the target into the rule would split the wrap-up's counts per
  change. The rerun costs one call, and a launcher can make it at any time.

## Risks / Trade-offs

- [The evaluator judges `goal met` from a line that the agent could type
  without running the check] → The evaluator's verdict ends the session and
  decides nothing else. The launcher reruns the check, which a typed line
  cannot answer for.
- [An interactive idle check-in may fire `UserPromptSubmit` and reset the
  count] → Not measured. Interactive goals have a person present, and the
  ceiling exists for unattended ones. Task 2.5's live check records what it
  sees.
- [A future Claude Code continues a goal on a path that `Stop` never sees] →
  The ceiling would not see those rounds. The live check in task 2.5 is the
  regression test to re-run when the pin on Claude Code moves.
- [`gh` is slow or offline] → The verdict is `open`, never `met`, and the
  line names why.
- [Twenty is a judgement, not a measurement of goal runs] → No harness
  session has run a goal yet. The ledger's `ceiling` counts are what would
  move it, and the constant has one site.

## Migration Plan

Apply after `gate-decision-ledger` and `pre-pr-run-record` merge, in two
steps. The first ships the check and the launch form. The second ships the
ceiling. Consumers gain both on their next pin bump, and nothing is registered.
Rolling back means reverting either step. The `goal` records left in the
ledger stay behind, unread.
