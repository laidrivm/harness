## ADDED Requirements

### Requirement: A pending checks read is not a failure

The guard SHALL NOT count a failed Bash call whose command is `gh pr checks`
followed only by plain words — a number, a branch, a flag, `owner/name` —
and at most a trailing `2>&1`, when its error's first line is `Exit code 8`,
which gh documents as *Checks pending*. Every other failure SHALL count as
the requirement *A repeat is the same call failing the same way* says.

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
  fails with
  `Exit code 8` three times the same way
- **THEN** the third failure warns, since the exit code need not be gh's

#### Scenario: Another command exiting 8

- **WHEN** a Bash command other than `gh pr checks` fails with `Exit code 8`
  three times the same way
- **THEN** the third failure warns
