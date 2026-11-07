# kill-guard

## Why

On 06.11 a Claude Code session in woop-woop, which installs the harness and
so runs its command guard, looked for its own hung processes across the whole
machine with `ps aux | grep -E "biome|astro check|bun test|…"` and sent
`kill 95034 27453`, then `kill 68348 27468 82511 82472 76275 69737`. Among
those pids were the `bun test` runs of other agents' pre-pr in sibling
worktrees (#430, #439). An interrupted run writes a failure to the gate
ledger for its commit, and the next push reruns the whole suite, about ten
minutes each time. A stop-gap Safety rule in `core/rules.md` forbids
signalling a process the session did not start; nothing enforces it (card
*Refuse kill, pkill and killall aimed at a process the session did not
start*, 41139875c31b81e7ba94d2417d02e411; investigation in *Find what sends
SIGTERM to a pre-pr run while others run beside it*).

## What Changes

- The command guard refuses `pkill` and `killall` in every form, wherever
  they stand on the line.
- It refuses `kill` unless every pid operand is a job spec (`%1`, `%+`,
  `%sleep`), which names only a job of the shell running that very line. A
  numeric pid, a negative one (a process group), a variable (`$pid`, `$PPID`,
  `$!`) and an operand a substitution supplies are refused. `kill -0`, which
  sends no signal, and `kill -l`/`kill -L`, which list signal names, pass.
  A `kill` behind a wrapper (`xargs kill`, `command kill`, `env kill`) is
  refused, since `xargs` appends pids the guard never sees.
- The reason names `TaskStop` for a background task the session started,
  `kill %N` for a job the same line started, and the user for anything else.
- The stop-gap Safety rule in `core/rules.md` leaves under *A mechanised
  prohibition leaves its prose home*.

Not in this change: a ledger of the pids a session spawned, or a check of a
pid's ancestry against the session's process (see design.md for why neither
is needed to stop the seen incident); other ways to send a signal, such as
an interpreter's `process.kill`, which the interpreter check already refuses
as unread program text, or `launchctl`, which no session was seen using.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: a new requirement, *A signal goes only to a job of the
  line's own shell*.

## Impact

- Changed: `bun/command-guard.ts` (the call and the header's list),
  `bun/command-guard-exec.ts` (the check, beside `bunTestRetry`), a new
  `bun/command-guard-kill.test.ts`, `core/rules.md` (the Safety rule leaves).
- Consumers: an agent can no longer stop a process by pid or by pattern. In
  the consumer trees measured (d2ass, mellon, woop-woop), only d2ass's
  untracked `.claude/settings.local.json` allows such calls —
  `pkill -f "bun --hot server.ts"` and two like it — and those become
  refusals; a dev server started with `run_in_background` stops through
  `TaskStop` instead. `kill %1`, which it also allows, still passes.
