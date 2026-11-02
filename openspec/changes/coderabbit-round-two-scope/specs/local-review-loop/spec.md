## ADDED Requirements

### Requirement: The review bot reads a change's artefacts for contradictions

The harness's `.coderabbit.yaml` SHALL carry under `reviews.path_instructions`
an entry whose `path` is `openspec/changes/**`. Its `instructions` SHALL call
the file a working artefact headed for the archive, ask for contradictions
with a spec, the code or another artefact, and tell the bot not to flag
wording, duplication or style. They SHALL except a delta spec under a
change's `specs/`, which becomes a living spec at sync. A test SHALL pin the
entry, reading it from the config the bot parses.

#### Scenario: The entry is missing

- **WHEN** `.coderabbit.yaml` carries no `reviews.path_instructions` entry
  whose `path` is `openspec/changes/**`
- **THEN** the test fails, since the bot would review a change's artefacts
  for wording as strictly as code

#### Scenario: The instructions lose their scope

- **WHEN** the entry's `instructions` no longer ask for contradictions with a
  spec, the code or another artefact, no longer tell the bot not to flag
  wording, duplication or style, or no longer except a delta spec
- **THEN** the test fails, naming the phrase that is gone
