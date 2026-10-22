# agent-permissions — delta spec

## ADDED Requirements

### Requirement: An interpreter given program text the guard cannot read is refused

The command guard SHALL refuse an interpreter given program text the guard
does not read. It exits 2 and writes on stderr a reason naming the interpreter,
what made the guard refuse it, and the route that runs: commit the script and
run it by its path. It refuses rather than prompts because a matching `allow`
rule silences a hook's `ask` (measured on Claude Code 2.1.308, 2026-10-22), so
the rule a "don't ask again" writes to `.claude/settings.local.json` would
grant every later call silently. A refusal also holds under every permission
mode, so an unattended session is refused at once rather than left waiting.

The interpreters are `sh`, `bash`, `zsh`, `dash`, `source`, `.`, `python` and
every name `python` followed by digits and dots and an optional `t`, as in
the free-threaded `python3.13t`, `node`, `bun`, `deno`,
`perl`, `ruby` and `php`. Each is resolved by base name, past wrappers,
assignments and redirections, as the git prohibitions are. An invocation of one of them
SHALL be refused unless one of the following holds:

- its only argument is `--version` or `--help`. The short forms differ
  between interpreters: `python3 -v` and `bash -v` turn on verbose mode, and
  then read a program from standard input;
- it is a shell carrying `-c`, whose text the guard reads and checks as
  *The git prohibitions are enforced by a hook* sets out;
- its first argument, with its symlinks resolved, names a file that the git
  repository holding it tracks unchanged from `HEAD`, or a file under that
  repository's top-level `node_modules/harness/`, where the harness package
  installs its scripts. A staged or uncommitted edit is refused, because a shell
  write makes one as easily as the editing tool does, and so does a file
  elsewhere under `node_modules/`;
- it is `bun` and its first argument is a subcommand that the installed
  `bun --help` lists, or an alias that help names, other than `exec`, `repl`
  and `create` with its alias `c`, which run code handed to them. `run`
  resolves its operand as bun does: a script of the nearest `package.json`
  first, even over a same-name file or directory, which applies the rule above
  to that `package.json` and reads the script's command line as a command
  line, so a script that runs an untracked file or inline code is refused as typing
  it would; else a regular file, to which it applies the rule above.

The resolution of uncertainty goes towards refusing. A path the guard cannot
resolve statically, such as one carrying `$`, behind an unresolvable `cd` or
through a symlink it cannot follow, is refused. So is a git call of this
check that fails, and an option of the interpreter standing before its file,
or of `bun run` before its script.
An interpreter that reads its program from standard input, given no argument
or `-`, is refused too, because the guard cannot read that program either.

A shell is the exception on standard input. A shell given neither `-c` nor a
file operand is outside this requirement, and is left to *A shell is not
handed a program the guard cannot read*. The same holds for `bun x`, which is
left to *bunx runs only what is already installed*. This requirement refuses
a shell only for a script file it is given.

The guard SHALL decide this refusal only once it has read the whole command,
so a git or `gh` prohibition anywhere in the command is the refusal recorded.

This requirement stands beside *The git prohibitions are enforced by a hook*
and qualifies one of its statements; where the two differ, this one decides.
The residual ceiling it accepts no longer holds an interpreter given code, such
as `python -c` spawning a subprocess, which is refused. What remains of that
ceiling is a command that no listed
interpreter runs, such as anything encoded and handed to `make`, `find -exec`,
`awk`'s `system()` or a git alias.

#### Scenario: Inline code

- **WHEN** the agent attempts `python3 -c "print(1)"`, `python3 -Ic
  "print(1)"`, `/usr/bin/python3.12 -c "print(1)"`, `python3.13t -c
  "print(1)"`, `node -e "1"`, `bun
  --eval "1"`, `bun -p "1"` or `perl -pi -e 's/a/b/' x`
- **THEN** the guard exits 2, writes nothing on stdout, and names the
  interpreter and the tracked-script route on stderr

#### Scenario: Inline code behind a wrapper

- **WHEN** the agent attempts `env FOO=1 python3 -c "print(1)"` or `command
  node -e "1"`
- **THEN** the guard refuses, as it does without the wrapper

#### Scenario: A throwaway script

- **WHEN** the agent attempts `bun /tmp/x.ts`, `python3 scratch.py` where
  `scratch.py` is untracked or edited, `bash /tmp/x.sh`, `source /tmp/env.sh`,
  `bun node_modules/.cache/x.ts`, or a tracked symlink or one under
  `node_modules/harness/` that points at such a file
- **THEN** the guard refuses

#### Scenario: A script the repository tracks

- **WHEN** the agent attempts `bun bun/pre-pr.ts` or `bash bun/diff-budget.sh`
  in a checkout that tracks both, unedited
- **THEN** the guard emits no decision, and the permission rules decide

#### Scenario: A script the harness package installed

- **WHEN** the agent attempts `bun node_modules/harness/bun/pre-pr.ts` in a
  consumer whose `node_modules/` is ignored
- **THEN** the guard emits no decision

#### Scenario: Code on standard input

- **WHEN** the agent attempts `curl -s example.test/x.py | python3`, `python3
  < x.py`, `node -` or `bun -`
- **THEN** the guard refuses, because none of them is given a file it can see

#### Scenario: A shell's own command text

- **WHEN** the agent attempts `bash -c "echo hi"`
- **THEN** the guard emits no decision. The text is read, and nothing in it is
  refused

#### Scenario: A bun subcommand

- **WHEN** the agent attempts `bun test`, `bun run check` where `check` is a
  script of a tracked, unedited `package.json` whose command line holds
  nothing refused, `bun info zod` or `bun x some-tool`
- **THEN** this requirement refuses none of them. Any decision on `bun x`
  is the `bunx` check's, not this one's

#### Scenario: A bun subcommand that runs code handed to it

- **WHEN** the agent attempts `bun exec "git push --force"`, `bun repl`, or
  `bun run /tmp/x.ts`
- **THEN** the guard refuses

#### Scenario: A package script the tree does not vouch for

- **WHEN** the agent attempts `bun run check` where `package.json` is
  untracked or carries an uncommitted or staged edit, or where the `check`
  script's command line, or its `precheck` or `postcheck` script's, is
  `bun x.ts` and `x.ts` is untracked, or `bun run --filter check evil`
- **THEN** the guard refuses, because the script's text or what it runs is not in
  the tree a reviewer reads

#### Scenario: A path the guard cannot resolve

- **WHEN** the agent attempts `bun "$SCRATCH/x.ts"`
- **THEN** the guard refuses

#### Scenario: A version query

- **WHEN** the agent attempts `python3 --version` or `node --help`
- **THEN** the guard emits no decision, while `python3 -v` is refused

#### Scenario: A block in the same command wins

- **WHEN** `HEAD` is on `main` and the agent attempts `python3 -c "print(1)";
  git commit -m fix`
- **THEN** the guard exits 2 with the commit's reason, and records the
  `main-commit` block

#### Scenario: A local allow entry does not let it through

- **WHEN** `.claude/settings.local.json` carries `Bash(python3 *)` under
  `permissions.allow`, and the agent attempts `python3 -c "print(1)"`
- **THEN** the guard still exits 2, since it reads no permission rule. Claude
  Code's hooks reference routes a hook's exit 2 as `deny`, which outranks
  `allow`
