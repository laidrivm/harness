## MODIFIED Requirements

### Requirement: The reviewable unit is the step, not the proposal

WHEN a change's `tasks.md` holds more than one task group, the project SHALL
ship it as a sequence of pull requests, one per group, on `feat/<slug>-<step>`
branches. A change whose `tasks.md` holds exactly one group SHALL ship as a
single `feat/<slug>` pull request. A group that holds an unticked box after
its pull request merged SHALL ship that box in one more pull request, on the
retry branch `git-and-prs.md` names, never on the merged branch.

#### Scenario: A proposal with four task groups

- **WHEN** a change's `tasks.md` contains four `## <n>. <group>` headings
- **THEN** the agent opens four pull requests, each on its own
  `feat/<slug>-<step>` branch, in the order the groups appear
- **AND** it does not open one pull request carrying all four

#### Scenario: A single-group change

- **WHEN** a change's `tasks.md` contains one task group
- **THEN** the whole change ships on one `feat/<slug>` branch

#### Scenario: A task added to a merged group

- **WHEN** a task is added to group 4 after the pull request on
  `feat/<slug>-4` merged
- **THEN** that task ships in a pull request on `feat/<slug>-4-2`
