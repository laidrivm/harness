# commit-gates Specification

## Purpose

What is checked before a commit lands and before a pull request can pass —
the secret scan and the ban on linter and type-checker suppressions. It exists
because both prohibitions were prose the agent could restate and still walk
past: a secret reaches a public repository once, and a suppression that nobody
approved is a silenced finding nobody reads.

## Requirements
### Requirement: A secret scan runs in CI and, when available, before a commit

CI SHALL run `gitleaks` over the branch on every pull request, from a
container image pinned by digest, matching how `actionlint` is already
pinned. The pre-commit hook SHALL run the locally installed `gitleaks` when
one is on `PATH` and SHALL skip silently when none is, so a fresh clone works
without installing it. A finding in CI SHALL fail the check.

#### Scenario: A token reaches a pull request

- **WHEN** a branch carries a file containing a recognisable API token
- **THEN** the CI check fails and names the file and line

#### Scenario: A developer without the binary

- **WHEN** `gitleaks` is not on `PATH` and a commit is made
- **THEN** the pre-commit hook completes without error and without scanning

#### Scenario: The image is not pinned

- **WHEN** the workflow references the image by tag alone
- **THEN** the change is rejected at review — a tag is mutable, and this
  repository pins container actions by digest

### Requirement: Linter and type-checker suppressions fail CI

CI SHALL fail when a tracked **source** file contains `biome-ignore`,
`@ts-expect-error` or `@ts-ignore`. The scanned set SHALL be every tracked
file that is not prose, rather than an enumeration of source extensions: a
linter acts on more of them than one list remembers, and a source type left off
such a list is exempt with nobody deciding it. Prose is exempt because
documentation and OpenSpec artefacts discuss suppressions by name, this
specification among them, and a check that fails on its own proposal is a check
nobody keeps. The check's own script and test SHALL be
outside the scanned set too, for the same reason and no other: they must carry
the three markers literally to do their job. The repository's root
`package.json` SHALL be outside the scanned set as well, because the allowlist
lives in it and each approval's key names its marker, so scanning it counts
every approval as a suppression of its own. A marker there cannot suppress
anything: the gates read that file as strict JSON, which has no comments, so a
marker can only sit inside a string. A `package.json` below the root holds no
allowlist and SHALL stay scanned. An approved suppression SHALL be
admitted only by naming its exact path, **which marker**, and how many
occurrences of it are approved there, in the check's own allowlist — so the
approval arrives as a reviewable line in the diff rather than as a silent
comment in a source file, a second suppression cannot ride in on the first
one's approval, and swapping an approved `@ts-ignore` for a `biome-ignore` at
the same path is a new approval rather than a free one. An entry SHALL NOT name
the line the suppression sits on: an approval follows the count and not the
occurrence, so deleting an approved suppression and adding another of the same
marker at the same path passes — an accepted ceiling, because the substitution
is two lines of the diff a reviewer reads, while a line number moves with every
unrelated edit above it and would have the allowlist re-approved by someone who
never re-read the reason. The check SHALL read tracked files only, so an
ignored or untracked file cannot fail a clone that does not have it.

#### Scenario: A suppression is added

- **WHEN** a commit adds `// biome-ignore lint/suspicious/noExplicitAny: …`
  to `src/model.ts`
- **THEN** the CI check fails and names the file and line

#### Scenario: An approved suppression

- **WHEN** the same commit also adds `src/model.ts`, `biome-ignore`, count one
  to the check's allowlist
- **THEN** the CI check passes, and the approval is visible in the diff

#### Scenario: An approved suppression swapped for another kind

- **WHEN** that `biome-ignore` is later replaced by an `@ts-ignore` at the same
  path, leaving the allowlist untouched
- **THEN** the CI check fails, because the entry approves one marker and not
  the line it sits on

#### Scenario: The repository as it stands

- **WHEN** the check runs over the current tree
- **THEN** it passes with an empty allowlist, because no tracked source
  carries a suppression today

#### Scenario: A document that discusses suppressions

- **WHEN** a markdown file names `biome-ignore` while explaining this rule
- **THEN** the check passes, because prose is the one thing exempt

#### Scenario: A source type the specification never enumerated

- **WHEN** a tracked `.mjs` file carries a suppression
- **THEN** the check fails, because the exemption is prose and not a list of
  the source extensions somebody thought of

#### Scenario: An allowlisted file gains a second suppression

- **WHEN** a file already on the allowlist gains an unrelated second
  suppression
- **THEN** the check fails — the allowlist admits the approved occurrence, and
  the count is part of what it pins

#### Scenario: A suppression inside a dependency

- **WHEN** an untracked file under `node_modules` or `dist` contains a
  suppression
- **THEN** the check passes, because it reads tracked files only

#### Scenario: The allowlist names the markers it approves

- **WHEN** the tracked root `package.json` approves `src/model.ts`,
  `biome-ignore`, count one, `src/model.ts` carries that one suppression, and
  the allowlist has no entry for `package.json`
