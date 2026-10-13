# guard-remote-code — tasks

One group, so the change ships whole on `feat/guard-remote-code`. The
numbers in brackets are the proposal-stage `/zombies` ideas each task covers.

## 1. The guard refuses an unread program and an installing bunx

Closes every scenario of `agent-permissions` §*A shell is not handed a program
the guard cannot read* and §*bunx runs only what is already installed*.

- [ ] 1.1 Write the failing cases first in `bun/command-guard-exec.test.ts`,
      each tagged with its scenario's `// spec:` line, and record that each
      blocking case exits 0 against the guard as it stands: the pipe, the
      `-s`, the process substitution, the command substitution, the heredoc
      and redirection, the option-value, the wrapped-shell and the `xargs`
      scenarios; and
      `bunx cowsay hi`, `bun x cowsay hi`, the flag after the package, `-p`
      without the flag, and the three wrapped `bunx` spellings
      (3, 7, 8, 10, 22–34, 36, 38, 40, 44–46)
- [ ] 1.2 Write the cases that must keep passing, and confirm they pass before
      and after: `bash bun/diff-budget.sh`, with and without a trailing
      `$(git merge-base HEAD origin/main)`; `sh -c "git status"`;
      `bash -o pipefail script.sh`; `bash --version`;
      `command -v bash`; `command -V sh`; `bunx --no-install openspec
      validate`; `bunx --bun --no-install playwright test`; `bunx --no-install
      -p renovate renovate-config-validator`; `bun x --no-install openspec`;
      `bun test x.test.ts` (4, 9, 11, 15–18, 35, 37, 39, 41, 42)
- [ ] 1.3 Add the boundary cases as their own tests: bare `sh`; bare `eval`;
      `bash -es`; `xargs sh -c`; `+o` and `-O` and `--rcfile x` each taking a
      value; script operands `-`, `/dev/stdin`, `/dev/fd/3` and
      `/proc/self/fd/0`; `cmd='git push --force'; sh -c "$cmd"` and `eval
      "$cmd"`, and `sh -c 'echo $(date)'` with them — the `$` test reaches a
      single-quoted string too — while `bash script.sh "$HOME"` passes; `bash -c "git
      status" $(echo x)` blocks; a blocked shell after `git status &&`; `cat a.sh |
      bash`; `zsh` and `dash` fed by a pipe; `bash -s -- --help` fed by a
      pipe blocks while `bash script.sh -s` passes, since options end at `--`
      or the script (1, 2, 5–8, 12–14, 19, 20, 33)
- [ ] 1.4 In `bun/command-parse.ts`, mark a command that a `$(`, a backtick or
      a `<(`/`>(` interrupts, without changing `commands()`'s return type, and
      stop `invocations` at `command -v`/`-V`; keep its existing tests green
      (design Decisions 3, 4)
- [ ] 1.5 Add `bun/command-guard-exec.ts` with the unread-program and bunx
      checks per design Decisions 2 and 5, each value-taking shell option
      listed beside its reason, and call both from `bun/command-guard.ts` for
      every candidate ahead of the `SHELLS` branch, with ledger ids
      `unread-program` and `bunx-install`; 1.1–1.3 pass
- [ ] 1.6 Assert the reasons, not only the exit code: the unread-program
      reason names the shell, showing the user the URL and running a local
      script by its path; the bunx reason
      names `--no-install`; each writes its ledger id (3, 21, 34, 43)
- [ ] 1.7 Delete `core/code-style.md`'s `bunx` bullet and narrow its pipe
      bullet to a script downloaded to a file and run by path, keeping the
      unattended clause; map `npx` to `bunx --no-install` in `core/rules.md`'s
      `playwright-cli` bullet; grep the four places that restate either rule
      and reconcile each — `agent-autonomy`'s `design.md` quotes the pipe
      bullet in its unattended table, if that change is not yet archived
      (design Decision 7)
- [ ] 1.8 Re-run the probe table in `proposal.md` §Why against the built guard
      and record the new column; measure `bun/command-guard.ts`,
      `bun/command-parse.ts` and the new files against the 300-line cap and
      record each number
