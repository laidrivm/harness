# task-board — delta

## MODIFIED Requirements

### Requirement: A card can be ranked without opening the repository

Every card short of `done` SHALL carry an English title saying what the change
does, never its slug, and a body opening with a summary in Russian of about
500 characters: what changes, why, and how large it is, longer only for context
the ranking needs, never a restated proposal. The body SHALL end
with links on GitHub to the change's `proposal.md` once merged and to every
pull request it opens, each added in the turn that pull request opens:
by `bun bun/work.ts finish --card` where that call opened the pull request or
found it open (`work-finish`, *Finish records its pull request on the card*), and
by the session otherwise. At archive, the `proposal.md` link SHALL follow the
file to its archived path.

#### Scenario: A card short of done

- **WHEN** the user reads a card at any status before `done`
- **THEN** its title says what the change does, its body opens with a Russian
  summary of about 500 characters, and every pull request the change has
  opened is linked under it

#### Scenario: A summary that carries context

- **WHEN** a card's summary needs a decision the user took, or what the card
  waits on, to be ranked
- **THEN** the summary MAY pass 500 characters to hold it, and still restates
  no proposal

#### Scenario: A pull request finish did not open

- **WHEN** the user opens a pull request for a card by hand
- **THEN** the first turn that learns it exists adds its link, since no
  `finish --card` wrote it
