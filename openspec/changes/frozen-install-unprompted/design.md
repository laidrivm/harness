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
- Allowing `--ignore-scripts` or any other flag beside `--frozen-lockfile`.

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

### 2. "Exact" is the parsed words, not the raw string

The check runs on the words the guard already parses: the command's name is
`bun`, its words are exactly `install` or `i` followed by `--frozen-lockfile`,
and no word before `bun` in that command is an assignment. So quoting and
spacing do not matter (`bun  i --frozen-lockfile`, `bun "install"
--frozen-lockfile`), nor does a wrapper or a path (`timeout 600 bun …`,
`~/.bun/bin/bun …`), since each runs the same bun with the same words. Any
other word — a second flag, `=false`, a package, a redirection such as
`> package.json` — makes the form inexact and blocks.

The install family is found as `bunTestRetry` finds `test`: the first word
after `bun` that is `install` or `i`, or that is neither an option nor the
word after one. That reads `bun --cwd ../x install --frozen-lockfile` as an
install, and inexact, so it blocks; `bun run install` and `bun pm ls` are not
installs and this check leaves them alone.

The check lives in `bun/command-guard-exec.ts` beside `bunxInstall` and
`bunTestRetry`, returning a reason or nothing, and `check()` in
`bun/command-guard.ts` blocks it under the id `bun-install`. It takes the
command's whole word list as well as the name and the rest, as `unreadProgram`
does, to see the assignments `invocations()` strips.

### 3. Any variable assigned before `bun` blocks

Recommended in the brief was refusing an assignment that names a `BUN_` or
`NPM_` setting. Every assignment is refused instead. bun reads install
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
--frozen-lockfile\`), exactly, with no variable set before it, installs without
the user — it changes neither package.json nor bun.lock. Any other install may
rewrite them: ask the user to run it in their own terminal.` A frozen install
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
  redirection is exempt. The agent drops it; a pipe after it is a separate
  command and passes.
- [The harness's own sessions lag] → its hooks run the guard from its pin,
  while its `.claude/settings.json` follows the tree, which `bun/self-pin.test.ts`
  compares with the tree's policy. From the merge until the self-pin bump
  past it, the harness's own settings carry no `ask` entry for the install
  and its pinned guard has no install check, so a bare `bun install` there is
  left to the permission mode. The window is one bump; the apply PR's body
  asks for that bump right after the merge. A consumer has no window: its
  bump moves the pin and syncs in one landing.
- [A consumer's check fails until it syncs] → as for any change to `ASK` or to
  the bootstrap text; the bump that lands the pin runs sync.
- [An agent used to a bare `bun install` loses a turn] → the reason names the
  form that runs.
- [A stale lockfile] → the frozen install fails; resolving it rewrites
  `bun.lock`, which is the user's in their terminal.
