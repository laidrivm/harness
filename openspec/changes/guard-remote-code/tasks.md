# guard-remote-code — tasks

One group, so the change ships whole on `feat/guard-remote-code`. The
numbers in brackets are the proposal-stage `/zombies` ideas each task covers.

## 1. The guard refuses an unread program and an installing bunx

Closes every scenario of `agent-permissions` §*A shell is not handed a program
the guard cannot read* and §*bunx runs only what is already installed*.

- [x] 1.1 Write the failing cases first in `bun/command-guard-exec.test.ts`,
      each tagged with its scenario's `// spec:` line, and record that each
      blocking case exits 0 against the guard as it stands: the pipe, the
      `-s`, the process substitution, the command substitution, the heredoc
      and redirection, the option-value, the wrapped-shell and the `xargs`
      scenarios; and
      `bunx cowsay hi`, `bun x cowsay hi`, the flag after the package, `-p`
      without the flag, and the three wrapped `bunx` spellings
      (3, 7, 8, 10, 22–34, 36, 38, 40, 44–46)
      — evidence: on `0dec082` all 22 cases fail with `code: 0` and no
      ledger rule. A heredoc whose body is `git push --force` exited 2 on
      `force-push`, so the heredoc and here-string bodies are `echo hi`
- [x] 1.2 Write the cases that must keep passing, and confirm they pass before
      and after: `bash bun/diff-budget.sh`, with and without a trailing
      `$(git merge-base HEAD origin/main)`; `sh -c "git status"`;
      `bash -o pipefail script.sh`; `bash --version`;
      `command -v bash`; `command -V sh`; `bunx --no-install openspec
      validate`; `bunx --bun --no-install playwright test`; `bunx --no-install
      -p renovate renovate-config-validator`; `bun x --no-install openspec`;
      `bun test x.test.ts` (4, 9, 11, 15–18, 35, 37, 39, 41, 42)
      — evidence: before, 12 of 12 pass on `0dec082`; after, see 1.5
- [x] 1.3 Add the boundary cases as their own tests: bare `sh`; bare `eval`;
      `bash -es`; `xargs sh -c`; `+o` and `-O` and `--rcfile x` each taking a
      value; script operands `-`, `/dev/stdin`, `/dev/fd/3` and
      `/proc/self/fd/0`; `cmd='git push --force'; sh -c "$cmd"` and `eval
      "$cmd"`, and `sh -c 'echo $(date)'` with them — the `$` test reaches a
      single-quoted string too — while `bash script.sh "$HOME"` passes; `bash -c "git
      status" $(echo x)` blocks; `bash -co pipefail 'echo $HOME'`, `bash -oc
      pipefail 'echo $HOME'` and `sh -c -x "$cmd"` block, since the program is
      the first operand after the options (PR #99 review); a blocked shell after `git status &&`; `cat a.sh |
      bash`; `zsh` and `dash` fed by a pipe; `bash -s -- --help` fed by a
      pipe blocks while `bash script.sh -s` passes, since options end at `--`
      or the script (1, 2, 5–8, 12–14, 19, 20, 33)
      — evidence: on `0dec082` the 24 blocking cases fail and the 4 that
      run pass. Two added beside them: `bash -Oc extglob 'git push --force'`
      is refused as `force-push`, since the recursion now reads the program
      past the option's value; and `time cp a.txt .` and `xargs grep -n
      eval` run, since `.`, `source` and `eval` are builtins only the
      command's own name can be
- [x] 1.4 In `bun/command-parse.ts`, mark a command that a `$(`, a backtick or
      a `<(`/`>(` interrupts, without changing `commands()`'s return type, and
      stop `invocations` at `command -v`/`-V`; keep its existing tests green
      (design Decisions 3, 4)
      — evidence: the mark is the exported `WeakSet` `FED`; `OPEN_REDIRECTION`
      is exported and now takes `<<<`, so a here-string's word is not read as
      a script. `bun test bun/command-parse` 46 pass, three of them new
      `command -v`/`-V`/`-pv` cases that fail with the parse edit stashed
- [x] 1.5 Add `bun/command-guard-exec.ts` with the unread-program and bunx
      checks per design Decisions 2 and 5, each value-taking shell option
      listed beside its reason, and call both from `bun/command-guard.ts` for
      every candidate ahead of the `SHELLS` branch, with ledger ids
      `unread-program` and `bunx-install`; 1.1–1.3 pass
      — evidence: `bun test bun/command-parse bun/command-guard` 303 pass,
      0 fail, the 1.2 cases among them; the whole suite 1270 pass. The `-c`
      recursion reads from the operand `shellWords` finds rather than the
      word after the `c`; `.`, `source` and `eval` are checked only as the
      command's own name, never past a wrapper
- [x] 1.6 Assert the reasons, not only the exit code: the unread-program
      reason names the shell, showing the user the URL and running a local
      script by its path; the bunx reason
      names `--no-install`; each writes its ledger id (3, 21, 34, 43)
      — evidence: two reason cases (a pipe into `zsh`, so a reason naming
      `sh` alone fails) and every blocking case asserts `unread-program` or
      `bunx-install` from the ledger; the file runs 64 pass
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
