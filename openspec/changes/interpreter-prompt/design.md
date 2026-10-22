# interpreter-prompt — design

## Context

`check()` in `bun/command-guard.ts` walks every invocation that
`command-parse.ts` resolves. It recurses into a shell's `-c` text and into
`eval`, blocks on `git` and `gh`, and lets everything else pass with no
decision. Since this was written (2026-10-13) it also blocks a shell, `source`
or `eval` handed a program the line does not spell out, a `bunx` that would
install, and a test run carrying `--retry`; those checks live in
`bun/command-guard-exec.ts` and return a reason the same way. They are the
shell-stdin and `bunx` checks this change leaves alone (re-read 2026-10-22). Each block is `blocker()` in `bun/gate-ledger.ts`, which writes stderr,
records the block and exits 2. The guard has no outcome between allowing and
blocking. The `gh` checks live in `bun/command-guard-gh.ts`, which returns a
reason and leaves the exit and the ledger id to the guard. This change
follows that split.

Claude Code's hooks reference (read 2026-10-13) says a hook's `"ask"`
prompts, and forces the prompt in auto mode as well. There the classifier can
still deny the call but cannot approve it silently. Across hooks the order is
`deny` > `defer` > `ask` > `allow`, and exit 2 routes as `deny`. The reference
does not say whether an `allow` rule suppresses a hook's `ask`. That is the
card's whole premise, so task 1.7 measures it.

**Goals:** a prompt for every spelling the guard already resolves, which a
local `allow` cannot silence, and every documented agent command in the three
trees still passing. **Non-Goals:** see the proposal.

## Decisions

### Ask, not block

The card's title and the `settings-local-sweep` design both put interpreters
*behind a prompt*. A user at the terminal can approve a harmless one-liner.
Unattended, the prompt is a stall under auto mode and a refusal under
`dontAsk`, and neither is an act the user did not want, which is what
`autonomy.md` asks. A block was rejected: the Safety rule forbids routing a
refused act *through* an interpreter, not using one.

**Reversed 2026-10-22 by the task 1.7 measurement.** With `Bash(python3 *)`
in `.claude/settings.local.json`, `python3 -c "print(1)"` ran with no prompt
on Claude Code 2.1.308: a matching `allow` rule silences the hook's `ask`, so
the prompt guards nothing a "don't ask again" has once granted. The user
agreed to the fallback on the card: the same set is blocked, exit 2 through
`blocker()`, with the reason naming the tracked-script route. A block also
settles the unattended case — it refuses at once under every permission mode,
where an `ask` stalled a pass under auto mode until the session timed out.
Group 2 carries the switch.

### What counts as unread program text

A listed interpreter asks unless an exemption holds. The check is stated by
what it exempts, as `core/rules.md` asks of a scan. The interpreter list is an
enumeration, as `SHELLS` and `WRAPPERS` are, and the spec names the runners
outside it as the ceiling. The "first argument" rule is deliberately crude:
`python3 -I x.py` asks because an option stands first. Modelling every
interpreter's options is an enumeration that goes stale, and asking costs
only a prompt.

### Tracked, or installed under `node_modules/harness/`

A committed file's text is in the tree a reviewer reads. An uncommitted or
staged edit is not, and a shell write makes one past the guard, so it asks.
Consumers run `bun node_modules/harness/bun/<script>.ts`, which they do not
track, so the repository's own top-level `node_modules/harness/` is exempt.
The rest of `node_modules/` is not: no measured command runs a file there,
and exempting it would let a script written into `node_modules/.cache/` pass
(local CodeRabbit review). A file written into `node_modules/harness/` itself
still passes, which the stated ceiling accepts, since the guard is not built
for an adversary. Under bun's isolated linker `node_modules/harness` is a
link into `node_modules/.bun/`, so its resolved path falls outside the
exemption and asks. The three trees install hoisted, measured 2026-10-14, so
only the hoisted layout is exempt.

The operand resolves from every directory in the guard's `dirs` set, as `-C`
does, and then to its real path: a tracked symlink puts only its target's
name in the tree. Only an interpreter given a file pays for the git reads.

### `bun`: subcommands from `bun --help`, minus three

Of the subcommands bun 1.4.2's `--help` lists, three run code handed to them,
so they ask: `exec` (a shell script as text), `repl`, and `create`/`c` (a
template fetched and run). `x` is exempt here, because the `bunx` check
decides it. `run` resolves its operand as bun does, from each directory the
line may run in: a script of the nearest `package.json` first, even over a
same-name file or directory (probed on bun 1.4.2, PR #222 review), else a
regular file, which the file rule decides. A script is exempt only as far as
the tree vouches for it: the `package.json` it is read from is held to the
file rule (tracked, no uncommitted or staged edit, else ask) and parsed as the
JSONC bun accepts, an unparseable one asking; the script's own command line is
read as a command line, so a script that runs an untracked file or inline code
asks as typing that line would (PR #100 review), and a script that runs itself
is read once. Its `pre<name>` and `post<name>` scripts, which bun runs around
it (probed on bun 1.4.2), are read the same way (PR #222 review). An option
before `run`'s script asks, as one before an interpreter's file does:
`--filter check evil` runs `evil` in the packages `check` selects, and
`--cwd` moves the `package.json` the script comes from (PR #222 review).
The
flags `-e`, `--eval`, `-p` and `--print` need no special case: a flag as the
first argument is no subcommand and no file, so it asks. The constant carries
the version it was read from, and a test compares it with the installed `bun
--help`. This is how `bun/settings.ts` pins the manifest-writing forms.

### One decision per command, after the walk

`check()` collects `ask` reasons rather than acting on them, and `block`
still exits at once. After `check(command)` returns, the guard writes one
JSON object to stdout, records one ledger line under the first reason's id
and exits 0. The ids are `inline-code`, `untracked-script` and `stdin-code`.
Nothing else may reach stdout on that path, because Claude Code reads stdout
as the decision. The module is handed the guard's `check` as well as `dirs`
(applied 2026-10-22), because a `package.json` script's command line is read
as a typed line, so a block in it still blocks and an ask in it joins the
line's asks.

### The prose rule stays

The last Safety rule in `core/rules.md` keeps its subject, because a prompt
can be approved, as the `bunfig.toml` precedent records. Its reason clause
("the act walks past") stops being true, so task 1.8 proposes a rewording.

## Risks / Trade-offs

- [A hook `ask` loses to an `allow` rule] → then the card's premise fails.
  Task 1.7 measures it before the step is called done. If it fails, the
  fallback is exit 2 for the same set. That fallback is a block, which this
  design rejected, so the user is asked first. It failed (2026-10-22, see
  *Ask, not block*), and the user agreed to the block.
- [An older Claude Code does not force a hook's `ask` in auto mode] → the
  call then falls to the permission rules, which is today's behaviour, so no
  version is worse off than now. Claude Code 2.1.299 was installed when this
  was written (2026-10-14), and task 1.7 records the version it measures.
- [Unattended sessions stall on a prompt] → agents are already told not to
  use interpreters. The prompt text names the tracked-script route.
- [The JSON is malformed or mixed with other stdout] → Claude Code would
  ignore it and fall back to the permission rules, which is the gap itself.
  A test parses the guard's whole stdout as one object.
