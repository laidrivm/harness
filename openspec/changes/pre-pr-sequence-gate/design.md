# pre-pr-sequence-gate — design

## Context

The rule this gate mechanises is one sentence in `core/review-toolkit.md`:
completing a task group starts the pre-PR sequence in the same turn, and the
agent never asks whether to run it. The session that broke it had read the
file in full earlier the same day. That rules out the two remedies reached for
first — restating the rule more forcefully, or loading it earlier — and points
at the moment of the failure instead, which is the end of a turn.

What the documentation confirms about that moment, read rather than recalled:

- A `Stop` hook fires when the model finishes responding, and exit **2**
  prevents stopping and continues the conversation, with stderr as the
  blocking message.
- `last_assistant_message` carries the final assistant text of the turn, and
  the documentation recommends it over reading the transcript, which "is
  written asynchronously and may lag the in-memory conversation".
- Stderr from a hook that exits 0 "goes to the debug log only, never the
  transcript, and Claude never sees it". So a non-blocking reminder cannot
  reach the model at all; blocking is the only channel that does.

What it does **not** confirm, and what this design therefore refuses to rest
on: a `stop_hook_active` field. An earlier reading of the same page reported
one; reading the page again for it found nothing. It is treated here as
non-existent, and loop safety is obtained by construction instead. (Task 1.3
later observed the field in a real payload — see *Measurements*; the design
still does not rest on it.)

## Goals / Non-Goals

**Goals:**

- Refuse the turn that would end the way 2026-08-19's ended, at that moment.
- Fire on turns that committed and on no others, so an answer to an unrelated
  question is never held up.
- Be impossible to deadlock, without depending on a field the documentation
  does not describe.

**Non-Goals:**

- Verifying the sequence rather than its report. The hook reads for a gate
  line; it cannot know whether the gate ran.
- Persisting anything past the session, or across branches.
- Covering the sequence's other trigger — any pull request that changes code —
  which has no event this cheap to hang off.

## Decisions

### The trigger is a turn that committed, not a turn

A completed task group stays completed until the change is archived, so a
condition reading only the task file would fire on every turn afterwards,
including turns that answer a question. Keying on "this turn produced commits"
matches what the rule is actually about: work landing on the branch without
the sequence having reported.

That question needs a mark taken when control arrives, which is
`UserPromptSubmit`. It records `HEAD`; `Stop` compares. The pair is the whole
state: one ref, rewritten on the next prompt, scoped to the session's
directory. Nothing accumulates, so nothing needs pruning or reconciling — the
failure mode of a durable ledger is that it disagrees with the repository, and
a mark this short-lived cannot.

*Alternative considered*: a ledger keyed by change and branch, recording that
the sequence had reported. It is precise across sessions, and it is a second
source of truth about work whose first source is the repository — the shape
this project has twice been bitten by.

*Alternative considered, drafted in, and removed by review*: firing only while
the branch has unpushed commits. On its own it holds the obligation open
across every later turn, which is what the trigger above rejects. As an
additional condition it looked free — the push is the point past which the
sequence can no longer run first, so let the push discharge it. That reasoning
inverts in the one case that matters: a turn that commits *and pushes* before
it ends satisfies "pushed" and walks out silently, which is not the obligation
being discharged but the sequence being skipped. The condition would have
built the bypass into the gate. The report discharges it, and nothing else.

### Loop safety is structural, not a flag

A blocked turn must be endable by something the very next message can carry.
Both escapes are text: the sequence's gate line, or `BLOCKED` naming what only
the user can settle — the second of which `core/review-toolkit.md` already
admits as a legitimate ending. So no repository state has to change for the
turn to end, and there is no configuration in which the hook can refuse
forever.

This matters more than it would elsewhere, because the field that would
otherwise carry loop protection is disputed. One reading of the documentation
reported a `stop_hook_active`; a second reading for it found nothing; the
review bot asserts it exists. Three summaries, no source — so this design
neither uses it nor denies it, and task 1.3 records what an actual event
payload carries.

What replaces it costs nothing extra, because the mark is already there. A
refused turn is *continued*, not restarted, so it submits no new prompt and
writes no new mark; refusing at most once per mark therefore bounds a
condition the model cannot satisfy to a single turn. Structural safety says a
loop cannot form; the once-per-mark rule says that even a mistaken condition
costs one turn rather than a conversation.

### The hook reads the task files, not the change's status

`openspec status` would answer "is a task group complete" authoritatively, and
it is a process launch on every turn end plus a dependency on the CLI being
resolvable. The task files are markdown with a fixed checkbox syntax that the
apply flow already parses, and reading them costs a glob. Changes under
`openspec/changes/archive/` are excluded by the glob, which is also what stops
an archived change from holding the gate open forever.

They are read twice: as the working tree holds them at `Stop`, and as the
marked commit holds them, through `git show <mark>:<path>`. Only a group
complete now and not complete at the mark qualifies the turn. Reading the
completion state alone would count every group finished in an earlier turn,
and any active change with one — a multi-step change mid-way through its
steps is exactly that — would refuse every committing turn after it. The
second read comes from git rather than from the mark, which records `HEAD`
and nothing else.

