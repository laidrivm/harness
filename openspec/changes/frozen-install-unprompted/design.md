# Design

## Context

The install family's prompt comes from two `ask` entries that `bun/settings.ts`
holds in `MANIFEST_WRITES`, from which `ASK` is built: the harness check
compares a consumer's `permissions.ask` with `ASK` whole, and
`bun/sync-settings.ts` writes it. The harness's own `.claude/settings.json`
carries the same entries, and `bun/settings.fixture.ts`' `policy()` builds the
fixture from a copy of them.

Before the harness is installed, the Bash hook's fallback — `BOOTSTRAP` in
`bun/bootstrap.ts`, registered in every consumer's settings character for
character — lets `bun install` and `bun i`, bare or with `--frozen-lockfile`,
through and blocks everything else. Today the `ask` entry still prompts for the
bare form there; once the entry goes, the bootstrap is the only thing in front
of it.

The command guard reads a line through `command-parse.ts`: quotes are removed,
words split on whitespace, and each command of a compound line is judged
alone. `invocations()` strips leading assignments, wrappers and redirections
before the command name, so the name and the words after it are what a check
sees; a redirection *after* the name stays among those words (probed
2026-11-05: `bunx 2>&1 --no-install tool` blocks, `bunx --no-install tool`
does not).

## Goals / Non-Goals

**Goals:**
- `bun install --frozen-lockfile` and `bun i --frozen-lockfile` run without a
  prompt, before and after the harness is installed.
- Every other install form is refused, with no prompt a local `allow` could
  silence.

**Non-Goals:**
- Changing how `bun add`, `bun remove`, `bun update`, `bun patch` or the
  gated `bun pm` subcommands are decided; their `ask` entries stay.
- Tracking shell state across commands: a variable exported earlier, or set in
  the session, is not seen.
- Allowing `--ignore-scripts` or any other flag beside `--frozen-lockfile`,
  or any wrapper before `bun`.

## Decisions

### 1. Block, not a hook `ask`

The user chose option «б» on 2026-11-05, replacing «а» of 2026-11-04, which
had the guard answer `ask` for any form but the frozen one. The archived
`2026-10-22-interpreter-prompt` measured (design *Ask, not block*, task 1.7)
that a matching local `allow` silences a hook's `ask`, and the guard's header
records the same; one "don't ask again" on a bare `bun install` would then let
every later one run. Exit 2 blocks whatever any settings file allows.

Rejected: letting a bare `bun install` through (it may rewrite `bun.lock`), and
leaving the `ask` entries (every new worktree prompts).

### 2. "Exact" is the parsed words, with `bun` the first of them

The check runs on the words the guard already parses: `bun` is the command's
first word, and the words after it are exactly `install` or `i` followed by
`--frozen-lockfile`. So quoting, spacing and a path to bun do not matter
(`bun  i --frozen-lockfile`, `bun "install" --frozen-lockfile`,
`~/.bun/bin/bun i --frozen-lockfile`), since each runs the same bun with the
same words. Any other word after `bun` — a second flag, `=false`, a package,
a redirection such as `> package.json` — makes the form inexact and blocks.

Nothing may stand before `bun` either: no assignment (decision 3), no
redirection (`>package.json bun install --frozen-lockfile` truncates the
manifest before bun starts), and no wrapper. A wrapper's options are not
modelled, and some change what the install sees: `env -C /tmp/x` moves it to
a directory the line never names, and `xargs` appends words from standard
input, so `echo --config=x.toml | xargs bun i --frozen-lockfile` loads a
bunfig the guard never read. Refusing every wrapper costs `timeout 600 bun
install --frozen-lockfile`, which the agent runs without the `timeout`.

The install family is found as `bunTestRetry` finds `test`: the first word
after `bun` that is `install` or `i`, or that is neither an option nor the
word after one. That reads `bun --cwd ../x install --frozen-lockfile` as an
install, and inexact, so it blocks; `bun run install` and `bun pm ls` are not
installs and this check leaves them alone.

The check lives in `bun/command-guard-exec.ts` beside `bunxInstall` and
`bunTestRetry`, returning a reason or nothing, and `check()` in
`bun/command-guard.ts` blocks it under the id `bun-install`. It takes the
command's whole word list as well as the name and the rest, as `unreadProgram`
does, to see what `invocations()` strips before the name.

`invocations()` itself reads `X+=1` as a command name today: `NOT_A_NAME` in
`bun/command-words.ts` knows `X=1` but not the appending form, which bash and
zsh export to the command exactly as they do `X=1` (probed by the review,
2026-11-05). With no wrapper the parse stops there, so `X+=1 bun install` would
never reach this check, and `GIT_X+=1 git commit` never reaches the main-commit
check. `NOT_A_NAME` takes `+=` too. dash reads `X+=1` as a command name and
fails; the guard then refuses a line dash would not run, the safe way to be
wrong.

### 3. Any variable assigned before `bun` blocks

