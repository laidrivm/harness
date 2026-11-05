# frozen-install-unprompted

## Why

`Bash(bun install *)` and `Bash(bun i *)` sit in `permissions.ask`, and an
`ask` entry prompts over any `allow` and over auto mode. Every agent in a new
worktree therefore stops on its first `bun install`, and on the VPS, reached
through Remote Control, that prompt is a manual step in the stage 2.5 metric.
`bun install --frozen-lockfile` changes neither `package.json` nor
`bun.lock`, so it needs no prompt; any other install may rewrite them (card
*Let a frozen bun install run without a prompt*,
40e39875c31b81e8b989ef568b1f65a9).

## What Changes

- `Bash(bun install *)` and `Bash(bun i *)` leave `permissions.ask` — in the
  policy `bun/settings.ts` checks and `bun/sync-settings.ts` writes, so every
  consumer drops them at its next sync, and in the harness's own
  `.claude/settings.json`. The other manifest-writing commands (`bun add`,
  `bun remove`, `bun update`, `bun patch`, `bun pm pkg|version|trust` and
  their aliases) keep their `ask` entries unchanged.
- The command guard blocks (exit 2, reason on stderr) every install-family
  command except exactly `bun install --frozen-lockfile` or
  `bun i --frozen-lockfile`. The reason names that form and tells the agent
  to ask the user to run any other install in their own terminal. A
  command that assigns a variable before `bun`, as in `CI=1 bun install
  --frozen-lockfile`, is not the exact form: bun reads its install settings
  from the environment, and `BUN_CONFIG_SKIP_LOAD_LOCKFILE=1` was measured
  making a frozen install install a package the lockfile does not hold.
- A block, not a hook `ask`: a local `allow` silences a hook's `ask`
  (`2026-10-22-interpreter-prompt`, task 1.7), so one "don't ask again"
  would let a bare `bun install` run silently afterwards.
- Before the harness is installed, the bootstrap fallback guard lets through
  only `bun install --frozen-lockfile` or `bun i --frozen-lockfile`, no longer
  a bare `bun install` or `bun i`, which today the `ask` entry catches and
  would otherwise run unprompted.
- The harness's own tracked `allow` list gains `Bash(bun install
  --frozen-lockfile)` and `Bash(bun i --frozen-lockfile)`, so the frozen
  form runs without a prompt in the default permission mode too.
- Messages and docs that tell the agent to run `bun install` name the frozen
  form: the bootstrap's hint, the stale-install notice, the board loop's
  refusal, `README.md`, `core/git-and-prs.md`, `orchestrator/README.md` and a
  comment in `bun/board-loop.ts`. Where the step is the user's own — adding
  the harness to a project, moving its pin — the docs say it runs in the
  user's terminal.

Not in this change: a variable exported by an earlier command, or set in the
session's environment, which the guard cannot see; `bun add` and the other
package commands, whose prompt stays; the in-flight `host-deploy` change's
text, whose runner script already runs the frozen form.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *Every manifest-mutating invocation prompts, whatever
  else allows it* is renamed to say the install family is refused rather than
  prompted, and drops it from the `ask` list; a new requirement makes the
  guard refuse every install but the exact frozen form; *The untracked
  settings file is swept against the tracked policy* takes `bun add` as its
  example of an entry the `ask` list decides.
- `cloud-sessions`: *A cloud session installs the harness as it starts* says
  the bootstrap lets through only the frozen form, and that the agent's own
  install is decided by the guard rather than by a prompt.
- `harness-updates`: *A session names an install that lags the pin* names
  `bun install --frozen-lockfile`.

## Impact

- Changed: `bun/settings.ts` (`MANIFEST_WRITES`), `bun/settings.fixture.ts`,
  `.claude/settings.json` (ask, allow, the bootstrap hook text),
  `bun/command-guard-exec.ts` and `bun/command-guard.ts` (the new check),
  `bun/bootstrap.ts` (`BOOTSTRAP`, `NOTICE`), `bun/board-loop-clone.ts`,
  `bun/board-loop.ts`, the tests `bun/command-guard-install.test.ts` (new),
  `bun/command-guard-interpreters.test.ts`, `bun/settings-local.test.ts`,
  `bun/bootstrap.test.ts`, `bun/bootstrap-notice.test.ts`,
  `bun/board-loop-stage.test.ts`, and `README.md`, `core/git-and-prs.md`,
  `orchestrator/README.md`.
- Consumers: their next sync drops the two `ask` entries and writes the new
  bootstrap text; the harness check fails on a consumer whose settings still
  carry the old ones, as it fails on any drift, until that sync runs. An
  agent whose habit is a bare `bun install` is refused with the frozen form
  named, and a lockfile that disagrees with `package.json` makes the frozen
  install fail, which is the user's to resolve in their terminal.
