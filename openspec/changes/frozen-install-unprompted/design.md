# Design

## Context

Claude Code decides a Bash call by its permission rules first: "Rules are
evaluated in order: deny, then ask, then allow" (`code.claude.com/docs/en/permissions`,
*Manage permissions*), and "a matching ask rule still prompts even when the
hook returned `"allow"` or `"ask"`" (same page, *Precedence among rules,
hooks, and mods*; the hooks reference says the same: "Deny and ask rules are
still evaluated regardless of what the hook returns"). A Bash rule's "`*`
matches any text, including spaces", and no Bash rule negates, so
`Bash(bun install *)` cannot leave out one string, and no hook can let that
string past it.

What the rule matches is the command text, after compound commands are split
and wrappers stripped — not what a script runs. And the command guard already
reads a `bun run <script>` by the script's text: `interpreter()` in
`bun/command-guard-interpreters.ts` hands `bun run` to `bunRun()`, which
refuses a script whose `package.json` is not committed and otherwise checks
the script's command line through `check()`, as a typed line.

## Goals / Non-Goals

**Goals:**
- An agent installs from the lockfile with no prompt: in auto mode, and in
  the default mode where `allow` holds `bun run deps` or `bun run *`.
- Every literal `bun install` or `bun i` prompts exactly as today.

**Non-Goals:**
- Any new refusal in the command guard but the one decision 2 names.
- CI, the runner image, `orchestrator/runner/session.sh` and the board loop,
  which install outside any agent session.

## Decisions

### 1. The user's answers of 2026-11-06

On the card, after CodeRabbit round 4 on #430 found two more ways past the
command parse (`$(printf bun) install lodash`, and `(bun install
--frozen-lockfile) > package.json`):

- **2 б** — narrow the change: only the exact frozen install runs unprompted,
  every other install form stays on `ask` as today, and the guard blocks
  nothing new. This reverses the block of every non-frozen install chosen as
  «б» on 2026-11-05, and with it every parse decision of review rounds 1–3:
  `bun` as the command's first word, the refused assignments and wrappers,
  `X+=1` read as an assignment, the shared subcommand walk, and the refusal
  inside a shell's `-c` program, an `eval` or a substitution.
- **3 а** — the CodeRabbit threads about parse bypasses close as not
  applicable.
- **4 б** — since an `ask` rule beats a hook's `allow` (*Context*), the frozen
  install runs through a committed script, `"deps": "bun install
  --frozen-lockfile"`, called as `bun run deps`.

Rejected with 4: a hook `ask` for every non-exact form with the `ask` entries
dropped — "Yes, don't ask again" would write a local `allow`, which silences
a hook's `ask` (`2026-10-22-interpreter-prompt`, task 1.7), the reason «а» of
2026-11-04 was rejected; returning to the block; changing nothing.

### 2. The guard reads the script, and refuses words after it

`bun run deps` reaches `bunRun()`, which reads `bun install
--frozen-lockfile` from a committed `package.json` and checks it as a line;
no check refuses that line, so the call passes. A `package.json` with an
uncommitted or staged edit is refused as `untracked-script` before the script
is read. A test pins both, so a later check that refuses the script's text is
seen.

`bunRun()` reads the script, not the words typed after its name, and bun
forwards those to the install: `bun run deps --no-verify` skips integrity
checks (CodeRabbit round 5). That is no manifest edit, so a new check in
`bun/command-guard-exec.ts` blocks `bun run deps` followed by any word,
redirections included, under the id `deps-args`, the reason naming
`bun run deps` with nothing after it. It is the one refusal the change adds.

### 3. Sync owns `scripts.deps`

`syncSettings()` already computes every file's new text before writing any,
so a throw leaves all of them as they were. It gains `package.json`:

- no `scripts.deps` (or no `scripts`) → the key is added, the rest of the
  object kept in order, the file's indentation and trailing newline kept;
- `scripts.deps` equal to the text → the file is left byte for byte;
- `scripts.deps` holding other text → sync throws `package.json: scripts.deps
  is "<text>", not "bun install --frozen-lockfile" — rename that script, then
  sync`, and writes nothing. Overwriting a consumer's own script would break
  whatever calls it; refusing names the clash.

`settings.ts` holds the text as one constant both sync and the check import,
and its check fails while `scripts.deps` is missing or different, as it fails
on an `[install]` that is not exactly `INSTALL`. The harness's own
`package.json` gains the script by hand.

### 4. The bootstrap and the notice

Before the harness is installed the bootstrap's test becomes
`/^(bun (install|i)( --frozen-lockfile)?|bun run deps)$/` on the trimmed
command, and its hint `run bun run deps first`. A bare `bun install` still
passes the bootstrap and then meets the `ask` entry, as today. The notice's
two lines name `bun run deps`.

### 5. Docs

`README.md`'s bootstrap paragraph and clone setup name `bun run deps`, and a
sentence says a consumer whose `allow` lacks `Bash(bun run *)` may add
`Bash(bun run deps)` for the default mode. Steps that must rewrite the
lockfile — adding the harness, moving the pin by hand — keep `bun install`,
which prompts.

## Risks / Trade-offs

- [An agent rewrites the `deps` script] → an uncommitted rewrite is refused
  by the guard (decision 2); a committed one runs unprompted. That is a
  manifest edit, out of scope by the user's answer 1 а of 2026-11-05: guard
  only a seen threat, with the pull request's diff and a human merge covering
  intent.
- [A committed `predeps` or `postdeps`] → bun runs it around `deps`, and the
  guard reads it as a line, which no check refuses for `bun add`; a manifest
  edit, out of scope by 1 а (CodeRabbit round 5; settled on the card
  2026-11-06, answer 5 а).
- [An edited `package.json` before the harness is installed] → the bootstrap
  matches `bun run deps` by text and reads no file, so an uncommitted script
  runs; a manifest edit, out of scope by 1 а (round 5; settled on the card
  2026-11-06, answer 6 а).
- [A consumer's own `deps` script] → sync refuses and names it; the consumer
  renames it by hand before the bump lands.
- [A checkout whose install predates the change] → no window: the `ask`
  entries do not move, and an older guard reads `bun run deps` the same way.
