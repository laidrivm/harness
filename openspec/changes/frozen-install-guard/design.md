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
--ignore-scripts` would still stop on the prompt, the incident again.

### 3. The reason carries the rule's exception

The reason names `bun run deps`, and a plain `bun install`, which prompts,
for a re-pin (`core/git-and-prs.md`), a `package.json` with uncommitted edits
(where the guard refuses `bun run deps` as `untracked-script`) and a
`bun.lock` that lacks the pin (where the frozen install fails). That is the
whole of the Process rule's exception, read at the moment it applies, so the
rule leaves `core/rules.md` whole.

### 4. Where the refusal is decided before the prompt

Claude Code runs `PreToolUse` hooks before the permission flow, and an exit
2 blocks the call even over a hook's own `allow` (Claude Code hooks
reference, read 2026-11-07). That a block on an `ask`-matched command shows
no prompt is read from that order, not measured; task 4.2 observes it.

## Risks / Trade-offs

- [The rule leaves before the guard acts here] → the rule goes with the
  apply's merge, the refusal with the self-pin bump past it; between the two
  an agent in this repository may meet the prompt again. Accepted: the
  bump follows a merge within the same stage, and a consumer gets both at
  its own bump.
- [A frozen variant the user wants run by an agent] → refused outright where
  it used to prompt; the user runs it in a terminal of their own.
- [The order of hook and prompt changes in Claude Code] → the refusal would
  follow a prompt rather than replace it; task 4.2's observation is the
  check, and the `ask` entry still holds the install either way.
