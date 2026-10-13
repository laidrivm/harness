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
file operand is outside this requirement, and is left to whatever the guard
decides for a shell's program arriving from outside the command. The same
holds for `bun x`, which is left to whatever the guard decides for `bunx`.
This requirement asks about a shell only for a script file it is given.

A block SHALL outrank a prompt. The guard decides to ask only once it has read
the whole command, so a refused act anywhere in the command still exits 2.

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
  `package.json` script, `bun info zod` or `bun x some-tool`
- **THEN** this requirement asks about none of them. Any decision on `bun x`
  is the `bunx` check's, not this one's

#### Scenario: A bun subcommand that runs code handed to it

- **WHEN** the agent attempts `bun exec "git push --force"`, `bun repl`, or
  `bun run /tmp/x.ts`
- **THEN** the guard asks

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

## MODIFIED Requirements

### Requirement: The git prohibitions are enforced by a hook

Three git prohibitions cannot be expressed as prefix-matched permission entries,
because their trigger is repository state or an argument in any position. They
SHALL be enforced by a single `PreToolUse` hook registered in the tracked
`.claude/settings.json`. The hook SHALL read the invoked command
from the event JSON on stdin rather than pattern-matching the raw payload, so
a `--force` appearing in a command's description cannot trigger it. It SHALL
block by exiting **2** with the reason on stderr — the only code Claude Code
treats as blocking — and SHALL exit 2 for an event it cannot decide as well: a
malformed payload, an absent command field or a git call of a git check that
fails. Every other non-zero code lets the command run, so the undecidable case
fails closed or it does not fail at all. Its one other answer is the prompt that
*An interpreter given program text the guard cannot read prompts* requires,
given by exit 0 with an `ask` decision on stdout. It SHALL depend on nothing
beyond git and bun, both of which the repository already requires.

A guard that never starts is the undecidable case too, and the script cannot
answer for it: an unresolved path or an absent `bun` exits **1**, which lets the
command run. The registered command SHALL therefore carry an `|| exit 2`
fallback, so every failure to launch blocks as well.

The hook SHALL carry no `if` field, and SHALL therefore run on every Bash call.
The `if` field takes a permission pattern, and a permission pattern matches the
command word literally: `/usr/bin/git commit` and `command gh pr comment` reach
no hook narrowed that way, which was demonstrated against the registered guard
before this requirement was written. Narrowing by `if` would mean the boundary
is whatever spelling the pattern anticipates. Deciding in the script instead
costs one bun start per Bash call, measured on a call it allows at 10.7-11.0 ms
before the merged-branch check and 11.0-11.1 ms after — negligible beside the
call it precedes — and the script SHALL resolve each command to its base name,
past a leading assignment, past a wrapper word such as `command`, `builtin`,
`exec` or `env`, and into a shell's `-c` argument.

The residual ceiling is a command whose text does not contain the guarded name
at all and which no interpreter the guard asks about runs — anything encoded
and handed to `make`, `find -exec`, `awk`'s `system()` or a git alias. That
is accepted: the guard exists for an agent that writes `git` and `gh` because
the documentation and this repository's prose do, not for an adversary. An
interpreter given code, such as `python -c` spawning a subprocess, is not
read either. It is asked about, as
*An interpreter given program text the guard cannot read prompts* sets out.

The hook SHALL block a commit while `HEAD` is on `main`, and SHALL block any
force-push, whether written as `--force`, `--force-with-lease`, `-f`, bundled
into a short-flag group such as `-uf`, which git reads as `-u -f`, or as the
`+` prefix of a refspec, and wherever it sits in the command. This is stricter than the prose it replaces, which
forbade force-pushing only after a pull request was open: the agent loses
force-push entirely, and the user keeps it.

The hook SHALL also block a push unless every destination the command names is
a concrete ref other than `main`. The rule is stated as what it exempts rather
than as a list of the spellings that mean `main`, because git's grammar has
more of those than a list remembers: `git push origin :` pushes every branch
that already exists on the remote, a wildcard refspec pushes whatever it
matches, and `git push origin HEAD` names its destination only through the
current branch.

While `HEAD` is on `main`, the hook SHALL block every push, whatever the
command names. A push with no refspec sends the current branch to its upstream
of the same name, and telling that case apart from a push that names a refspec
means deciding which operand is the repository — which a value-taking option
such as `-o <string>` moves by one word. Refusing every push from `main`
removes that decision instead of parsing around it, and costs an agent nothing:
it cannot commit there, so it has nothing of its own to push from there.

