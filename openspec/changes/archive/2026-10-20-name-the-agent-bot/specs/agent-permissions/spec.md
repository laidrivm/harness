# agent-permissions delta

## ADDED Requirements

### Requirement: The rule against writing under the user's name names the App's bot

`core/git-and-prs.md`'s bullet on sending, replying, commenting and reviewing
under the user's name SHALL name the harness's GitHub App,
`laidrivm-harness-agent`, and the login its writes show as,
`laidrivm-harness-agent[bot]`. It SHALL say that the bot writes only from the
board loop's runner or the orchestrator, never from inside a session. The
bullet's prohibition and its refused `gh` writes SHALL stay as they are.

#### Scenario: A pull request the runner opened as the bot

- **WHEN** a reader holds the bullet against a pull request that the runner
  opened as `laidrivm-harness-agent[bot]`, over commits the bot authored
- **THEN** the bullet does not forbid it, because nothing there was written
  under the user's name

#### Scenario: A session that would comment as the bot

- **WHEN** a session, attended or not, would post a comment on its pull
  request
- **THEN** it posts nothing, either as the bot or as the user, because it
  holds no token of the App's and the `gh` writes stay refused; it reports
  what it would have written

#### Scenario: A Major dismissal without the user stays on the card

- **WHEN** an unattended session would dismiss a 🟠 Major or 🔴 Critical
  finding
- **THEN** the dismissal is handed on as a question on the card, and no
  comment from the bot is posted in the pull request

#### Scenario: The bot's name is read from GitHub, not spelt in code

- **WHEN** the tracked files under `bun/` are searched for the App's name as
  the bullet spells it
- **THEN** none holds it, because the runner reads the App's slug from
  GitHub, and the bullet is the only tracked place that writes it
