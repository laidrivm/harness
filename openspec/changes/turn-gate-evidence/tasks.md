# turn-gate-evidence — tasks

Group 1 is one pull request; group 2 is ticked in the pull request that moves
the self-pin past group 1's merge, or in one of its own after it. Each failing
case first, its failure recorded in the pull request body, cited as
`// spec: <capability>/<slug>` from this change's deltas. The repositories,
marks and ledger are `bun/turn-gate.fixture.ts`'s and
`bun/turn-gate-record.test.ts`'s (`finished()`, `ledger()`, `run()`).

## 1. The hook reads the runner's records, not the message

- [ ] 1.1 Failing cases in `bun/gate-ledger-ran.test.ts` for a new
      `passed(commit, top, ledger?)`: a `pass` record of every
      `RUNNER_STEPS` step for `C` in `TOP` answers true; one step's alone, a
      `fail` for either, another commit or another project answers false; an
      undefined `top` answers false
      (`// spec: pre-pr-runner/another-step-s-record`). Then add it to
      `bun/gate-ledger.ts` and switch `ranUnder()` and `bun/goal-check.ts`'s
      local branch to it; `bun/goal-check*.test.ts` and
      `bun/gate-ledger-rule.test.ts` stay green
- [ ] 1.2 Failing cases in `bun/turn-gate-record.test.ts`, each calling
      `decide()` on `finished()`: `SILENT` with `run(tip, top)` ends
      (`commit-gates/a-run-record-and-no-gate-line`); a bare `BLOCKED` with
      `run(tip, top)` ends (`…/a-bare-marker-with-nothing-after-it`); a `PASS`
      gate line with no record refuses
      (`…/gate-lines-with-no-run-behind-them`); the project checks' record
      `fail` refuses, then the same mark releases (`…/a-run-that-failed`); the
      diff budget's `pass` alone refuses (`…/one-step-s-record-alone`);
      `BLOCKED — pick a name` with no record refuses
      (`…/blocked-without-a-run`), then the same mark releases
      (`…/the-turn-names-what-only-the-user-can-settle`); an event with no
      `last_assistant_message` and no record refuses
      (`…/the-final-message-cannot-be-read`); the refusal names the group, the
      tip, the runner's path, `not repeated`, and ending on the whole final
      message again. Record which fail
- [ ] 1.3 Make them pass in `bun/turn-gate.ts`: delete `GATE_LINE`,
      `NAMED_BLOCK` and `reported()`; `decide()` reads no message field and
      passes on `passed(end, top)`; one refusal text (design.md, D4); the
      header comment says what the hook now reads and drops the message
      fail-open. `wc -l` stays under 300
- [ ] 1.4 Delete the tests of what went: `reported()`'s cases in
      `bun/turn-gate.test.ts` (their citations now sit on 1.2's cases), and
      the `reported()` assertions and imports in `bun/goal-check.test.ts`,
      `bun/goal-check-io.test.ts` (its case citing
      `stage-goal/the-line-the-turn-gate-reads` keeps only the line's opening),
      `bun/pre-pr.test.ts` and `bun/pre-pr-steps-run.test.ts`. Rewrite every
      other case in `bun/turn-gate*.test.ts` and
      `bun/gate-ledger-turn.test.ts` that passes on a gate line or a `BLOCKED`
      to pass on `run(tip, top)`, its citation unchanged.
      `git grep -n -e GATE_LINE -e NAMED_BLOCK -e "reported(" -- bun` names
      nothing of the turn gate's; the touched test files pass
- [ ] 1.5 Prose: the README's *Gate lines* section stops saying a hook can
      require the lines and that the last one makes the rule "mechanically
      checkable" — they are the report, and the turn gate reads the runner's
      records; its turn gate bullet names the passing records of both steps
      and drops the `BLOCKED` exit. `core/review-toolkit.md`'s pre-PR sequence
      paragraph does the same, and says a turn blocked on the user is refused
      once. The code comments that say the turn gate reads gate lines go too:
      `bun/pre-pr.ts`'s header and its two "not shaped like a gate line"
      comments, and `bun/goal-check.ts`'s header. Grep `README.md`, `core/`,
      `bun/` and `openspec/specs/` for "gate line" beside "turn gate" or
      `turn-gate` and fix each site this change makes false; the skills,
      `core/autonomy.md` and `session-wrapup` stay
- [ ] 1.6 Probe from the tree in a scratch clone of the harness, after `bun
      install` and `git fetch origin` there so both runner steps can pass,
      with `XDG_STATE_HOME` in the scratchpad and the event on stdin of `bun
      bun/turn-gate.ts stop` after `mark`: a commit completing a group with no
      runner record exits 2 naming the tip; after `bun bun/pre-pr.ts` at that
      commit, the same session's next stop exits 0, and the ledger holds
      `refused` then `passed`, not `released`. Record each command and its
      result in the pull request body

## 2. The probe after the pin bump

- [ ] 2.1 Once the self-pin passes group 1's merge, in a harness session: a
      turn that ticks a group's last box and commits without running the
      runner is refused once with the new text; the continued turn, after
      `bun bun/pre-pr.ts`, ends; `turn-gate` records `refused` then `passed`
      for that session in the ledger. Record it on the card and in that pull
      request
