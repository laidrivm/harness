# frozen-install-guard

## Why

`frozen-install-unprompted` (archived 2026-11-06) made `bun run deps` run
without a prompt, but left `Bash(bun install *)` and `Bash(bun i *)` in
`permissions.ask` by design, and nothing an agent is handed at the moment it
installs names the script. On 2026-11-06 a worktree subagent typed
`bun install --frozen-lockfile` and stopped on the prompt, which the user
cleared by hand through Remote Control — a manual step in the stage 2.5
metric. The stop-gap is a Process rule in `core/rules.md` (#473); a refusal
the agent reads at the moment it types the install holds it instead (card
*Refuse a literal frozen bun install in the command guard, pointing at bun
run deps*, 41039875c31b81ecb83ee726adf6be27). It is an OpenSpec change
rather than a fix, because it changes how an existing gate behaves
(`core/feature-workflow.md`).

## What Changes

- The command guard refuses a typed `bun install` or `bun i` carrying
  `--frozen-lockfile`, alone or within a compound line, under a new ledger
  id `frozen-install`. The reason names `bun run deps`, and a plain
  `bun install`, which prompts, for the cases the script cannot serve: a
  re-pin, a `package.json` with uncommitted edits, a `bun.lock` that lacks
  the pin; a frozen install with other flags is the user's to run. The
  `PreToolUse` hook decides before the `ask` entry prompts, so the agent
  reads the refusal and retries with no prompt shown.
- A frozen install inside a committed script — `bun run deps` itself, or a
  consumer's own `setup` — is not refused: the guard reads a script's text
  through the same walk, and only the typed line is checked for this.
- Every other literal install — a plain `bun install`, `bun i`, `bun add`,
  `bun install <package>` — keeps prompting: those change the lockfile and
  stay the user's call. The `ask` entries are not touched.
- The stop-gap Process rule in `core/rules.md` («Install dependencies with
  `bun run deps` …») is shortened to what the guard cannot see — a plain
  `bun install`, which it leaves to the prompt — under agent-rulebook's
  *A rule only partly covered*; the frozen spelling leaves it.
- `README.md`'s sentence that every literal `bun install` prompts names the
  refusal of the frozen form.

Not in this change: the bootstrap, which still lets a frozen install through
before the harness is installed and prompts there, since the guard is not yet
on disk; an install typed in a form the guard's parse does not read as one,
which prompts as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *A frozen install runs through the deps script* — the
  guard refuses a typed frozen install, naming the script; its scenario
  *A literal install still prompts* narrows to the installs that change the
  lockfile.

## Impact

- Changed: `bun/command-guard-exec.ts` (a `frozenInstall` check beside
  `depsArgs`), `bun/command-guard.ts` (the call, the block, the header, and
  whether a line was typed or read from a script),
  `bun/command-guard-deps.test.ts` (the cases), `core/rules.md` (the rule
  shortened), `README.md` (one sentence).
- Reach: hooks run from the installed harness, so the refusal takes effect in
  this repository once its self-pin passes the merge, and in a consumer at
  the bump that crosses it. Nothing to sync: no settings text changes.
- Consumers measured 2026-11-07 (d2ass, mellon, skills, skills-mutation,
  woop-woop): no doc tells an agent to type a frozen install once the harness
  is installed; the frozen installs in their trees run in CI, in the board
  loop's clone, in a hook's command or in a `package.json` script, and the
  last is read as a script, which this check leaves alone.
