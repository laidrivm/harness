# kill-guard — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: <capability>/<slug>`
where a scenario names it. Every line in the tests is a string the guard
reads through `verdict()` from `bun/command-guard.fixture.ts`; none is run.

## 1. Signalled by name

- [x] 1.1 Failing cases in a new `bun/command-guard-kill.test.ts`, shaped as
      `bun/command-guard-bunx.test.ts`, each blocking as
      `{ code: 2, rule: "kill-by-name" }`: `pkill -f "bun test"`,
      `killall bun`, `pkill -P 123` and `skill -KILL -c bun`, the stderr
      naming `TaskStop` (`agent-permissions/a-name-matched-across-the-machine`);
      `/usr/bin/pkill bun`, `command pkill bun`, `noglob pkill -f "bun test"`,
      `setsid pkill bun`, `arch -arm64 pkill bun`, `bash -c "killall bun"`
      and `ps aux | grep bun && pkill bun`
      (`agent-permissions/behind-a-prefix-nested-or-chained`);
      `git grep -n pkill`, the stderr naming `'[k]ill'`, while
      `git commit -m "refuse pkill"` gets no `kill-by-name`
      (`agent-permissions/the-bare-word-in-a-search`)
- [x] 1.2 Then `killByName(part)` in `bun/command-guard-exec.ts`, beside
      `bunTestRetry`: a word of `part` whose base name is `pkill`, `killall`,
      `killall5` or `skill` returns the refusal; `check()` in
      `bun/command-guard.ts` calls it once per command, before the walk over
      `invocations`, and blocks it as `kill-by-name`. The header comments of
      both guard files name the prohibition. Verify `bun test
      bun/command-guard` passes whole

## 2. kill

- [x] 2.1 Failing cases in `bun/command-guard-kill.test.ts`, each blocking
      as `{ code: 2, rule: "kill-signal" }`: `kill 95034 27453`,
      `kill -9 68348`, `kill -TERM -- -123` and `kill %1 95034`, the stderr
      naming `TaskStop`, `kill %N` and the user
      (`agent-permissions/pids-found-across-the-machine`); `kill $pid`,
      `kill $PPID`, `kill $!`, `kill %$x`, `kill -$x %1`, `kill $(pgrep bun)`,
      `kill %1 $(pgrep bun)`, `kill -0 $(pgrep bun)` and
      `kill -0$(echo 9) 95034` (`agent-permissions/pids-the-guard-cannot-read`);
      `pgrep bun | xargs kill`, `xargs kill %1`,
      `pgrep bun | xargs -I-0 kill -0`, `xargs kill -0`, `command kill %1`,
      `env kill %1`, `nocorrect kill 95034`, `watch -n1 kill 95034` and
      `find . -name x -exec kill {} ;`
      (`agent-permissions/a-kill-behind-a-prefix`); `kill '<' 95034`,
      `kill %1 '>' 95034` and `kill %1 > /dev/null`
      (`agent-permissions/a-word-that-hides-the-next`);
      `kill -0 -s KILL 95034` and `kill -0 -9 95034`
      (`agent-permissions/a-signal-after-a-no-signal-probe`);
      `bash -c "kill 95034"` and `eval kill 95034`
      (`agent-permissions/a-kill-written-inside-a-program-the-guard-reads`);
      from `/zombies`, `kill %1; kill 95034`, `kill -n 9 95034`,
      `kill -s 0 95034` and a heredoc fed to `bash` holding `kill 95034`.
      Each of these passing with no decision (`code: 0`, no rule):
      `sleep 30 & kill %1`, `kill -9 %1`, `kill -s KILL %1`, `kill -- %+`,
      `/bin/kill %1 2>/dev/null`, `FOO=1 kill %1` and `{ kill %1; }`
      (`agent-permissions/a-job-the-line-started`); `kill -0 95034`,
      `kill -l`, a bare `kill` and `if kill -0 95034; then echo up; fi`
      (`agent-permissions/no-signal-sent`)
- [x] 2.2 Lift the test of whether a word can be a command name (not
      `NOT_A_NAME`, not an open redirection's target, not a `KEYWORDS` word)
      out of `invocations` into an export of `bun/command-words.ts`, and
      switch `invocations` to it; `bun test bun/command-guard bun/command-parse`
      passes unchanged
- [x] 2.3 Then `killSignal(part)` beside `killByName`, per design.md
      decisions 2 and 3: when a word of `part` has the base name `kill`,
      refuse unless that word is the first one 2.2's predicate accepts and
      `part` is not in `FED`; then read the words after it raw, in order —
      skip a redirection glued to its target, refuse an open one; take an
      optional signal (`-0`; `-s`/`-n` with `^[A-Za-z0-9]+$`; or
      `^-[A-Za-z0-9]+$`) and an optional `--`; then require `^[0-9]+$` for
      every operand after `-0` and `^%[A-Za-z0-9_+%-]*$` after anything else.
      Blocked as `kill-signal` from `check()` beside `killByName`. Verify
      `bun test bun/command-guard` passes whole

## 3. The rule shrinks to what the guard cannot see

- [x] 3.1 Shorten the Safety bullet *Never signal a process this session did
      not start…* in `core/rules.md`, under `agent-rulebook`'s *A rule only
      partly covered*, to the senders the guard does not read — a committed
      script's `process.kill`, a command string a tool runs itself
      (`watch "kill …"`), `playwright-cli kill-all`, `fuser -k` — with no
      sentence restating what `kill-signal` and `kill-by-name` refuse. Verify
      `bun test bun/autonomy bun/review-config` passes, the tests that read
      `core/rules.md`

## 4. Integration

- [x] 4.1 `bunx --no-install openspec validate kill-guard --strict` passes,
      and `bun test` passes whole; the PR body says the session's own hook
      runs the pinned `node_modules/harness`, so the refusal reaches a live
      session only with the pin bump that crosses this change