From any other branch, every operand SHALL be read as a refspec, including the
repository operand, which is one word that cannot be told from a refspec
without the same decision above — and a remote whose name is `main` blocks a
push that would have been allowed, which is the safe direction. The words that
are values of `-o` and `--push-option`, and of `--receive-pack`, `--exec` and
`--repo` in their separate-word form, SHALL be skipped, so a push option whose
value reads like a branch name does not refuse the push carrying it.

Each refspec SHALL be read as `[+]<src>:<dst>`, where a refspec without
`:<dst>` updates the ref its `<src>` names. The hook SHALL block when the
destination equals `main` or `refs/heads/main`; and when the destination is not a single concrete ref at all — the bare `:` and
`+:` matching form, a destination containing `*`, and an empty destination —
because an unbounded destination cannot be shown not to include `main`.

A leading `+` on a refspec SHALL be blocked as a force-push wherever it
appears, whatever its destination: it forces the update exactly as `--force`
does, and the flag pattern does not see it because it is not a flag.

`--all`, its alias `--branches`, `--mirror` and `--prune` SHALL be blocked
outright: each acts on refs the command does not name. The first three push
every ref under `refs/heads/` or `refs/`, `main` among them; `--prune` removes
a remote branch that has no local counterpart, so it deletes `main` from the
remote in any tree that does not carry it locally.

Those four SHALL be matched by prefix and not by exact spelling: git accepts
any unambiguous abbreviation, and `--mir`, `--pru`, `--al` and `--bra` all
reach the option they abbreviate. Any argument that is a prefix of one of the
four SHALL block, including one git would itself reject as ambiguous — over-
refusing a command git does not accept costs nothing.

Bare `--` SHALL be exempt from that prefix match, being a prefix of all four
and none of them: it ends option parsing, and git accepts it. It is the one
argument the justification above does not reach, since refusing it would refuse
a valid push. The operands after it are read as refspecs like any other, so
`git push -- origin main` still blocks on its destination.

The words skipped as option values SHALL be the exact spellings instead — `-o`,
`--push-option`, `--receive-pack`, `--exec` and `--repo`, and the `=` forms.
Prefix-matching there would let a short abbreviation swallow the word after it,
hiding an operand; leaving an abbreviated form unskipped reads that value as an
operand and can only refuse a push. Both lists therefore resolve their
uncertainty towards blocking.

The destination SHALL be read from the command's own words. A destination that
comes from configuration is outside the guard — `remote.<name>.push`,
`push.default` set to `matching`, `upstream` or `tracking`, and
`remote.<name>.mirror` set to true, which makes `--mirror` the default. Reading
them would make the hook decide on repository state the command does not carry,
and the fallback that fails closed on an unreadable state would then block
every push made where that configuration cannot be read. That half stays prose.

The script SHALL find the git command inside a compound one by splitting only
on separators outside quotes. A split that ignores quoting cuts both ways: it
severs a force flag from its command, and it turns a quoted `;` inside a
`--grep` argument into a fragment that reads as a commit. Quoting SHALL be
removed from the words it yields as well, so a value containing a space —
`GIT_AUTHOR_NAME="Jane Doe" git commit`, `git -C "some path" commit` — does not
break the command's resolution. A command substitution SHALL start a command
even inside double quotes, in **both** POSIX spellings, `$(…)` and backticks:
the shell expands them there alike, so honouring one and not the other leaves
the guard walked around by the other.

The branch SHALL be read from the repository the command names with `-C`, and
not from the guard's own working directory, which is a different repository in
exactly that case. `-C` is the only selector honoured: `--git-dir`,
`--work-tree` and the `GIT_DIR` and `GIT_WORK_TREE` environment assignments are
a declared limitation rather than coverage, so a command using one of them is
decided against the guard's own working tree — which can refuse a commit or a
push that would have landed elsewhere, and can miss one that lands on `main` in
another repository.

The long force flags SHALL be matched by the `--force` prefix rather than by
their full spellings. Git accepts any unambiguous abbreviation, so `--force-w`
and `--force-i` reach the force-push path while `--forc` and `--fo` are
rejected as ambiguous — every spelling git honours therefore begins with
`--force`.

#### Scenario: A commit attempted on main

