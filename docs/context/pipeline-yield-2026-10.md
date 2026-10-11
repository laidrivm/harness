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

## 2026-10-11 — harness-auto-bump (spec/, feat/-1 to -4, chore/archive-, and both consumers' chore/harness-auto-bump)

- coderabbit (#44): PASS — 1 finding, 1 acted on
- zombies (feat/harness-auto-bump-1): PASS — 7 findings, 7 acted on
- triage (feat/harness-auto-bump-1): PASS — 0 findings (by design); 2 High groups read, 2 defects fixed
- coderabbit-local (feat/harness-auto-bump-1): PASS — 2 findings, 2 acted on (one defect, reported twice)
- coderabbit-local (feat/harness-auto-bump-1, after the mark replaced the path): PASS — 0 findings, 0 acted on
- coderabbit (#45): PASS — 2 findings, 1 acted on (1 Minor skipped: a check-enforced prohibition stays the consumer's)
- zombies (feat/harness-auto-bump-2): PASS — 5 findings, 5 acted on
- triage (feat/harness-auto-bump-2): PASS — 0 findings (by design); the High group read, nothing found
- coderabbit-local (feat/harness-auto-bump-2): PASS — 0 findings, 0 acted on; re-run after the check-name guard: 0 findings
- coderabbit (#46): PASS — 3 findings, 3 acted on (all Major)
- zombies (feat/harness-auto-bump-3): PASS — 2 findings, 2 acted on (1 closed with a reason: it would need the network)
- triage (feat/harness-auto-bump-3): PASS — 0 findings (by design); High and Medium groups read, nothing found
- coderabbit-local (feat/harness-auto-bump-3): PASS — 1 finding, 0 acted on (Major rejected, the user confirmed)
- coderabbit (#47): PASS — 1 finding, 1 acted on
- zombies (feat/harness-auto-bump-4): PASS — 3 findings, 3 acted on
- triage (feat/harness-auto-bump-4): PASS — 0 findings (by design); the High group read, nothing found
- coderabbit-local (feat/harness-auto-bump-4): PASS — 0 findings, 0 acted on
- triage (dota2 chore/harness-auto-bump): PASS — 0 findings (by design); 2 High groups read, nothing found
- coderabbit-local (dota2 chore/harness-auto-bump): PASS — 0 findings, 0 acted on
- triage (mellon chore/harness-auto-bump): PASS — 0 findings (by design); 2 High groups read, nothing found
- coderabbit-local (mellon chore/harness-auto-bump): PASS — 1 finding, 0 acted on (Minor skipped: the edits came from sync.ts)
- opsx:verify (harness-auto-bump): 1 critical, 0 warnings, 1 suggestion — the critical acted on (an unticked task whose work was done)
- triage (chore/archive-harness-auto-bump): PASS — 0 findings, nothing above Low
- coderabbit-local (chore/archive-harness-auto-bump): PASS — 2 findings, 1 acted on (Major rejected, the user confirmed)
- Side agents, not a skill: 5 notes, 5 acted on — the write token visible to the checking job, d2ass's stale install, the 60-day schedule shutdown, sync deleting a project hook by path, the unpinned check name
- Not run: warm (no manifest changed), first-five, review-order, code-review, preflight, ponytail-review, security-review; coderabbit on #48, #49, dota2#319 and mellon#46, whose reviews were re-fetched after merge and held 0 findings
