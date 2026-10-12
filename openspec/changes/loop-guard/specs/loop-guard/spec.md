# loop-guard — delta spec

## Purpose

Stop an agent that keeps repeating the same failing call, with a reason the
session's launcher can read, so that a loop in an unattended session ends
instead of spending the plan's limit.

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

On the third failure of one call, the guard SHALL return a warning to the agent
beside the error and let the turn continue. The warning SHALL name the tool and
the count, and SHALL tell the agent to change approach or to end the turn with
`BLOCKED` naming what only the user can settle.

#### Scenario: Third failure

- **WHEN** a call fails for the third time the same way
- **THEN** the agent reads the warning with the error, and the turn goes on

#### Scenario: Second failure

- **WHEN** a call fails for the second time the same way
- **THEN** the guard says nothing

### Requirement: A repeat past the warning stops the session

On the fourth and every later failure of one call, the guard SHALL end the
session through the hook output that stops processing, with a reason that
starts `loop-guard:` and names the tool and the count. The reason SHALL be the
same text whether a person or a launcher reads it, so a launcher can tell a
loop from every other way a session ends by that prefix alone.

#### Scenario: Fourth failure

- **WHEN** a call fails for the fourth time the same way
- **THEN** the session stops, and its reason starts `loop-guard:`

#### Scenario: Resumed after a stop

- **WHEN** a stopped session is resumed and the same call fails the same way
  again
- **THEN** the session stops again

#### Scenario: The cause is fixed

- **WHEN** a stopped session is resumed after the cause was fixed outside it,
  and the call now succeeds
- **THEN** the guard does nothing

### Requirement: Each warning and stop is recorded in the gate ledger

The guard SHALL record each warning and each stop as one record in the gate
ledger that `openspec/changes/gate-decision-ledger/` defines, through that
ledger's writer and under its requirements *A record holds no command text* and
*Recording never changes a decision*. It SHALL keep no log of its own. A
failure below the warning SHALL NOT be recorded.

#### Scenario: A warning, then a stop

- **WHEN** one call fails four times the same way
- **THEN** the ledger gains a warning and then a stop for the loop guard,
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

- **WHEN** the hook receives an event that is not JSON
- **THEN** it exits 0 with no output

#### Scenario: An unwritable count

- **WHEN** the guard's count cannot be written and a call fails for the fourth
  time
- **THEN** the session is not stopped

### Requirement: Every consumer session runs the guard

The guard SHALL be one of the hooks the harness registers in a consumer's
`.claude/settings.json`, and the consumer check SHALL fail a settings file that
lacks it, as it does for the turn gate. Before the harness is installed, the
registration SHALL exit 0 and decide nothing.

#### Scenario: A consumer without the hook

- **WHEN** a consumer's settings carry every harness hook but this one
- **THEN** the check names the missing hook and the command that writes it

#### Scenario: Before the install

- **WHEN** a call fails in a clone where the harness is not installed yet
- **THEN** the hook exits 0 with no output
