# ship-turn-gate-to-consumers

## Why

`pre-pr-sequence-gate` registered `bun/turn-gate.ts` in the harness's own
`.claude/settings.json` only. `core/review-toolkit.md` syncs to consumers,
which register nothing, so there "completing a task group starts the sequence;
never ask whether to run it" is still held by prose alone — the mechanism
that failed on 2026-08-19 in dota2, the consumer whose turn the gate was
written for. That change scoped the sentence rather than shortening it, and
left shipping the hook here.

Measuring the gate against both consumers' trees before proposing, as
`core/feature-workflow.md` asks of a gate the harness ships, turned up two
more things the hook needs before it can ship:

- **Cost.** On dota2, with 13 active changes, the `Stop` half takes a median
  **247 ms**, against the 100 ms budget `pre-pr-sequence-gate`'s design set.
  Nearly all of it (208 ms) is two `git show` launches per change; one
  `git cat-file --batch` reads the same 26 blobs in 14 ms.
- **A group the turn created.** Replaying every first-parent commit of
  dota2's, mellon's and the harness's `main` as a one-commit turn, the gate
  fires 163 times, and misses 4 completions because the group did not exist
  at the mark — 3 findings groups added and closed in one apply PR, and one
  group added and closed in a single commit. CodeRabbit raised the same case
  against the archived spec. The spec excludes such a group on purpose
  ("had an unticked one … at the mark"), and the replay says the exclusion
  lets real completions through.

## What Changes

- The hook's text for a consumer, beside `BOOTSTRAP` in `bun/bootstrap.ts`:
  it runs `node_modules/harness/bun/turn-gate.ts` when the package is
  installed and ends the turn when it is not — fail-open, as the gate itself
  is, and with no `|| exit 2`.
- `bun/settings.ts` fails a consumer whose tracked settings do not carry both
  registrations verbatim, as it already fails one without the Bash bootstrap.
- A group that was not complete at the mark qualifies the turn, including one
  absent there. Today only a group with an unticked box at the mark does.
- The `Stop` half reads every task list it compares through one
  `git cat-file --batch`, replacing two `git show` per active change.
- Each consumer bumps its pin and adds both registrations in the same commit,
  since the bumped check fails without them.
- `core/review-toolkit.md` drops "where it is not, never ask whether to run
  it" and keeps only what the hook cannot see: a pull request that changes
  code outside a task group, and that a gate line reports the sequence rather
  than proving it ran — per agent-rulebook's *A mechanised prohibition leaves
  its prose home*, now that every repository the doc reaches registers the
  hook.

## Non-goals

- A group whose change directory or heading the turn renamed. It reads as
  absent at the mark, so the turn is refused once if the group is complete.
  The replay found no such commit in 1,667; following renames is a
  `--find-renames` diff this change does not buy.
- The harness's own registration. It keeps running `bun/turn-gate.ts` from
  the working tree, as it runs the command guard, because the harness does not
  install itself as a package.
- Consumers that do not use OpenSpec. The hook runs there and finds no task
  list, which ends the turn.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: *A turn that commits reports its gates before it ends* —
  the hook is registered in every consumer through text the harness supplies
  and the consumer's check pins, and a group absent at the mark qualifies.

### Unmodified, but adjacent

- `agent-permissions` pins the Bash bootstrap. The new registrations sit on
  other events and its requirements are untouched; `bun/settings.ts` is the
  shared home of both checks, not a shared requirement.
- `agent-rulebook`'s *A mechanised prohibition leaves its prose home* is the
  requirement the prose edit applies, not one it changes.

## Impact

- `bun/bootstrap.ts`, `bun/settings.ts`, `bun/turn-gate.ts` and their tests.
- `core/review-toolkit.md`: one sentence shortened.
- dota2 and mellon: a pin bump, two hook registrations and a refreshed rules
  copy each, in their own pull requests.
- Every consumer turn pays one `bun` launch at its end and one at each
  prompt; after the batch read, the `Stop` half's cost on dota2 is a
  measurement this change owes.
