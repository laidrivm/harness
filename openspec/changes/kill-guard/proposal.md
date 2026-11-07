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

- The command guard is triggered by a word, not by a command position: any
  command holding the word `pkill`, `killall`, `killall5` or `skill` is
  refused, wherever it stands, so no prefix the guard does not know
  (`noglob`, `setsid`, `watch`, `find -exec`) hides it. A search for the bare
  word is refused too; the reason names a quoted `'[k]ill'` pattern instead.
- A command holding the word `kill` is refused unless `kill` is its command
  name with no prefix before it, no substitution feeds it, and each word
  after it fits: a glued redirection, a signal, `--`, and literal job specs
  (`%1`, `%+`), which name only a job of the shell running that very line.
  `kill -0` takes plain numeric pids, since it sends no signal. A numeric
  pid with a real signal, a process group, a word carrying a `$` (`$pid`,
  `$PPID`, `$!`, `%$x`) and an open redirection, which may be a quoted word
  hiding the next, are refused.
- The reason names `TaskStop` for a background task the session started,
  `kill %N` for a job the same line started, and the user for anything else.
- The stop-gap Safety rule in `core/rules.md` is shortened, under
  `agent-rulebook`'s *A rule only partly covered*, to the senders the guard
  cannot read: a committed script's `process.kill`, a command string a tool
  runs itself (`watch "kill …"`), `playwright-cli kill-all`, `fuser -k`.

Not in this change: a ledger of the pids a session spawned, or a check of a
pid's ancestry against the session's process (see design.md for why neither
is needed to stop the seen incident); a gate on the senders the shortened
rule names, none of which a session was seen using against another's
process.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: two new requirements, *A process is never signalled
  by name* and *A signal goes only to a job of the line's own shell*.

## Impact

- Changed: `bun/command-guard.ts` (the calls and the header's list),
  `bun/command-guard-exec.ts` (the two checks, beside `bunTestRetry`),
  `bun/command-words.ts` (the name-position predicate, lifted out of
  `invocations`), a new `bun/command-guard-kill.test.ts`, `core/rules.md`
  (the Safety rule shortened).
- Consumers: an agent can no longer stop a process by pid or by pattern. In
  the consumer trees measured (d2ass, mellon, woop-woop), only d2ass's
  untracked `.claude/settings.local.json` allows such calls —
  `pkill -f "bun --hot server.ts"` and two like it — and those become
  refusals; a dev server started with `run_in_background` stops through
  `TaskStop` instead. `kill %1`, which it also allows, still passes.
