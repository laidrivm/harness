# session-wrapup-on-done

## Why

`/session-wrapup` runs only when the user remembers to type it, so a session
that finished its card keeps growing, and the card gets no debrief and no
pipeline-yield entry. On the VPS there is one persistent session, which only
the user can `/clear`, so a forgotten wrap-up costs a manual step per card —
the step stage 2.5's metric counts (card *Trigger session-wrapup when a task is
done, and tell the user the session can be cleared*,
3f639875c31b81d3aed5e2088ad129d9; explore of 02.11).

In the harness only `bun bun/work.ts status` writes `done` — the status hook
refuses the connector's `Status` write — and the session reads that command's
output anyway. One printed line after a written `done` is therefore enough of a
trigger; a hook would repeat it and see the same events.

Starting the wrap-up on the VPS exposes a seam: there the session's clone sits
on `main`, the wrap-up appends to the tracked
`docs/context/pipeline-yield-<month>.md`, the command guard refuses the commit,
and the dirty file stops the start script's `git pull --ff-only` once the same
month arrives from the laptop.

## What Changes

- `status`, after it moves a card to a read-back of `done`, prints one last
  line: `next: run /session-wrapup unless it is already running, then tell
  the user «можно /clear»; a subagent passes this line to its caller
  instead`. A refusal, a failed write, a card already at `done`, or a write
  of any other status prints no such line.
- `.claude/settings.json` allows `Skill(session-wrapup)`, so the model starts
  it without a permission prompt (the user's answer to question 1, 03.11: «а»).
- `session-wrapup` step 5 appends the yield entry outside the tree, to
  `<state>/harness/pipeline-yield-<yyyy-mm>.md` beside the gate ledger, on
  every branch and machine: when the line fires the branch in hand is `main`,
  detached or merged, and the command guard refuses a commit on all three.
  The skill's `allowed-tools` gain that one path. The user's answer to
  question 2 (03.11, «а») widened it: wrap-up ledgers no longer reach git.
- **BREAKING** for readers of the tracked ledger: the change deletes
  `docs/context/pipeline-yield-2026-10.md`, and README's *Consuming* tells
  each consumer to delete its own once, after the bump that carries this.
- `core/git-and-prs.md`'s rule on committing wrap-up artefacts and
  `core/review-toolkit.md`'s pointer to the ledger follow it.
- The prose stop-gap the VPS rules card adds as rule 4 of
  `orchestrator/runner/CLAUDE.md` (card 40c39875c31b81f0b1d1cbea945696bc)
  shrinks to a pointer at the line once the line lands.

Not in this change: a card a person moves to `done` on the board, which no
session sees; the context-window threshold, which has its own card
(40c39875c31b8105837eed7d739a8086); carrying a host's yield entries into the
repository (`design.md`, decision 3).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-status`: a written `done` names the wrap-up as the next step, and the
  harness allows the skill the line names.
- `agent-rulebook`: the yield ledger is kept outside the tree.

## Impact

- Changed: `bun/work-status.ts`, the `done` cases of `bun/work-status.test.ts`,
  `bun/work-status-tree.test.ts` and `bun/work-status-pr.test.ts` that pin
  the last line, `.claude/settings.json`,
  `core/skills/session-wrapup/SKILL.md`, `bun/session-wrapup-yield.test.ts`,
  `core/git-and-prs.md`, `core/review-toolkit.md`, `README.md`; deleted:
  `docs/context/pipeline-yield-2026-10.md`; `orchestrator/runner/CLAUDE.md`
  if it is on `main`.
- Consumers get the skill's change through the package: their entries land in
  each user's state directory, not their tree. The
  `status` line is the harness's own: consumers move a status through the
  connector and never see it.
