# gate-ledger — delta spec

## ADDED Requirements

### Requirement: A prompt a guard asks for is recorded

When the command guard answers `ask` rather than blocking, it SHALL append one
record whose decision is `ask` and whose rule is the id of the reason it asked
for, under *Each prohibition has a stable id*. One command is one record, so a command
that would be asked about for two reasons is recorded under the first reason
the guard read. A command the guard also blocks is recorded only as the block,
because the block is the decision Claude Code acts on.

#### Scenario: Inline code asked about

- **WHEN** the guard answers `ask` for `python3 -c "print(1)"`
- **THEN** the ledger gains one record naming the guard, `ask`, and the
  inline-code id, and no part of the command line

#### Scenario: A prompt overtaken by a block

- **WHEN** `HEAD` is on `main` and the guard reads `python3 -c "print(1)"; git
  commit -m fix`
- **THEN** the ledger gains the `main-commit` block and no `ask` record
