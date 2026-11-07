# kill-guard — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: <capability>/<slug>`
where a scenario names it. Every line in the tests is a string the guard
reads through `verdict()` from `bun/command-guard.fixture.ts`; none is run.

## 1. pkill, killall and the zsh wrappers

- [ ] 1.1 Failing cases in a new `bun/command-guard-kill.test.ts`, shaped as
      `bun/command-guard-bunx.test.ts`: `pkill -f "bun test"`,
      `killall bun` and `pkill -P 123` block as
      `{ code: 2, rule: "kill-by-name" }`, the stderr naming `TaskStop`
      (`agent-permissions/a-name-matched-across-the-machine`);
      `/usr/bin/pkill bun`, `command pkill bun`, `noglob pkill -f "bun test"`,
      `bash -c "killall bun"` and `ps aux | grep bun && pkill bun` block the
      same way (`agent-permissions/a-wrapped-or-nested-pkill`). In
      `bun/command-guard.test.ts`, beside the main-commit cases,
      `noglob git commit -m x` and `nocorrect git commit -m x` on main block
      as `main-commit`
- [ ] 1.2 Then `noglob`, `nocorrect` and `caffeinate` join `WRAPPERS` in
      `bun/command-words.ts`, and `killByName(name)` in
      `bun/command-guard-exec.ts`, beside `bunTestRetry`, returns the refusal
      for `pkill` and `killall`, blocked as `kill-by-name` from `check()` in
      `bun/command-guard.ts`; the header comments of both guard files name
      the new prohibition. Verify `bun test bun/command-guard` passes whole

## 2. kill

- [ ] 2.1 Failing cases in `bun/command-guard-kill.test.ts`, each blocking
      as `{ code: 2, rule: "kill-signal" }`: `kill 95034 27453`,
      `kill -9 68348` and `kill -TERM -- -123`, the stderr naming `TaskStop`,
      `kill %N` and the user (`agent-permissions/pids-found-across-the-machine`);
      `kill $pid`, `kill $PPID`, `kill $!`, `kill %$x`, `kill -$x %1`,
      `kill $(pgrep bun)` and `kill %1 $(pgrep bun)`
      (`agent-permissions/pids-the-guard-cannot-read`);
      `pgrep bun | xargs kill`, `xargs kill %1`, `command kill %1`,
      `env kill %1`, `nocorrect kill 95034` and `caffeinate -i kill 95034`
      (`agent-permissions/pids-fed-through-a-wrapper`);
      `bash -c "kill 95034"` and `eval kill 95034`
      (`agent-permissions/a-kill-written-inside-a-program-the-guard-reads`);
      and, from `/zombies`, `kill %1 95034`, `kill %1; kill 95034`,
      `kill -n 9 95034`, `kill -s 0 95034` and a heredoc fed to `bash`
      holding `kill 95034`. Each of these passing with no decision
      (`code: 0`, no rule): `sleep 30 & kill %1`, `kill -9 %1`,
      `kill -s KILL %1`, `kill -- %+`, `/bin/kill %1 2>/dev/null` and
      `{ kill %1; }` (`agent-permissions/a-job-the-line-started`);
      `kill -0 95034`, `kill -l`, `kill -l 15`,
      `if kill -0 95034; then echo up; fi`, `xargs kill -0` and
      `kill -0 $(pgrep bun)` (`agent-permissions/no-signal-sent`); a bare
      `kill` and `FOO=1 kill %1`
- [ ] 2.2 Then `killSignal(part, name, rest)` beside `killByName`, per
      design.md decisions 2 and 3, in this order: pass a first word of
      `args(rest)` that is `-0`, `-l` or `-L`; refuse when a wrapper stands
      among the words of `part` before the name — a predicate exported from
      `bun/command-words.ts` over `WRAPPERS`, never a second skip loop — or
      `part` is in `FED`; then take the signal word anchored as
      `^-[A-Za-z0-9]+$` (the next as `^[A-Za-z0-9]+$` after `-s`/`-n`) and a
      `--`, and refuse unless every word left matches `^%[A-Za-z0-9_+%-]*$`.
      Blocked as `kill-signal` from `check()`. Verify `bun test
      bun/command-guard` passes whole

## 3. The rule shrinks to what the guard cannot see

- [ ] 3.1 Shorten the Safety bullet *Never signal a process this session did
      not start…* in `core/rules.md`, under `agent-rulebook`'s *A rule only
      partly covered*, to the senders the guard does not read — a committed
      script's `process.kill`, `playwright-cli kill-all`, `fuser -k`,
      `find … -exec kill` — with no sentence restating what `kill-signal` and
      `kill-by-name` refuse. Verify `bun test bun/autonomy bun/review-config`
      passes, the tests that read `core/rules.md`

## 4. Integration

- [ ] 4.1 `bunx --no-install openspec validate kill-guard --strict` passes,
      and `bun test` passes whole; the PR body says the session's own hook
      runs the pinned `node_modules/harness`, so the refusal reaches a live
      session only with the pin bump that crosses this change
