# kill-guard — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: <capability>/<slug>`
where a scenario names it. Every line in the tests is a string the guard
reads through `verdict()` from `bun/command-guard.fixture.ts`; none is run.

## 1. pkill and killall

- [ ] 1.1 Failing cases in a new `bun/command-guard-kill.test.ts`, shaped as
      `bun/command-guard-bunx.test.ts`: `pkill -f "bun test"`,
      `killall bun` and `pkill -P 123` block as
      `{ code: 2, rule: "kill-by-name" }`, the stderr naming `TaskStop`
      (`agent-permissions/a-name-matched-across-the-machine`);
      `/usr/bin/pkill bun`, `command pkill bun`, `bash -c "killall bun"` and
      `ps aux | grep bun && pkill bun` block the same way
      (`agent-permissions/a-wrapped-or-nested-pkill`)
- [ ] 1.2 Then `killSignal(part, name, rest)` in
      `bun/command-guard-exec.ts`, beside `bunTestRetry`, returning the
      `kill-by-name` refusal for `pkill` and `killall`, called and blocked
      from `check()` in `bun/command-guard.ts`; the header comments of both
      files name the new prohibition. Verify `bun test
      bun/command-guard-kill` passes

## 2. kill

- [ ] 2.1 Failing cases in `bun/command-guard-kill.test.ts`, each blocking
      as `{ code: 2, rule: "kill-signal" }`: `kill 95034 27453`,
      `kill -9 68348` and `kill -TERM -- -123`, the stderr naming `TaskStop`,
      `kill %N` and the user (`agent-permissions/pids-found-across-the-machine`);
      `kill $pid`, `kill $PPID`, `kill $!`, `kill $(pgrep bun)` and
      `kill %1 $(pgrep bun)` (`agent-permissions/pids-the-guard-cannot-read`);
      `pgrep bun | xargs kill`, `xargs kill %1`, `command kill %1` and
      `env kill %1` (`agent-permissions/pids-fed-through-a-wrapper`);
      `bash -c "kill 95034"` and `eval kill 95034`
      (`agent-permissions/a-kill-written-inside-a-program-the-guard-reads`).
      And with no decision at all (`code: 0`, no rule): `sleep 30 & kill %1`,
      `kill -9 %1`, `kill -s KILL %1`, `kill -- %+` and
      `/bin/kill %1 2>/dev/null` (`agent-permissions/a-job-the-line-started`);
      `kill -0 95034`, `kill -l` and `kill -l 15`
      (`agent-permissions/no-signal-sent`). From `/zombies`, also refused:
      `kill %1 95034` (a job spec beside a pid), `kill %1; kill 95034`,
      `kill -n 9 95034`, `kill -s 0 95034` (only `-0` passes as no signal)
      and a heredoc fed to `bash` holding `kill 95034`; and passing with no
      decision: a bare `kill` and `FOO=1 kill %1`
- [ ] 2.2 Then extend `killSignal` per design.md decisions 2 and 3: refuse a
      `kill` whose name is not the first word of `part` once assignments and
      redirections are passed over, or whose `part` is in `FED`; otherwise
      read `args(rest)`, pass `-l`/`-L` and `-0`, take the signal word (and
      the next after `-s`/`-n`) and a `--`, and refuse unless every word
      left starts with `%`. Verify `bun test bun/command-guard` passes whole

## 3. The rule leaves its prose home

- [ ] 3.1 Delete the Safety bullet *Never signal a process this session did
      not start…* from `core/rules.md`, under `agent-rulebook`'s *A
      mechanised prohibition leaves its prose home*; `git grep -n "signal a
      process"` outside `openspec/changes/` then finds nothing. Verify
      `bun test bun/autonomy bun/review-config` passes, the tests that read
      `core/rules.md`

## 4. Integration

- [ ] 4.1 `bunx --no-install openspec validate kill-guard --strict` passes,
      and `bun test` passes whole; the PR body says the session's own hook
      runs the pinned `node_modules/harness`, so the refusal reaches a live
      session only with the pin bump that crosses this change