Recommended in the brief was refusing an assignment that names a `BUN_` or
`NPM_` setting. Every assignment is refused instead, as everything else before
`bun` is (decision 2). bun reads install
settings from the environment under several prefixes — `BUN_CONFIG_*`,
`NPM_CONFIG_*`, `npm_config_*` — and from proxy and certificate variables
whose names share none of them, so an enumeration would go stale silently
(`core/rules.md`: scope a scan by what it exempts). The threat is measured, not
theoretical: on bun 1.4.2 (2026-11-05), with a `bun.lock` that lacked
`is-odd`, `bun install --frozen-lockfile` failed with "lockfile had changes,
but lockfile is frozen", while `BUN_CONFIG_SKIP_LOAD_LOCKFILE=1 bun install
--frozen-lockfile` installed `is-odd@3.0.1` and exited 0. The cost is a
harmless `CI=1 bun install --frozen-lockfile` refused; the agent drops the
prefix, which the reason makes plain.

Not covered: `export BUN_CONFIG_SKIP_LOAD_LOCKFILE=1` as an earlier command,
or a variable in the session's environment. The guard judges each command
alone and keeps no shell state; following an `export` across a line would be
a shell interpreter, for a path no session has taken.

### 3a. Only a manifest the tree vouches for

"Frozen changes neither file" is true, but it is not the whole premise: a
frozen install installs whatever `package.json` and `bun.lock` hold on disk,
and runs the root package's lifecycle scripts (`preinstall`, `postinstall`,
`prepare`), which `bun.lock` does not record. The agent can edit both files
with the Edit tool, which no rule gates, so without more a frozen install
would let a dependency the agent wrote in, or a `postinstall` carrying inline
code, run unprompted — past the `ask` on `bun add` and past the interpreter
check. (Raised by the review; not reproduced by hand.)

So the frozen form passes only where, for every directory the line may run
in, the nearest `package.json` and the `bun.lock` beside it are tracked and
unchanged against `HEAD` — the `committed()` test `bun/command-guard-interpreters.ts`
already applies to a `bun run` script's `package.json`, lifted into one module
both callers import. A missing `bun.lock` fails it: a frozen install with no
lockfile resolves freely and writes none (probed on bun 1.4.2, 2026-11-05). A
directory outside any repository fails it, which closes
`cd /tmp/x && bun i --frozen-lockfile` over a manifest the agent wrote there.
What runs is then what a reviewer can read on the branch.

This narrows the user's «б», which allowed the exact form wherever it ran;
it widens nothing.

### 4. The bootstrap allows only the frozen form

Its test becomes `/^bun (install|i) --frozen-lockfile$/` on the trimmed
command, so a bare `bun install` or `bun i` is blocked before the install
exactly as after it, and the hint names `bun install --frozen-lockfile`. The
bootstrap stays a raw-string match: it runs before the parser is installed,
and refusing an unusual spacing there costs one retry. It does not check the
manifest against `HEAD` (decision 3a): it is inline text in every consumer's
settings, and before the first install a clone holds what it was cloned with.

### 5. The harness's own allow list names the frozen form

Dropping the `ask` entries is enough under auto mode, where agent sessions
here run, but in the default mode an unlisted command still prompts. The
harness's tracked `allow` gains `Bash(bun install --frozen-lockfile)` and
`Bash(bun i --frozen-lockfile)`, with no trailing ` *`, so only the exact
string matches. A consumer's `allow` list is its own and `sync` does not write
it; the README says a consumer may add the same two entries.

### 6. The reason sends any other install to the user's terminal

`command-guard: only \`bun install --frozen-lockfile\` (or \`bun i
--frozen-lockfile\`), exactly, with nothing before bun, over a package.json and
bun.lock committed unchanged, installs without the user — it changes neither
file. Any other install may rewrite them or run what no reviewer read: ask the
user to run it in their own terminal.` A frozen install
that fails because the lockfile disagrees with `package.json` reaches the same
remedy through bun's own message.

### 7. Docs and messages

Where the agent is told to install, the text names the frozen form: the
bootstrap's hint, the stale-install notice and its not-installed line, the
board loop's "pinned check is missing" refusal, `orchestrator/README.md`'s
clone setup, and the comment in `bun/board-loop.ts`, which explains an install
before any session by an `ask` that no longer exists. Where the step is the
user's own and must update the lockfile — README step 1 adding the harness,
README's manual pin move, `core/git-and-prs.md`'s re-pin with `bun add` — the
text keeps `bun install` and says it runs in the user's terminal.
`core/code-style.md` already says automated installs use the frozen form.

## Risks / Trade-offs

- [`bun install --frozen-lockfile 2>&1` is refused] → a redirection is a word
  of the command, and `> package.json` truncates the manifest, so no
  redirection is exempt, before `bun` or after it. The agent drops it; a pipe
  after it is a separate command and passes.
- [The root package's lifecycle scripts run] → only from a `package.json`
  committed unchanged (decision 3a). `--ignore-scripts`, which the cloud hook
  passes, stays outside the exact form, as the user's decision names it; an
  agent retrying after a failed cloud install therefore runs the committed
  root scripts the hook skipped.
- [A checkout whose installed guard predates the change] → the guard runs
  from `node_modules/harness/`, the settings from the tracked file. A
  checkout that has the new settings but an older install — a consumer's
  checkout after pulling the bump, any harness checkout after the apply PR
  merges and until its self-pin and install move past it — carries no `ask`
  entry for the install and an installed guard with no install check, so
  `bun install` or `bun install lodash` there is left to the permission mode.
  The window closes at that checkout's first install, and the stale-install
  notice names `bun install --frozen-lockfile`, which the old guard and the
  new both let run. Keeping the `ask` entries a release longer would prompt
  for the frozen form too, the very thing removed. The apply PR's body asks
  for the harness's self-pin bump right after its merge.
- [A consumer's check fails until it syncs] → as for any change to `ASK` or to
  the bootstrap text; the bump that lands the pin runs sync.
- [An agent used to a bare `bun install` loses a turn] → the reason names the
  form that runs.
- [A stale lockfile] → the frozen install fails; resolving it rewrites
  `bun.lock`, which is the user's in their terminal.
