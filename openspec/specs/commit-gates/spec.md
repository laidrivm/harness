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
floor with the Stryker run that produces its report. That run SHALL mutate
only the modules whose stored results no longer match the tree, as
`mutation-floor` sets out, while the floor SHALL count every mutated module,
the unchanged ones from their stored results: a run over every module on every
push would cost hours, and a floor over the changed modules alone would let a
survivor elsewhere go uncounted. A non-zero exit from any
of them SHALL block the push. The diff budget SHALL remain the single
exception, absorbed as `change-slicing` requires, because it measures rather
than judges. Whether the judged gates run at all is the one exception
*The pre-push hook skips the gates a passing run record proved* sets out.

The judged gates SHALL be one script, and the project checks the pre-PR
runner records — the command under `harness.bumpTest` — SHALL run that same
script, so that on one machine the runner and the push judge a commit by the
same gates: a record that proves less than the push is one an agent reads as
more. The draft check stays outside the script, being about the pull
request's state rather than the commit, and a gate guarded by `command -v`
judges only where its tool is installed.

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
`--log-opts` from the base branch to `HEAD`, the base being the one
`bun/diff-base.sh` prints, which the diff budget reads too — and SHALL NOT walk the whole
history the way CI does. Two failure modes decide the bound: an unbounded scan
means one secret ever reaching history blocks every push by everyone until a
baseline is written, and a working-tree scan reads the gitignored files that
exist for one author and in no clone.

`HEAD` is the supported push shape, and the hook SHALL NOT be read as covering
more. Its gates do not read the ref-update records git writes to a pre-push
hook's standard input — only the draft check and the gates' skip do — so a
push of some ref other than the checked-out one leaves its commits unscanned
here. That is the same gap as a machine without
`gitleaks`, and it closes the same way: CI keeps the history-wide scan, where a
failure stops one pull request rather than everybody's pushes, and that is
where the verdict is binding.

#### Scenario: A gate that CI would fail blocks the push instead

- **WHEN** a branch is pushed whose surviving-mutant count exceeds the floor
- **THEN** the hook reports the count and the floor and exits non-zero, and the
  push does not happen

#### Scenario: A push that changed no module

- **WHEN** a branch that changed no file under `bun/` is pushed over current
  stored results
- **THEN** the hook starts no Stryker run, and the floor is checked against
  the stored results of every mutated module

#### Scenario: A gate the runner's checks run too

- **WHEN** `biome ci` fails on a branch and the pre-PR runner runs
- **THEN** the runner's project checks fail and record no `pass` for the
  commit, as the push would refuse it

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

### Requirement: The pre-push hook drops git's repository variables

Before any other command it starts — that read of the list is the first —
the harness's pre-push hook SHALL remove from its environment every variable
that `git rev-parse --local-env-vars` names, so no check it runs inherits the
repository git handed the hook. The list
SHALL be git's own, read when the hook runs, and no copy of it SHALL be kept
in the harness.

#### Scenario: A push from a worktree

- **WHEN** a branch is pushed from a linked worktree, so git hands the hook
  an absolute `GIT_DIR` naming that worktree's directory under the shared
  `.git`
- **THEN** no command the hook starts sees `GIT_DIR`, so each git call of the
  suite it runs finds its repository from its own working directory

#### Scenario: Every variable on git's list

- **WHEN** the hook is started with `GIT_DIR`, `GIT_INDEX_FILE` and
  `GIT_CONFIG_COUNT` set to a decoy repository's values
- **THEN** the commands it starts see none of them, and the decoy's refs and
  config are as they were

### Requirement: The test suite refuses to start under git's repository variables

The harness's `bun test`, started at the repository's root, SHALL exit
non-zero before any test file loads while any variable that `git rev-parse
--local-env-vars` names is set, whatever its value, empty included, and SHALL
name each such variable on stderr. A list it cannot read, or one that names no
variable, SHALL refuse the same way. A variable outside that list SHALL NOT
refuse.

#### Scenario: A suite started under a decoy repository

- **WHEN** `bun test` starts with `GIT_DIR` naming a decoy repository that
  has no remote
