## MODIFIED Requirements

### Requirement: A repeat is the same call failing the same way

The guard SHALL count a tool call that failed after it started executing, and
only against earlier failures in the same session and the same sub-agent. Two
failures SHALL count as one call repeated only when the tool and its input are
equal, and their error text is equal once runs of digits and of whitespace are
normalised. A call's free-text description SHALL NOT be part of its input. A
call the user or the runtime interrupted SHALL NOT be counted, nor a pending
checks read as *A pending checks read is not a failure* defines it.

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

## ADDED Requirements

### Requirement: A pending checks read is not a failure

The guard SHALL NOT count a failed Bash call whose trimmed command is words
separated by spaces or tabs: `gh`, `pr`, `checks`, then only words of
letters, digits and `./:@=_-`, and at most a last word `2>&1` — when its
error's first line is exactly `Exit code 8`, which gh documents as *Checks
pending*. Any other failure of such a command SHALL count as *A repeat is
the same call failing the same way* says.

#### Scenario: Checks still pending, read four times

- **WHEN** an agent runs `gh pr checks 437` four times under one prompt and
  each run exits 8 with the same output
- **THEN** no warning is added, and the fourth run is not refused

#### Scenario: A repository flag and a redirect

- **WHEN** the command is `gh pr checks 437 -R laidrivm/harness 2>&1` or
  `gh pr checks 437 --repo laidrivm/harness`, and it exits 8 three times the
  same way
- **THEN** none of the three is counted

#### Scenario: A failed check

- **WHEN** `gh pr checks 437` exits 1 three times the same way, because a
  check failed
- **THEN** the third failure warns, as for any other call

#### Scenario: The read inside a compound command

- **WHEN** a command runs `gh pr checks 437` in a pipe, beside a `;`, `&&`
  or newline, inside a substitution or with a quoted word, and the call
  fails with `Exit code 8` three times the same way
- **THEN** the third failure warns, since the exit code need not be gh's

#### Scenario: A word outside the set

- **WHEN** the command is `gh pr checks fix+retry` or
  `gh pr checks 4372>&1`, and it fails with `Exit code 8` three times the
  same way
- **THEN** the third failure warns

#### Scenario: Another command exiting 8

- **WHEN** a Bash command other than `gh pr checks` fails with `Exit code 8`
  three times the same way
- **THEN** the third failure warns
