# pre-pr-runner — delta

## ADDED Requirements

### Requirement: The runner names the steps the branch requires from its diff

The runner SHALL print, as its last line, the ids of the steps the branch
requires before its pull request opens. A branch whose every changed path is a
`*.md` file or lies under `openspec/` is a documentation branch and requires
the project checks, `triage` and `coderabbit-local`. Any other branch is a code
branch and requires `zombies` as well, and `warm` where a path named
`package.json` or `bun.lock` changed. A judgement step's id is its skill's name.

#### Scenario: Markdown alone

- **WHEN** every changed path ends in `.md`
- **THEN** the runner names the project checks, `triage` and
  `coderabbit-local`, and neither `zombies` nor `warm`

#### Scenario: A proposal with one source file

- **WHEN** the changed paths are files under `openspec/` and one `.ts` file
- **THEN** the runner names `zombies` along with the documentation branch's
  steps

#### Scenario: Config alone

- **WHEN** the only changed path is `.coderabbit.yaml`, a workflow or
  `.claude/settings.json`
- **THEN** the runner names the code branch's steps

#### Scenario: A source file moved to Markdown

- **WHEN** the branch renames a `.ts` file to a `.md` file
- **THEN** the runner names `zombies`, since the removed `.ts` path is a
  changed path too

#### Scenario: A lockfile alone

- **WHEN** `bun.lock` changed and `package.json` did not
- **THEN** the runner names `warm`

#### Scenario: A nested manifest

- **WHEN** a `package.json` below the repository root changed
- **THEN** the runner names `warm`

#### Scenario: Nothing past the base

- **WHEN** the branch changes no path
- **THEN** the runner names the documentation branch's steps

#### Scenario: A diff it cannot read

- **WHEN** the changed paths cannot be read
- **THEN** the runner names every step, `warm` included

### Requirement: An open pull request requires the project checks alone

Once the branch's pull request is open, draft or not, the runner SHALL name
the project checks and no judgement step, since the reviewer on the pull
request reviews its head. A read of the pull request that fails SHALL count as
no pull request open.

#### Scenario: A code branch with its pull request open

- **WHEN** the branch changes a `.ts` file and its pull request is open
- **THEN** the runner names the project checks alone

#### Scenario: A merged pull request

- **WHEN** the branch's only pull request is merged or closed
- **THEN** the runner names the steps its diff requires

#### Scenario: The pull request cannot be read

- **WHEN** the read of the branch's pull requests fails
- **THEN** the runner names the steps its diff requires

### Requirement: The runner reads one base for every step

The runner SHALL resolve the base once, when none is passed to it, by the same
rule the diff budget uses when called with none, and SHALL pass that base both
to the diff budget and to the read of the changed paths. A base passed to the
runner SHALL be used for both.

#### Scenario: No base passed

- **WHEN** the runner runs with no argument
- **THEN** the diff budget measures from the base the changed paths are read
  from

#### Scenario: A base passed

- **WHEN** the runner runs with a base `B`
- **THEN** both the diff budget and the changed paths are read against `B`