As built in group 2, the first read also comes from git, at the turn's tip
commit, not from the working tree. The tip is `HEAD`, or the remote-tracking
ref when `HEAD` was reset back to the mark after a push. That reset leaves the
working tree as it was at the mark, so a working-tree read would let through
the turn the spec's *A turn that pushes, then resets to the mark* refuses. An
uncommitted tick is not committed work either way. "Not complete at the mark"
is built as the spec words it: the group had an unticked box there. A group
the turn created already complete does not qualify.

### What the hook does not claim

It reads `last_assistant_message` for a gate line. An agent that writes
`TRIAGE gate: PASS` without running `/triage` passes it. That is not a hole to
be closed here — closing it means running the gates from the hook, which is
the sequence itself — and the specification says so rather than implying a
guarantee the check does not have.

## Risks / Trade-offs

- **A second hook event, and a per-turn cost** → every turn end now launches a
  process, as every Bash call already does. The budget is **100 ms per event**,
  for each of the two hooks: a turn end happens once per turn where the Bash
  guard happens dozens of times, so the guard's 16–22 ms is the wrong bar, and
  100 ms is where a delay in an interactive tool stops being invisible. Over
  budget, the trigger narrows to repositories holding an `openspec/changes/`
  directory, which is the cheapest condition that removes the cost from every
  other repository the agent works in. The number is a judgement; the
  measurement that tests it is task 1.2.
- **The mark is written by one hook and read by another** → if
  `UserPromptSubmit` does not fire, `Stop` finds no mark. A missing mark SHALL
  be read as "unknown whether this turn committed" and, unlike the guard's
  convention, SHALL allow the turn to end: a hook that blocks whenever its
  partner is absent turns a partial installation into an unusable session.
  This is the one place this change chooses fail-open, and it is stated in the
  spec as a choice.
- **The project's tracked settings register `PreToolUse` only** → the ponytail
  plugin supplies its own `SessionStart` and `UserPromptSubmit` hooks, which
  fire in this session, so the events are live but the composition of a
  project-level entry with a plugin's is a claim this design does not make.
  Task 1.1 measures it before anything depends on it.

## Measurements

Taken 2026-10-08 for group 1, on Claude Code 2.1.293 and bun 1.4.2, by
`claude -p --output-format stream-json --verbose --include-hook-events` in a
scratch repository whose project `.claude/settings.json` registered a logging
hook on each event, with the ponytail plugin enabled.

- **Composition (1.1).** A project-level `UserPromptSubmit` entry composes
  with the plugin's: the stream reports two `UserPromptSubmit` hooks started
  and answered per prompt, and the project hook's log holds one payload. The
  design's premise holds.
- **Exit codes (1.3).** A `Stop` hook exiting **2** continued the turn, and
  its stderr reached the model as a user message headed `Stop hook feedback:`
  — the model wrote the word the stderr asked for. Exiting **1** ended the
  turn; the stderr was not acted on.
- **The payload (1.3).** `UserPromptSubmit` carries `cwd`,
  `hook_event_name`, `permission_mode`, `prompt`, `prompt_id`, `session_id`,
  `transcript_path`. `Stop` carries `background_tasks`, `cwd`, `effort`,
  `hook_event_name`, `last_assistant_message`, `permission_mode`,
  `prompt_id`, `session_crons`, `session_id`, `stop_hook_active`,
  `transcript_path`. **`stop_hook_active` exists**: `false` on the first
  `Stop`, `true` on the one after a refusal. `prompt_id` is also unchanged
  across that refusal, which confirms that a refused turn is continued and
  writes no new mark. The design still uses neither: the once-per-mark rule
  already bounds the loop, and the spec forbids depending on the field.
- **Interruption (1.3).** SIGINT to a headless turn mid-tool-call fired no
  `Stop` and no `StopFailure`; only `SessionEnd`, with reason `other`, fired.
  Such a turn is ungated, as the spec's *Nor SHALL it claim to reach every
  turn* already says. An interactive Esc was not probed: it ends no session,
  so nothing registered here is expected to fire on it.
- **Cost (1.2).** 30 spawns each, after 3 warm-ups, payload on stdin, in this
  repository with 7 active changes. A proxy doing each half's I/O (stdin
  parse, `git rev-parse`, mark write; for `Stop` also the `tasks.md` glob and
  one `git show <mark>:<path>` per change) stood in for the script group 2
  writes:

  | Command | Median | p90 |
  |---|---|---|
  | bare `bun -e 0` | 6.1 ms | 6.4 ms |
  | guard, `PreToolUse` | 9.2 ms | 10.2 ms |
  | mark, `UserPromptSubmit` | 16.2 ms | 17.5 ms |
  | turn end, `Stop`, `HEAD` moved | 60.3 ms | 62.3 ms |

  Both halves are inside the **100 ms** budget, so the trigger stays as
  designed. Most of the `Stop` cost is one `git show` per change, and 2.5
  can halve it with a single `git cat-file --batch`. A turn that did not
  commit stops after `git rev-parse` and costs about what the mark costs.
  The guard now measures 9.2 ms against the 16–22 ms that
  `agent-permissions`' *one bun start per Bash call* requirement records.
  The figure overstates the cost on this machine, so the requirement's
  "negligible" claim stands. The stale number is a one-line `MODIFIED` delta
  for whichever change next touches that requirement; `merged-branch-guard`
  task 2.3, which measures the same surface, should read these numbers
  rather than take its own.

## Open Questions

None outstanding. The latch was settled with the user: the trigger is a turn
in which commits were made, checked before control returns.