- **THEN** it exits non-zero naming `GIT_DIR`, runs no test, and the decoy's
  refs and config are as they were

#### Scenario: A variable set but empty

- **WHEN** `bun test` starts with `GIT_PREFIX` set to the empty string, as git
  sets it for a hook run at a checkout's top level
- **THEN** it refuses and names `GIT_PREFIX`

#### Scenario: A git variable outside the list

- **WHEN** `bun test` starts with `GIT_EDITOR` set and nothing on git's list
- **THEN** the suite runs, because only git's list decides — a session that
  sets an editor for git is not inside another repository

#### Scenario: The list cannot be read

- **WHEN** `git rev-parse --local-env-vars` fails when the suite starts, or
  succeeds and prints no variable
- **THEN** the suite exits non-zero naming that failure and runs no test

### Requirement: A turn that commits reports its gates before it ends

A `Stop` hook registered in the tracked `.claude/settings.json` SHALL refuse
to end a turn when all of the following hold: the turn left at least one commit
on the branch that was not there at the mark, a task group in a change
outside `openspec/changes/archive/` has at least one box and no unticked one
left and was complete neither in the task lists as committed at the mark nor
in those `origin/main` holds when the turn ends, and the gate ledger holds no
passing run record of the turn's tip in this checkout (`pre-pr-runner`, *The
runner records each run for the commit it read*): a `pass` record of the tip
for every step the runner runs. The
tip is the commit the turn's work is read from, as the paragraph on the mark
below decides it. A record is this checkout's when the project it names is the
repository's top level, as git resolves it from the turn's working directory.
A run in another clone or worktree at the same commit does not count, nested
inside this one or not, because it measured against its own base refs. It
SHALL block by exiting **2** with the reason on stderr, which is
the only code that prevents the turn ending, and the only channel the model
reads — stderr from a hook exiting 0 reaches the debug log alone.

The hook SHALL NOT read the turn's final message. What the message says —
a gate line, a `BLOCKED`, or nothing — neither discharges the obligation nor
qualifies the turn, because a line of text proves nothing a record does not,
and code that parsed the model's text is where the previous design broke.

A group with no boxes at all SHALL NOT count as complete, because the absence
of an unticked box is not evidence that a box was ticked. A group already
complete at the mark SHALL NOT qualify the turn either: it was completed, and
reported or not, by an earlier turn, and counting it would refuse every turn
that commits anything while any active change holds a finished group. A
group absent at the mark SHALL qualify the turn like one with an unticked box
there: the turn that wrote it and ticked it completed it, and excluding it
lets a whole group of findings, added and closed in one turn, end silently.

Nor SHALL a group qualify the turn that is already complete in the task lists
as `origin/main` holds them when the turn ends, the base ref the merged-branch
guard reads (`agent-permissions`). That group reached the default branch
through a pull request of its own, and a turn that pulled it, fetched it or
merged `main` into its branch brought it in rather than completed it. Counting
it refused 8 of the last 14 pulls on `main` in the harness's orchestrator
session on 2026-10-13, each of which committed nothing. The ref SHALL be read
when the turn ends, not at the mark, because the fetch that brings a group in
is the same one that moves the ref. A repository without that ref SHALL read it
as holding no task list, which excludes nothing. The cost is accepted: a turn
that completes a group, merges its own pull request and fetches the merge
before ending ends without a run. Merging is not among the commands the
harness's settings allow without a prompt, and the pre-push hook has run on
what merged.

The state at the mark and on `origin/main` SHALL be read from git — the task
files as the marked commit and the ref hold them — rather than recorded beside
the mark, which would be the second source of truth this requirement already
refuses.

The branch's push state SHALL NOT be a condition. A turn that commits and
pushes before it ends is precisely the case the sequence exists to prevent, so
treating a push as discharge would build the bypass into the gate. What
discharges the obligation is the runner's passing run record of the tip, and
nothing else. A run record for any commit but the tip SHALL NOT discharge it:
a commit made after the run is one the run never read. Nor SHALL a record
whose outcome is `fail`, or one step's record without the other's: a step that
failed, or did not run, is no evidence that the tip is ready.

