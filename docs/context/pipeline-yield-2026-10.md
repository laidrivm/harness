# Pipeline yield

## 2026-10-07 — chore/repoint-moved-changes (stack: spec/repoint-moved-changes, chore/cut-bun-version-sites)

- zombies: PASS — 0 findings, 0 acted on (three branches, planning artefacts only)
- triage: OPEN → PASS — 0 findings (by design); reading the two Medium groups surfaced 1 defect, fixed
- coderabbit-local: PASS — 0 findings, 0 acted on (three branches)
- coderabbit (#14): PASS — 1 finding, 1 acted on
- coderabbit (#15): PASS — 1 finding, 1 acted on
- Not run: warm (no manifest changed), first-five, review-order, code-review, preflight

## 2026-10-08 — fix/exempt-manifest-suppressions (stack: spec/exempt-manifest-suppressions, chore/archive-exempt-manifest-suppressions)

- zombies (proposal text): OPEN → PASS — 6 findings, 5 acted on (1 skipped: the harness's own manifest is covered only incidentally, too narrow for a test)
- triage (spec branch): OPEN → PASS — 0 findings (by design); the Medium group read, nothing found
- coderabbit-local (spec branch): PASS — 0 findings, 0 acted on
- coderabbit (#18): PASS — 1 finding, 1 acted on
- zombies (fix branch, diff mode): OPEN → PASS — 1 finding, 1 acted on
- triage (fix branch): OPEN → PASS — 0 findings (by design); the Medium group read, nothing found
- coderabbit-local (fix branch): PASS — 0 findings, 0 acted on
- triage (archive branch): OPEN → PASS — 0 findings (by design); the Medium group read, nothing found
- coderabbit-local (archive branch): PASS — 0 findings, 0 acted on
- Not run: warm (no manifest changed), first-five, review-order, code-review, preflight; coderabbit on #19 and #20 (#19 re-fetched after merge: the bot approved with 0 findings)

## 2026-10-11 — spec/bun-version-sites-ask-precedence (session: chore/card-properties-refetch, chore/ignore-claude-worktrees, spec/gate-decision-ledger, spec/capture-as-mechanism, spec/board-state-per-project, spec/board-state-per-project-2, spec/policy-gate-beyond-bash, spec/notion-update-guard)

- coderabbit (#33): PASS — 1 finding, 1 acted on
- zombies (gate-decision-ledger, proposal text): OPEN → PASS — 25 findings, 25 acted on (one exposed the walked-past refusal, which became the released decision)
- triage (spec/gate-decision-ledger): OPEN → PASS — 0 findings (by design); the Medium group read, 1 defect fixed
- coderabbit-local (spec/gate-decision-ledger): PASS — 1 finding, 1 acted on
- zombies (capture-as-mechanism, subagent): PASS — 12 findings, 12 acted on
- triage (spec/capture-as-mechanism, subagent): PASS — 0 findings (by design); the Medium group read, 1 defect fixed
- coderabbit-local (spec/capture-as-mechanism, subagent): PASS — 1 finding, 1 acted on
- zombies (board-state-per-project, subagent): PASS — 24 findings, 24 acted on
- triage (spec/board-state-per-project, subagent): PASS — 0 findings (by design); 2 Medium groups read, nothing found
- coderabbit-local (spec/board-state-per-project, subagent): PASS — 0 findings, 0 acted on
- zombies (policy-gate-beyond-bash, subagent): PASS — 13 findings, 13 acted on
- triage (spec/policy-gate-beyond-bash, subagent): PASS — 0 findings (by design); the High group read, 3 defects fixed
- coderabbit-local (spec/policy-gate-beyond-bash, subagent): PASS — 1 finding, 0 acted on (Major rejected, the user confirmed)
- coderabbit (#35): PASS — 3 findings, 1 acted on (2 Trivial skipped by default)
- coderabbit-local (spec/board-state-per-project-2): PASS — 1 finding, 1 acted on
- zombies (notion-update-guard, proposal text): OPEN → PASS — 25 findings, 25 acted on
- coderabbit-local (spec/notion-update-guard): PASS — 0 findings, 0 acted on
- coderabbit-local (spec/bun-version-sites-ask-precedence): PASS — 1 finding, 0 acted on (rejected: the date it wanted was another read's)
- coderabbit (#39): PASS — 2 findings, 2 acted on; re-run after merge: 2 already resolved
- coderabbit (#41): PASS — 1 finding, 1 acted on
- Not run: warm (no manifest changed), first-five, review-order, code-review, preflight, ponytail-review; triage on spec/board-state-per-project-2, spec/notion-update-guard and spec/bun-version-sites-ask-precedence, which the documentation-branch sequence requires; any review on the two subagent revisions after the user's answers; coderabbit on #34, #36, #37, #38 and #40
