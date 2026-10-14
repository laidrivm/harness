# agent-permissions — delta spec

## ADDED Requirements

### Requirement: An interpreter given program text the guard cannot read prompts

The command guard SHALL answer `ask` when an interpreter is given program text
the guard does not read. To answer `ask`, it exits 0 and writes on stdout a
`hookSpecificOutput` whose `permissionDecision` is `ask` and whose
`permissionDecisionReason` names the interpreter and what made the guard ask.
Claude Code then prompts, and a hook's `ask` forces that prompt in auto mode as
well. The `allow` rule that a "don't ask again" writes to
`.claude/settings.local.json` therefore cannot grant the call silently.

The interpreters are `sh`, `bash`, `zsh`, `dash`, `source`, `.`, `python` and
every name `python` followed by digits and dots, `node`, `bun`, `deno`,
`perl`, `ruby` and `php`. Each is resolved by base name, past wrappers,
assignments and redirections, as the git prohibitions are. An invocation of one of them
SHALL be asked about unless one of the following holds:

- its only argument is `--version` or `--help`. The short forms differ
  between interpreters: `python3 -v` and `bash -v` turn on verbose mode, and
  then read a program from standard input;
- it is a shell carrying `-c`, whose text the guard reads and checks as
  *The git prohibitions are enforced by a hook* sets out;
- its first argument, with its symlinks resolved, names a file that the git
  repository holding it tracks unchanged from `HEAD`, or a file under that
  repository's top-level `node_modules/`. A staged or uncommitted edit asks,
  because a shell write makes one as easily as the editing tool does;
- it is `bun` and its first argument is a subcommand that the installed
  `bun --help` lists, or an alias that help names, other than `exec`, `repl`
  and `create` with its alias `c`, which run code handed to them. `run` given
  an operand that is an existing file applies the rule above to that file.

The resolution of uncertainty goes towards asking. A path the guard cannot
resolve statically, such as one carrying `$`, behind an unresolvable `cd` or
through a symlink it cannot follow, is asked about. So is a git call of this
check that fails, and an option of the interpreter standing before its file.
An interpreter that reads its program from standard input, given no argument
or `-`, is asked about too, because the guard cannot read that program either.

A shell is the exception on standard input. A shell given neither `-c` nor a
file operand is outside this requirement, and is left to *A shell is not
handed a program the guard cannot read*. The same holds for `bun x`, which is
left to *bunx runs only what is already installed*. This requirement asks
about a shell only for a script file it is given.

A block SHALL outrank a prompt. The guard decides to ask only once it has read
the whole command, so a refused act anywhere in the command still exits 2.

This requirement stands beside *The git prohibitions are enforced by a hook*
and qualifies three of its statements; where the two differ, this one decides.
The prompt is that hook's third answer, beside letting the command run and
exiting 2. The exit 2 it requires
for a git call that fails covers the git checks' own calls, while a failing git
call of this check asks. And the residual ceiling it accepts no longer holds an
interpreter given code, such as `python -c` spawning a subprocess, which is
asked about. What remains of that ceiling is a command that no listed
interpreter runs, such as anything encoded and handed to `make`, `find -exec`,
`awk`'s `system()` or a git alias.

#### Scenario: Inline code

- **WHEN** the agent attempts `python3 -c "print(1)"`, `python3 -Ic
  "print(1)"`, `/usr/bin/python3.12 -c "print(1)"`, `node -e "1"`, `bun
  --eval "1"`, `bun -p "1"` or `perl -pi -e 's/a/b/' x`
- **THEN** the guard exits 0 with a `permissionDecision` of `ask`

#### Scenario: Inline code behind a wrapper

- **WHEN** the agent attempts `env FOO=1 python3 -c "print(1)"` or `command
  node -e "1"`
- **THEN** the guard asks, as it does without the wrapper

#### Scenario: A throwaway script

- **WHEN** the agent attempts `bun /tmp/x.ts`, `python3 scratch.py` where
  `scratch.py` is untracked or edited, `bash /tmp/x.sh`, `source /tmp/env.sh`,
  or a tracked symlink or one under `node_modules/` that points at such a file
- **THEN** the guard asks

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
- **THEN** the guard asks, because none of them is given a file it can see

#### Scenario: A shell's own command text

- **WHEN** the agent attempts `bash -c "echo hi"`
- **THEN** the guard emits no decision. The text is read, and nothing in it is
  refused

#### Scenario: A bun subcommand

- **WHEN** the agent attempts `bun test`, `bun run check` where `check` is a
  script of a tracked, unedited `package.json` whose command line asks
  nothing, `bun info zod` or `bun x some-tool`
- **THEN** this requirement asks about none of them. Any decision on `bun x`
  is the `bunx` check's, not this one's

#### Scenario: A bun subcommand that runs code handed to it

- **WHEN** the agent attempts `bun exec "git push --force"`, `bun repl`, or
  `bun run /tmp/x.ts`
- **THEN** the guard asks

#### Scenario: A package script the tree does not vouch for

- **WHEN** the agent attempts `bun run check` where `package.json` is
  untracked or carries an uncommitted or staged edit, or where the `check`
  script's command line is `bun x.ts` and `x.ts` is untracked
- **THEN** the guard asks, because the script's text or what it runs is not in
  the tree a reviewer reads

#### Scenario: A path the guard cannot resolve

- **WHEN** the agent attempts `bun "$SCRATCH/x.ts"`
- **THEN** the guard asks

#### Scenario: A version query

- **WHEN** the agent attempts `python3 --version` or `node --help`
- **THEN** the guard emits no decision, while `python3 -v` is asked about

#### Scenario: A block in the same command wins

- **WHEN** `HEAD` is on `main` and the agent attempts `python3 -c "print(1)";
  git commit -m fix`
- **THEN** the guard exits 2 on the commit, and writes no `ask`

#### Scenario: A local allow entry does not grant it

- **WHEN** `.claude/settings.local.json` carries `Bash(python3 *)` under
  `permissions.allow`, and the agent attempts `python3 -c "print(1)"`
- **THEN** Claude Code still prompts. This is measured by refusing the prompt,
  because an approval and an absent prompt look the same to the agent
