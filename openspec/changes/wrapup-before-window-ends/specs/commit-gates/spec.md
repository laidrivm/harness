## ADDED Requirements

### Requirement: The once-per-mark bound is the pre-PR refusal's own

The bound of *A turn that commits reports its gates before it ends* — the hook
refuses at most once per mark — SHALL count the turn gate's refusal for a
missing pre-PR run alone. The same `Stop` hook's refusal for size
(`context-window`) is bounded by its own record once per context, and SHALL
neither use the bound nor be refused by it. That requirement's fail-open
cases — no mark, no repository, a `HEAD` naming no branch — SHALL still end
the turn, a refusal for size included.

#### Scenario: A refusal for size, then a completed group

- **WHEN** a stop is refused for size, and the continued turn completes a task
  group with no passing run of its tip
- **THEN** the hook refuses that turn's next stop for the missing run, a
  second refusal under the same mark

#### Scenario: A refusal for the run, then a full context

- **WHEN** the turn gate refused a stop for a missing run, and the turn's next
  stop measures 850 000
- **THEN** that stop ends the turn, as the refusal promised

#### Scenario: Outside a repository, a full context

- **WHEN** a turn ends outside a git repository, under the empty mark its
  prompt wrote, and the stop measures 850 000
- **THEN** the turn ends, as it does at any size
