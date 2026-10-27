# code-review-replaces-cli — design

## Context

See proposal.md — *Why*. `core/review-toolkit.md` is still the one place that
says when the local review runs (step 5, the documentation-branch path) and on
what terms its findings are disposed of (the `/coderabbit-local` bullet, which
the `/coderabbit` bullet borrows). The only code that names the step is
`bun/pre-pr-steps.ts`: `CODERABBIT_LOCAL` in `JUDGEMENT`, which the runner
prints on its last line and `work.ts finish` will check the gate ledger
against. The `Skill` hook of `judgement-step-record` (in flight on
`feat/judgement-step-record-1`) records every skill call by
`tool_input.skill`, so a `/code-review` call becomes a record with `rule:
"code-review"` without that change knowing this one.

The archived `local-review-before-pr` set step 2 aside for this change
(design.md there, *Non-Goals*): replacing the CLI, the `--json-schema` form
with its `severity` enum, and `orchestrator/runner/Dockerfile` and
`orchestrator/README.md` losing the CLI.

## Goals / Non-Goals

**Goals:** `/code-review high` is the local review wherever
`/coderabbit-local` was, on the same terms; the measurement is gone from the
doc, the spec and the tests; the runner names the new step.

**Non-Goals:** the `--json-schema` run and the runner launching the reviewer
itself (stage 2, *Потом* item 4); posting arguments (their own card); the CLI
leaving the runner's image, which `host-deploy` (open, `orchestrator`) and the
kept skill both bear on; the subagents' brief, which lives outside this tree
and which the session that writes it owns.

## Decisions

1. **The invocation is `/code-review high`, over the runner's diff.** `high`
   is named because `/code-review` with no level reuses the last one typed,
   which a later session cannot know. No `--comment`, no `--fix`, no `ultra`
   or `--post`: the first and the last post under the user's name on the
   pull request, which has none yet, and `--fix` applies findings before they
   are verified, which the disposal policy forbids. Refusing the posting
   arguments by a hook is the card *Refuse posting arguments to /code-review
   in a PreToolUse hook on Skill*, after the roadmap. With no target the
   skill diffs against the local `main` (its own run on this branch said
   so), which in a worktree or a long-lived checkout trails `origin/main`:
   on this branch that diff held 209 files where the branch changes 7. The
   review must read the diff the runner measured, in the tree the branch is
   checked out in, so the session names that base, and a clone's path where
   it works in a clone outside its working directory. Which argument form
   the skill reads as a base and which as a tree was not probed; task 2.1
   probes it before the doc names it.
