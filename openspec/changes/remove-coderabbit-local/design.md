# Design — remove-coderabbit-local

## Context

Read against main at `cc6a146`. `code-review-replaces-cli` (archived
2026-10-28) made `/code-review high` step 5 of the pre-PR sequence and kept
`/coderabbit-local` as an on-demand skill (its decision 6). What still names
the skill or the CLI on main, outside the archive and
`docs/context/pipeline-yield-2026-10.md`:

| Path | What |
|---|---|
| `core/skills/coderabbit-local/SKILL.md` | the skill |
| `.claude/skills/coderabbit-local` | the harness's tracked link to it |
| `.claude/settings.json` | `Skill(coderabbit-local)`, `Bash(coderabbit --version)`, `Bash(coderabbit doctor *)`, `Bash(coderabbit review *)` |
| `README.md` | the skills table row |
| `core/review-toolkit.md` | the `/coderabbit-local [base]` bullet |
| `bun/review-docs.test.ts` | the `CLI` constant and the case pinning that bullet |
| `openspec/specs/local-review-loop/spec.md` | Purpose, *The CLI review passes the guidelines the PR bot reads* |
| `orchestrator/runner/Dockerfile` | `CODERABBIT_VERSION` and the CLI install |
| `orchestrator/README.md` | the `coderabbit auth login` step |

`skills-lock.json` lists only `playwright-cli`, so it has no entry to drop.
`bun/sync.ts` writes no skill link and no `allow` entry into a consumer, so
nothing there names the skill. No harness script, workflow or hook runs the
CLI.

## Goals / Non-Goals

**Goals**

- No skill, link, permission, image layer or doc step for the CodeRabbit CLI
  remains in the harness.
- `local-review-loop` and `agent-autonomy` say of the local review only what
  `/code-review` does: items 2–5 and 7 of the card's *Explore 2026-10-31*.

**Non-goals**

- `agent-autonomy`'s *The bot's review is worked once it has landed on the
  head commit* (item 1 of the explore): `coderabbit-resolve-fixed-threads`
  narrows its «on the terms `local-review-loop` sets» in its own `MODIFIED`
  copy (answer 3 а). Two `MODIFIED` copies of one requirement would have the
  later archive revert the earlier.
- `core/rules.md` §*The loop* still says «a settled project convention the
  bot cannot know» of a Minor the local review raised. The user's answer 2 а
  covers the spec; the rulebook is always-on text every consumer syncs, and
  is left for its own card.
- Changing a consumer's tree. mellon and D2ASS each get a card instead
  (*Consumers*).

## Decisions

1. **The skill goes whole** (answer 1, 2026-10-31). Its `coderabbit doctor`
   preflight — the explore's item 6 and question 1 — goes with it, so no
   spec or test needs to pin it. The CLI's permission entries go too: with
   no skill to run it, an allowed `coderabbit review` is a command nobody is
   meant to run.

2. **No CLI on the host either.** The runner image installs the CLI only for
   `/coderabbit-local`, and `orchestrator/README.md` authenticates it for the
   same reason. Both go, which closes the roadmap's open question 5
   («CodeRabbit CLI на хосте — отдельно, по итогам карточки ротации
   ревьюеров»): there is no CLI to put on the host. The reviewer-rotation
   card on the Harness board, *Поменять агента-ревьюера с одного coderabbit
   на ротацию нескольких* (done), listed the Dockerfile and the README step
   among step 2's edits; its remaining subject is CodeRabbit on the pull
   request, in CI, not the CLI, and the card says so from 2026-10-31 at the
   user's request. `host-deploy` edits other steps of
   `orchestrator/README.md` (its task 4.1 adds one after step 11), so the
   two merge without a textual clash, though whichever lands second merges
   `origin/main` first.

