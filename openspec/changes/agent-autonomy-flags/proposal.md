# agent-autonomy-flags

## Why

Eight skills under `core/skills/` carry `disable-model-invocation: true`:
`checklist`, `code-review`, `coderabbit`, `first-five`, `pr-brief`,
`review-order`, `session-wrapup` and `ship`. With the flag set, the Skill tool
refuses a model's call, and the skill stays out of a sub-agent's listing.
A scheduled task cannot run it either. Only a `/name` the user types still
runs it.

On 2026-10-18 an orchestrator session could not run `/coderabbit 147` on a
review that had already landed, and the user had to type it. So an
unattended session cannot process the bot's review at all, and an agent that
ends its own session cannot wrap it up.

`agent-autonomy` (#63, #87) gave every critical-path step a class and named
this follow-up in its non-goals. The flags were never classified. The one
flag with a written reason guards the wrong thing: `core/review-toolkit.md`
reserves `/coderabbit` because waiting for the bot burns a session, but the
cost is the wait, not the reading. The same paragraph's "the user is present
by definition" stops being true once a runner starts the skill.

Five of the eight belong to no workflow or loop, and the user does not use
them:

- `checklist`
- `code-review`, which also collides with Claude Code's bundled `/code-review`
- `first-five`
- `pr-brief`
- `review-order`

## What Changes

- **A flag only where a step stays with the user.** A skill carries the flag
  only when one of its steps is marked `(unattended: user`, and the marker
  check fails on a flag with no such step. `ship` keeps its flag, and its
  merge step is marked `user`. `core/autonomy.md` says that a skill carrying
  the flag is a `user` step.
- **The flag comes off `coderabbit` and `session-wrapup`.** An unattended or
  orchestrator-driven session can then run both through the Skill tool, and
  `ship`'s call to `coderabbit` stops being refused.
- **Five skills are removed.** The directories of `checklist`, `code-review`,
  `first-five`, `pr-brief` and `review-order` go, together with:
  - the `.claude/skills/` links to `checklist`, `first-five` and
    `review-order`;
  - the README rows, and the README's note on `code-review`'s old severities;
  - the prose that names them: `ship`'s steps that call `pr-brief`, the gate
    line in `triage` that says what `pr-brief` "files it under", and
    `session-wrapup`'s example.

  `ship` writes the pull request's title and body itself, to the project's
  pull request rules.
- **`/coderabbit` gets a guard against the risk the flag stood for.**
  - It reads the head commit and the reviews.
  - If the bot has not reviewed the head commit, it ends on an `OPEN` gate
    line that names the commit. It does not sleep or read again.
  - A run that finds a review keeps its single re-fetch before the gate line,
    so a review that lands mid-run is still dispositioned.
  - Its approval steps carry `card` markers.
  - `core/review-toolkit.md` stops saying that invoking it is the approval.
- **`session-wrapup`'s steps are classed.** Step 2 hands each proposed capture
  on as `card`. The other steps report, or write the save point, the yield
  ledger and the card corrections, and none of them waits on anyone.

### Non-goals

- **When `/session-wrapup` runs, and the handover.** Running it at a finished
  task or near the end of the context window, and handing over to a fresh
  session, belong to the card "Trigger session-wrapup at a finished task or
  near the end of the context window, and hand over to a fresh session".
  This change only makes the skill runnable by the model.
- **Starting `/coderabbit` when the review lands.** That event is the
  orchestrator's and the board loop's.
- **Steps off the critical path** (`core/verification.md`, `core/testing.md`,
  `feature-generator`, `spec-generator`). Their unmarked asks keep the default
  `card`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *Who may invoke a skill is enforced, not narrated*
  ties the flag to a `user` step, and replaces its `/coderabbit` scenario.
- `agent-autonomy`: three new requirements:
  - *A skill only the user may start is a `user` step*
  - *The bot's review is worked once it has landed on the head commit, never
    waited for*
  - *An unattended session runs `/session-wrapup` without waiting on the
    user*

## Impact

- `core/skills/{checklist,code-review,first-five,pr-brief,review-order}/`
  and the three `.claude/skills/` links are deleted. `README.md` loses their
  rows.
- `core/skills/{coderabbit,session-wrapup,ship,triage}/SKILL.md`,
  `core/autonomy.md`, `core/review-toolkit.md`: prose and frontmatter.
- `bun/autonomy.ts` and `bun/autonomy.test.ts`: the marker check also reads
  each skill's frontmatter.
- **Consumers.** `d2ass` and `mellon` both link `checklist`, `first-five` and
  `review-order`. Their pre-push `harness:check` fails on a link into the
  package that holds no `SKILL.md`. The pin bump that takes this change must
  therefore delete those three links in the same pull request. That edit
  lands in their repositories, so each needs a card on its own board.