Whether the turn left commits SHALL be decided against a mark of `HEAD`
written by a `UserPromptSubmit` hook on the session's first prompt, and
afterwards on the first prompt after a turn this hook let end. A prompt that
arrives while a turn runs — a message queued mid-turn, which Claude Code hands
to the model inside the same turn — SHALL leave the mark as it is, its refusal
included, and so SHALL a prompt after a turn that ended without this hook
running. A mark moved by such a prompt let the turn it arrived in end
unjudged: on 2026-11-02 a turn that committed a completed group and answered a
message queued during its last command ended with no refusal and no record. A
turn that commits
and then returns `HEAD` to the mark SHALL be treated as having left none,
unless the branch's remote-tracking ref holds a commit the mark does not: the
gate exists so that work reaching a branch is reported, and work withdrawn
before the turn ends reaches nothing — but a commit pushed and then reset
locally has reached the remote branch, whatever `HEAD` says afterwards. A tip
read from that ref is decided like any other, so a fetch on `main`, whose
remote-tracking ref is `origin/main`, completes no group. The mark SHALL be keyed by the session it
belongs to, since two sessions in one repository otherwise share one mark and
answer each other's question. It SHALL be replaced on the first prompt after
the next turn this hook lets end: a record of what the sequence has already
reported would be a second source of truth about work the repository already
describes, and one that can disagree with it.

The hook SHALL refuse at most once per mark. A refused turn is continued rather
than restarted, so no new mark is written — nor by a prompt that arrives in
it — and the second refusal a repeated
condition would produce is suppressed by that. This bounds the cost of a
condition the model cannot satisfy — a blocker only the user can settle, or a
step that keeps failing — to one turn, without depending on any field of the
hook event to detect the repetition.

Where the hook cannot read what it needs — no mark, no repository, or a `HEAD`
naming no branch — it SHALL allow the turn to end. This is the one place in
this capability where an undecidable case does not block, and it is a choice
rather than an oversight: a hook that refuses when its partner did not run
makes a partial installation into a session that cannot end a turn.

The gate ledger is not among those inputs. A ledger that is absent or cannot be
read SHALL be treated as holding no run record, because a missing record is the
case the record clause exists to catch. The once-per-mark bound limits what
that costs to one refusal.

The refusal SHALL name the groups the turn completed, the tip, and the
runner's path as the project reaches it, and SHALL say that it is not
repeated for this mark, so a turn whose blocker only the user can settle
knows its next stop ends it. It SHALL tell the model to end that stop on the
whole final message it meant to end on — its report, a `BLOCKED` line, and
any line a launcher reads — because a launcher reads the continued turn's
last message, not the refused one. No repository state need change for a blocked
turn to end, so the hook SHALL NOT be able to refuse indefinitely, and SHALL
NOT depend on a loop-protection field to guarantee it.

This requirement SHALL claim that the runner ran the sequence's deterministic
steps at the tip and that they passed, and nothing beyond that. The steps that
need judgement are not read here: a record of a skill call is `work.ts
finish`'s business (`work-finish`), and their gate lines are a report for the
model and the human. What it catches is the turn that completes a group and
ends with no passing run at the commit it ends on.

Nor SHALL it claim to reach every turn. A turn that ends by a path which does
not invoke this hook — an interruption, or a failure that ends the turn
without it — is not gated as it ends. Because the next prompt leaves the mark
where it was, its commits are judged with the next turn's when that turn ends
in the same session: a refusal it earns names its groups, and a mark it
already spent its refusal on lets the next turn end unrefused. A session not
continued after it leaves those commits to the prose rule and the pre-push
hook. A turn another `Stop` hook continues after this one let it end counts as
ended, so a prompt that arrives in the continuation moves the mark. An
interrupted headless turn was measured firing `SessionEnd` and no `Stop`; that
is an observation, not a behaviour this requirement asserts.

