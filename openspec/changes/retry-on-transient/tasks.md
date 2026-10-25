## 1. Classify a transient failure where it surfaces

- [ ] 1.1 Add `bun/transient.ts`: `class Transient extends Error`,
      `TEMPFAIL = 75`, `answered(status)` (5xx or 429) and `network(stderr)`
      with the patterns design.md lists. Cases in `bun/transient.test.ts`:
      500, 503, 429 transient, 401, 403, 404, 422 not; each pattern matched
      from a real git message, and `! [rejected] … (fetch first)`,
      `Authentication failed`, `returned error: 403` and `error: RPC failed;
      HTTP 413 curl 22 The requested URL returned error: 413` not. Verify
      with that file
- [ ] 1.2 `request()` in `bun/github-app.ts` and `client()` in
      `bun/notion-bot.ts` throw `Transient` for a rejected `fetch` and for an
      `answered()` status, with today's messages. Cases in
      `bun/github-app.test.ts` and `bun/notion-bot-rest.test.ts`: a stub
      answering 502 and one that never answers throw `Transient`; 401 throws a
      plain `Error`. Verify with those files
- [ ] 1.3 `bun/github-app-mint.ts` exits `TEMPFAIL` for a `Transient`;
      `minted()` in `bun/github-app-minted.ts` throws `Transient` for exit 75
      or for no exit status. Cases in `bun/github-app-mint.test.ts`: a mint
      whose API answers 503 exits 75, one answered 401 exits 1; a fake mint
      command exiting 75, and one sleeping past a short limit, make `minted()`
      throw `Transient`, and one exiting 1 a plain `Error`. Verify with that
      file and `bun test`
- [ ] 1.4 `session()` in `bun/board-loop-session.ts` adds
      `--output-format json` and returns `out` as the result object's
      `result` and `transient` as design.md *A session ended by a transient
      Claude API error* defines it, with `LIMITED` exported from
      `bun/transient.ts`; output that is not one result object is `out` as
      printed and not transient. Cases in `bun/board-loop-session.test.ts`
      with a stub `claude` printing the probe's objects: `null`, 529, 500 and
      429 transient; 401, a `You've hit your session limit · resets 3:45pm`
      result at 429, `is_error: false`, and plain text not; `out` is the
      `result`. Verify with that file and the `bun/board-loop*.test.ts` files

## 2. The pass ends `retry` on a transient failure

- [ ] 2.1 Split `bun/board-loop.ts` (289 lines) before adding to it: move
      `consider()` and `left()` into `bun/board-loop-candidates.ts` with no
      change in behaviour (skip the move if `loop-every-stage` made it
      first), and keep every file under 300 lines after group 2's
      additions. Verify with `wc -l` and the `bun/board-loop*.test.ts` files
- [ ] 2.2 Add the `retry` outcome exiting `TEMPFAIL` to `end()`, and end
      `retry` at the start's `git fetch` when `network()` matches its stderr
      (through `refuse()`, so a noted branch is switched back) and at the
      identity/`own()` `try` for a `Transient`. Cases, one per scenario of
      *A transient failure ends the pass `retry`* before the pick: GitHub's
      API unreachable or 502 → `retry`, exit 75, no session; 401 → `refused`,
      exit 1; Notion's id read 503 → `retry`; a fetch failing with `Could not
      resolve host` → `retry`, back on the noted branch. Verify with those
      cases
- [ ] 2.3 `publish()` in `bun/board-loop-push.ts` returns a `Transient` for
      `carry()`'s `origin` fetch, the mint and a push whose stderr
      `network()` matches; the pass ends `retry` for it. Cases in
      `bun/board-loop-push.test.ts` and the pass's tests: a push failing with
      `Connection reset by peer` → `retry`, branch kept, no pull request; a
      push rejected as non-fast-forward → `open`; a mint killed at its limit
      → `retry`. Verify with those cases
- [ ] 2.4 `post()` prints `UNREACHED`, exported beside `POSTED` and
      `ALREADY`, for a `Transient` from its reads or the question's comment,
      and the pass ends `retry` when the question line starts with it. Cases
      in `bun/board-loop-question.test.ts`: the comments read answered 500 →
      `retry`; the `Assign` write answered 503 → `waiting`, as today. Verify
      with those cases
- [ ] 2.5 The pass ends `retry` for a `transient` pick session through
      `refuse()`, and for a `transient` stage session before the post and the
      push when `git status --porcelain --untracked-files=no` in the
      session's clone is empty; with a tracked edit it ends `open` naming the
      API error. Cases in `bun/board-loop-stage.test.ts` through the
      fixture's stub: a pick ending on 529 → `retry`, exit 75, no stage
      session; a stage ending on 500 after a commit → `retry`, branch kept,
      nothing pushed or posted; the same with a tracked edit left → `open`;
      a stage ending on a 401 or on the usage limit → as today. Update
      `board-loop.ts`'s header to name `retry` and its exit status. Verify
      with those cases and `bun test`

## 3. The wrapper skips a transient tick until the third

- [ ] 3.1 `orchestrator/pass.sh`: keep `$state/<clone>.retries`; on exit 75
      add one and write no stop file below 3, write it at 3 naming the count
      and remove the count; remove the count on every other pass status; leave
      it on a busy lock and a paused tick. Route the push clone's fetch and
      the pin's fetch through a `skip()` that counts the same way; keep
      `halt()` for the checkouts. Update the header's exit statuses and the
      comment above the final `if`. Cases in `orchestrator/pass.test.ts`,
      whose fake runner exits `TEMPFAIL` imported from `bun/transient.ts`:
      one per scenario of the stop-file requirement's 75 cases (first,
      third in a row, a pass between, the push clone's fetch failing). Verify
      with those cases where `flock` exists (Linux CI) and `bun test`
- [ ] 3.2 `orchestrator/README.md` §7: a skipped tick exits 75 with no stop
      file, three in a row write one naming the count, and removing the stop
      file also needs no count reset. Verify by reading the section against
      `pass.sh`

## 4. Live

- [ ] 4.1 **User act.** Once group 3 is on `main` and the pin has moved,
      rebuild the runner image on the host so its `pass.sh` and mint are this
      change's; verify that `grep -c retries /opt/orchestrator/pass.sh` in the
      runner container prints a non-zero count
