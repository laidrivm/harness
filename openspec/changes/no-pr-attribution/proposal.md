# no-pr-attribution

## Why

`core/git-and-prs.md` says a pull request body "carries no attribution line
at all — no session URL, no run id, no generated-with footer, whatever the
harness offers by default". The board loop's stage session opened #159 with
Claude Code's default footer, `🤖 Generated with [Claude Code](…)`, all the
same. The rule is prose the session reads, but the footer comes from a
setting, and every pull request an unattended session opens would carry it.
The user authorised the settings change on 2026-10-18.

Claude Code's settings reference
(<https://code.claude.com/docs/en/settings-reference>, *Git and
attribution*) names the key: `attribution.pr` sets the text added to a pull
request description, and an empty string hides it. `attribution.sessionUrl`
set to `false` drops the claude.ai session link that cloud and Remote Control
sessions add to a commit and a pull request. Leaving `attribution.commit`
unset keeps the default `Co-Authored-By` trailer, which is the one trailer
`core/git-and-prs.md` asks a commit to carry.

## What Changes

- The policy fixes `attribution` in `.claude/settings.json` as exactly
  `{"pr": "", "sessionUrl": false}`. The check names a settings file whose
  `attribution` is anything else.
- The sync writes that value into a consumer's settings, as it writes the
  permission lists and hooks, so consumers get it on their next bump.
- The harness's own `.claude/settings.json` carries the same value, and a
  test pins it there, since no consumer check reads that file.
- `core/git-and-prs.md` says which setting removes the footer.

## Non-goals

- Changing the commit trailer. `attribution.commit` stays unset, so Claude
  Code keeps writing `Co-Authored-By: <model> <noreply@anthropic.com>`.
- `attribution: false`. It needs Claude Code v2.1.281 or later, and an
  earlier version skips the whole settings file that holds it. It would also
  hide the commit trailer.
- `includeCoAuthoredBy`, which the reference marks deprecated and which
  Claude Code ignores once `attribution.pr` is set.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: gains *Claude Code adds no attribution to a pull
  request body*.
- `harness-updates`: *Sync writes every value the policy check dictates*
  lists the `attribution` setting and gains a scenario for it.

## Impact

- `bun/settings.ts` (the value and its check), `bun/sync-settings.ts` (the
  write), `.claude/settings.json`, `core/git-and-prs.md`, with tests in
  `bun/settings-attribution.test.ts` and `bun/sync-settings.test.ts`.
- This repository's sessions read the tracked `.claude/settings.json` at
  start, so they get it once this merges, with no pin move. A consumer gets
  it from the sync its next bump runs, and until then its check is unchanged.
