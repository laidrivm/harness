# agent-autonomy delta

## ADDED Requirements

### Requirement: A session whose launcher pushes names the pull request

Where *Three classes say what an unattended session does at a step that names
the user* has the session push or open the pull request, a session whose
launch form says its launcher pushes for it SHALL push nothing and open
nothing. It SHALL instead end its final message with the title and the body
that pull request would carry, the body as that requirement sets it out, and
SHALL write neither where it would hold the pull request back.

#### Scenario: A board loop step ready for review

- **WHEN** a session the board loop launched passes the pre-PR sequence and
  the step for opening the pull request is marked `agent`
- **THEN** it pushes nothing, and its final message ends with a `PR-TITLE:`
  line and a `PR-BODY:` line with the body below it

#### Scenario: A pull request held back

- **WHEN** such a session ends with a gate line short of `PASS` that holds
  the pull request back
- **THEN** its final message holds no `PR-TITLE:` line
