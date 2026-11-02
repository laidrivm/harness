# turn-gate-keeps-mid-turn-mark — tasks

One group, one pull request. Each failing case first, its failure seen, cited
as `// spec: commit-gates/<slug>`. The cases use `bun/turn-gate.fixture.ts` as
the file's other cases do: `started()`, `commit`, `prompt` for a prompt and
`end` for a stop.

## 1. The mark moves only after a turn the `Stop` half let end

- [ ] 1.1 Failing cases in `bun/turn-gate-turn.test.ts`, describe "the mark":
      a message queued mid-turn — `started()`, commit `DONE`, `mark` again with
      no `decide` between, then `decide` refuses naming "1. Group"
      (`a-message-queued-mid-turn`); a turn the user interrupted — the same
      commit, no `decide`, a `mark`, a commit of an unrelated file, then
      `decide` refuses naming "1. Group" (`a-turn-the-user-interrupted`); the
      boundary is consumed — `started()`, `decide` lets the turn end, `mark`,
      commit `DONE`, `mark` again, then `decide` refuses
      (`the-prompt-after-a-turn-the-hook-let-end`). Each fails on today's code,
      which rewrites the mark on every prompt
- [ ] 1.2 Cases that pass today and must keep passing: a message queued into a
      refused turn — commit `DONE`, `decide` refuses, `mark`, then `decide` is
      `undefined` and the mark file still ends in ` refused`
      (`a-message-queued-into-a-refused-turn`); a stop with nothing to judge —
      `started()`, `decide` with `HEAD` at the mark, `mark` after a commit of
      an unrelated file, and the mark file reads the new `HEAD`. Amend "a new
      mark can be refused again" so the refused turn ends once more (a second
      `decide`) before its `mark`, as the spec's refused turn does
- [ ] 1.3 A failing case in `bun/turn-gate-ceiling.test.ts`: `counted(0)`, a
      commit of an unrelated file, and `run("mark")` leaves the mark at the old
      `HEAD`; then `rounds(…, CEILING - 1)` (that prompt restarted the count),
      `run("stop")` ends the session at the ceiling, and `run("mark")` writes
      the new `HEAD` (`the-prompt-after-the-round-ceiling`). Case [41], a mark
      after eighteen restarting the count, keeps passing unchanged
      (`design.md`, decision 5)
- [ ] 1.4 Then `bun/turn-gate.ts`: `decide` writes `<mark>.stopped` before
      every return that lets the turn end once it has the mark's path, and
      never on a refusal; the ceiling branch writes it too; `mark` writes
      `HEAD` only when the mark file is absent or `<mark>.stopped` exists,
      removes `<mark>.stopped` when it does, and calls `resetRounds` on every
      prompt as now. Every write best-effort and silent. Rewrite the header
      comment's `mark` paragraph and its once-per-mark paragraph to say when
      the mark moves, and the store comment in the `import.meta.main` block to
      name `.stopped` beside the marks. Verify with `bun test bun/turn-gate*`
      and `bun test bun/goal-check*`, then the whole `bun test`