2. **The session runs it itself, not a fresh subagent, records no SHA, and
   checks the files.** The fresh subagent and the SHA were the measurement's:
   one held the two lists comparable, the other caught a subagent that
   reviewed the main checkout instead of the branch (the card's caveat). The
   user dropped the SHA (answer 1 а, *можно без записи sha*) because since
   #320 a subagent works in its own worktree. What stays is the cheap half
   of the old guard: a review naming a file the branch's diff does not change
   read another tree or another base, and counts as a review that does not
   return. It costs one `git diff --name-only` and catches both decision 1's
   stale base and a session in a clone. *Alternative: keep the fresh
   subagent* — rejected: it reopens which tree the subagent reads, the
   caveat the user closed, and "Claude reviews Claude" is held where the
   card's option 1 put it, by CodeRabbit on the pull request.
3. **The disposal terms move unchanged, the session grading each
   finding.** Apply every verified finding without asking, put a
   Major-or-above dismissal to the user, at most three reviews stopping at
   one with nothing above Minor, Minor findings reported once.
   `/code-review` reports each finding as a file, a line, a summary and a
   failure scenario — no severity and no kind, as its run on this branch
   showed. So the session grades each finding on the ladder the `coderabbit`
   skill reads, 🔵 Trivial < 🟡 Minor < 🟠 Major < 🔴 Critical, while it
   verifies it, and disposes of it on that grade; the report names the
   grade beside each finding, so a dismissal's grade can be read back. The
   user chose this on 2026-10-27 (in chat, replacing the card's answer 4 а
   with б: *если агент будет приносить мне 5 вопросов на одно ревью — пусть
   сессия сама решает, что major, а что minor*). *Alternative: every finding
   counts as 🟠 Major* — the card's first answer, withdrawn: it puts every
   dismissal to the user, five questions for one review. *Alternative: wait
   for the `--json-schema` run* — it needs the runner to launch the
   reviewer.
4. **The session writes the gate line.** The built-in skill ends on no
   `GATE:` line, and `bun/turn-gate.ts` asks for some gate line, never this
   one. The session ends its disposition on `CODE-REVIEW gate: PASS|OPEN|
   BLOCKED — …`, read as `local-review-loop` reads it, so `OPEN` over a
   proposed dismissal and `BLOCKED` over a Major left after the third review
   keep their meaning.
5. **The step's id is `code-review`.** `JUDGEMENT` names it in place of
   `coderabbit-local`; the `Skill` hook's record carries the skill's name, so
   the two meet without either change citing the other's code. The pin that
   each id names a skill under `core/skills/` cannot hold a built-in one: it
   skips `code-review` and names the case of `bun/review-docs.test.ts` that
   already pins the `Skill(code-review)` entry of `.claude/settings.json`,
   rather than asserting it a second time.
6. **`/coderabbit-local` stays, outside the sequence.** It moves to the
   bullets like `/ponytail-review`: available, not a gate, run when a user
   asks for CodeRabbit's take before a push. Retiring it would reach d2ass
   and mellon through the next sync and drop a working tool for no saving:
   a skill nobody invokes costs nothing, and its `Skill(coderabbit-local)`
   entry and the runner image's CLI stay for it. A later card may retire it
   once nobody has run it for a while.
7. **The gate requirement is replaced, not modified.** `openspec validate`
   refuses a `MODIFIED` block that drops a scenario, and *The CLI is
   unavailable* no longer describes anything the sequence runs. The delta
   removes *The gate runs after triage and before the push* and adds *The
   local review runs after triage and before the push*, its text the
   archived one with `/code-review high` for the CLI and *The review does not
   return* for the unavailable CLI. The other scenario names stay, so the
   tests citing them keep their identifiers. The capability's other
   requirements — a verified finding fixed without asking, a Major dismissal
   the user's, Minor findings once, three reviews, a justification kept only
   as a convention — speak of the reviewer ("the bot") and its findings,
   never of how the CLI is invoked, and hold for `/code-review` unchanged.
   *The local review passes the guidelines the PR bot reads* is the one
   about the CLI's `--config` invocation, which the kept skill still makes:
   it is renamed *The CLI review passes the guidelines the PR bot reads*,
   and its body says the CLI review where it said the local review. The
   capability's Purpose, which no delta reaches, is rewritten by hand in the
   archive (task 2.4).
8. **`/code-review` reads `CLAUDE.md` and `core/rules.md`, not the docs the
   rulebook indexes.** The session has both loaded; `core/code-style.md`,
   `core/testing.md` and the others are read on demand, and the review's
   recipe reads `CLAUDE.md` files only. A rule kept in an indexed doc under
   *A justification survives only when it is a convention* is therefore read
   by CodeRabbit on the pull request, not by the local review. Accepted:
   `core/rules.md` §*The loop* already lets the always-on budget decide
   between the two homes, and the pull request's review is where a rule the
   bot keeps re-raising was always read back. *Alternative: brief the review
   with the indexed docs* — rejected: the skill takes no such argument, and
   reading them into every session spends the budget the indexing exists to
   save.

## Conflict check (roadmap question 14 б)

`openspec show code-review-replaces-cli --json --deltas-only`:
`agent-autonomy`, `local-review-loop`, `pre-pr-runner`.

- `pre-pr-diff-paths` — archived by #324, merged while this proposal was
  open. Shared: `local-review-loop` (its `MODIFIED` of *The gate runs after
  triage and before the push*) and `pre-pr-runner` (its two `ADDED`
  requirements this change modifies). No contradiction: #324 rewords which
  branch is a documentation branch and adds the steps the runner names; this
  change keeps both and swaps the reviewer. The deltas here were copied from
  #324's synced specs; after merging `origin/main`, the live text differs
  from them only by this change's edits, and `openspec validate --strict`
  passes with no missing header.
- `judgement-step-record` — `gate-ledger`, `harness-updates`: no shared
  capability. Seam: decision 5. Its group 1 (#325) merged `bun/skill-record.ts`,
  which records `tool_input.skill` as the rule, as decision 5 assumes.
- `work-finish` — `commit-gates`, `gate-ledger`, `pre-pr-runner` (*ADDED* a
  reader asking for one step's evidence), `work-finish`. Shared:
  `pre-pr-runner`, different requirements; `finish` takes its list from
  `required()`, which now names `code-review`. No contradiction today: until
  the required steps are derived from the diff, `finish` asks only for the
  runner's diff-budget record. Order via prose for the change that makes it
  ask per step: a review that does not return leaves no `code-review` record,
  where *The local review runs after triage and before the push* lets the
  push go on — as the unavailable CLI did, with no `coderabbit-local`
  record — so that change decides how `finish` reads a step the spec
  excuses, and a fix commit after the last review, which leaves no record at
  `HEAD` for any judgement step, is the same question there.
- `host-deploy` — `orchestrator` alone: no shared capability; it keeps the
  CLI in the image, which decision 6 needs.
- `strip-inherited-git-env` was archived by #327 and `pre-pr-diff-paths` by
  #324; neither left an open pull request with a change directory. The one
  other open pull request, #326 (`work-finish` step 1), changes no delta,
  only that change's design and tasks; it also edits `README.md`, which task
  2.4 edits at apply — a text merge at most, in different sentences.

## Risks / Trade-offs

- [A review by the context that wrote the code] → CodeRabbit on the pull
  request stays, and on the five measured pull requests it caught three
  defects both local reviewers missed.
- [The session grades a finding below Major and dismisses it alone] →
  accepted by the user's choice (decision 3); the report names each grade
  beside its finding and its disposition, and CodeRabbit on the pull request
  reviews the head the dismissal left.
- [The review reads a stale base or another tree] → decision 2's file check
  turns it into a review that does not return, and decision 1 names the
  runner's base. The runner itself falls back to the local `main` where
  `origin/HEAD` is unset, as on this branch's first run; that is the
  checkout's setting, not this change's (`git remote set-head origin
  --auto` sets it).
- [The `Skill` hook records a built-in skill under another name] → the
  runner's line would ask for a record that never comes; the apply step of
  `judgement-step-record` or this change's verify reads one live record of a
  `/code-review` call and fixes the id if it differs.
- [A consumer's brief or docs still name `/coderabbit-local` as step 5] →
  the doc is the harness's and syncs; a brief outside the tree is its
  writer's.
