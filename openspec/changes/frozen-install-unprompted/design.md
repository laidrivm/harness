# Design

## Context

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

A shell is not a wrapper here. The guard reads a `-c` program in full as a
line of its own, as it does for every other check, and the shell hands bun
neither words nor a directory the program does not spell out, so
`bash -c "bun install --frozen-lockfile"` is the exact form and runs.

The subcommand is found as `bunxInstall` finds `x` and `bunTestRetry` finds
`test`: the first word after `bun` that is one of the verbs sought, or that is
neither an option nor the word after one. Those two hold the walk as two
copies today; it is lifted into one helper all three call, so a third copy is
not made. That reads `bun --cwd ../x install --frozen-lockfile` as an
install, and inexact, so it blocks; `bun run install` and `bun pm ls` are not
installs and this check leaves them alone.

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

### 3a. No check of what the manifest holds

A frozen install installs whatever `package.json` and `bun.lock` hold on disk
and runs the root package's lifecycle scripts, which `bun.lock` does not
record. An agent that writes a dependency or a `postinstall` into those files
by hand, then runs the frozen form, gets them installed or run with no
prompt; today the `ask` entry on `bun install` would have stopped it.

The first review round proposed requiring the nearest `package.json` and its
`bun.lock` to be committed unchanged, as a `bun run` script's `package.json`
must be. The second showed what that would not cover: a rewrite earlier in
the same line, after the guard has read the files; a `cd` into a directory the
line creates; one commit on the agent's own branch; a workspace member's
`package.json`, a patch file, a `bunfig.toml` written through Bash; a
lockfile named `bun.lockb`. A check with that many open sides reads as a
boundary and is not one. The threat it answers — an agent rewriting the
manifest on purpose to run code — has not been seen, and the user's standing
position is to guard only a seen threat, with CI's required checks and a
human merge covering intent. So no manifest check: the exact form is decided
by its words alone, as the user's «б» states it. The guard catches the casual
path, an agent typing `bun install lodash`; a hand-written dependency shows
in the pull request's diff of `package.json` and `bun.lock`. Settled on the
card 2026-11-05: а — out of scope; the HEAD check (б) rejected.

### 4. The bootstrap allows only the frozen form

Its test becomes `/^bun (install|i) --frozen-lockfile$/` on the trimmed
command, so a bare `bun install` or `bun i` is blocked before the install
exactly as after it, and the hint names `bun install --frozen-lockfile`. The
bootstrap stays a raw-string match: it runs before the parser is installed,
and refusing an unusual spacing there costs one retry.

### 5. The harness's own allow list names the frozen form

Dropping the `ask` entries is enough under auto mode, where agent sessions
here run, but in the default mode an unlisted command still prompts. The
harness's tracked `allow` gains `Bash(bun install --frozen-lockfile)` and
`Bash(bun i --frozen-lockfile)`, with no trailing ` *`, so only the exact
string matches. A consumer's `allow` list is its own and `sync` does not write
it; the README says a consumer may add the same two entries.

### 6. The reason sends any other install to the user's terminal

`command-guard: only \`bun install --frozen-lockfile\` (or \`bun i
--frozen-lockfile\`), exactly and with nothing before bun, installs without the
user — it changes neither package.json nor bun.lock. Any other install may
rewrite them: ask the user to run it in their own terminal.` A frozen install
that fails because the lockfile disagrees with `package.json` reaches the same
remedy through bun's own message.

### 7. Docs and messages

Where the agent is told to install, the text names the frozen form (tasks
3.2–3.3, 4.2). Where the step is the user's own and must update the lockfile
— adding the harness, moving the pin by hand, a re-pin with `bun add` — the
text keeps `bun install` and says it runs in the user's terminal.

## Risks / Trade-offs

- [`bun install --frozen-lockfile 2>&1` is refused] → a redirection is a word
  of the command, and `> package.json` truncates the manifest, so no
  redirection is exempt, before `bun` or after it. The agent drops it; a pipe
  after it is a separate command and passes.
- [The root package's lifecycle scripts run, from whatever `package.json`
  holds] → accepted (decision 3a). `--ignore-scripts`, which the cloud hook
  passes, stays outside the exact form, as the user's decision names it; an
  agent retrying after a failed cloud install therefore runs the root scripts
  the hook skipped.
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
  for the frozen form too, the very thing removed. Refusing non-frozen
  installs in the bootstrap's text, which syncs with the settings, would
  close the window, at the price of a second reader of the line — a raw
  regular expression over a compound line, kept in step with the guard by
  hand; not taken. The apply PR's body asks for the harness's self-pin bump
  right after its merge.
- [A consumer's check fails until it syncs] → as for any change to `ASK` or to
  the bootstrap text; the bump that lands the pin runs sync.
