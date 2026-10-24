# fresh-subagent-brief — design

## Context

Nothing in the tree says how a session delegates. The closest artefacts are
`core/autonomy.md`'s "An orchestrator copies the line into each worker's
brief, because a worker cannot see its parent's prompt" and `agent-autonomy`'s
scenario *A worker whose brief declares it unattended*: both assume a brief
and say nothing of its content or of forks.

What a fresh subagent already receives was observed, not assumed: a
subagent started by `Agent` with no fork, on 2026-10-25 in this repository,
opened with `CLAUDE.md`, the `core/rules.md` it imports, and the index lines
of the user's auto-memory — not the memory files those lines name, not the
parent's conversation, and not the docs the rulebook links. A board-loop
session on the VPS runs `claude -p` in a clone, so it loads the same
`CLAUDE.md` and rulebook, and no user memory at all.

The session brief this change draws from mixes four kinds of line:

| Kind | Example | Where it goes |
|---|---|---|
| A rule the rulebook holds | `git -C <literal path>`, no interpreter, no suppression | nowhere: the subagent loads it |
| A standing instruction of the user's that no file holds | report language, the approval comment before a pull request | the brief; the doc names the slot |
| A repository convention no file writes down | the 300-line cap, `flock` cases skip on macOS | the brief, until a change writes it into the tree |
| A session fact | host address, user id, scratchpad path | the brief only |

## Decisions

### A doc, not a skill

`core/delegation.md`, beside `autonomy.md`. A skill would cost a call and a
`SKILL.md` frontmatter for text an orchestrating session reads once, and a
skill is not copied by `bun/sync.ts`, which carries every Markdown file of
`core/` to consumers with nothing to add. The doc is read on demand.

### The rule reaches every session through one pointer line

The rule is a choice a session makes at the moment it delegates, so a doc
read on demand is too late. `core/rules.md`'s `### Rules` preamble already
holds two pointer lines, to `verification.md` and `autonomy.md`; a third,
stating the rule in one sentence and linking the doc, costs one always-on
line and grows no sublist (Process holds 17 of its ~20). Proposed wording:

> How a session hands a task to a subagent — a fresh one with a brief,
> forking only when the task needs the session's history — see
> [delegation.md](delegation.md).

### What the doc holds

- The rule and its reason, with the measured cost of a fork.
- What a fresh subagent loads by itself (above), so a brief leaves it out.
- The brief's slots, each named by what fills it, none filled: the task and
  its scope; the clone and the commands that make it run the repository's
  push hook; the acts allowed, named one by one (commit, push, pull request,
  card status, `Assign`, a comment, a host), with any act not named refused;
  the user's standing instructions no file holds (report language, the
  approval model, how a question reaches the user); the unattended line when
  the worker runs unattended (`autonomy.md`); where secrets and host
  addresses are read from, never their values; the report's shape (tasks
  done, commits, diff size, tests with the failing run before the fix, push
  and CI result, decisions beyond the design, questions only the user can
  settle, what was not run, any rule broken).
- That a repository convention no file writes down goes in the brief and is
  a lesson to capture into the tree, so the brief shrinks rather than grows.
- That the brief is a file in the session's scratchpad, shared by every
  subagent of the session, with a short task per subagent beside it.

### Kept in step by holding no copy

The card asked whether a test should pin the brief's key phrases against
`core/rules.md`. Pinning phrases would keep two copies in step by hand, which
the Code rule on writing logic twice warns against. Instead the brief holds
no rule of the rulebook, and `bun/delegation.test.ts` fails when the doc
copies a rulebook bullet whole. shortcut: a paraphrase passes the check; it
catches the copy-paste that built today's brief, not a reworded restatement.

### The stage prompt stays as it is

**User decision.** The board loop's stage session loads the rulebook, so the
pointer line reaches it; a line in `bun/board-loop-prompt.ts` would say the
same thing a second time. The launch form is also pinned at five lines by
`bun/board-loop-question.test.ts` and written out in
`core/feature-workflow.md`, so a sixth line costs the doc, the test and the
`stage-goal` launch form. Proposed: no prompt line, and no ban on forks
there — a loop session's history is one step, so a fork of it is cheap, and
one rule for every session is simpler than two. Group 2 of `tasks.md`
carries the other answer if the user picks it.

## Collisions

- `loop-reads-feedback` (branch `fix/loop-reads-feedback`, not on main)
  edits `bun/board-loop-prompt.ts`, its tests and `core/feature-workflow.md`.
  This change touches none of them unless group 2 is taken; if it is, that
  group lands after `loop-reads-feedback` merges, and is rebased onto its
  launch form. `after:` cannot name it until it merges.
- `no-pause-on-question` edits the pick prompt in the same file; group 2
  would touch only the stage prompt.
- The card on the approval model owns that model's wording; the doc names
  the slot only.

## Risks

- The doc says what a fresh subagent loads from one observation in one
  Claude Code version. If a later version stops passing `CLAUDE.md` to
  subagents, a brief without rules would run without them; the doc dates the
  observation so a reader can re-check it.