Every consumer SHALL register both halves in its tracked
`.claude/settings.json` with the text the harness supplies, character for
character, and the consumer's check SHALL fail when either registration is
missing or differs, as it fails a Bash hook that is not the bootstrap. That
text SHALL run the installed package's script, and SHALL end the turn — and
let the prompt through — when the package is not installed: a clone before
`bun install` is the partial installation the fail-open paragraph above
already refuses to make unusable. The harness registers the same text in its
own settings, as `harness-updates`' *The harness's own sessions run its gates
from its pin* requires.

#### Scenario: A task group is completed and the turn ends silently

- **WHEN** a turn commits the last task of a group, and the ledger holds no
  runner record for the tip
- **THEN** the hook blocks the turn from ending, and the reason names the
  tip, the runner's path and that it is not repeated

#### Scenario: The turn reports its gates

- **WHEN** the same turn ends while the ledger holds a passing run record of
  the tip in this checkout
- **THEN** the turn ends, whatever its final message says

#### Scenario: Gate lines with no run behind them

- **WHEN** a turn commits the last task of a group and ends with gate lines
  reading `PASS`, and the ledger holds no runner record for the tip
- **THEN** the hook blocks, because it reads no text

#### Scenario: A run record for an earlier commit

- **WHEN** the runner recorded commit `A`, the turn then committed `B`, and it
  completed a group
- **THEN** the hook blocks, because the run never read `B`

#### Scenario: A run record from another checkout

- **WHEN** a second clone of the repository recorded a run at the tip, and
  this checkout did not
- **THEN** the hook blocks, because that run measured against the other
  clone's base refs

#### Scenario: A run from a subdirectory

- **WHEN** the runner recorded the tip from a subdirectory of this checkout
- **THEN** the record discharges the turn, because the runner records the
  checkout's top level wherever in it it runs

#### Scenario: A worktree nested inside the checkout

- **WHEN** a worktree kept under this checkout's directory recorded a run at
  the tip, and this checkout did not
- **THEN** the hook blocks, because the record names that worktree's top
  level, not this one's

#### Scenario: A run record and no gate line

- **WHEN** the ledger holds a passing run record of the tip and the final
  message carries no gate line
- **THEN** the turn ends, because the hook reads no text

#### Scenario: A run that failed

- **WHEN** the runner's only record of the tip for the project checks has
  the outcome `fail`, and the diff budget's has `pass`
- **THEN** the hook blocks once, because a failed step is no evidence that
  the tip is ready, and the next end of that turn is let through by the
  once-per-mark bound

#### Scenario: One step's record alone

- **WHEN** the ledger holds a `pass` record of the tip for the diff budget and
  none for the project checks
- **THEN** the hook blocks, because one step's record does not stand in for
  another's

#### Scenario: No ledger at all

- **WHEN** a turn completes a group, and the ledger file does not exist
- **THEN** the hook blocks once, and the next end of that turn is let through
  by the once-per-mark bound

#### Scenario: Blocked without a run

- **WHEN** the final message carries `BLOCKED` naming what the user must
  decide, and the ledger holds no run record for the tip
- **THEN** the hook blocks once, and the reason says it is not repeated

#### Scenario: The turn names what only the user can settle

- **WHEN** a turn the hook has refused for this mark ends again with
  `BLOCKED` followed by what the user must decide, and still no run record
- **THEN** the turn ends, by the once-per-mark bound and not by the marker

#### Scenario: A bare marker with nothing after it

- **WHEN** the final message carries `BLOCKED` and nothing after it, and the
  ledger holds a passing run record of the tip
- **THEN** the turn ends, because the hook reads no text: a marker neither
  clears a turn nor holds one

#### Scenario: The turn commits and pushes before ending

- **WHEN** a turn commits the last task of a group, pushes the branch, and
  the ledger holds no runner record for the tip
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

#### Scenario: A message queued mid-turn

- **WHEN** a turn commits the last task of a group, a message the user queued
  while it ran reaches the model inside the same turn, and the turn ends with
  no runner record for the tip
- **THEN** the hook blocks, because the message left the mark where the turn
  started

#### Scenario: A message queued into a refused turn

