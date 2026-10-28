# Proposal

## Why

Once the ready guard (#332) is live, it refuses a hand-run `gh pr create` and
`gh pr ready`, and sends the agent to `bun bun/work.ts finish`, which requires
`--card`. A pull request with no card — a pin bump (#335, #336), a hotfix
(#333) — then has no way to open.

## What Changes

- `--card` on `finish` becomes optional. Without it, `finish` does everything
  it does today — the refusals, the evidence check on `HEAD`, the push while
  draft, the draft opened, the ready switch — and skips only the check for a
  question waiting on the card. It does not guard against intent (stage 2,
  question 23).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-finish`: *Finish reads its arguments strictly* no longer requires
  `--card`; *Finish marks ready only when no question waits* reads no card
  when none is given.

## Impact

`bun/work.ts` (argument reading, usage), `bun/work-finish.ts`, their tests,
the ready guard's refusal text, and the `finish` lines of `README.md` and
`core/git-and-prs.md`.
