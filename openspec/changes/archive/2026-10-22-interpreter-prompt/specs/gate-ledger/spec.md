# gate-ledger — delta spec

## ADDED Requirements

### Requirement: An interpreter the guard refuses is recorded once

When the command guard refuses an interpreter given program text it cannot
read, it SHALL append one record whose decision is `block` and whose rule is
the id of the reason it refused, under *Each prohibition has a stable id*. One
command is one record, so a command refused for two interpreters is recorded
under the first reason the guard read. A command that a git or `gh`
prohibition also refuses is recorded only under that prohibition, because the
guard decides the interpreter refusal last.

#### Scenario: Inline code refused

- **WHEN** the guard refuses `python3 -c "print(1)"`
- **THEN** the ledger gains one record naming the guard, `block`, and the
  inline-code id, and no part of the command line

#### Scenario: An interpreter refusal overtaken by a git block

- **WHEN** `HEAD` is on `main` and the guard reads `python3 -c "print(1)"; git
  commit -m fix`
- **THEN** the ledger gains the `main-commit` block and no inline-code record
