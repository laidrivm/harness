# gate-ledger — delta spec

## MODIFIED Requirements

### Requirement: A record holds no command text

A record SHALL hold the time, the gate, the decision, the rule it applied — a
guard's prohibition id, the turn gate's `pre-pr-sequence`, or the pre-PR
runner's step id — the project and the session, and nothing else, save the
commit the decision read, which a gate that reads one SHALL add and every other
gate SHALL omit. Its counts are copied into a
tracked file of a public repository, and a command line can carry a token or a
machine-local path; a commit id carries neither.

#### Scenario: A blocked push naming a token

- **WHEN** the guard blocks a push whose command line carries a credential
  in a URL
- **THEN** no part of the command line appears in the ledger

#### Scenario: A gate that reads a commit

- **WHEN** the pre-PR runner records a run at commit `C`
- **THEN** the record holds the six fields and the commit `C`, and nothing else

#### Scenario: A gate that reads none

- **WHEN** the command guard records a block
- **THEN** the record holds the six fields and no commit
