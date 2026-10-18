# agent-autonomy — delta spec

## MODIFIED Requirements

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
