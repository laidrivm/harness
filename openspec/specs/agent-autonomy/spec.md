# agent-autonomy Specification

## Purpose

What a session does when nobody is at the terminal and it reaches a step that
waits on the user, asks the user, or hands an act to the user. It covers how a
session knows it is unattended, the three classes that say what it does at
such a step, and how a step names its class. It exists because the harness's
prose was written for a session with the user present, and an unattended
session would otherwise stall at each such step, or guess which ones it may
take.

## Requirements

### Requirement: A session is attended unless the prompt that started it says otherwise

A session SHALL be unattended only when the prompt or brief that started it
holds the line `This session runs unattended.`, verbatim and on a line of its
own, ignoring whitespace around it. No other wording SHALL make a session
unattended. Every other session
SHALL be attended, and an attended session SHALL follow every step as its
prose is written, markers included. A marker only says what an unattended
session does in place of the step, and it never relaxes an attended one.

#### Scenario: An attended session reaches the pull request

- **WHEN** a session whose starting prompt does not hold the line
  `This session runs unattended.` has passed the pre-PR sequence
- **THEN** it offers to open the pull request and waits for the user's
  go-ahead, as `core/feature-workflow.md` says, whatever the step's marker
  reads

#### Scenario: A worker whose brief declares it unattended

- **WHEN** an orchestrating session starts a worker with a brief that holds
  the line `This session runs unattended.`
- **THEN** the worker reads each step it reaches through that step's class

#### Scenario: A prompt that implies but does not declare

- **WHEN** a session is started by the prompt "Apply agent-autonomy
  overnight, I'm asleep", which lacks the line
- **THEN** it is attended, and a step that waits on the user waits

#### Scenario: A declared line copied from a terminal

- **WHEN** a session is started by a prompt copied from a terminal, which
  indents each line, so the line reads `  This session runs unattended.`,
  or by a prompt whose lines end in a carriage return
- **THEN** it is unattended, because only the whitespace around the line
  differs; a line holding any other text beside the sentence still leaves
  the session attended

### Requirement: Three classes say what an unattended session does at a step that names the user

`core/autonomy.md` SHALL define exactly three classes, `agent`, `card` and
`user`, and SHALL be the only file under `core/` that defines what each lets an
unattended session do:

- `agent`: the session takes the step itself and records what it did in the
  user's stead, in its report or in the pull request's body.
- `card`: the session hands the question on through the card-questions
  change's procedure. The work that waits on the answer stops, and other
  work goes on.
- `user`: the session neither takes the step nor asks for it on a card. It
  stops the work that needs the step and reports `BLOCKED`, naming the step.

A 🟠 Major or 🔴 Critical that the local review left open SHALL NOT hold back
an unattended session's pull request. The finding is left open in either of
two cases:

- the session proposes to dismiss it;
- it is still unresolved after the third pass.

The pull request's body SHALL list each such finding with:

- its severity;
- its file and line;
- what it says;
- for a proposed dismissal, the reason it is proposed;
- for a finding unresolved after the third pass, a statement that it is still
  open.

The gate line SHALL read as `local-review-loop` sets it: `OPEN` over a
proposed dismissal and `BLOCKED` over an unresolved finding. The merge stays
with the user.

`core/rules.md` SHALL link the doc, so that a consumer's copy of the rulebook
reaches it.

#### Scenario: The pull request opens over a proposed dismissal

- **WHEN** an unattended session has passed the pre-PR sequence, and
  `/coderabbit-local` left a 🟠 Major that it proposes to dismiss
- **THEN** it opens the pull request
- **AND** the body names that finding's severity, its file and line, what it
  says, and why dismissal is proposed
- **AND** the gate line reads `OPEN`

#### Scenario: The pull request opens over a Major left unresolved

- **WHEN** an unattended session's third `/coderabbit-local` pass still
  reports a 🟠 Major that no fix resolved and no dismissal was proposed for
- **THEN** it pushes and opens the pull request
- **AND** the body names that finding's severity, its file and line, what it
  says, and that it is still open
- **AND** the gate line reads `BLOCKED`

#### Scenario: A step the agent may take

- **WHEN** an unattended session has passed the pre-PR sequence, and the step
  for opening the pull request is marked `agent`
- **THEN** it opens the pull request, ready for review, and lists what it
  decided in the user's stead under the body's "Check by hand"

#### Scenario: A question that waits on the card

- **WHEN** an unattended session would dismiss a 🟠 Major that `/coderabbit-local`
  raised, and the step is marked `card`
- **THEN** it hands the dismissal on through the card-questions procedure, with
  what the bot missed, and does not settle the dismissal itself
- **AND** if it opens the pull request, the body lists the finding as
  *The pull request opens over a proposed dismissal* sets out

