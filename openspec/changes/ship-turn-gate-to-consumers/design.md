# ship-turn-gate-to-consumers — design

## Context

The gate is built and archived (`openspec/changes/archive/2026-10-08-pre-pr-sequence-gate/`).
Its design set the per-event budget at **100 ms** and recorded the harness's
own costs; this change cites that budget rather than restating its reasoning.

A consumer holds exactly one piece of the harness as text: the Bash
`PreToolUse` command, `BOOTSTRAP` in `bun/bootstrap.ts`, which
`bun/settings.ts` asserts character for character because it must run before
the package is installed. The two turn-gate registrations are the second and
third such pieces, for the same reason.

Two consumers pin the harness today, each by a full commit: dota2 at
`afaa3c3` and mellon at `d9e506b`. Both run `harness:check` in their
pre-push hook and in CI.

## Measurements

Taken 2026-10-08, bun 1.4.2, read-only against each repository's git
objects. dota2's working tree is on another session's branch, so nothing was
checked out there.

- **Replay.** Every first-parent commit of each `origin/main`, treated as a
  one-commit turn, through `complete()` from `bun/turn-gate.ts`:

  | Repository | Commits | Fires today | Complete, absent at the mark |
  |---|---|---|---|
  | dota2 | 1,436 | 156 | 4 |
  | mellon | 141 | 0 | 0 |
  | harness | 90 | 7 | 0 |

  The four are three findings groups (`10.`, `10a.`, `10b.` in
  `hero-picker`) that one apply PR added and closed, and group 7 of
  `agent-permissions-gaps`, added and closed in one commit (`9498931`).
  Every one is a real completion, and no rename turns up among them. A
  first-parent replay is coarser than a turn: a merge commit stands for a
  whole pull request. It can over-count fires, never invent an absent group.

- **Cost of the `Stop` half**, 30 runs after 3 warm-ups, `HEAD` one commit
  past the mark, message carrying no gate line:

  | Repository | Active task lists | Median | p90 |
  |---|---|---|---|
  | dota2 | 13 | 247.3 ms | 266.8 ms |
  | mellon | 0 | 39.5 ms | 41.6 ms |

  On dota2, the two `git show` per change cost 208 ms; one
  `git cat-file --batch` read of the same 26 blobs costs 14 ms (harness: 88
  vs 11 ms, 6 changes).

- **After the batch read (1.4)**, same method, both halves:

  | Repository | `Stop` median | `Stop` p90 | mark median | mark p90 |
  |---|---|---|---|---|
  | dota2 | 53.7 ms | 59.6 ms | 26.4 ms | 29.3 ms |
  | mellon | 44.3 ms | 46.8 ms | 27.2 ms | 28.2 ms |

  Both halves are inside the 100 ms budget on both consumers, and dota2's
  `Stop` lands where the prediction under *Risks* put it.

## Goals / Non-Goals

**Goals:**

- Every turn in every consumer reaches the gate, with the text the consumer
  carries pinned by its own check.
- Stay inside the 100 ms budget on the largest consumer.
- Count the group a turn creates and completes.

**Non-Goals:**

- Following renames of a change directory or heading (proposal, *Non-goals*).
- Changing what the gate decides beyond that one condition.

## Decisions

### The hook text sits beside `BOOTSTRAP`

```sh
g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/turn-gate.ts"; if [ -f "$g" ]; then bun "$g" stop; fi
```

and the same with `mark`. Without the package the `if` exits 0, which ends
the turn and lets the prompt through. With it, the script's own code is the
hook's: 2 refuses, anything else does not. There is no `|| exit 2`, because a
gate that cannot launch must not hold the turn — the opposite of the command
guard, and the archived spec's fail-open paragraph says why.

Both strings are exported from `bun/bootstrap.ts`. That file's purpose is
"the piece of the harness a consumer holds as text", and splitting the three
across files would put a consumer's settings text in two places.

*Alternative considered*: a single exported function of the half. Two
constants are what `settings.ts` compares against and what a reader copies;
a function adds a call between the reader and the string.

### The check asks for presence, not sole occupancy

The Bash hook must be the only one on its matcher, because a second
`PreToolUse` command could allow what the guard refuses. A second
`UserPromptSubmit` or `Stop` hook cannot undo this one: Claude Code runs them
all, and any `Stop` hook exiting 2 refuses. So `settings.ts` fails only when
an event carries no hook of type `command`, unnarrowed by `if`, whose command
equals the harness's text — the same two conditions the Bash check puts on
its hook, since a matching string under another type or behind an `if` is a
registration that never runs. A
consumer's own prompt hooks, such as the ponytail plugin's, stay legal.

### A group absent at the mark qualifies

The condition becomes "complete at the tip, and not complete at the mark",
where absent is not complete. The archived design excluded a group the turn
created already complete; the replay found four such completions and no false
one, so the exclusion cost real refusals and bought nothing measured.

*Alternative considered*: walk the turn's commits (`git log <mark>..<tip>`)
and qualify a created group only if some commit held it with an unticked box.
It answers CodeRabbit's case as worded and misses `9498931`, where the group
was written and ticked in a single commit. It also costs a launch per commit
in the turn.

The rename cost is stated in the spec as a scenario rather than hidden: a
renamed complete group refuses once, and the refusal-once rule bounds it.

### One batch read replaces the per-change `git show`

`completed()` lists the tip's active task files as today, then writes
`<mark>:<path>` and `<tip>:<path>` for each into one `git cat-file --batch`
and parses the framed output. A path the mark lacks answers `missing`, which
reads as an empty task list, as `git show` failing does today. This removes
the `ponytail:` ceiling comment the archived change left on that loop,
because the ceiling has been reached.

### Each consumer lands the bump, the registrations and the rules copy in one commit

The bumped `settings.ts` fails a consumer without the registrations, and
`sync.ts`'s drift check fails a rules copy that differs from the pin, so a
commit holding one without the others is red in that consumer's CI. dota2's
checkout belongs to another session, so its bump is made in a worktree off
its `origin/main`.

### The prose drops the clause the hook now holds everywhere

Once the harness's check makes the registration mandatory, every repository
`core/review-toolkit.md` reaches registers the hook. The sentence keeps the
trigger ("completing a task group starts the sequence in the same turn"),
loses "where it is not, never ask whether to run it", and keeps what the hook
does not see. It lands in the harness PR that adds the check, so a consumer
gets the shorter prose and the mandatory registration from the same pin.

## Risks / Trade-offs

- **A bump carries every harness change since the consumer's pin** → the
  first step of each consumer task is `harness:check` at the new pin before
  any edit; a failure unrelated to this change is reported in that task, and
  fixed there only if it is the consumer's to fix.
- **The `Stop` cost after the batch read is predicted, not measured** →
  roughly 247 − 208 + 14 ≈ 53 ms on dota2. A task re-measures it on dota2's
  tree with the same harness as above, and the 100 ms budget decides.
- **The mark half now runs on every consumer prompt** → it was 16 ms in the
  harness, a `git rev-parse` and a file write, which does not grow with the
  tree. It is re-measured alongside the `Stop` half rather than assumed.

## Open Questions

None.