- **WHEN** `HEAD` is on `main` and the agent attempts `git commit -m "fix"`
- **THEN** the hook blocks the call and the reason names branching first

#### Scenario: A commit on a feature branch

- **WHEN** `HEAD` is on `feat/something` and the agent attempts `git commit`
- **THEN** the hook allows the call

#### Scenario: A commit reached through a compound command

- **WHEN** `HEAD` is on `main` and the agent attempts `git add -A && git
  commit -m "fix"`
- **THEN** the hook blocks the call

#### Scenario: A commit reached through a command that does not start with git

- **WHEN** `HEAD` is on `main` and the agent attempts `bun test && git commit
  -m "fix"`
- **THEN** the hook blocks the call, because the script scans every subcommand
  and not the command string's prefix

#### Scenario: A guarded command reached by another spelling

- **WHEN** the agent attempts `/usr/bin/git commit` on `main`, `command gh pr
  comment 37 --body x`, or `bash -c "git commit"` on `main`
- **THEN** the hook blocks each one, because the script resolves the command to
  its base name rather than matching the word as written

#### Scenario: A guarded command behind a quoted value containing a space

- **WHEN** `HEAD` is on `main` and the agent attempts
  `GIT_AUTHOR_NAME="Jane Doe" git commit -m "fix"`
- **THEN** the hook blocks the call — splitting on whitespace alone would
  resolve the invocation to the tail of the quoted value instead of to `git`

#### Scenario: A guarded command inside a backtick substitution

- **WHEN** `HEAD` is on `main` and the agent attempts
  ``echo "`git commit -m fix`"``
- **THEN** the hook blocks the call, as it does for the `$(…)` spelling

#### Scenario: A forbidden command appearing only as text

- **WHEN** the agent attempts `printf 'git push --force'`
- **THEN** the hook allows the call — the guard reads invocations, and a quoted
  argument is data

#### Scenario: A command that merely ends in a guarded name

- **WHEN** the agent attempts `mygit commit -m "fix"` on `main`
- **THEN** the hook allows the call — the base name is `mygit`, not `git`

#### Scenario: A gh write reached by an absolute path

- **WHEN** the agent attempts `/opt/homebrew/bin/gh pr comment 37 --body x`
- **THEN** the hook blocks the call, which is the case the deny entry cannot see

#### Scenario: A gh write behind a global flag

- **WHEN** the agent attempts `gh --repo owner/name pr comment 37 --body x`
- **THEN** the hook blocks the call, because the pair is matched wherever it
  sits and not as the first two words

#### Scenario: A force-push with the flag last

- **WHEN** the agent attempts `git push origin feat/x --force`
- **THEN** the hook blocks the call, although no command-prefix pattern would
  have matched it

#### Scenario: A force flag bundled with another short flag

- **WHEN** the agent attempts `git push -uf origin feat/x`
- **THEN** the hook blocks the call, because git reads the group as `-u -f`

#### Scenario: A separator inside a quoted argument

- **WHEN** the agent attempts `git push origin "a;b" --force`
- **THEN** the hook blocks the call, because the `;` is inside quotes and does
  not start a second command that the flag would fall outside of

#### Scenario: An abbreviated force flag

- **WHEN** the agent attempts `git push --force-w origin feat/x`
- **THEN** the hook blocks the call, because git resolves the abbreviation to
  `--force-with-lease`

#### Scenario: A git command hidden in a command substitution

- **WHEN** the agent attempts `echo "$(git push --force origin feat/x)"`
- **THEN** the hook blocks the call

#### Scenario: A commit aimed at another repository

- **WHEN** `HEAD` here is on `feat/x` and the agent attempts `git -C ../other
  commit -m "fix"` where `../other` is on `main`
- **THEN** the hook blocks the call, because `-C` names where the commit lands

#### Scenario: A lease-guarded force-push

- **WHEN** the agent attempts `git push --force-with-lease`
- **THEN** the hook blocks the call — the boundary is the rewrite, not how
  carefully it is guarded

#### Scenario: An ordinary push

- **WHEN** the agent attempts `git push -u origin feat/x`
- **THEN** the hook allows the call

#### Scenario: The word force appears only in the description

- **WHEN** the agent attempts `git push origin feat/x` with the description
  "force the branch up to date"
- **THEN** the hook allows the call, because it reads the command field and
  not the whole payload

#### Scenario: A push aimed at main by refspec