- **THEN** the check passes, because the key naming `biome-ignore` is an
  approval and not a suppression

#### Scenario: A workspace manifest carries a marker

- **WHEN** a tracked `packages/web/package.json` contains `@ts-ignore`
- **THEN** the check fails and names that file, because only the root
  manifest holds the allowlist

### Requirement: The pre-push hook runs the gates named here

The pre-push hook SHALL run, in addition to the type check and `bun test`:
`biome ci`, the YAML syntax check, the suppression scan, and the mutation
floor with the Stryker run that produces its report. A non-zero exit from any
of them SHALL block the push. The diff budget SHALL remain the single
exception, absorbed as `change-slicing` requires, because it measures rather
than judges.

No specification under `openspec/specs/` other than this one SHALL enumerate
what the hook runs. The list was previously spread across four of them, two of
which disagreed, and a gate no single file claims is one a change can break
without contradicting anything. A change's own artefacts and `README.md` may
name individual checks and SHALL link here for the list.

A check whose tool may be absent from a developer's machine — `actionlint` over
`.github/workflows/`, `gitleaks` over the commits the push would add — SHALL be
guarded by
`command -v` and SHALL be skipped silently when the binary is not on `PATH`, so
a fresh clone can push. Absence SHALL NOT fail the hook: CI runs both from
pinned versions, and that is where their verdict is binding. Presence SHALL be
treated like any other gate — a non-zero exit blocks the push, because a
finding a developer can see before pushing is one they should not push past.

The hook SHALL NOT run the browser suite or the coverage report — `smoke-suite`
owns why for both — nor `bun audit`, which queries an advisory database over
the network and would make an offline push fail on a gate about published
vulnerabilities rather than about the branch. CI runs it on a pull request that
touches `package.json`, and nightly.

The secret scan SHALL be bounded to the checked-out branch's range —
`--log-opts` from the base branch to `HEAD`, resolved as
`scripts/diff-budget.sh` resolves its own base — and SHALL NOT walk the whole
history the way CI does. Two failure modes decide the bound: an unbounded scan
means one secret ever reaching history blocks every push by everyone until a
baseline is written, and a working-tree scan reads the gitignored files that
exist for one author and in no clone.

`HEAD` is the supported push shape, and the hook SHALL NOT be read as covering
more. It does not consume the ref-update records git writes to a pre-push
hook's standard input, so a push of some ref other than the checked-out one
leaves its commits unscanned here. That is the same gap as a machine without
`gitleaks`, and it closes the same way: CI keeps the history-wide scan, where a
failure stops one pull request rather than everybody's pushes, and that is
where the verdict is binding.

#### Scenario: A gate that CI would fail blocks the push instead

- **WHEN** a branch is pushed whose surviving-mutant count exceeds the floor
- **THEN** the hook reports the count and the floor and exits non-zero, and the
  push does not happen

#### Scenario: A tool the machine does not have

- **WHEN** `actionlint` is not on `PATH` and a branch is pushed
- **THEN** the hook completes without error and without linting the workflows

#### Scenario: A tool the machine has, reporting a finding

- **WHEN** `gitleaks` is on `PATH` and the branch carries a recognisable API
  token
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A secret that is already in the base branch

- **WHEN** `gitleaks` is on `PATH` and a recognisable token sits in a commit
  the branch did not add
- **THEN** the hook does not report it, because the scan is bounded to the
  range the push would send; CI's history-wide scan is what owns that case

#### Scenario: The budget is still soft

- **WHEN** a branch at 950 counted lines is pushed and every other gate passes
- **THEN** the hook prints the `FAIL` gate line and the push proceeds

#### Scenario: The list has one home

- **WHEN** a file under `openspec/specs/` other than this one enumerates what
  the pre-push hook runs
- **THEN** the change is rejected at review — the fragment belongs here, and
  the other specification states only the part it owns

### Requirement: A turn that commits reports its gates before it ends

A `Stop` hook registered in the tracked `.claude/settings.json` SHALL refuse
to end a turn when all of the following hold: the turn left at least one commit
on the branch that was not there when control arrived, a task group in a change
outside `openspec/changes/archive/` has at least one box and no unticked one
left and had an unticked one in the task lists as committed at the mark, and
the turn's final assistant message
carries neither a gate line nor `BLOCKED` naming what only the user can
settle. It SHALL block by exiting **2** with the reason on stderr, which is
the only code that prevents the turn ending, and the only channel the model
reads — stderr from a hook exiting 0 reaches the debug log alone.

A group with no boxes at all SHALL NOT count as complete, because the absence
of an unticked box is not evidence that a box was ticked. A group already
complete at the mark SHALL NOT qualify the turn either: it was completed, and
reported or not, by an earlier turn, and counting it would refuse every turn
that commits anything while any active change holds a finished group. The
state at the mark SHALL be read from git — the task files as the marked commit
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
those. Which lifecycle events fire on such a turn is a measurement this change
takes rather than a behaviour it asserts.

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
