# capture-as-mechanism

## Why

The fix & capture loop in `core/rules.md` routes a confirmed lesson to a rule,
a skill edit or nothing. Every branch ends in prose, and prose is the
probabilistic mechanism this harness exists to replace. The result is
measurable: on 2026-10-10 the Process sublist stood at 22 rules against its
trigger, and 16 of them had to be promoted out of the always-on file.

`agent-rulebook`'s *A mechanised prohibition leaves its prose home* removes
the prose once a mechanism exists. Nothing asks for that mechanism, though:
no step of the loop asks whether a lesson could be a gate before it becomes a
rule. Nothing counts how often a lesson became one either, so nobody can tell
whether the rulebook is maturing into gates or just getting longer. The
session that prompted this change is an example. Its one capture ("set a
card's properties with `update_properties` and re-fetch the card") went into
prose. Yet a `PostToolUse` hook that re-reads the page could hold it, and
nothing in the loop asked whether one could.

## What Changes

- The capture step of the loop in `core/rules.md` gains a first question,
  asked before any rule is proposed: **can a mechanism hold this?** The
  answer has three outcomes.
  - **A test the branch can add.** This applies when the lesson is about
    one piece of code and a test over it holds the lesson. The lesson
    becomes that test in the same turn, and no rule is written.
  - **A mechanism that would change a gate** (a hook, a `deny` entry, a
    `harness:check` check). It enters the OpenSpec cycle as
    `core/feature-workflow.md` requires of a gate change, so the capture
    files a card for it. A rule is written now as the stop-gap. It leaves
    under *A mechanised prohibition leaves its prose home* when the gate
    lands.
  - **None that would not block far more than the rule intends.** The rule
    is written, and the capture's proposal to the user says why no
    mechanism fits.
- `session-wrapup` step 2 tags each capture it proposes with its kind:
  `mechanism`, `card + rule`, `rule`, `skill edit` or `memory`. Step 5
  appends one `- captures:` line counting them to the yield ledger it
  already writes. There is no new file. Over a month the ledger then shows
  whether lessons are turning into gates, as it already shows which review
  steps find nothing.

## Non-goals

- Auditing the rules already in the rulebook for ones a mechanism could
  replace. That is a sweep with its own scope and its own cards. This change
  only stops new prose arriving unexamined.
- Building any particular mechanism, including the hook that would hold this
  session's capture. That belongs to the sibling change verifying external
  writes.
- Changing the rule quality bar or the sublists. A rule that is still written
  clears the same bar as today.
- Counting gate decisions. The sibling change `gate-decision-ledger` adds an
  append-only ledger of what the gates decided, and `session-wrapup` reads
  it. This change counts what the loop *produced*, which that ledger cannot
  see. The two lines sit side by side in step 5 and neither restates the
  other.

## Open questions for the user

1. **Stop-gap or card alone.** When the mechanism is a gate change, this
   proposal writes the rule now *and* files the card. The alternative is the
   card alone: no prose arrives, and the lesson goes unprotected until the
   gate lands. The default here is both, because a card can sit in `idea`
   for weeks.
2. **Where the count is taken.** `session-wrapup` runs only when the user
   invokes it (`disable-model-invocation: true`), so a session that is never
   wrapped up adds nothing to the count. A mechanical count, such as one
   derived from git history at wrap-up, would not depend on the model
   remembering. It is also a larger change than one ledger line. The default
   here is the ledger line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-rulebook`: two added requirements.
  - *A captured lesson is weighed as a mechanism before it is written as
    prose*: the routing above.
  - *The yield ledger counts captures by kind*: the measurement above.

  *A mechanised prohibition leaves its prose home* is unchanged. The stop-gap
  outcome relies on it rather than restating it.

### Unmodified, but adjacent

- `context-budget`'s *A fact with no status is written where its reader
  looks* routes a *fact* to its site. This change routes a *lesson* to a
  mechanism or a rule, and a rule that is still written goes where that
  requirement already sends it.
- `local-review-loop`'s requirement that a skipped Minor becomes a rule only
  when it is a settled convention keeps its gate. A Minor that clears it is
  then weighed as a mechanism like any other lesson.

## Impact

- `core/rules.md`: the loop's capture step gains one leading bullet with
  three sub-bullets, a few always-on lines. Every consumer receives it
  through `sync.ts` at its next pin bump.
- `core/skills/session-wrapup/SKILL.md`: steps 2 and 5, and the example.
- No code, no gate and no consumer-side registration change, so nothing needs
  measuring against the consumers' trees.
