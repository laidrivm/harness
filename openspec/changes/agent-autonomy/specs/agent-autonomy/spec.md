# agent-autonomy — delta spec

## ADDED Requirements

### Requirement: A session is attended unless the prompt that started it says otherwise

A session SHALL be unattended only when the prompt or brief that started it
says it runs unattended. Every other session SHALL be attended, and an
attended session SHALL follow every step as its prose is written, markers
included. A marker only says what an unattended session does in place of the
step, and it never relaxes an attended one.

#### Scenario: An attended session reaches the pull request

- **WHEN** a session the user started at the terminal has passed the pre-PR
  sequence
- **THEN** it offers to open the pull request and waits for the user's
  go-ahead, as `core/feature-workflow.md` says, whatever the step's marker
  reads

#### Scenario: A worker whose brief declares it unattended

- **WHEN** an orchestrating session starts a worker with a brief saying the
  worker runs unattended
- **THEN** the worker reads each step it reaches through that step's class

#### Scenario: A brief that says nothing

- **WHEN** a session is started by a prompt that does not say it runs
  unattended
- **THEN** it is attended, and a step that waits on the user waits

### Requirement: Three classes say what an unattended session does at a step that names the user

`core/autonomy.md` SHALL define exactly three classes, `agent`, `card` and
`user`, and SHALL be the only file under `core/` that defines what each lets an
unattended session do:

- `agent`: the session takes the step itself and records what it did in the
  user's stead, in its report or in the pull request's body.
- `card`: the session hands the question on as a worker does in the
  card-questions change, and the work that waits on the answer stops while
  other work goes on.
- `user`: the session neither takes the step nor asks for it on a card. It
  stops the work that needs the step and reports `BLOCKED`, naming the step.

`core/rules.md` SHALL link the doc, so that a consumer's copy of the rulebook
reaches it.

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

#### Scenario: A step that stays with the user

- **WHEN** an unattended session would need a force-push, which is marked
  `user`
- **THEN** it does not push, posts no question asking for one, and reports
  `BLOCKED` naming the force-push

### Requirement: A step on the loop's critical path names its class where it stands

Each step in the harness's prose and gate skills that waits on the user, asks
the user, or hands an act to the user, and that an unattended session reaches
on its way through explore, propose, apply, the pre-PR sequence, opening the
pull request or archive, SHALL carry its class inline at that step, in the
form `(unattended: <class>`. Each marker SHALL name a class that
`core/autonomy.md` defines, and a check SHALL fail on any marker that names
a class it does not define. A step with no marker SHALL read as `card`.
This holds for a step in this harness's prose, in a vendored skill and in an
OpenSpec command alike.

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
