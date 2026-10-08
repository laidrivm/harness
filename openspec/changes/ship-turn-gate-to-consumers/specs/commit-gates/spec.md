# commit-gates — delta spec

## MODIFIED Requirements

### Requirement: A turn that commits reports its gates before it ends

A `Stop` hook registered in the tracked `.claude/settings.json` SHALL refuse
to end a turn when all of the following hold: the turn left at least one commit
on the branch that was not there when control arrived, a task group in a change
outside `openspec/changes/archive/` has at least one box and no unticked one
left and was not complete in the task lists as committed at the mark, and
the turn's final assistant message
carries neither a gate line nor `BLOCKED` naming what only the user can
settle. It SHALL block by exiting **2** with the reason on stderr, which is
the only code that prevents the turn ending, and the only channel the model
reads — stderr from a hook exiting 0 reaches the debug log alone.

A group with no boxes at all SHALL NOT count as complete, because the absence
of an unticked box is not evidence that a box was ticked. A group already
complete at the mark SHALL NOT qualify the turn either: it was completed, and
reported or not, by an earlier turn, and counting it would refuse every turn
that commits anything while any active change holds a finished group. A
group absent at the mark SHALL qualify the turn like one with an unticked box
there: the turn that wrote it and ticked it completed it, and excluding it
lets a whole group of findings, added and closed in one turn, end silently.
The state at the mark SHALL be read from git — the task files as the marked commit
holds them — rather than recorded beside the mark, which would be the second
source of truth this requirement already refuses. A bare `BLOCKED`
with nothing after it SHALL NOT satisfy the message condition, on the terms
this project already applies to an `oversize:` marker in a pull request body:
a marker with nothing after it clears nothing.

The branch's push state SHALL NOT be a condition. A turn that commits and
pushes before it ends is precisely the case the sequence exists to prevent, so
treating a push as discharge would build the bypass into the gate. What
discharges the obligation is the report, and nothing else.

Whether the turn left commits SHALL be decided against a mark of `HEAD` taken
when control arrived, written by a `UserPromptSubmit` hook. A turn that commits
and then returns `HEAD` to the mark SHALL be treated as having left none,
unless the branch's remote-tracking ref holds a commit the mark does not: the
gate exists so that work reaching a branch is reported, and work withdrawn
before the turn ends reaches nothing — but a commit pushed and then reset
locally has reached the remote branch, whatever `HEAD` says afterwards. The mark SHALL be keyed by the session it
belongs to, since two sessions in one repository otherwise share one mark and
answer each other's question. It SHALL live no longer than the turn that
follows it: a record of what the sequence has already reported would be a
second source of truth about work the repository already describes, and one
that can disagree with it.

The hook SHALL refuse at most once per mark. A refused turn is continued rather
than restarted, so no new mark is written, and the second refusal a repeated
condition would produce is suppressed by that. This bounds the cost of a
condition the model cannot satisfy to one turn, without depending on any field
of the hook event to detect the repetition.

Where the hook cannot read what it needs — no mark, no final message, no
repository, or a `HEAD` naming no branch — it SHALL allow the turn to end.
This is the one place in this capability where an undecidable case does not
block, and it is a choice rather than an oversight. A hook that refuses when
its partner did not run makes a partial installation into a session that
cannot end a turn; and refusing when the final message is unreadable would
refuse with an instruction that cannot be followed, since the escape from the
refusal is text in that same message.

The refusal SHALL name both endings the rule already admits — running the
sequence, or writing `BLOCKED` with what only the user can settle — because
each is text the next message can carry. No repository state need change for a
blocked turn to end, so the hook SHALL NOT be able to refuse indefinitely, and
SHALL NOT depend on a loop-protection field to guarantee it.

This requirement SHALL NOT claim that the sequence ran. The hook reads the
final message for a gate line; a gate line written without running the gate
passes it. What it catches is the turn that ends silently, which is the
failure it was written for.

Nor SHALL it claim to reach every turn. A turn that ends by a path which does
not invoke this hook — an interruption, or a failure that ends the turn
without it — is not gated, and the obligation falls back to the prose rule for
those. An interrupted headless turn was measured firing `SessionEnd` and no
`Stop`; that is an observation, not a behaviour this requirement asserts.

Every consumer SHALL register both halves in its tracked
`.claude/settings.json` with the text the harness supplies, character for
character, and the consumer's check SHALL fail when either registration is
missing or differs, as it fails a Bash hook that is not the bootstrap. That
text SHALL run the installed package's script, and SHALL end the turn — and
let the prompt through — when the package is not installed: a clone before
`bun install` is the partial installation the fail-open paragraph above
already refuses to make unusable. The harness itself registers the script from
its own working tree, because it is not installed as its own package.

