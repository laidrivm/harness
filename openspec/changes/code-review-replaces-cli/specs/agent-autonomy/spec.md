## MODIFIED Requirements

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
  `/code-review` left a 🟠 Major that it proposes to dismiss
- **THEN** it opens the pull request
- **AND** the body names that finding's severity, its file and line, what it
  says, and why dismissal is proposed
- **AND** the gate line reads `OPEN`

#### Scenario: The pull request opens over a Major left unresolved

- **WHEN** an unattended session's third `/code-review` pass still
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

- **WHEN** an unattended session would dismiss a 🟠 Major that `/code-review`
  raised, and the step is marked `card`
- **THEN** it hands the dismissal on through the card-questions procedure, with
  what the reviewer missed, and does not settle the dismissal itself
- **AND** if it opens the pull request, the body lists the finding as
  *The pull request opens over a proposed dismissal* sets out

#### Scenario: A step that stays with the user

- **WHEN** an unattended session would need a force-push, which is marked
  `user`
- **THEN** it does not push, posts no question asking for one, and reports
  `BLOCKED` naming the force-push

