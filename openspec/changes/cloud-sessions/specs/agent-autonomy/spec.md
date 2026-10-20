# agent-autonomy delta

## ADDED Requirements

### Requirement: A routine's prompt is the declared line and one tracked skill

A routine's prompt SHALL be two lines: `This session runs unattended.`, as
*A session is attended unless the prompt that started it says otherwise*
fixes it, and one call of a skill the repository tracks or its pinned
harness ships, with that skill's parameters. It SHALL hold no step of a
procedure. What the routine does SHALL live in the skill, where it is
reviewed and changed through a pull request like the rest of the tree,
because a routine's prompt is stored outside the repository, where nothing
reviews it and nothing notices it drift. `core/autonomy.md` SHALL state the
rule, and the README's *Cloud sessions* section SHALL point to it.

#### Scenario: The trial routine

- **WHEN** the user creates the harness's trial routine
- **THEN** its prompt is `This session runs unattended.` and, on the next
  line, `/cloud-probe cloud-sessions`, a skill tracked under `core/skills/`
  and its one parameter

#### Scenario: A procedure in the prompt

- **WHEN** a routine's prompt would hold steps — run this, then report that
- **THEN** those steps go into a tracked skill, or into one that exists, and
  the prompt calls it

#### Scenario: A skill the clone does not hold

- **WHEN** a routine's prompt calls a skill installed only on the user's own
  machine
- **THEN** it breaks the rule, because the routine's fresh clone does not
  hold that skill