3. **Renaming a scenario replaces its requirement.** `openspec validate
   --strict` refuses a `MODIFIED` block that omits a scenario the live spec
   has, and a renamed scenario reads as one omitted and one added. So *A
   verified finding is fixed without asking* and *A justification survives
   only when it is a convention* are `REMOVED` and re-`ADDED` whole as *A
   verified finding is applied without asking* and *A skipped convention
   becomes a rule, a one-off does not*, as `code-review-replaces-cli` did
   for *The gate runs after triage and before the push*. No test cites a
   scenario of either (`git grep 'spec: local-review-loop/'`), so the
   coverage floor sees the same counts. The other three requirements that
   say «the bot» keep their scenario titles and are `MODIFIED`.

4. **«The review» or «the reviewer», not «the bot», in the shared disposal
   rules** (answer 2 а). Those requirements hold for `/code-review` locally
   and, through the toolkit's `/coderabbit` bullet, for CodeRabbit on the
   pull request; «the review» names both. The requirements that pin
   `.coderabbit.yaml` keep «the bot», which is CodeRabbit there.

5. **The session writes the gate line; a review that does not return gets
   none.** `/code-review` prints no gate line, so the toolkit has the session
   write `CODE-REVIEW gate: PASS|OPEN|BLOCKED — …`; the spec now says so in
   its requirement and in *The session writes the gate line*, and the
   toolkit case at `bun/review-docs.test.ts` that pins the sentence cites
   it. For a review that does not return the toolkit says «the push goes on
   without the gate»: no line is written. A `BLOCKED` line there would hold
   the pull request back, since `core/autonomy.md` opens it when every gate
   line present reads `PASS`, which contradicts «rather than blocking the
   branch». Nothing in `bun/` parses `CODE-REVIEW`. The toolkit sentence
   gains «and the session writes no `CODE-REVIEW gate:` line», so the case
   citing *The review does not return* can pin it.

6. **`agent-autonomy`'s three-round cap is a different requirement from the
   one resolve-threads owns.** Explore item 2 sits in *A pull request gets
   CodeRabbit's fixes for at most three rounds* (scenario *The third round
   still gets its fixes*), which `coderabbit-resolve-fixed-threads` does not
   modify (its `agent-autonomy` delta holds only *The bot's review is worked
   once it has landed…*). So this change narrows it, in the toolkit's words:
   the finding-disposal terms, not the local review's base, changed-file
   check, grading or gate line.

7. **The Purpose of `local-review-loop` is edited by hand at archive.** No
   delta reaches it; it drops «which guidelines CodeRabbit's CLI reads when a
   session runs `/coderabbit-local` by hand», as `code-review-replaces-cli`
   task 2.5 rewrote it.

## Consumers

`gh api repos/<repo>/git/trees/HEAD?recursive=1` and `gh search code` on
2026-10-31:

- **mellon** (`laidrivm/mellon`): `.claude/skills/coderabbit-local` →
  `../../node_modules/harness/core/skills/coderabbit-local`;
  `.claude/settings.json` allows `Skill(coderabbit-local)`, `Bash(coderabbit
  --version)`, `Bash(coderabbit doctor *)`, `Bash(coderabbit review *)`; its
  synced `harness/review-toolkit.md` and `harness/autonomy.md` predate
  `code-review-replaces-cli` and refresh on the next bump.
- **D2ASS** (`laidrivm/dota2`): the same link and the same four entries.

Once a consumer's pin passes this change, `bun/check.ts`'s `links` reports
the link as holding no `SKILL.md` and the bump fails, as it already does on
links to other deleted skills. Removing the link and the entries first is
safe at any pin: the skill is then simply not loaded. One card on each
board, status `idea`, names the removal.

## Risks / Trade-offs

- [The `MODIFIED` copy of *The local review runs after triage and before the
  push* is long, and another change may modify it before this one archives]
  → re-copy it from main right before archive and re-apply this change's
  three edits.
- [A consumer's bump fails until its card is done] → the cards exist before
  this change merges; the failure names the link, so it is not silent.
- [A session somewhere still runs `/coderabbit-local` from memory] → the
  skill is gone, so the call fails visibly rather than running a reviewer no
  gate reads.
