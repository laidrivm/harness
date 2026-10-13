# guard-remote-code — design

## Context

`bun/command-guard.ts` walks every invocation `bun/command-parse.ts` finds on
a line — past wrappers, into `bash -c` and `eval` strings — and refuses by
name. What it cannot do today is see that a shell's program arrives from
somewhere other than the line: `commands()` splits a pipe into two commands
and keeps no record of which fed which, and it splits a command substitution
off the word it sits in. See `proposal.md` §Why for the probe.

## Goals / Non-Goals

**Goals:** close the route by which any guarded act reaches a shell unread
from the line itself — standard input, a substitution, an expansion —
`curl … | sh` among them; refuse `bunx` that installs; keep a repository
script and a literal `-c` string running.

**Non-Goals:** reading pipe topology in general; any interpreter that is not a
shell; a program the shell reads from a file — a script operand,
`--rcfile`/`--init-file` — whose contents the guard does not open
(`proposal.md` §Non-goals).

## Decisions

### 1. Refuse by where the program comes from, not by who produced it

The card asked for `curl`/`wget` output reaching a shell. A downloader list
cannot be closed — `wget -qO-`, `gh api … --jq .content | base64 -d`, `bun -e
"…fetch…"` — and `core/rules.md` scopes a check by what it exempts, not by an
enumeration of what it covers. The shell side has a closed grammar instead:
its program is a script operand, a `-c` string, or standard input. Refusing
the third outright also closes `echo '<guarded act>' | sh`, which the guard
lets through today.

*Alternative:* refuse only when a downloader and a shell share a line. Rejected:
it keeps the bypass in the second probe row and needs the list.

### 2. What counts as an unread program

For `sh`, `bash`, `zsh` and `dash`, walk the shell's own options — the words
after the name up to `--` or the first operand; every word after that belongs
to the script, so `bash script.sh -s` is a script and `curl … | bash -s --
--help` is not a version query:

- `--version` or `--help` among those options → not a run; allowed.
- A short-flag group (`-x`, `-eu`, `+o`) is an option; a group carrying `o` or
  `O`, and `--rcfile`/`--init-file`, take the next word as their value. A
  redirection and its target are skipped, as `invocations` already does.
- A group carrying `s` → reads stdin → **refused**.
- A group carrying `c` → the program is the next word: none there, one holding
  a `$`, the command marked as substitution-fed (Decision 3), or an `xargs`
  among the command's words before the shell → **refused**; otherwise the
  existing recursion reads the string, unchanged. `xargs -I{} sh -c '{}'`
  writes its input into the string, and without a replacement or a `$` the
  shell never reads what `xargs` appends, so refusing every `-c` that `xargs`
  runs costs no line anyone needs.
- Otherwise the first remaining word is the script. None, `-`, or a path under
  `/dev/` or `/proc/` → **refused**; any other path → allowed. Scoped by
  directory rather than by the stdin spellings (`/dev/stdin`, `/dev/fd/0`,
  `/proc/self/fd/0`), since no script of a repository lives in either.

`source` and `.`: the same operand test. `eval`: no words, any word holding a
`$`, or substitution-fed → refused.

A `$` is refused because the guard reads the text and the shell runs the
value: `cmd='git push --force'; sh -c "$cmd"` hands the recursion the literal
`$cmd`, which names nothing. Telling a harmless `$HOME` from a `$cmd` would
need the value, so every expansion in a program string is refused — a `-c`
string or an `eval`, never a script's arguments. A heredoc, a here-string and
`< file` all leave the shell with no script operand, so they need no case of
their own; `<(…)` reaches the shell as a lone `<` with nothing after it and
falls into the same branch.

The value-taking options are an enumeration, and an unlisted one would make
its value read as a script and allow the call. Shell option grammars are
stable and short; the list sits beside its reason in the code.

### 3. A substitution-fed mark from the parser, not a text search

`bash -c "echo $(curl …)"` reaches the guard as `["bash", "-c", "echo "]` —
the substitution has already been split off, so the `$` test of Decision 2
never sees it. Searching the raw line for `$(` would also fire on a script's
arguments elsewhere on the line, and `core/rules.md` says to read a value from
the structure the tool parses. So `commands()` marks the command it
interrupts when it opens `$(`, a backtick, or a `(` straight after a `<`/`>`;
the mark rides beside the array (a `WeakSet` export, or whatever the apply
finds smaller) so its one caller's type does not change. Only `-c` and `eval`
read it: `bash script.sh $(…)` is a script with arguments and stays allowed.

