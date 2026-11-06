# wrapup-before-window-ends — tasks

One group, one pull request on `feat/wrapup-before-window-ends`. Each failing
case first, its failure seen, cited as `// spec: context-window/<slug>` or
`// spec: commit-gates/<slug>`. The
trigger is the user's answer to question 1 on the card (05.11, «б»); the
choices are `design.md`'s decisions 1–9.

## 1. The turn gate's stop asks for the wrap-up once per full context

- [ ] 1.1 Make room first, with no change in behaviour: move `groups()` and
      `complete()` from `bun/turn-gate.ts` to a new `bun/task-groups.ts`,
      and point `goal-check.ts`, `work-status.ts`, `board-loop-takeable.ts`
      and `turn-gate.test.ts` at it (grep `from "./turn-gate.ts"` for any
      other), and re-read `goal-rounds.ts`'s header, which says
      `goal-check.ts` imports `turn-gate.ts`; move `unattended()` from
      `bun/question-gate.ts` to a new `bun/unattended.ts`, exported, with its
      comment, and import it back.
      Verify with `bun test bun/turn-gate* bun/goal-check* bun/work-status*
      bun/board-loop* bun/question-gate*`, all passing unchanged
- [ ] 1.2 Failing cases in a new `bun/context-window.test.ts`, in process,
      over a transcript written into a temp directory per case (a helper that
      writes assistant lines with a given `usage`, `isSidechain` and padding,
      and an optional first user message) and a temp mark store: 812 000
      refuses, and the reason names `/session-wrapup`, «можно /clear», the
      subagents and `812000` (`a-context-past-the-threshold`); exactly
      800 000 refuses (`a-context-at-the-threshold`); 799 999 asks nothing
      (`a-context-below-the-threshold`); a first user message holding
      `This session runs unattended.` at 820 000, then 830 000, asks nothing
      and writes the mark at the first (`a-board-loop-stage-past-the-threshold`);
      a tail holding a `Skill` `tool_use` with `input.skill`
      `session-wrapup`, at 815 000 and then 830 000, asks nothing twice
      (`the-wrap-up-the-done-line-started`); a tail holding a user message
      with `<command-name>/session-wrapup</command-name>` at 815 000 asks
      nothing (`a-wrap-up-the-user-typed`); a tail holding a `Skill`
      `session-wrapup` call, then a `system` line with `subtype`
      `compact_boundary`, then a reply at 810 000, with no `.wrapup` mark,
      refuses (`a-wrap-up-from-before-a-compaction`); 900 000 then 120 000 reads
      120 000 (`the-last-reply-counts`); a sidechain line and an all-zero
      line after an 810 000 reply read 810 000
      (`a-sidechain-or-synthetic-reply-after-the-last-real-one`); a 6 MiB
      transcript whose only reply, at 810 000, sits before its final 4 MiB,
      the rest padding, reads no size — a whole-file read would find it
      (`a-large-transcript`); a one-line transcript holding an 810 000 reply
      reads it (`a-transcript-smaller-than-the-tail`); no `transcript_path`,
      a missing file, and a tail with no assistant line ask nothing
      (`no-size-to-read`); the stop after a refusal at 830 000 asks nothing
      (`the-continued-turn`); refusal, 150 000, then 805 000 refuses again
      (`a-compaction-re-arms-it`); refusal at 805 000, 790 000, then 802 000
      asks nothing twice (`a-small-shrink-does-not-re-arm-it`); a refusal,
      then a fresh call with the same session id and store at 820 000, asks
      nothing (`a-resumed-session-above-the-threshold`); session A refused,
      session B at 810 000 refused (`two-sessions`); no session id or `../x`
      asks nothing and writes no file (`an-unsafe-session-id`). Each fails
      today for want of the module
- [ ] 1.3 Then `bun/context-window.ts` as `design.md` decisions 2–4 and 7 set
      out: `THRESHOLD` and `REARM` exported, the 4 MiB tail read with the
      first line dropped only past byte 0, the backward walk passing over
      sidechain and zero-sum replies and looking for a `session-wrapup` call
      back to the tail's last `compact_boundary` line, the `.wrapup` mark beside the turn gate's,
      written on a refusal and on an ask skipped for a wrap-up or an
      unattended session, `unattended()` called only for a stop it would
      otherwise refuse, the
      reason's exact text with a comment that «можно /clear» is the user's
      own phrase. Fail-open on every read, as `turn-gate.ts`'s header says.
      Verify with `bun test bun/context-window.test.ts`
- [ ] 1.4 Cases in a new `bun/turn-gate-wrapup.test.ts`, over
      `turn-gate.fixture.ts` and a transcript at 850 000. Failing today: a
      stop that completes a task group with no passing run is refused with
      the turn gate's reason alone, its next stop ends, and the first stop
      after the next prompt is refused for size
      (`the-turn-gate-refuses-at-the-same-stop`); a stop refused for size,
      then a commit completing a group with no run, has its next stop
      refused by the turn gate (`the-continued-turn-completes-a-group`, and
      `commit-gates/a-refusal-for-size-then-a-completed-group`); after a
      refusal for size a `mark` leaves the mark file unchanged
      (`a-message-queued-into-the-continued-turn`); spawned as the hook with
      `XDG_STATE_HOME` at the case's directory, a turn with a passing run at
      810 000 whose next stop ends it adds one `context-window`/`refused`/
      `wrapup` record and two `turn-gate`/`passed`
      (`a-refusal-over-a-passing-run`); the stop after the gate's refusal,
      at 850 000, ends (`commit-gates/a-refusal-for-the-run-then-a-full-context`).
      Passing today and kept as guards:
      spawned as the hook, the twentieth continued stop prints `continue:
      false` and no wrap-up reason (`the-ceiling-at-the-same-stop`); a stop
      at 850 000 in a session no `mark` ran for ends (`no-mark`); a stop
      at 400 000 adds no `context-window` record
      (`a-stop-below-the-threshold`); `HOOKS` and the harness's
      `.claude/settings.json` hold no `SubagentStop` entry
      (`a-subagent-s-stop`)
- [ ] 1.5 Then `bun/turn-gate.ts` as decisions 1, 5 and 9 set out:
      `decide()` runs the size check when `judge()` did not refuse and the
      mark file exists and is not flagged ` refused`, never flags it for
      size, and passes a
      size refusal to `log` as its own decision; `judge()` logs as today; the
      hook maps the size refusal to `record("context-window", "refused",
      "wrapup", event)`. The header gains one paragraph naming the check, its order
      and its module; the `ponytail:` comment on the store names `.wrapup`.
      Verify with `bun test bun/turn-gate* bun/context-window.test.ts
      bun/gate-ledger*`, and `wc -l bun/turn-gate.ts` at or under 300 (the
      file ends in a newline, so `wc -l` equals `file-size.ts`'s count)
- [ ] 1.6 `README.md`: the turn gate's row in the hook table adds "asks an
      attended session once per context for `/session-wrapup` at 800k
      tokens" and cites `context-window`; one line below the table states
      the limit — with `/autocompact` below 800 000, or a model whose window
      is under 1M, compaction comes first and nothing is asked. Verify by
      reading the passages back, and `bun test bun/review-docs.test.ts`
- [ ] 1.7 Run the whole `bun test` and `bun bun/pre-pr.ts`, and confirm
      `openspec validate wrapup-before-window-ends --strict` passes
