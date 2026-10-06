# context-budget Specification

## Purpose

What a session must read before it can start work, how that cost is measured,
and what leaves the always-on files when it grows. It exists because the two
files read at every session start have no shared ceiling and no eviction
route: `CLAUDE.md` had a protocol governing only itself, and `PLAN.md` had
none at all, so the only thing that ever happened to a decision recorded there
was that another one was added below it.

## Requirements
### Requirement: A fence stands where it is stepped on

A deliberate departure from the obvious implementation, or a precondition the
code relies on without checking, SHALL carry a comment at that line. `git
blame` records why a line changed on one occasion; it does not record what must
stay true, and no reader runs `git log -S` before editing. This matters here
because `/ponytail-review` runs over every diff looking for what to cut, and an
unmarked deliberate construction is exactly what such a pass removes.

The rule SHALL be one line in the `CLAUDE.md` rules list, in the sublist that
governs this application's code.

#### Scenario: An unchecked precondition

- **WHEN** a function trusts its input rather than validating it, as
  `computeModel` trusts a well-formed session
- **THEN** a comment at the function says so, and names what is undefined
  behaviour rather than defended against

#### Scenario: A tolerance that looks careless

- **WHEN** an assertion is loose on purpose, as the antisymmetry check is to
  1 dp rather than 1e-6
- **THEN** a comment says why, so the next reader does not tighten it

#### Scenario: A self-evident function

- **WHEN** a function's name and signature already say what it does
- **THEN** no comment is required, and its absence is not a finding

### Requirement: CLAUDE.md is the only file read at every session start

`CLAUDE.md` SHALL name itself as the only file read at the start of every
session and SHALL state the maintenance trigger over its line count: the
trigger fires when `CLAUDE.md` exceeds **~350 lines**. A file indexed from
`CLAUDE.md` is read on demand and SHALL NOT count against the budget. The
`README.md` ownership map SHALL read exactly one file as read every session.

#### Scenario: The trigger fires on the one file

- **WHEN** `CLAUDE.md` exceeds ~350 lines
- **THEN** the trigger has fired, and what it asks for is extraction, promotion
  or deletion — never a second always-on file to carry what `CLAUDE.md` no
  longer holds

#### Scenario: A second file read every session

- **WHEN** the `README.md` ownership map reads a file other than `CLAUDE.md` as
  read every session
- **THEN** the check over that map fails, naming the file

### Requirement: A fact with no status is written where its reader looks

A fact that is not a status, recorded so that a later session does not reopen
it, SHALL be written at every site below that applies, the sites tested in
order:

1. a card, if it is a task;
2. a comment at the line, if it is a fence;
3. the owning spec, through a change, if it is behaviour;
4. `openspec/config.yaml` `context:`, if it is an architecture default;
5. `CLAUDE.md` or the indexed doc whose trigger matches, if it is a rule or a
   contract.

A fact the archive records SHALL be written nowhere new. An archived change
SHALL NOT be edited to receive one.

#### Scenario: An architecture default

- **WHEN** the fact is a project-wide architecture choice, such as STRATZ
  rather than OpenDota as the statistics source
- **THEN** it is written in `openspec/config.yaml` `context:`, which is read
  when a proposal is drafted — the moment someone would propose replacing it

#### Scenario: A fact its owner already states

- **WHEN** an owning site already says it, as `CLAUDE.md`'s stack line says
  Preact and Bun's bundler
- **THEN** nothing new is written

#### Scenario: A fact no site owns

- **WHEN** a fact fits none of the five sites
- **THEN** it SHALL be brought to the user, and no file SHALL be created to
  hold it — a file admitting whatever nothing else owns is what `PLAN.md` was
