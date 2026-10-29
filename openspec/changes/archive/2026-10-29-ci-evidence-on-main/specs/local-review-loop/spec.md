## ADDED Requirements

### Requirement: The review bot's approval is the pull request's one approval

The harness's `.coderabbit.yaml` SHALL set `reviews.auto_approvals.enabled`
to `true`, so the bot approves a pull request only once it has reviewed the
latest commit with every required thread resolved and no pre-merge check
failing, and that approval is the one the `main` ruleset requires. It SHALL
NOT set `reviews.auto_review.drafts` to `true`. A test SHALL pin both,
reading them from the config the bot parses, and SHALL fail when it cannot.

#### Scenario: The config leaves Automatic Approvals off

- **WHEN** `.coderabbit.yaml` sets `reviews.auto_approvals.enabled` to
  anything but `true`, or does not set it, or does not parse, or also sets
  the schema's legacy alias of that key, `reviews.request_changes_workflow`
- **THEN** the test fails, since no approval would come and every agent
  merge would wait on a bypass it does not have

#### Scenario: The config turns draft reviews on

- **WHEN** `.coderabbit.yaml` sets `reviews.auto_review.drafts` to `true`
- **THEN** the test fails, since a draft is pushed to while its work goes
  on and the bot reviews it once it is marked ready

### Requirement: The review bot does not pause on a long pull request

The harness's `.coderabbit.yaml` SHALL set
`reviews.auto_review.auto_pause_after_reviewed_commits` to `0`, since a
paused bot neither reviews nor approves a new head, and an agent identity
has no bypass to merge without that approval. A test SHALL pin it, reading
it from the config the bot parses.

#### Scenario: A pull request past the default pause

- **WHEN** `.coderabbit.yaml` leaves
  `reviews.auto_review.auto_pause_after_reviewed_commits` unset, whose
  default is five, or sets it to anything but `0`
- **THEN** the test fails
