# repoint-moved-changes

## Why

The seven active changes arrived from d2ass verbatim (extract-harness, step
11, harness#6), and their artefacts still name d2ass's layout —
`scripts/<gate>.ts`, `docs/<doc>.md`, `CLAUDE.md`, `checks/*.test.ts`. Here the
gates live in `bun/`, the docs sit flat in `core/` and the rules in
`core/rules.md`, so whoever picks up any of these changes reads tasks pointing
at files that do not exist. extract-harness deferred the rewording as a
non-goal, and CodeRabbit raised it twice on harness#6
(`merged-branch-guard/proposal.md`, `scan-lift/proposal.md`); this is the
change both skips promised.

## What Changes

- Every path in the seven changes' artefacts is resolved by where its file
  lives now, not by a blind `scripts/` → `bun/` replacement:
  - a gate that moved, and a file a change creates (`tracked.ts`,
    `branch-state.ts`, `turn-gate.ts` and their tests), → `bun/`;
  - a doc that moved → `core/<doc>.md`;
  - `docs/testing.md` and `CLAUDE.md` per meaning: a rule or passage now in
    `core/` is cited there, one that stayed in d2ass is marked *in d2ass*;
  - a path that stays d2ass's — `src/**`, `stryker.config.json`,
    `checks/container-image.test.ts`, d2ass `docs/testing.md` §The mutation
    floor — keeps its path and gains an explicit *in d2ass* marker, because
    extract-harness D9 carries such a task out in d2ass.
- `bun-version-sites` is cut to what the harness owns: the `agent-permissions`
  delta widening the alias clause. The reconciliation of bun's version sites
  (`Dockerfile`, workflow inputs, `.github/dependabot.yml`) is d2ass's tree,
  so it leaves the change, together with its `toolchain-pins` delta, as a card
  on `D2ASS`.
- `tracked-file-sweep`'s decision *The module lives under `scripts/`, and
  `src/**` imports it* is rewritten for the layout it now lands in: the module
  is `bun/tracked.ts`, and d2ass's tests reach it through the pinned package.
  Its task switching the two `src/app/` tests is d2ass work and goes to the
  same `D2ASS` card.
- `scan-lift`'s rule of two goes to `core/rules.md`'s Code list, and the budget
  its task measures is that file's.

## Non-goals

- **Rewording the changes beyond their paths and the three decisions above.**
  A sentence that is true in the new layout stays as it is.
- **The rulebook's references to the harness's own specs** (`core/rules.md`,
  `core/feature-workflow.md`) and `core/rulebook-growth.md`'s advice to
  extract into `docs/<topic>.md`. Both surfaced beside this one and are fixed
  in `core/` on their own.
- **Carrying out any of the seven changes.** Each is still applied on its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The edit is to planning artefacts of changes not yet applied; no
requirement of the harness changes, so the change sets `skip_specs`.

## Impact

- `openspec/changes/{gh-api-guard,merged-branch-guard,pre-pr-sequence-gate,scan-lift,tracked-file-sweep,drop-mutation-exemptions,bun-version-sites}/**`.
- `openspec/changes/bun-version-sites/specs/toolchain-pins/` — removed.
- A new card on `D2ASS` for the bun version reconciliation and
  `tracked-file-sweep`'s `src/app/` switch.
- The `Re-point the moved changes' paths at the harness layout` card on
  `Harness` reaches `done` with this change.
- No code, no spec under `openspec/specs/`.