- **WHEN** a turn the hook refused is continued, a queued message reaches it,
  and it ends again with still no runner record
- **THEN** the turn ends, because the mark kept its refusal

#### Scenario: A turn the user interrupted

- **WHEN** a turn commits the last task of a group and the user interrupts it,
  so the hook does not run, and the session's next turn ends with no runner
  record for its tip
- **THEN** the hook blocks that turn, and the reason names the group the
  interrupted turn completed

#### Scenario: The prompt after a turn the hook let end

- **WHEN** the hook lets a turn end, and the next prompt arrives
- **THEN** the mark is taken afresh at `HEAD`, and the next turn is judged by
  its own commits alone

#### Scenario: The prompt after the round ceiling

- **WHEN** the session ended at the round ceiling (`stage-goal`) and a prompt
  resumes it
- **THEN** the mark is taken afresh at `HEAD`, because the ceiling's end is
  one this hook made

#### Scenario: Two sessions in one repository

- **WHEN** a second session's turn ends while the first session's mark is the
  most recently written
- **THEN** the second session is decided against its own mark, not the first's

#### Scenario: A turn that commits nothing

- **WHEN** a turn answers a question while a task group stands complete, and
  `HEAD` is where the mark left it
- **THEN** the turn ends, whatever the ledger holds

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
  every box in it, commits, and the ledger holds no runner record for the tip
- **THEN** the hook blocks, because the group was not complete at the mark,
  whether the turn committed it unticked first or not

#### Scenario: A complete group the turn renamed

- **WHEN** a turn renames the heading or the change directory of a group
  already complete at the mark, and the ledger holds no runner record for the
  tip
- **THEN** the hook blocks once, because the group reads as absent at the
  mark — a cost the refusal-once rule bounds to one turn

#### Scenario: The completed group belongs to an archived change

- **WHEN** the only fully ticked group is in a change under
  `openspec/changes/archive/`
- **THEN** the turn ends, because archiving is what retires the obligation

#### Scenario: A pull brings in another pull request's completed group

- **WHEN** a turn on `main` fast-forwards it to `origin/main`, which completes
  a group that was open at the mark, and the ledger holds no runner record for
  the tip
- **THEN** the turn ends, because the group was already complete on
  `origin/main`

#### Scenario: A fetch on main moves the tip to its remote-tracking ref

- **WHEN** a turn on `main` fetches, leaves `HEAD` at the mark, and
  `origin/main` now completes a group
- **THEN** the turn ends, because a tip read from the remote-tracking ref is
  decided like any other

#### Scenario: Main merged into a feature branch

- **WHEN** a turn merges `origin/main` into its branch, the merge brings in a
  group complete there, and the turn completes nothing of its own
- **THEN** the turn ends

#### Scenario: The turn's own group beside a pulled one

- **WHEN** a turn completes a group `origin/main` does not hold complete, and
  also pulls in another group `origin/main` does, and the ledger holds no
  runner record for the tip
- **THEN** the hook blocks, and the reason names the turn's own group and not
  the pulled one

#### Scenario: A repository without origin/main

- **WHEN** no `origin/main` ref exists and a turn completes a group
- **THEN** the hook blocks as it would without this exclusion, because a ref
  that is absent excludes nothing

#### Scenario: A turn that merges its own pull request

- **WHEN** a turn completes a group, pushes, merges its pull request, fetches
  `origin/main`, and the ledger holds no runner record for the tip
- **THEN** the turn ends — the accepted cost, because `origin/main` now holds
  the group complete

#### Scenario: The mark was never written

- **WHEN** `Stop` finds no record of `HEAD` from the start of the turn
- **THEN** the turn ends, because a partial installation must not make the
  session unusable

#### Scenario: The final message cannot be read

- **WHEN** the hook event carries no final assistant message, a turn completed
  a group, and the ledger holds no runner record for the tip
- **THEN** the hook blocks, because it decides on the repository and the
  ledger and reads no text

#### Scenario: There is no repository, or no branch

- **WHEN** the turn ends outside a git repository, or on a `HEAD` that names
  no branch
