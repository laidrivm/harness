# agent-autonomy — delta

## ADDED Requirements

### Requirement: A skill reserved for the user is a `user` step

`core/autonomy.md` SHALL class a skill whose frontmatter carries
`disable-model-invocation: true` as `user` for an unattended session. When its
work needs such a skill, the session SHALL stop that work and report
`BLOCKED`, naming the skill, and SHALL NOT carry out the skill's steps by
other means.

#### Scenario: The work needs a merge through a skill reserved for the user

- **WHEN** an unattended session's work would need a skill whose frontmatter
  carries the flag, and one of that skill's steps merges a pull request
- **THEN** it neither runs the skill nor merges by hand, and reports
  `BLOCKED` naming the skill

## REMOVED Requirements

### Requirement: A skill only the user may start is a `user` step

**Reason**: Its only scenario names `/ship`, which this change deletes, and
OpenSpec refuses a MODIFIED block that drops a scenario.

**Migration**: *A skill reserved for the user is a `user` step* replaces it.
It carries the same text, and its scenario names no skill.
