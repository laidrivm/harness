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

1. **The invocation is `/code-review high`, with no other argument.** `high`
   is named because `/code-review` with no level reuses the last one typed,
   which a later session cannot know. No `--comment`, no `--fix`, no `ultra`
   or `--post`: the first and the last post under the user's name on the
   pull request, which has none yet, and `--fix` applies findings before they
   are verified, which the disposal policy forbids. No target either where
   the session works in its working directory — its worktree or checkout —
   since the review reads the branch's own diff there; a session working in a
   clone outside it passes the clone's path, the one target the skill takes
   that names a tree. Refusing the posting
   arguments by a hook is the card *Refuse posting arguments to /code-review
   in a PreToolUse hook on Skill*, after the roadmap.
2. **The session runs it itself, not a fresh subagent, and records no SHA.**
   The fresh subagent and the SHA were the measurement's: one held the two
   lists comparable, the other caught a subagent that reviewed the main
   checkout instead of the branch (the card's caveat). The user dropped the
   SHA (answer 1 а, *можно без записи sha*) because since #320 a subagent
   works in its own worktree; the session that runs the review in the tree it
   works in has nothing to mismatch. *Alternative: keep the fresh subagent* —
   rejected: it reopens the question of which tree the subagent reads, which
   is the caveat the user closed, and "Claude reviews Claude" is held where
   the card's option 1 put it, by CodeRabbit on the pull request.
3. **The disposal terms move unchanged.** Apply every verified finding
   without asking, put a Major-or-above dismissal to the user, at most three
   reviews stopping at one with nothing above Minor, Minor findings reported
   once. `/code-review` names no severity in CodeRabbit's terms, so a
   correctness finding counts as 🟠 Major and a reuse, simplification or
   efficiency cleanup as 🟡 Minor, unless the review states a severity of its
   own. The scale is the reviewer's kind of finding, not the session's
   judgement, so the session cannot lower a finding to dismiss it alone.
   *Alternative: the session grades each finding* — rejected for that reason.
   *Alternative: wait for the `--json-schema` run* — rejected: it needs the
   runner to launch the reviewer, which the user did not ask for now.
4. **The session writes the gate line.** The built-in skill ends on no
   `GATE:` line, and `bun/turn-gate.ts` asks for some gate line, never this
   one. The session ends its disposition on `CODE-REVIEW gate: PASS|OPEN|
   BLOCKED — …`, read as `local-review-loop` reads it, so `OPEN` over a
   proposed dismissal and `BLOCKED` over a Major left after the third review
   keep their meaning.
5. **The step's id is `code-review`.** `JUDGEMENT` names it in place of
   `coderabbit-local`; the `Skill` hook's record carries the skill's name, so
   the two meet without either change citing the other's code. The pin that
   each id names a skill under `core/skills/` cannot hold a built-in one: the
   test pins `code-review` instead where it is defined for the harness's
   sessions, the `Skill(code-review)` entry of `.claude/settings.json`, which
   an unattended call needs anyway.
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
   tests citing them keep their identifiers.

## Conflict check (roadmap question 14 б)

`openspec show code-review-replaces-cli --json --deltas-only`:
`agent-autonomy`, `local-review-loop`, `pre-pr-runner`.

- `pre-pr-diff-paths` — on `origin/main`, its archive open as #324 (ready,
  checks green). Shared: `local-review-loop` (its `MODIFIED` of *The gate runs
  after triage and before the push*) and `pre-pr-runner` (its two `ADDED`
  requirements this change modifies). No contradiction: #324 rewords which
  branch is a documentation branch and adds the steps the runner names; this
  change keeps both and swaps the reviewer. The deltas here are copied from
  #324's synced specs, so the order is fixed: #324 merges first, this branch
  merges `origin/main` after it, and `openspec validate` then stops reporting
  that the `pre-pr-runner` headers are missing. Order via prose, not
  `after:`, since #324 moves the directory into the archive.
- `judgement-step-record` — `gate-ledger`, `harness-updates`: no shared
  capability. Seam: decision 5.
- `work-finish` — `commit-gates`, `gate-ledger`, `pre-pr-runner` (*ADDED* a
  reader asking for one step's evidence), `work-finish`. Shared:
  `pre-pr-runner`, different requirements; `finish` takes its list from
  `required()`, which now names `code-review`. No contradiction.
- `strip-inherited-git-env` — `commit-gates`: no shared capability.
- `host-deploy` — `orchestrator` alone: no shared capability; it keeps the
  CLI in the image, which decision 6 needs.
- Open pull requests: #324 alone, above.

## Risks / Trade-offs

- [A review by the context that wrote the code] → CodeRabbit on the pull
  request stays, and on the five measured pull requests it caught three
  defects both local reviewers missed.
- [`/code-review`'s findings carry no CodeRabbit severity] → decision 3's
  rule by kind; a correctness finding wrongly counted Major costs one
  question to the user, never a dismissal reaching the merge.
- [The `Skill` hook records a built-in skill under another name] → the
  runner's line would ask for a record that never comes; the apply step of
  `judgement-step-record` or this change's verify reads one live record of a
  `/code-review` call and fixes the id if it differs.
- [A consumer's brief or docs still name `/coderabbit-local` as step 5] →
  the doc is the harness's and syncs; a brief outside the tree is its
  writer's.
