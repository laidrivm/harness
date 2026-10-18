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

## 2026-10-12 — chore/wrapup-2026-10-11

- Side agents, not a skill: 3 notes, 3 acted on — the no-push-from-worktree rule against worktree-per-session, the harness dependency in consumers, transcripts deleted after 30 days (cleanupPeriodDays raised to 365)
- triage (chore/wrapup-2026-10-12): PASS — 1 group, nothing above Low risk
- coderabbit-local (chore/wrapup-2026-10-12): PASS — 1 finding, 1 acted on (this entry's "nothing changed" claim, corrected)
- Not run: zombies, warm, coderabbit, first-five, review-order, code-review, preflight — until the wrap-up the session changed nothing in this repository: it filed and edited board cards and wrote the untracked local/harness-roadmap.html; the wrap-up branch carries three card-writing rules in core/feature-workflow.md and this entry

## 2026-10-14 — main (orchestrator session for roadmap section A, 2026-10-12 to 2026-10-14; sub-agents in scratch clones, PRs #82–#113 and dota2#322, mellon#47)

- coderabbit (#99, run by the orchestrator): PASS — 2 findings, 1 acted on (a `-c` program is the first operand after the shell's options; 1 already resolved)
- coderabbit (#101, run by the orchestrator over four reviews): PASS — 10 findings, 7 acted on (quoted delimiter matched literally, backslash parity, a `$` delimiter matched literally, a dash-split delimiter refused, a path-named command read as a script reader, the refusal naming its open state, MD038); 1 Minor skipped by reading (path rule kept as fail-closed), 1 Trivial skipped, the rest already resolved
- Side agent, not a skill: 1 note, 1 acted on — every #101 hole shares one shape, so a scan ending inside a quote now refuses the call (D10)
- Sub-agents' own pre-PR runs (zombies, warm, triage, coderabbit-local) are recorded in each PR body; the sharpest yield there: coderabbit-local found 2 Critical guard holes on #109 (a `-c` program shaped like a redirection; an unnormalised path to standard input), and 1 Major each was dismissed by the user on #104 and #111
- Not run by the orchestrator: zombies, warm, triage, coderabbit-local, first-five, review-order, code-review, preflight — every code and spec change went through a sub-agent's pre-PR sequence
- gates: command-guard block force-push ×1, command-guard block gh-publish ×1, command-guard block main-commit ×4, command-guard block main-push ×3, command-guard block stale-fetch ×2, command-guard block unreadable-branch ×2, loop-guard warned repeated-failure ×1, pre-pr pass diff-budget ×11, question-gate allowed question ×2, question-gate passed reply ×1, turn-gate passed pre-pr-sequence ×11, turn-gate refused pre-pr-sequence ×11

## 2026-10-18 — main (orchestrator session, 2026-10-14 to 2026-10-18; sub-agents in scratch clones, PRs #125–#163; board loop live checks from `~/harness-loop`)

- coderabbit (run by the orchestrator over 15 PRs: #126, #131, #133, #137, #138, #143, #144, #147, #152, #154, #156, #160, #161, #163, and #125 before compaction): PASS on each — 24 findings, 18 acted on, 6 rejected or skipped. Defects it caught that every local pass missed: `gh pr list`'s 30-record default in the goal check (#131), a branch switch under a process group that outlived its session (#147), `/coderabbit`'s one-read rule dropping its own final re-fetch (#152), fixes applied against a head that moved after verification (#154), a stub claim that a gate's `deny` message replaces "do not retry" before anyone had measured it (#143, outside the diff range — missed on the first pass because only inline comments were read). Rejected: 2 Majors, both the status-filter misreading the user had dismissed (#133, #138). Skipped by reading: 4 Minors (a dead-session scenario already carded on #138, a Claude Code version floor on #161, a step-aware marker check on #160, the 3.2a hand-on line on #163). Separately, the user dismissed 4 Majors from local passes (#133's status filter, #138's dead-session scenario, #154's `ship` and `coderabbit` gates)
- Sub-agents' own pre-PR runs (zombies, warm, triage, coderabbit-local) are recorded in each PR body; the sharpest local yield: triage found the gate answering `deny` with "unreadable" when its own verdict threw (#146), and coderabbit-local found `session-wrapup`'s unscoped `Write` once its flag came off (#152)
- Live checks, not a skill: 4 run by the user (1.4 and 2.4 of `step-branch-retry`, 1.8 of `question-gate-reason`, 2.7 of `pick-claim-answer`), all passed; 1.8's first try found the indented-line defect (#155), 2.7 found the attribution line (#161) and the final-message gate-line round trip (carded)
- Not run by the orchestrator: zombies, warm, triage, coderabbit-local, preflight, ponytail-review, simplify, code-review — every code and spec change went through a sub-agent's pre-PR sequence
- gates: command-guard block gh-api-write ×1, command-guard block unread-program ×2, command-guard block unreadable-branch ×3, goal met apply ×2, goal open apply ×5, loop open apply ×2, pre-pr pass diff-budget ×3, question-gate allowed question ×1, question-gate passed not-a-card ×1, question-gate passed unmarked ×2, question-gate refused unmarked ×1, turn-gate passed pre-pr-sequence ×1, turn-gate refused pre-pr-sequence ×1
