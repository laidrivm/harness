# agent-permissions — delta

## MODIFIED Requirements

### Requirement: Who may invoke a skill is enforced, not narrated

Where this project restricts who may invoke a vendored skill, the restriction
SHALL be carried by that skill's `disable-model-invocation` frontmatter.
`CLAUDE.md` MUST NOT be the only thing preventing an invocation, and MUST NOT
restate an instruction the skill's own `description` already carries.
A skill under `core/skills/` SHALL carry the flag only when one of its steps
is marked `(unattended: user`. The marker check SHALL fail on a skill that
carries the flag without such a step.

#### Scenario: A skill reserved for the user

- **WHEN** a skill under `core/skills/` has a step that merges a pull request,
  and that step is marked `(unattended: user`
- **THEN** that skill's `SKILL.md` carries `disable-model-invocation: true`

#### Scenario: A flag with no step that stays with the user

- **WHEN** a skill's `SKILL.md` under `core/skills/` carries
  `disable-model-invocation: true` and none of its steps is marked
  `(unattended: user`
- **THEN** `bun test` fails, naming the file

#### Scenario: A skill the agent is meant to run itself

- **WHEN** a skill's `description` already says to run it proactively, as
  `/zombies` and `/warm` do
- **THEN** `CLAUDE.md` carries no "invoke it yourself" clause for it

#### Scenario: A clause that adds information

- **WHEN** this project's trigger or ordering differs from the skill's own
  description, as for `/triage`, or inverts it, as for `/ponytail-review`
- **THEN** the `CLAUDE.md` clause stays
