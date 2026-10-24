## 1. A pass waiting on the user does not pause

- [x] 1.1 Export from `bun/notion-bot.ts` the two prefixes `post()` prints for
      a posted question and for one that already waits, and use them in
      `post()`; in `bun/board-loop.ts` add the `waiting` outcome: when the
      goal check does not read `goal met` and the printed question line starts
      with the posted prefix or names the waiting one, record `waiting`,
      print the card and exit 0. Cases in `bun/board-loop-question.test.ts`:
      posted → `waiting`, exit 0; already waits → `waiting`; not posted for
      another reason → `open`, exit 1; no question and goal open → `open`.
      Verify with those cases and `bun test`
- [x] 1.2 Add the pass-over rule to the pick prompt in
      `bun/board-loop-prompt.ts`, worded as `waits()` tests the discussion,
      with a case pinning it in `bun/board-loop.test.ts`. Verify with that
      case
- [x] 1.3 `orchestrator/pass.sh`: name in its header that a pass waiting on
      the user exits 0 and writes no stop file; add a case in
      `orchestrator/pass.test.ts` whose fake runner prints a `waiting` line and
      exits 0, and asserts no stop file. Verify with that case (it runs where
      `flock` exists)
