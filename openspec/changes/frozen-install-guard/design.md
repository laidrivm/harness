# frozen-install-guard — design

## Context

The command guard (`bun/command-guard.ts`) is the `PreToolUse` hook on every
Bash call; its program-level checks (`bunxInstall`, `bunTestRetry`,
`depsArgs`) live in `bun/command-guard-exec.ts`, each returning a reason that
`check()` blocks under its own ledger id. `subcommand()` there finds bun's
subcommand past bun's own options. The `ask` entries `Bash(bun install *)`
and `Bash(bun i *)` stay (*frozen-install-unprompted*, answer 2 б of
2026-11-06). The hook command runs the guard from
`$CLAUDE_PROJECT_DIR/node_modules/harness`, the installed self-pin, not from
the tree.

## Goals / Non-Goals

**Goals:**
- A typed frozen install never reaches the prompt where the guard reads it;
  the agent is told what to type instead.

**Non-Goals:**
- Closing every spelling of a frozen install. A form the parse misses
  prompts, as today.
- The bootstrap (`bun/bootstrap.ts`), which runs before the guard is
  installed and still lets a frozen install through to the prompt. A session
  meets it only where its project directory has no install yet; a worktree
  agent of a session started in an installed checkout runs the hooks that
  checkout's settings name (seen 2026-11-07: the hook text this change's
  explore read was the main checkout's, not the worktree's), and the board
  loop installs its clone itself.

## Decisions

### 1. A redirection, not a boundary

The refusal sends the agent to a form that runs unprompted; it guards
nothing the `ask` entry does not already hold. So it reads the command as
the other exec checks do and errs toward letting a call through: a miss
costs the prompt this change removes, never an install the user did not
see. This does not reopen 2 б of 2026-11-06, which dropped a *block* of every
non-frozen install because each parse gap there let a manifest change past
the user; here a parse gap falls back to the user.

Rejected: a hook `ask`, or a hook `allow` for the frozen form — an `ask`
entry prompts over a hook's `allow`, and a local `allow` silences a hook's
`ask` (decision 1 of *frozen-install-unprompted*).

### 2. What is refused

`bun` whose subcommand, found by `subcommand()` past bun's options, is
`install` or `i`, with the word `--frozen-lockfile` anywhere after it. Other
flags beside it refuse too (`--ignore-scripts`, `--production`): the card
asks for every install carrying the flag, `bun run deps` is the frozen
install the harness runs, and a variant the user wants is theirs to run.
Redirections are dropped through `args()`, so `2>&1` does not hide the
flag. A compound line, a pipeline, a `bash -c` program and an `eval` reach
the check through `check()`'s walk, as for every other check.

Rejected: only the exact two words — `bun install --frozen-lockfile
--ignore-scripts` would still stop on the prompt, the incident again. The
reason says such a variant is the user's to run, since `bun run deps` runs
the root lifecycle scripts a `--ignore-scripts` meant to skip.

### 3. Typed lines only, never a script's text

`check()` also reads a committed `bun run` script's text: `bunRun` in
`bun/command-guard-interpreters.ts` hands `pre<name>`, the script and
`post<name>` to the `read` callback, which is `check`. Unqualified, the new
check would refuse `bun run deps` — its own script — and a consumer's
`"setup": "bun install --frozen-lockfile && …"`, which `core/code-style.md`
asks automated installs to spell that way. The `ask` entries match the typed
text only, so a script's install never prompts, and there is nothing to
redirect. So `check(line, script = false)` carries whether the line was
typed: `interpreter()` is handed `(line) => check(line, true)`, a `bash -c`
program and an `eval` pass on the flag they were read under, and
`frozenInstall` is consulted only where it is `false`. Every other check
reads a script as it reads a typed line, as today.

Rejected: an exemption for the `deps` script by name — a consumer's own
scripts would still be refused.

### 4. The reason carries the rule's exception; the rule shrinks

The reason names `bun run deps`, and a plain `bun install`, which prompts,
for a re-pin (`core/git-and-prs.md`), a `package.json` with uncommitted edits
(where the guard refuses `bun run deps` as `untracked-script`) and a
`bun.lock` that lacks the pin (where the frozen install fails). The guard
covers the frozen spelling only; a habitual plain `bun install` still
prompts, and nothing refuses it, since it is also the right command in those
three cases. So under agent-rulebook's *A rule only partly covered* the
Process rule is shortened to what the guard cannot see — install with
`bun run deps`, and type a plain `bun install` only in those three cases —
rather than deleted. The shortened rule still names `bun run deps`, so the
window between this change's merge and the self-pin bump that brings the
refusal here is covered by prose as before.

### 5. Where the refusal is decided before the prompt

Claude Code runs `PreToolUse` hooks before the permission flow, and an exit
2 blocks the call even over a hook's own `allow` (Claude Code hooks
reference, read 2026-11-07). That a block on an `ask`-matched command shows
no prompt is read from that order, not measured; task 3.2 observes it, and
no `verdict()` case can.

## Risks / Trade-offs

- [A frozen variant the user wants run by an agent] → refused outright where
  it used to prompt; the reason says the user runs it in a terminal of their
  own.
- [A consumer whose own `deps` script is not a frozen install] → sync refuses
  to overwrite it and the harness check fails while it differs
  (*frozen-install-unprompted* decision 3), so that consumer is already
  failing its check, and the refusal pointing at its `deps` is one more
  symptom of the same fault.
- [The order of hook and prompt changes in Claude Code] → the refusal would
  follow a prompt rather than replace it; task 3.2's observation is the
  check, and the `ask` entry still holds the install either way.