#### Scenario: A task group is completed and the turn ends silently

- **WHEN** a turn commits the last task of a group and its final message
  carries no gate line
- **THEN** the hook blocks the turn from ending, and the reason names running
  the sequence or writing `BLOCKED`

#### Scenario: The turn reports its gates

- **WHEN** the same turn's final message carries the sequence's gate line
- **THEN** the turn ends

#### Scenario: The turn names what only the user can settle

- **WHEN** the final message carries `BLOCKED` followed by what the user must
  decide
- **THEN** the turn ends, because that is an ending the rule already admits

#### Scenario: A bare marker with nothing after it

- **WHEN** the final message carries `BLOCKED` and nothing naming what the
  user must settle
- **THEN** the hook blocks, because a marker with nothing after it clears
  nothing

#### Scenario: The turn commits and pushes before ending

- **WHEN** a turn commits the last task of a group, pushes the branch, and
  ends with no gate line
- **THEN** the hook blocks, because the push is the event the sequence was
  meant to precede rather than a discharge of it

#### Scenario: A turn whose commits are withdrawn before it ends

- **WHEN** a turn commits and then returns `HEAD` to where the mark left it
- **THEN** the turn ends, because nothing it committed survives to be reported

#### Scenario: A turn that pushes, then resets to the mark

- **WHEN** a turn commits the last task of a group, pushes the branch, and
  returns `HEAD` to the mark
- **THEN** the hook blocks, because the branch's remote-tracking ref holds a
  commit the mark does not, so the work reached a branch

#### Scenario: A refusal is not repeated

- **WHEN** a turn already refused under this requirement ends again with the
  same mark and the condition still met
- **THEN** the turn ends, because the hook refuses at most once per mark

#### Scenario: Two sessions in one repository

- **WHEN** a second session's turn ends while the first session's mark is the
  most recently written
- **THEN** the second session is decided against its own mark, not the first's

#### Scenario: A turn that commits nothing

- **WHEN** a turn answers a question while a task group stands complete, and
  `HEAD` is where the mark left it
- **THEN** the turn ends, whatever the message says

#### Scenario: A group that carries no boxes

- **WHEN** the only group whose text holds no `- [ ]` also holds no `- [x]`
- **THEN** the turn ends, because the absence of an unticked box is not
  evidence that a box was ticked

#### Scenario: Every group still has work in it

- **WHEN** a turn commits while every task group in every active change still
  has an unticked box
- **THEN** the turn ends, because no group has been completed

#### Scenario: A group completed in an earlier turn

- **WHEN** a turn commits work for a group that still has an unticked box,
  while another group was already fully ticked in the task lists the marked
  commit holds
- **THEN** the turn ends, because no group was completed in this turn

#### Scenario: A group created and completed in the same turn

- **WHEN** a turn adds a task group the marked commit does not hold, ticks
  every box in it, commits, and ends with no gate line
- **THEN** the hook blocks, because the group was not complete at the mark,
  whether the turn committed it unticked first or not

#### Scenario: A complete group the turn renamed

- **WHEN** a turn renames the heading or the change directory of a group
  already complete at the mark, and ends with no gate line
- **THEN** the hook blocks once, because the group reads as absent at the
  mark — a cost the refusal-once rule bounds to one turn

#### Scenario: The completed group belongs to an archived change

- **WHEN** the only fully ticked group is in a change under
  `openspec/changes/archive/`
- **THEN** the turn ends, because archiving is what retires the obligation

#### Scenario: The mark was never written

- **WHEN** `Stop` finds no record of `HEAD` from the start of the turn
- **THEN** the turn ends, because a partial installation must not make the
  session unusable

#### Scenario: The final message cannot be read

- **WHEN** the hook event carries no final assistant message
- **THEN** the turn ends, because the escape from a refusal is text in that
  message, and refusing over an unreadable one cannot be acted on

#### Scenario: There is no repository, or no branch

- **WHEN** the turn ends outside a git repository, or on a `HEAD` that names
  no branch
- **THEN** the turn ends, because no commit of a task group can be in
  question

#### Scenario: A consumer without the registrations

- **WHEN** a consumer's tracked `.claude/settings.json` lacks the `Stop` or
  the `UserPromptSubmit` registration, or carries one that differs from the
  harness's text
- **THEN** the consumer's check fails and names the registration

#### Scenario: A consumer clone before install

- **WHEN** a prompt arrives or a turn ends in a consumer whose
  `node_modules/harness` is absent
- **THEN** the prompt goes through and the turn ends, with nothing printed