#### Scenario: A step that stays with the user

- **WHEN** an unattended session would need a force-push, which is marked
  `user`
- **THEN** it does not push, posts no question asking for one, and reports
  `BLOCKED` naming the force-push

### Requirement: A step on the loop's critical path names its class where it stands

This requirement covers each step in the docs under `core/` and in the gate
skills that a harness checkout owns, as opposed to vendored skills or
generated OpenSpec commands. It covers a step that waits on the user, asks the
user, or hands an act to the user, and that an unattended session reaches on
its way through explore, propose, apply, the pre-PR sequence, opening the pull
request or archive. Each such step SHALL carry its class inline, at the step,
in the form `(unattended: <class> — <what instead>)`. The text after the dash
SHALL say what an unattended session does at that particular step, and SHALL
NOT be empty. Each marker SHALL name a class that `core/autonomy.md` defines,
and a check SHALL fail on any marker that names a class it does not define.
The check reads the class and nothing more. Whether the text after the dash
fits its step is for review to judge.

A step with no marker SHALL read as `card`, whether it sits in the harness's
own prose, in a vendored skill, or in an OpenSpec command. A step in a
vendored skill or an OpenSpec command is never required to carry a marker.

A prompt or brief that names a stage SHALL be the request that the stage's own
command waits for, such as `/opsx:explore`'s confirmation before it captures a
change, or `/opsx:propose`'s description of the change.

#### Scenario: A marker names an unknown class

- **WHEN** a Markdown file under `core/` carries `(unattended: agnet`
- **THEN** the check fails, naming the file and the class

#### Scenario: A marker that wraps across a line

- **WHEN** a marker's class begins on the line after `(unattended:`
- **THEN** the check reads it as one marker and validates its class

#### Scenario: An ask in an OpenSpec command with no marker

- **WHEN** an unattended session running `/opsx:archive` meets the command's
  own prompt to confirm archiving with tasks incomplete
- **THEN** it treats the prompt as `card`, and does not archive

#### Scenario: The stage's command waits for its request

- **WHEN** an unattended session was started with a brief that says to explore
  and propose a card
- **THEN** `/opsx:explore`'s and `/opsx:propose`'s waits for the user's request
  are met by that brief, and the session writes the change's artefacts without
  asking

### Requirement: A skill reserved for the user is a `user` step

`core/autonomy.md` SHALL class a skill whose frontmatter carries
`disable-model-invocation: true` as `user` for an unattended session. When its
work needs such a skill, the session SHALL stop that work and report
`BLOCKED`, naming the skill, and SHALL NOT carry out the skill's steps by
other means.

#### Scenario: The work needs a merge through a skill reserved for the user

- **WHEN** an unattended session's work would need a skill whose frontmatter
  carries the flag, and one of that skill's steps merges a pull request
- **THEN** it neither runs the skill nor merges by hand, and reports
  `BLOCKED` naming the skill

### Requirement: The bot's review is worked once it has landed on the head commit, never waited for

`/coderabbit` SHALL first read the pull request's head commit, its walkthrough
and its reviews. When no review from the bot is on the head commit, and the
walkthrough does not name it reviewed with no actionable comments, since an
incremental review with no findings submits no review, the run SHALL end with a
`CODERABBIT gate: OPEN` line naming that commit as not yet reviewed, after
that one read, with no sleep and no second read. A run that finds such a
review SHALL dispose of its findings on the terms `local-review-loop` sets for
the local review, and SHALL re-fetch once before its gate line to reconcile
against the bot's count, without sleeping or looping. Each step that waits on
the user SHALL carry an `(unattended: card` marker.

#### Scenario: The head commit has no review yet

- **WHEN** an unattended session runs `/coderabbit` on a pull request whose
  newest bot review is on an earlier commit, and whose walkthrough does not
  name the head commit reviewed with no actionable comments
- **THEN** the run ends on `CODERABBIT gate: OPEN` naming the head commit's
  short SHA, after one read, with no sleep and no second read

#### Scenario: A review lands while the run disposes of the first

- **WHEN** a run finds a review of the head commit, and a second review posts
  while the run is disposing of the first one's findings
- **THEN** the single re-fetch before the gate line finds the second review,
  and its findings are dispositioned before the gate line reads `PASS`

#### Scenario: A landed review with a dismissal

- **WHEN** an unattended session runs `/coderabbit` over a review of the head
  commit, and verifying the findings leaves one fix and one 🟠 Major it would
  dismiss
- **THEN** it applies the fix without asking, hands the dismissal on through
  the card-questions procedure with what the bot missed, and the gate line
  reads `OPEN`

### Requirement: An unattended session runs `/session-wrapup` without waiting on the user

