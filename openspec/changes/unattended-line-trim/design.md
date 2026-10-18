# unattended-line-trim — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/agent-autonomy/spec.md` and `specs/agent-permissions/spec.md`.
`question-gate-reason`'s design (archived, decision 2) had the gate split the
first prompt on newlines and look for one line exactly equal to the declared
one. Its `/zombies` idea [9] pinned a trailing space as attended.

## Decisions

### 1. Each line is compared trimmed

The gate compares `line.trim()` with the declared line. A line holding the
sentence with only whitespace around it declares the session. A line with
any other text on it still does not.

- `String.prototype.trim` strips every Unicode whitespace character and line
  terminator, not only spaces, tabs and `\r`. A non-breaking space or an
  ideographic space around the sentence therefore also counts. That is
  accepted: neither one changes what the line says, and a prompt pasted from
  a rich-text source can carry one.
- The split stays on `\n`, so a CRLF prompt's lines end in `\r`, and the trim
  removes it.
- **Rejected: stripping only leading spaces**, the one shape the live check
  met. A tab or a trailing `\r` comes from the same copy-and-paste paths, and
  one rule for both ends is simpler to state.
- **Rejected: matching the sentence anywhere in the prompt.** A session
  reading its brief aloud, or a prompt quoting the line, would then declare
  itself unattended. Requiring the sentence alone on its line keeps the
  declaration deliberate.

### 2. The spec says it in both capabilities

`agent-autonomy` fixes the declared line, so its requirement says "ignoring
whitespace around it" and gains the terminal-copy scenario. The
`agent-permissions` scenario that names the line says the same, so neither
reads as stricter than the other.
