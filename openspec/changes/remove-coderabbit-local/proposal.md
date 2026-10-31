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
  bullet and the `CLI` constant only that case reads.
- `local-review-loop` loses *The CLI review passes the guidelines the PR bot
  reads*, whose only subject was the skill's invocation, and at archive its
  Purpose, which no delta reaches, loses the sentence naming the CLI.
- `local-review-loop`'s shared finding-disposal rules say «the review» or
  «the reviewer» instead of «the bot» (answer 2 а), and the scenario *A
  convention the bot does not know* becomes *A convention the reviewer does
  not know*. A `MODIFIED` block cannot drop a scenario, so its requirement
  is replaced whole under a new name, *A skipped convention becomes a rule,
  a one-off does not*; no test cites it.
- The scenario *A Major finding the bot got wrong* keeps its title, its
  text saying «the review». Renaming it would rename *A verified finding is
  fixed without asking*, which `coderabbit-resolve-fixed-threads` cites by
  name in `agent-autonomy`, and the citation would dangle once both archive.
- *A skipped convention becomes a rule, a one-off does not* says that
  CodeRabbit's review on the pull request reads the docs the rulebook
  indexes, and `/code-review` reads `CLAUDE.md` and `core/rules.md` only,
  where *A justification survives only when it is a convention* said the
  next review reads either.
- *The local review runs after triage and before the push* says the session
  writes the `CODE-REVIEW gate:` line itself whenever a pass of the loop
  returned a review, and none only when no pass did, so a later pass that
  fails leaves an earlier pass's `OPEN` or `BLOCKED` standing; `BLOCKED`
  wins over `OPEN` and `OPEN` over `PASS`. The `/code-review` bullet of
  `core/review-toolkit.md`, whose «the push goes on without the gate» reads
  as no gate line on any failed pass, says the same, and the
  `bun/review-docs.test.ts` case citing *The review does not return* pins
  it.
- `agent-autonomy`'s *A pull request gets CodeRabbit's fixes for at most
  three rounds* applies a third round's fix on the finding-disposal terms
  of *A verified finding is fixed without asking* and *Dismissing a Major or
  above is the user's call*, not on all of the local review's terms.

Out of scope: *The bot's review is worked once it has landed on the head
commit* in `agent-autonomy`, whose «on the terms `local-review-loop` sets»
`coderabbit-resolve-fixed-threads` narrows in its own MODIFIED copy (answer
3 а). Its deltas modify no requirement this change modifies, and the two
`local-review-loop` requirements it cites keep their names, so the two
archive in either order. `core/rules.md` §*The loop* still says a rule in it
or an indexed doc is read back by the next review, and «the bot» of a Minor
the local review raised; the rulebook is every consumer's always-on text,
and a card of its own carries that. `docs/context/pipeline-yield-2026-10.md`
stays as the record it is. `design.md` and `tasks.md` follow on
`spec/remove-coderabbit-local-plan` once this merges, the four artefacts
together being over the diff budget.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: the CLI requirement removed; the gate line's writer
  and its absence on a review that does not return stated; «the bot» in the
  shared disposal rules replaced, one requirement renamed to rename its
  scenario; which review reads the indexed docs corrected.
- `agent-autonomy`: the three-round cap's third round applies fixes on the
  finding-disposal terms alone.

## Impact

- Deleted: `core/skills/coderabbit-local/SKILL.md`,
  `.claude/skills/coderabbit-local`.
- Edited: `.claude/settings.json`, `README.md`, `core/review-toolkit.md`,
  `bun/review-docs.test.ts`, `orchestrator/runner/Dockerfile`,
  `orchestrator/README.md`; by hand at archive, the Purpose of
  `openspec/specs/local-review-loop/spec.md`.
- Consumers: mellon and D2ASS, one card each (link and allow entries); their
  synced `harness/*.md` refresh on the next bump.
- No harness script runs the skill or the CLI; `bun/pre-pr-steps.ts` already
  names `code-review` as the judgement step.
