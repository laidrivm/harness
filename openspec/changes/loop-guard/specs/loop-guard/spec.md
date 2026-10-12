# loop-guard — delta spec

## Purpose

Refuse a call an agent keeps repeating after it failed the same way, with a
reason the agent and the session's launcher can both read. A loop in an
unattended session then stops spending the plan's limit on that call.

## ADDED Requirements

### Requirement: A repeat is the same call failing the same way

The guard SHALL count a tool call that failed after it started executing, and
only against earlier failures in the same session and the same sub-agent. Two
failures SHALL count as one call repeated only when the tool and its input are
equal, and their error text is equal once runs of digits and of whitespace are
normalised. A call's free-text description SHALL NOT be part of its input. A
call the user or the runtime interrupted SHALL NOT be counted.

#### Scenario: The same command fails the same way three times

- **WHEN** an agent runs one Bash command three times in a session and each
  run fails with the same error, apart from a duration in its output
- **THEN** the third failure counts as the third of one call

#### Scenario: A different error

- **WHEN** a test command fails, the agent edits code, and the same command
  fails again with a different error
- **THEN** each failure starts its own count

#### Scenario: A different input

- **WHEN** an edit fails three times, each time with a different anchor text
  and the same error
- **THEN** no count passes one

#### Scenario: Only the description differs

- **WHEN** one command fails twice with the same error and a different
  description each time
- **THEN** the second failure counts as the second of one call

#### Scenario: A sub-agent and its parent

- **WHEN** a sub-agent and the session that launched it each fail once on the
  same call with the same error
- **THEN** neither count passes one

#### Scenario: A call rejected before it runs

- **WHEN** a call fails input validation, is denied permission, or is blocked
  by a `PreToolUse` hook, three times the same way
- **THEN** none of the three is counted, since none started executing

#### Scenario: An interrupted call

- **WHEN** a call ends as an interruption rather than as an error the tool
  reported
- **THEN** it is not counted

### Requirement: The third repeat warns the agent

On the third and every later failure of one call, the guard SHALL add a warning
to the agent's context beside the error and let the turn continue. The warning
SHALL name the tool and the count, SHALL say that the next identical call will
be refused, and SHALL tell the agent to change approach or to end the turn with
`BLOCKED` naming what only the user can settle.

#### Scenario: Third failure

- **WHEN** a call fails for the third time the same way
- **THEN** the agent reads the warning with the error, and the turn goes on

#### Scenario: Second failure

- **WHEN** a call fails for the second time the same way
- **THEN** the guard says nothing

### Requirement: A thrice-failed call is refused before it runs

Once a call has failed the same way three times, the guard SHALL refuse the
same tool with the same input before it runs, for as long as the prompt that
was being processed at the third failure is still being processed. The refusal SHALL give a reason that starts
`loop-guard:` and names the tool and the count, so an agent, a person or a
launcher can tell it from any other refusal by that prefix alone. The guard
SHALL NOT end the session.

#### Scenario: The fourth identical call

- **WHEN** a call has failed three times the same way and the agent makes it
  a fourth time
- **THEN** the call does not run, and the agent reads a reason that starts
  `loop-guard:`

#### Scenario: A different input after the warning

- **WHEN** one call has failed the same way three times, and the agent makes a
  call with a different input
- **THEN** that call runs

#### Scenario: A new prompt

- **WHEN** a person or a launcher sends a new prompt after the refusal, and
  the agent makes the identical call again
- **THEN** the call runs

#### Scenario: Fails again after a new prompt

- **WHEN** that call, run again under the new prompt, fails the same way once
  more
- **THEN** it is warned and refused again, under the new prompt

#### Scenario: A sub-agent's refused call

- **WHEN** a call has failed the same way three times in a sub-agent, and the
  session that launched it makes the identical call
- **THEN** that call runs

#### Scenario: The agent keeps calling

- **WHEN** the agent makes the refused call again and again
- **THEN** each one is refused, and the session goes on until the agent or
  its launcher ends it

### Requirement: Each warning and refusal is recorded in the gate ledger

The guard SHALL record each warning and each refusal as one record in the gate
ledger that `openspec/changes/gate-decision-ledger/` defines, through that
ledger's writer and under its requirements *A record holds no command text* and
*Recording never changes a decision*. It SHALL keep no log of its own. A
failure below the warning SHALL NOT be recorded.

#### Scenario: A warning, then a refusal

- **WHEN** one call fails three times the same way and is then made a fourth
  time
- **THEN** the ledger gains a warning and then a refusal for the loop guard,
  both under one rule id, and no part of the call's input or error

#### Scenario: A first failure

- **WHEN** a call fails once
- **THEN** the ledger is unchanged

### Requirement: The guard fails open

Whatever the guard cannot read or write SHALL decide nothing: an event that is
not JSON, one with no usable session id, or a count it cannot read SHALL leave
the turn to go on as if the guard were absent. Its count SHALL hold nothing
from which a call's input or error can be read back.

#### Scenario: An unreadable event

- **WHEN** either hook receives an event that is not JSON
- **THEN** it exits 0 with no output

#### Scenario: An unwritable count

- **WHEN** the guard's count cannot be written and a call fails for the third
  time the same way
- **THEN** the fourth identical call runs

#### Scenario: An unreadable count before a call

- **WHEN** the count file holds something that is not the guard's JSON and a
  call is about to run
- **THEN** the call runs

### Requirement: Every consumer session runs the guard

The guard's hooks SHALL be among those the harness registers in a consumer's
`.claude/settings.json`, and the consumer check SHALL fail a settings file that
lacks either, as it does for the turn gate. Before the harness is installed,
each registration SHALL exit 0 and decide nothing.

#### Scenario: A consumer without the hooks

- **WHEN** a consumer's settings carry every harness hook but this guard's
- **THEN** the check names each missing hook and the command that writes it

#### Scenario: Before the install

- **WHEN** a call is made or fails in a clone where the harness is not
  installed yet
- **THEN** each hook exits 0 with no output