- **THEN** the turn ends, because no commit of a task group can be in
  question

#### Scenario: A consumer without the registrations

- **WHEN** a consumer's tracked `.claude/settings.json` lacks the `Stop` or
  the `UserPromptSubmit` registration, or carries one that differs from the
  harness's text, is not of type `command`, is narrowed by `if`, or runs in
  a form that cannot block (`async`, `asyncRewake`, `args`, a non-bash `shell`), or the
  settings set `disableAllHooks`
- **THEN** the consumer's check fails and names the registration

#### Scenario: A consumer clone before install

- **WHEN** a prompt arrives or a turn ends in a consumer whose
  `node_modules/harness` is absent
- **THEN** the prompt goes through and the turn ends, with nothing printed

### Requirement: The pre-push hook refuses a push into a ready pull request

Before its other checks, the pre-push hook SHALL refuse a push that updates a
branch on a GitHub remote while that branch has an open pull request that is
not a draft, naming `gh pr ready <n> --undo`, and SHALL refuse one whose pull
requests it cannot read. A branch with no open pull request or a draft one,
and a remote not on GitHub, SHALL pass. This check and the gates' skip
(*The pre-push hook skips the gates a passing run record proved*) alone read
the hook's ref-update records, from one read the hook hands to both.

#### Scenario: A push into a ready pull request

- **WHEN** a push updates `feat/x` on `github.com` and `feat/x` has open pull
  request #7, not a draft
- **THEN** the hook names `gh pr ready 7 --undo`, exits non-zero before
  its gates, and the push does not happen

#### Scenario: A push under another name

- **WHEN** a push sends local `feat/x` to `refs/heads/release`, and `release`
  has an open pull request that is not a draft
- **THEN** the hook refuses, reading the branch from the remote ref

#### Scenario: A push into a draft

- **WHEN** a push updates `feat/x` and its open pull request is a draft
- **THEN** the draft check passes and the hook goes on past it

#### Scenario: A pull request state the hook cannot read

- **WHEN** a push updates a branch on `github.com` and its pull requests
  cannot be read
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A push with nothing to update

- **WHEN** a push finds `origin` already at `HEAD`, so git hands the hook no
  ref-update record
- **THEN** the draft check reads no pull request and passes

#### Scenario: A remote that is not on GitHub

- **WHEN** a push updates a branch of a remote whose URL is a local path
- **THEN** the draft check reads no pull request and passes

### Requirement: The pre-push hook skips the gates a passing run record proved

The one exception to *The pre-push hook runs the gates named here*: the hook
SHALL skip its judged gates when the push updates or deletes no tag and every
commit it lands — each ref-update record's local sha but a deletion's — has a
pre-PR runner record of `project-checks` that passed, made in this checkout,
and none that failed or erred, and SHALL print one line naming those commits.
Otherwise it SHALL run them and print why. The draft check and the diff
budget SHALL run either way. No sha, or an unreadable ledger, skips nothing; a
torn line is no record.

#### Scenario: A head the runner passed

- **WHEN** the ledger holds a passing `project-checks` record of `C` in this
  checkout and a push lands `C`
- **THEN** the hook prints a line naming `C` and saying the gates were
  skipped, runs no gate, and still runs the draft check and the diff budget

#### Scenario: A head the runner did not pass

- **WHEN** the ledger holds no passing `project-checks` record of the commit
  a push lands
- **THEN** the hook prints a line naming the commit and saying why the gates
  run, and runs them

#### Scenario: Another step's pass at the commit

- **WHEN** the ledger holds a passing `diff-budget` record of `C`, a failing
  `project-checks` one, and a draft-check refusal naming `C`, and a push lands
  `C`
- **THEN** the hook runs its gates

#### Scenario: A pass and a later failure of one commit

- **WHEN** the ledger holds a passing and a failing `project-checks` record of
  `C` in this checkout, in either order, and a push lands `C`
- **THEN** the hook runs its gates, since a failure seen before the push is
  one the push does not go past

#### Scenario: Two refs, one unproven

