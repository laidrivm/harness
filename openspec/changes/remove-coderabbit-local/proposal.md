# remove-coderabbit-local

## Why

`code-review-replaces-cli` made `/code-review high` the local review on
2026-10-27 and kept `/coderabbit-local` as a skill a session may run on
request, in no sequence and no gate. Nobody runs it, and on 2026-10-31 the
user decided to delete it whole rather than clean its text (card *Clean
local-review-loop and agent-autonomy of what the CLI-era text still says
about the local review*, answer 1: «Я бы вообще скилл /coderabbit-local
целиком удалил, раз переезжаем на /code-review»). The CodeRabbit CLI is then
used nowhere. The same card lists the CLI-era text the two specs still
carry: the shared finding-disposal rules say «the bot» where the local
reviewer is `/code-review`, a requirement claims the next review reads the
docs the rulebook indexes, which `/code-review` does not, and two scenarios
leave unsaid who writes the `CODE-REVIEW gate:` line and whether one is
written when the review does not return.

## What Changes

- **BREAKING** for a consumer that links it: `core/skills/coderabbit-local/`
  is deleted, with the harness's own `.claude/skills/coderabbit-local` link,
  its `Skill(coderabbit-local)` allow entry and the `Bash(coderabbit
  --version)`, `Bash(coderabbit doctor *)` and `Bash(coderabbit review *)`
  entries in `.claude/settings.json`. A consumer's tracked link to it would
  dangle once its pin passes this change, and `bun/check.ts` fails a dangling
  skill link, so its bump would fail. mellon and D2ASS link it; each gets a
  card on its own board to remove the link and the entries first.
- The runner image stops installing the CodeRabbit CLI
  (`orchestrator/runner/Dockerfile`) and `orchestrator/README.md` drops the
  `coderabbit auth login` step.
- `core/review-toolkit.md` loses the `/coderabbit-local` bullet; `README.md`
  loses its table row; `bun/review-docs.test.ts` loses the case pinning that
  bullet.
- `local-review-loop` loses *The CLI review passes the guidelines the PR bot
  reads*, whose only subject was the skill's invocation.
- `local-review-loop`'s shared finding-disposal rules say «the review» or
  «the reviewer» instead of «the bot» (answer 2 а); the scenarios *A Major
  finding the bot got wrong* and *A convention the bot does not know* are
  renamed to match. No test cites either. A `MODIFIED` block cannot drop a
  scenario, so the two requirements holding them are replaced whole under
  new names: *A verified finding is applied without asking* and *A skipped
  convention becomes a rule, a one-off does not*.
- The second of those says that CodeRabbit's review on the pull request
  reads the docs the rulebook indexes, and `/code-review` reads `CLAUDE.md`
  and `core/rules.md` only, where *A justification survives only when it is
  a convention* said the next review reads either.
- *The local review runs after triage and before the push* says the session
  writes the `CODE-REVIEW gate:` line itself, in a new scenario, and *The
  review does not return* says the session writes no gate line there.
- `agent-autonomy`'s *A pull request gets CodeRabbit's fixes for at most
  three rounds* applies a third round's fix on the finding-disposal terms
  `local-review-loop` sets, not on all of the local review's terms.

Out of scope: *The bot's review is worked once it has landed on the head
commit* in `agent-autonomy`, whose «on the terms `local-review-loop` sets»
`coderabbit-resolve-fixed-threads` narrows in its own MODIFIED copy (answer
3 а). Its deltas modify no requirement this change modifies, so the two
archive in either order. `docs/context/pipeline-yield-2026-10.md`
stays as the record it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: the CLI requirement removed; the gate line's writer
  and its absence on a review that does not return stated; «the bot» in the
  shared disposal rules replaced, two requirements renamed to rename their
  scenarios; which review reads the indexed docs corrected.
- `agent-autonomy`: the three-round cap's third round applies fixes on the
  finding-disposal terms alone.

## Impact

- Deleted: `core/skills/coderabbit-local/SKILL.md`,
  `.claude/skills/coderabbit-local`.
- Edited: `.claude/settings.json`, `README.md`, `core/review-toolkit.md`,
  `bun/review-docs.test.ts`, `orchestrator/runner/Dockerfile`,
  `orchestrator/README.md`.
- Consumers: mellon and D2ASS, one card each (link and allow entries); their
  synced `harness/*.md` refresh on the next bump.
- No harness script runs the skill or the CLI; `bun/pre-pr-steps.ts` already
  names `code-review` as the judgement step.
