# wrapup-before-window-ends — tasks

One group, one pull request on `feat/wrapup-before-window-ends`. Each failing
case first, its failure seen, cited as `// spec: context-window/<slug>`. The
trigger is the user's answer to question 1 on the card (05.11, «б»); the
choices are `design.md`'s decisions 1–9.

## 1. The turn gate's stop asks for the wrap-up once per full context

- [ ] 1.1 Failing cases in a new `bun/context-window.test.ts`, in process,
      over a transcript written into a temp directory per case (a helper that
      writes assistant lines with a given `usage`, `isSidechain` and padding)
      and a temp mark store: 812 000 refuses, and the reason names
      `/session-wrapup`, «можно /clear» and `812000`
      (`a-context-past-the-threshold`); exactly 800 000 refuses
      (`a-context-at-the-threshold`); 799 999 asks nothing
      (`a-context-below-the-threshold`); 900 000 then 120 000 reads 120 000
      (`the-last-reply-counts`); a sidechain line and an all-zero line after
      an 810 000 reply read 810 000
      (`a-sidechain-or-synthetic-reply-after-the-last-real-one`); a 6 MiB
      transcript whose last reply sits in its final 4 MiB reads that reply
      (`a-large-transcript`); no `transcript_path`, a missing file, and a
      tail with no assistant line ask nothing (`no-size-to-read`); the stop
      after a refusal at 830 000 asks nothing (`the-continued-turn`);
      refusal, 150 000, then 805 000 refuses again
      (`a-compaction-re-arms-it`); a refusal, then a fresh call with the same
      session id and store at 820 000, asks nothing
      (`a-resumed-session-above-the-threshold`); session A refused, session B
      at 810 000 refused (`two-sessions`); no session id or `../x` asks
      nothing and writes no file (`an-unsafe-session-id`). Each fails today
      for want of the module
- [ ] 1.2 Then `bun/context-window.ts` as `design.md` decisions 2–4 and 7 set
      out: `THRESHOLD` exported, the 4 MiB tail read with the first line
      dropped, the backward walk passing over sidechain and zero-sum replies,
      the `.wrapup` mark beside the turn gate's, the reason's exact text with
      a comment that «можно /clear» is the user's own phrase. Fail-open on
      every read, as `turn-gate.ts`'s header says. Verify with `bun test
      bun/context-window.test.ts`
- [ ] 1.3 Failing cases in a new `bun/turn-gate-wrapup.test.ts`, over
      `turn-gate.fixture.ts` and a transcript at 850 000: a stop that
      completes a task group with no passing run is refused with the turn
      gate's reason alone, and its next stop is refused for size
      (`the-turn-gate-refuses-at-the-same-stop`); spawned as the hook, the
      twentieth continued stop prints `continue: false` and no wrap-up reason
      (`the-ceiling-at-the-same-stop`); after a refusal for size a `mark`
      leaves the mark file unchanged (`a-message-queued-into-the-continued-turn`);
      spawned with `XDG_STATE_HOME` at the case's directory, a refusal adds
      one `context-window`/`refused`/`wrapup` record and a stop at 400 000
      adds none (`a-refusal-is-recorded`, `a-stop-below-the-threshold`);
      `HOOKS` and the harness's `.claude/settings.json` hold no
      `SubagentStop` entry (`a-subagent-s-stop`). The first four fail today
- [ ] 1.4 Then `bun/turn-gate.ts`: `decide()` returns `judge(...) ??` the
      size check, with a second logging callback the hook binds to
      `record("context-window", "refused", "wrapup", event)`; the header gains
      one paragraph naming the check, its order and its module. Keep the
      file within 300 lines by the count `file-size.ts` applies, moving
      nothing else out. Verify with `bun test bun/turn-gate*` and `bun
      bun/check.ts`, which runs the file-size cap (`file-size.ts` has no
      entry point)
- [ ] 1.5 `README.md`: the turn gate's row in the hook table adds "asks once
      per context for `/session-wrapup` at 800k tokens" and cites
      `context-window`; one line below the table states the limit — with
      `/autocompact` below 800 000, or a model whose window is under 1M,
      compaction comes first and nothing is asked. Verify by reading the
      passages back, and `bun test bun/review-docs.test.ts`
- [ ] 1.6 Run the whole `bun test` and `bun bun/pre-pr.ts`, and confirm
      `openspec validate wrapup-before-window-ends --strict` passes
