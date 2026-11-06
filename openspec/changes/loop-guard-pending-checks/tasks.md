# loop-guard-pending-checks — tasks

One pull request. The failing cases come first, their failure seen before the
code changes, each cited as `// spec: loop-guard/<slug>` where a scenario
names it.

## 1. The guard skips a pending checks read

- [ ] 1.1 Failing cases in a new `bun/loop-guard-pending.test.ts`, since
      `bun/loop-guard.test.ts` would pass the 300-line cap, on the fixture
      `bun/loop-guard.fixture.ts`, each driving the spawned guard with three
      or four failures under one prompt:
      - not counted, with no warning and the next `PreToolUse` let run:
        `gh pr checks 437` exiting 8 four times
        (`checks-still-pending-read-four-times`); `gh pr checks 437 -R
        laidrivm/harness 2>&1` and `gh pr checks 437 --repo
        laidrivm/harness` (`a-repository-flag-and-a-redirect`); bare
        `gh pr checks`; an error that is `Exit code 8` with no output;
      - counted, the third failure warning: `gh pr checks 437` exiting 1
        (`a-failed-check`); `gh pr checks 437 | cut -f1`, `gh pr checks 437;
        gh pr checks 438`, `gh pr checks 437 && true`, `gh pr checks 437`
        and `false` on two lines, `gh pr checks "$N"` and `gh pr checks
        $(cat n)`, each exiting 8 (`the-read-inside-a-compound-command`);
        `gh pr checks 437 --json name,state` and `gh pr checks fix+retry`
        exiting 8 (`a-word-outside-the-set`);
        `bun test` exiting 8 (`another-command-exiting-8`); an error whose
        first line is `Exit code 80`; a non-Bash tool whose input carries
        that same `command` and the error `Exit code 8`;
      - a skipped read leaves the count as it was: two `Exit code 1`
        failures of `gh pr checks 437`, one `Exit code 8`, then a third
        `Exit code 1` warns with 3;
      - the shell claim of `design.md`, *Match the whole command*: under
        dash, bash and zsh where installed, with `gh` a shell function
        returning 8, `gh pr checks 437 -R o/r --interval=30 a.b:c@d_e-f
        2>&1` exits 8, and `gh pr checks =nosuchcmd` does not.
      Verify `bun test bun/loop-guard.test.ts` fails on the not-counted cases
      and the last one, and only those
- [ ] 1.2 Then, in `bun/loop-guard.ts`, `guard()` returns before it loads
      the count when the tool is `Bash`, the trimmed `command` matches
      `gh pr checks` followed by space- or tab-separated words of letters,
      digits and `./:@=_-` and at most a trailing `2>&1`, and the error's
      first line is exactly `Exit code 8`; a one-line comment names gh's
      `8: Checks pending`, and the header's first paragraph says a pending
      checks read is not counted. Verify `bun test bun/loop-guard.test.ts
      bun/loop-guard-refuse.test.ts bun/loop-guard-pending.test.ts` passes