- **WHEN** the agent attempts `git push origin HEAD:main` from a feature branch
- **THEN** the hook blocks the call

#### Scenario: A push naming main as its only refspec

- **WHEN** the agent attempts `git push origin main` from a feature branch
- **THEN** the hook blocks the call, because a refspec without `:<dst>` updates
  the ref its `<src>` names

#### Scenario: A push aimed at main by its full ref name

- **WHEN** the agent attempts `git push origin +HEAD:refs/heads/main`
- **THEN** the hook blocks the call

#### Scenario: A push with no refspec while HEAD is on main

- **WHEN** the agent attempts `git push` with `HEAD` on `main`
- **THEN** the hook blocks the call, because git pushes the current branch to
  the upstream branch of the same name

#### Scenario: A push of every branch

- **WHEN** the agent attempts `git push --all origin`
- **THEN** the hook blocks the call, because `--all` pushes every ref under
  `refs/heads/`, `main` among them

#### Scenario: A push that deletes main

- **WHEN** the agent attempts `git push origin :main`
- **THEN** the hook blocks the call — the refspec has no `<src>`, and `<dst>`
  is what the check reads

#### Scenario: A second refspec aimed at main

- **WHEN** the agent attempts `git push origin feat/x main`
- **THEN** the hook blocks the call, because every refspec is read and not
  only the first

#### Scenario: A blocked flag written as an abbreviation

- **WHEN** the agent attempts `git push --mir origin`
- **THEN** the hook blocks the call, because git resolves the abbreviation and
  the guard matches the four by prefix

#### Scenario: The end-of-options marker

- **WHEN** the agent attempts `git push -- origin feat/x` from a feature branch
- **THEN** the hook allows the call — `--` is a prefix of all four blocked
  options and none of them, and refusing it would refuse a valid push

#### Scenario: A push that prunes

- **WHEN** the agent attempts `git push --prune origin`
- **THEN** the hook blocks the call, because `--prune` removes a remote branch
  whose local counterpart is gone and names none of them

#### Scenario: A push of every branch with no branch to read

- **WHEN** the agent attempts `git push --all origin` with a detached `HEAD`
- **THEN** the hook blocks the call on the flag alone, without reading a
  branch it cannot read

#### Scenario: A push to a branch whose name contains main

- **WHEN** the agent attempts `git push origin HEAD:mainline`
- **THEN** the hook allows the call — the destination is compared whole

#### Scenario: A push whose source is main but whose destination is not

- **WHEN** the agent attempts `git push origin main:feat/x`
- **THEN** the hook allows the call, because `<dst>` is what the push updates

#### Scenario: A push with no refspec from a feature branch

- **WHEN** the agent attempts `git push` with `HEAD` on `feat/x`
- **THEN** the hook allows the call

#### Scenario: A push of matching branches

- **WHEN** the agent attempts `git push origin :`
- **THEN** the hook blocks the call — the refspec names every branch already on
  the remote, which cannot be shown to exclude `main`

#### Scenario: A push through a wildcard refspec

- **WHEN** the agent attempts `git push origin 'refs/heads/*:refs/heads/*'`
- **THEN** the hook blocks the call, because the destination is not a single
  concrete ref

#### Scenario: A push carrying a push option

- **WHEN** the agent attempts `git push -o ci.skip origin` with `HEAD` on
  `main`
- **THEN** the hook blocks the call, because every push from `main` is blocked
  and no operand has to be identified

#### Scenario: A push naming HEAD from a feature branch

- **WHEN** the agent attempts `git push origin HEAD` with `HEAD` on `feat/x`
- **THEN** the hook allows the call

#### Scenario: A force-push written as a refspec prefix

- **WHEN** the agent attempts `git push origin +feat/x:feat/x`
- **THEN** the hook blocks the call, because `+` forces the update exactly as
  `--force` does

#### Scenario: A push of another branch from main

- **WHEN** the agent attempts `git push origin feat/x` with `HEAD` on `main`
- **THEN** the hook blocks the call — every push from `main` is refused,
  because which operand is the repository is not decidable cheaply enough to
  rest a boundary on

#### Scenario: A push option whose value reads like a branch

- **WHEN** the agent attempts `git push -o main origin feat/x` with `HEAD` on
  `feat/x`
- **THEN** the hook allows the call, because the word after `-o` is that
  option's value and not an operand