`session-wrapup` SHALL be startable by the model. An unattended session
running it SHALL take each of its steps itself, except one: each capture it
proposes in step 2 is handed on as `card`, and applied by nobody until the
user settles it.

#### Scenario: Wrapping up before the session ends

- **WHEN** an unattended session runs `/session-wrapup` after work that left a
  correction to propose and a card behind its floor
- **THEN** it corrects the card and writes the yield entry, hands the proposed
  correction on as a card question, and ends without waiting for an answer

### Requirement: A session whose launcher pushes names the pull request

Where *Three classes say what an unattended session does at a step that names
the user* has the session push or open the pull request, a session whose
launch form says its launcher pushes for it SHALL push nothing and open
nothing. It SHALL instead end its final message with the title and the body
that pull request would carry, the body as that requirement sets it out, and
SHALL write neither where it would hold the pull request back.

#### Scenario: A board loop step ready for review

- **WHEN** a session the board loop launched passes the pre-PR sequence and
  the step for opening the pull request is marked `agent`
- **THEN** it pushes nothing, and its final message ends with a `PR-TITLE:`
  line and a `PR-BODY:` line with the body below it

#### Scenario: A pull request held back

- **WHEN** such a session ends with a gate line short of `PASS` that holds
  the pull request back
- **THEN** its final message holds no `PR-TITLE:` line

### Requirement: A pull request gets CodeRabbit's fixes for at most three rounds

`core/review-toolkit.md` SHALL cap `/coderabbit` on a pull request at three
rounds that apply fixes. A round is CodeRabbit's review of one commit — a
review whose author's login starts with `coderabbitai`, never one by the
App's `laidrivm-harness-agent[bot]` — and the run SHALL count the rounds from
the pull request's reviews. A run working the fourth round or
a later one, whose review carries a finding the run would apply, SHALL apply
none. It SHALL end on a `CODERABBIT gate: BLOCKED` line that names the cap,
and SHALL report each finding left.

#### Scenario: The third round still gets its fixes

- **WHEN** CodeRabbit's reviews on a pull request name three distinct commits,
  and the head commit's review carries a verified finding
- **THEN** the run applies it on the terms `local-review-loop` sets, as in
  any earlier round

#### Scenario: A fourth round with a finding to apply, attended

- **WHEN** an attended session runs `/coderabbit` on a pull request whose
  CodeRabbit reviews name four distinct commits, and the head commit's review
  carries a verified finding the run would apply
- **THEN** it applies nothing, reports each finding left with its severity,
  file and line, and ends on `CODERABBIT gate: BLOCKED` naming the cap

#### Scenario: A fourth round with a finding to apply, unattended

- **WHEN** an unattended session reaches the same state
- **THEN** it applies nothing, hands the findings left on as one question on
  the card, posts nothing in the pull request, and ends on
  `CODERABBIT gate: BLOCKED` naming the cap

#### Scenario: A fourth round with nothing to apply

- **WHEN** the fourth round's review carries only findings the run skips
  with a reason, as Trivial and Minor may be skipped
- **THEN** the cap does not bite, and the gate line reads as it would in any
  earlier round

#### Scenario: The rounds are counted from the pull request

- **WHEN** a session the orchestrator started runs `/coderabbit` with no
  memory of the earlier rounds
- **THEN** it counts the distinct commits that CodeRabbit's reviews on the pull
  request name, and reaches the same count as a session that ran every round

### Requirement: A routine's prompt is the declared line and one tracked skill

A routine's prompt SHALL be two lines: the line `This session runs
unattended.`, then one call of a skill the repository tracks or its pinned
harness ships, with that skill's parameters. The first line declares the
session unattended as *A session is attended unless the prompt that started
it says otherwise* fixes. The prompt SHALL hold no step of a procedure.
What the routine does SHALL live in the skill, where it is reviewed and changed through a pull request like the rest of the tree,
because a routine's prompt is stored outside the repository, where nothing
reviews it and nothing notices it drift. `core/autonomy.md` SHALL state the
rule, and the README's *Cloud sessions* section SHALL point to it.

#### Scenario: A routine that probes the cloud

- **WHEN** the user creates a routine on the harness that runs `cloud-probe`
- **THEN** its prompt is `This session runs unattended.` and, on the next
  line, `/cloud-probe cloud-sessions`, a skill tracked under `core/skills/`
  and its one parameter

#### Scenario: A procedure in the prompt

- **WHEN** a routine's prompt would hold steps — run this, then report that
- **THEN** those steps go into a tracked skill, or into one that exists, and
  the prompt calls it

#### Scenario: A skill the clone does not hold

- **WHEN** a routine's prompt calls a skill installed only on the user's own
  machine
- **THEN** it breaks the rule, because the routine's fresh clone does not
  hold that skill
