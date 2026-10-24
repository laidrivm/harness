## 1. The notice command

- [ ] 1.1 In `bun/notion-bot.ts`: `settings()` reads an optional `pauses`,
      checked with `ID` as `user` is, into `Settings`; lift the `Assign` write
      out of `post()` into an exported `assign(call, card, user)` and switch
      `post()` to it; `comment()` takes an optional user id, mentioned in a
      run after the mark. Cases in `bun/notion-bot.test.ts` (a bad `pauses`
      throws naming the key, never the value) and `bun/notion-bot-rest.test.ts`
      (the mention run's shape; `post()`'s existing `Assign` cases still pass).
      Keep both files under 300 lines. Verify with those two files
- [ ] 1.2 Add `bun/notion-pause.ts <stop file> [<log>]` (design, *The
      comment* and *Failures print, never pause twice*): reads
      `notion-bot.json` with `settings()`, posts the comment on `pauses` with
      `comment()` and the mark `harness-pause`, then `assign()`; prints its one
      line and exits 0. Cases in `bun/notion-pause.test.ts` against the fake
      Notion server of `bun/notion-bot.fixture.ts`: posted with `Assign`; no
      settings; no `pauses`; the post fails (no `Assign` write); the `Assign`
      write fails; no log; a stop line over 1000 characters is cut; no line
      holds the token. Verify with that file

## 2. The wrapper runs it

- [ ] 2.1 In `orchestrator/pass.sh`, `pause()` runs the command `PASS_NOTIFY`
      names (split as `PASS_AS_AGENT` is) with the stop file and the log when
      it exists, ignoring its status; name it in the header. Cases in a new
      `orchestrator/pass-notice.test.ts` (skipped without `flock`, as
      `pass.test.ts` is), whose fake notifier records its arguments: a pass
      exiting 1 runs it once with the stop file and the log, and the wrapper
      still exits 1; the next tick exits 3 and runs it not at all; a halt (no
      token) runs it with the stop file alone; a notifier exiting 1 leaves the
      wrapper's status and the stop file unchanged; `PASS_NOTIFY` unset runs
      nothing; a pass stopped with `stop.sh` runs it not at all. Probe the
      split under dash too. Verify with that file on Linux CI
- [ ] 2.2 In `orchestrator/runner/entrypoint.sh`, the forced command sets
      `PASS_NOTIFY` to `bun --config=/dev/null --no-env-file
      /opt/orchestrator/bun/notion-pause.ts`; extend the forced-command case in
      `orchestrator/users.test.ts` to print it. Verify with that file and
      `orchestrator/layout.test.ts`
- [ ] 2.3 In `orchestrator/README.md`: the optional `pauses` key where
      `notion-bot.json` is written (section 5), and in section 7 that each
      pause posts one notice on that card, mentioning the user. Verify by
      reading both passages back

## 3. On the host

- [ ] 3.1 **User act.** Once this merges: create the *loop status* card on the
      Harness board (no `Pointer`), add its id as `pauses` to
      `/home/runner/.config/harness/notion-bot.json` in your own ssh session,
      and rebuild the runner with `docker compose up -d --build`. The next
      pause posts the notice; until one comes, nothing shows