The mark cannot tell a substitution inside the `-c` string from one after it,
so `bash -c "git status" $(echo x)` is refused too. Telling them apart means
recording whether the substitution opened mid-word, and `eval x $(…)` would
still need the coarse rule, since `eval` joins every argument into its
program. The over-refusal is a line nobody needs; the precision is not worth
a second state in the scanner.

### 4. `command -v` names a command and runs nothing

Past a wrapper every word is a candidate, so `command -v bash` hands the guard
a bare `bash` with no script — which Decision 2 refuses. `invocations` stops
at `command -v`/`-V` instead. It is a correction of the parser, not an
exemption in the check: `command -v git commit` was never a commit either.

### 5. `bunx` needs `--no-install` among its own options

`bunx` and `bun x` (a `bun` whose first non-option word is `x`) are refused
unless `--no-install` appears before the first non-option word, skipping the
value of `-p`/`--package`. A word after the package is the package's own
argument (`bun.com/docs/pm/bunx`: `--bun` "must occur before the executable
name", and the same holds for every bunx flag).

The card asked whether `--no-install` of a package absent from `package.json`
needs a narrower rule. **Decided: no.** With the flag, bunx runs what is
already installed — the project's `node_modules` or Bun's global cache. After
this change only `bun add -g`, which the tracked `ask` list prompts for, or a
`bunx` run before it, can put a package in that cache. Checking
`package.json` from a hook means resolving which project the line runs in,
which `dirs` can only approximate. The residual is recorded under Risks.

### 6. Its own module, before the `-c` recursion

Both checks go in `bun/command-guard-exec.ts`, returning a refusal or nothing,
as `command-guard-gh.ts` does; the guard calls them for every candidate,
ahead of its `SHELLS` branch, since that branch `continue`s. Ledger ids:
`unread-program` and `bunx-install`. The guard stands at 264 lines of its
300-line cap.

### 7. Prose

`core/code-style.md`'s `bunx` bullet is deleted. Its pipe bullet narrows to
the case the guard cannot see — a script downloaded to a file and run by path
— and keeps its unattended clause. `core/rules.md`'s `playwright-cli` bullet
maps `npx` to `bunx --no-install`.

### 8. One step

One task group, so the change ships whole on `feat/guard-remote-code`. The
two checks share a module, a test file and a prose edit, and together sit
well under the diff budget's warning threshold.

## Risks / Trade-offs

- [Over-refusal of a local program fed by stdin — `sh < local.sh`, `bash
  <<'EOF'`] → the reason names the remedy, `bash <path>`; nothing in either
  consumer's tracked files does this (measured, `proposal.md` §Impact).
- [Over-refusal of a `-c` string or `eval` holding any `$`, `bash -c 'echo
  $HOME'` included] → run the commands directly, or put them in a script and
  run it by path; neither consumer's tracked files does this.
- [An unlisted value-taking shell option hides a stdin read] → the list is
  short and stable; a test pins each listed option.
- [A file the shell reads runs unread — a script operand, `--rcfile` or
  `--init-file`] → accepted: the guard reads a line, not the files it names,
  and opening one would judge a file that may change before the shell reads
  it; `core/code-style.md`'s narrowed bullet keeps a downloaded script.
- [A package already in Bun's global cache from before this change] → runs
  under `--no-install`; *Check by hand* in the PR.
- [The heredoc card stops reading a quoted heredoc's body as commands] → a
  shell fed by one is refused here whatever its body says, so the two compose
  rather than open a hole; whichever lands second rebases its
  `command-parse.ts` edit on the other's.
- [`fix/push-option-values` edits `bun/command-guard.ts`'s imports] → a
  one-line textual conflict for whichever merges second.
- [`agent-permissions` §*The tracked allow list holds only what a clone can
  use* gives `bunx openspec validate *` as an example of a pathless entry] →
  the example is about the entry's form and stays true of it; it is reworded
  the next time that requirement is modified, not by copying it whole here.
