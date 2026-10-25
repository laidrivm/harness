## 1. The notice command

- [x] 1.1 In `bun/notion-bot.ts`: `settings()` reads an optional `board`,
      checked with `ID` as `user` is, into `Settings`; lift the `Assign` write
      out of `post()` into an exported `assign(call, card, user)` and switch
      `post()` to it; `comment()` takes an optional user id, mentioned in a
      run after the mark. Cases in `bun/notion-bot.test.ts` (a bad `board`
      throws naming the key, never the value) and `bun/notion-bot-rest.test.ts`
      (the mention run's shape; `post()`'s existing `Assign` cases still pass).
      Keep both files under 300 lines. Verify with those two files
- [x] 1.2 Add `bun/notion-pause.ts <stop file> [<log>]` (design, *The step's
      card, or a card of its own*, *The comment* and *Failures print, never
      pause twice*): reads `notion-bot.json` with `settings()`; takes the slug
      from the stop line only as the design reads it; queries `board` for the
      cards whose `Pointer` names it; on exactly one, posts the comment with
      `comment()`, the mark `harness-pause` and the mention, then `assign()`;
      otherwise files the new card (`Name`, `Status` `approved`, `Assign`, the
      body with the reason) and posts the comment there; prints its one line
      and exits 0. Cases in `bun/notion-pause.test.ts` against the fake Notion
      server of `bun/notion-bot.fixture.ts`: a step's card found, posted with
      `Assign`; a halt's line, a new card filed with its fields and the
      comment; no card and two cards for the slug each file a new card naming
      why; a line with a slug but exit 2, or not opening with `board-loop: `,
      reads no step; no settings; no `board`; the query, the creation and the
      post failing each print which and write nothing after; the `Assign`
      write fails; no log; a stop line over 1000 characters is cut; no line
      holds the token. Keep the file under 300 lines. Verify with that file

## 2. The wrapper runs it

- [x] 2.1 In `orchestrator/pass.sh`, `pause()` runs the command `PASS_NOTIFY`
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
- [x] 2.2 In `orchestrator/runner/entrypoint.sh`, the forced command sets
      `PASS_NOTIFY` to `bun --config=/dev/null --no-env-file
      /opt/orchestrator/bun/notion-pause.ts`; extend the forced-command case in
      `orchestrator/users.test.ts` to print it. Verify with that file and
      `orchestrator/layout.test.ts`
- [x] 2.3 In `orchestrator/README.md`: the optional `board` key where
      `notion-bot.json` is written (section 5), and in section 7 that each
      pause posts one notice on the step's card or on a new `approved` card,
      mentioning the user, that the user clears its `Assign` when removing the
      stop file, and that a question open on that card is answered, not the
      notice. Verify by reading both passages back

## 3. On the host

- [ ] 3.1 **User act.** Once this merges: add the Harness board's data source
      id as `board` to `/home/runner/.config/harness/notion-bot.json` in your
      own ssh session, and rebuild the runner with `docker compose up -d
      --build`. The next pause posts the notice; until one comes, nothing
      shows
