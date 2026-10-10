# capture-as-mechanism — design

## Context

The loop lives in `core/rules.md`, the one file read at every session start,
and reaches each consumer through `sync.ts`. Every line it gains is an
always-on line, everywhere. The yield ledger is
`docs/context/pipeline-yield-<yyyy-mm>.md`. Only `session-wrapup` writes it,
append-only, and only when the user invokes the skill. The specs fix the
behaviour (see `specs/agent-rulebook/spec.md`). The proposal gives the
motivation.

## Goals / Non-Goals

**Goals:**

- The question is asked at the moment a rule would otherwise be written, in
  the file where that moment happens, and it costs few always-on lines.
- The count lands in the ledger a month of sessions already accumulates, in
  the form its existing lines use.

**Non-Goals:**

- A mechanical check that the question was asked. A capture's reasoning lives
  in conversation, where no gate can read it. The count is the only evidence
  this change produces, and it is reported, not enforced.

## Decisions

### The question leads the capture step instead of becoming a step of its own

The loop's numbered steps are *fix* and *capture*. The question belongs to
capturing, and it has to come before the existing branches route the lesson
to a sublist or a skill. Otherwise the rule is drafted first and the
mechanism weighed after, which is the order this change reverses. So it
becomes the capture step's first bullet, with its three outcomes as
sub-bullets.

A third numbered step was considered and rejected. It would read as
something done after capturing, which is when the rule already exists.

### A test is the branch's, a check is a gate

A new `harness:check` check changes how a gate behaves, and
`core/feature-workflow.md` sends every such change through the OpenSpec
cycle, so it cannot land in the turn that captured the lesson. A test over
the code the lesson is about can. The routing draws the line there: only a
test holds a lesson in the same turn. A general lesson, one meant to stop a
pattern anywhere, needs a gate, because a test over one call site does not
reach the next one.

### The stop-gap rule is written with the card

A gate change goes through proposal, apply and archive, and its card may sit
in `idea` for weeks. A card with no rule leaves the lesson unprotected for
that whole time. The rule and the card together cost one line, and that line
leaves on its own terms: *A mechanised prohibition leaves its prose home*
already removes it when the gate lands. This is the proposal's open
question 1. Choosing *card alone* deletes one sub-bullet and one scenario,
and nothing else moves.

### Proposals are counted, not what the user kept

The wrap-up writes the ledger in the same pass that proposes captures. The
user decides afterwards, often in another turn or not at all. Counting
proposals measures what the loop produced, which is what this change is
about. Counting what was kept would mean revisiting the ledger later, and the
ledger is append-only.

### One ledger line, beside the gate line the sibling change adds

`gate-decision-ledger` makes step 5 read its own ledger of gate decisions.
This change adds a `- captures:` line to the same step. The two lines answer
different questions: what the gates decided, and what the lessons became.
Neither change restates the other's line. Whichever merges second rebases
over the first's edit to step 5 and keeps both lines. The order between them
is cosmetic.

## Risks / Trade-offs

- [Risk] The question becomes a ritual: "no mechanism fits" is asserted
  without weighing anything. → The proposal to the user must name *why*,
  which is checkable in the conversation. The `rule` count against
  `mechanism` and `card + rule` shows a sustained skew over a month.
- [Risk] The cards for mechanisms pile up in `idea` and never land, so the
  stop-gap rules never leave. → They are ordinary cards on the board, ranked
  by the user like any other. The ledger's `card + rule` count is how a
  growing backlog shows.
- [Trade-off] A session never wrapped up is uncounted. The proposal's open
  question 2 names the larger alternative. The default accepts the gap,
  because the review-step lines in the same ledger already live with it.
