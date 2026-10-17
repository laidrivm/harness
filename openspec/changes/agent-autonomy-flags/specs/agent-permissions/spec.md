# agent-permissions — delta spec

## MODIFIED Requirements

### Requirement: Who may invoke a skill is enforced, not narrated

Where this project restricts who may invoke a vendored skill, the restriction
SHALL be carried by that skill's `disable-model-invocation` frontmatter.
`CLAUDE.md` MUST NOT be the only thing preventing an invocation, and MUST NOT
restate an instruction the skill's own `description` already carries.
A skill whose run only reads, reports, or applies the fixes the review policy
already lets the agent apply SHALL NOT carry the flag, so that an unattended
session can run it.

#### Scenario: A skill reserved for the user

- **WHEN** a skill's run merges a pull request, as `/ship`'s does
- **THEN** `ship/SKILL.md` carries `disable-model-invocation: true`

#### Scenario: A review skill the agent runs itself

- **WHEN** a skill only reads and reports, or applies verified review
  findings, as `/coderabbit`, `/first-five`, `/pr-brief` and `/review-order`
  do
- **THEN** its `SKILL.md` frontmatter does not set
  `disable-model-invocation` to `true`, and `bun test` fails if it does

#### Scenario: A skill the agent is meant to run itself

- **WHEN** a skill's `description` already says to run it proactively, as
  `/zombies` and `/warm` do
- **THEN** `CLAUDE.md` carries no "invoke it yourself" clause for it

#### Scenario: A clause that adds information

- **WHEN** this project's trigger or ordering differs from the skill's own
  description, as for `/triage`, or inverts it, as for `/ponytail-review`
- **THEN** the `CLAUDE.md` clause stays