- **WHEN** a push lands `C` and `D`, and only `C` has a passing
  `project-checks` record here
- **THEN** the hook runs its gates

#### Scenario: A push of a commit other than HEAD

- **WHEN** a push lands `C` while `HEAD` is another commit, and `C` has a
  passing `project-checks` record here
- **THEN** the hook skips its gates, since the record is of the commit the
  push lands

#### Scenario: A push that only deletes

- **WHEN** every ref-update record of a push is a deletion, or there is none
  and the input is empty or one blank line
- **THEN** the hook runs its gates

#### Scenario: A tag

- **WHEN** a push updates a ref under `refs/tags/`, annotated or lightweight,
  whose commit has a passing record, or deletes one beside a proven branch
- **THEN** the hook runs its gates, whatever the tag's sha

#### Scenario: A torn line beside a pass

- **WHEN** the ledger holds a passing `project-checks` record of `C` here and
  a line that is not JSON, and a push lands `C`
- **THEN** the hook skips its gates, the torn line counting as no record

#### Scenario: Another checkout of the same commit

- **WHEN** the passing record of `C` names another worktree's top level and
  a push from this checkout lands `C`
- **THEN** the hook runs its gates

#### Scenario: A dirty tree over a proven head

- **WHEN** `HEAD` is `C` with a passing record here, a tracked file has an
  uncommitted edit, and a push lands `C`
- **THEN** the hook skips its gates, since the record proves `C`'s own tree
  and the edit is not pushed

#### Scenario: A ledger the hook cannot read

- **WHEN** the ledger is absent or unreadable and a push lands a commit
- **THEN** the hook runs its gates

### Requirement: The once-per-mark bound is the pre-PR refusal's own

The bound of *A turn that commits reports its gates before it ends* — the hook
refuses at most once per mark — SHALL count the turn gate's refusal for a
missing pre-PR run alone. The same `Stop` hook's refusal for size
(`context-window`) is bounded by its own record once per context, and SHALL
neither use the bound nor be refused by it. That requirement's fail-open
cases — no mark, no repository, a `HEAD` naming no branch — SHALL still end
the turn, a refusal for size included.

#### Scenario: A refusal for size, then a completed group

- **WHEN** a stop is refused for size, and the continued turn completes a task
  group with no passing run of its tip
- **THEN** the hook refuses that turn's next stop for the missing run, a
  second refusal under the same mark

#### Scenario: A refusal for the run, then a full context

- **WHEN** the turn gate refused a stop for a missing run, and the turn's next
  stop measures 850 000
- **THEN** that stop ends the turn, as the refusal promised

#### Scenario: Outside a repository, a full context

- **WHEN** a turn ends outside a git repository, under the empty mark its
  prompt wrote, and the stop measures 850 000
- **THEN** the turn ends, as it does at any size

### Requirement: An allowlist entry the check cannot read approves nothing

Each entry of `harness.suppressions` SHALL hold a `count` that is a whole
number, zero or above, and a `why` holding at least one non-whitespace
character. An entry that does not SHALL approve no suppression, and the check
SHALL fail naming the entry's key and the field, beside every other problem
it reports rather than in place of them. A `count` of `"2"` approves two only
because the comparison coerces it, and one that is not a number at all
compares as `NaN`, which no number of occurrences exceeds — so the entry would
approve every suppression of its marker in that file. An approval with no
reason is a line of the diff a reviewer cannot weigh. A `harness.suppressions`
that is some other value than an object of entries SHALL fail the check as
such, beside the other problems; one that is omitted or `null` fails as every
missing `harness` key does, before any gate reports, since the manifest's
reader treats the two alike as missing.

#### Scenario: An allowlist entry the check cannot read

- **WHEN** `harness.suppressions` holds `"src/model.ts biome-ignore"` with a
  `count` of `"two"`, `-1` or `1.5`, or a `why` that is absent or whitespace,
  and `src/model.ts` carries two occurrences of that marker
- **THEN** the check fails naming
  `harness.suppressions["src/model.ts biome-ignore"]` and the field, and
  reports both occurrences as unapproved
