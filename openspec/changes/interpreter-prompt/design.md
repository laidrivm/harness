# interpreter-prompt — design

## Context

`check()` in `bun/command-guard.ts` walks every invocation that
`command-parse.ts` resolves. It recurses into a shell's `-c` text and into
`eval`, blocks on `git` and `gh`, and lets everything else pass with no
decision. Each block is `blocker()` in `bun/gate-ledger.ts`, which writes stderr,
records the block and exits 2. The guard has no outcome between allowing and
blocking. The `gh` checks live in `bun/command-guard-gh.ts`, which returns a
reason and leaves the exit and the ledger id to the guard. This change
follows that split.

Claude Code's hooks reference (read 2026-10-13) gives a `PreToolUse` hook four
JSON outcomes, `allow`, `deny`, `ask` and `defer`, and states:

- `"ask"` prompts the user to confirm. A hook's `"ask"` also forces a
  permission prompt in auto mode, where the classifier can still deny the call
  but cannot approve it silently.
- Across hooks, `deny` > `defer` > `ask` > `allow`, and exit 2 routes as
  `deny`.
- Deny and ask rules are still evaluated, whatever the hook returns.

The reference does not say whether an `allow` rule suppresses a hook's
`ask`. That is the card's whole premise, so task 1.7 measures it.

## Goals / Non-Goals

**Goals:** an interpreter given program text the guard does not read prompts,
in every spelling the guard already resolves, and a local `allow` cannot
silence the prompt. Every command that the harness, `d2ass` and `mellon`
document for an agent to run passes unchanged.

**Non-Goals:** the proposal's list. Two of them sit close to this check: the
`bunx` check and the heredoc reading belong to their own cards.

## Decisions

### Ask, not block

The card's title and the `settings-local-sweep` design both put interpreters
*behind a prompt*. A user at the terminal can approve a harmless `python3 -c
'import json…'`. A blocked call would leave them nothing to approve. Unattended, the prompt
is a stall under auto mode and a refusal under `dontAsk`, and in both cases
the agent takes no act the user did not approve. That matches `autonomy.md`'s
"a stall, never an act the user did not want".

Rejected: blocking. The refusal would reach the agent, but the user would lose
an interpreter the brief never forbade. The Safety rule forbids routing a
refused act *through* one, not using one.

### What counts as unread program text

An invocation of a listed interpreter asks unless an exemption holds. The
exemptions are a version or help query, a shell's `-c`, a tracked or
installed file, and a `bun` subcommand. This states the check by what it exempts, as `core/rules.md` asks of a scan.
The interpreter list itself is an enumeration, as `SHELLS` and `WRAPPERS`
already are: a name the guard has never heard of carries no meaning it could
exempt. The spec states the remaining runners as the ceiling instead.

The "first argument" rule is deliberately crude. `python3 -I x.py` asks
because an option stands before the file, and `bun --bun run x` asks for the
same reason. Modelling every interpreter's value-taking options is the
enumeration that goes stale. Asking costs one prompt. Missing a case costs
the boundary.

### Tracked, or installed under `node_modules/`

A tracked file's text is in the tree a reviewer reads. An uncommitted edit to
one came through the editing tool, and `git diff` shows it. The consumers run
`bun node_modules/harness/bun/<script>.ts`, which no consumer tracks, so the
repository's own top-level `node_modules/` is exempt. A `node_modules` segment
anywhere else, as in `/tmp/node_modules/x.js`, is not. Measured 2026-10-13, every script
file the three trees document passes. The only local grant that would now
prompt is `d2ass`'s `sh .git/hooks/pre-commit`, a file no tree tracks.

Mechanics: resolve the operand from every directory in the guard's `dirs` set,
as `-C` and `cd` already are. A `null` place asks. Then run `git -C
<file's directory> ls-files --error-unmatch -- <file>`. On a miss, run `git
rev-parse --show-toplevel` from the same directory and compare against
`<top>/node_modules/`. A failing git call asks. Only an interpreter given a
file pays for these git reads, so the header comment's "only a commit pays"
grows by that clause.

### `bun`: subcommands from `bun --help`, minus three

On bun 1.4.2, `bun --help` lists `run`, `test`, `x`, `repl`, `exec`,
`install`, `add`, `remove`, `update`, `audit`, `dedupe`, `prune`,
`outdated`, `link`, `unlink`, `publish`, `patch`, `pm`, `info`, `why`,
`build`, `init`, `create` and `upgrade`, and the aliases `i`, `a`, `rm` and
`c`. Three run code handed to them, so they ask: `exec` (a shell script as
text), `repl`, and `create`/`c` (a template fetched and run). `x` is exempt
here, because the `bunx` card decides it. `run` hands its operand to the file
rule when that operand is an existing file, and otherwise it is a
`package.json` script, tracked text. The flags `-e`, `--eval`, `-p` and
`--print` need no special case: a flag as the first argument is no
subcommand and no file, so it asks. The constant carries the version it was
read from, and a test compares it with the installed `bun --help`. This is
how `bun/settings.ts` pins the manifest-writing forms.

### One decision per command, after the walk

`check()` collects `ask` reasons rather than acting on them, and `block`
still exits at once. After `check(command)` returns, the guard writes one
JSON object to stdout, records one ledger line under the first reason's id
and exits 0. The ids are `inline-code`, `untracked-script` and `stdin-code`.
Nothing else may reach stdout on that path, because Claude Code reads stdout
as the decision.

### The prose rule stays

The last Safety rule in `core/rules.md` keeps its subject. The prompt can be
approved, and a permission mode can approve it without the user, so the
mechanism is partial. `bunfig.toml` set that precedent in
*The supply-chain configuration files are gated*. Its reason clause ("both
read only the call's own words, so the act walks past") stops being true once
this ships. Rewording the rule is a rulebook edit, which goes to the user
through fix & capture, so the apply step proposes the new wording rather
than making the edit.

## Risks / Trade-offs

- [A hook `ask` loses to an `allow` rule] → then the card's premise fails.
  Task 1.7 measures it before the step is called done. If it fails, the
  fallback is exit 2 for the same set. That fallback is a block, which this
  design rejected, so the user is asked first.
- [Unattended sessions stall on a prompt] → agents are already told not to
  use interpreters. The prompt text names the tracked-script route.
- [The JSON is malformed or mixed with other stdout] → Claude Code would
  ignore it and fall back to the permission rules, which is the gap itself.
  A test parses the guard's whole stdout as one object.
- [MODIFIED requirement shared with #86] → whichever change archives second
  re-copies the requirement from the live spec and keeps only its own edits.
  The note at the top of `tasks.md` holds that step.
