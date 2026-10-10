# notion-update-guard — design

## Context

The harness registers `PreToolUse` only for `Bash`. Turn-gate registrations
reach consumers as text from `bun/bootstrap.ts` (`TURN_MARK`, `TURN_STOP`),
and `bun/settings.ts` asserts each one verbatim. The connector's update tool
takes `page_id`, `command` and, for `update_properties`, `properties`. Its own
description says `properties` is required for `update_properties`. Only
`cover` and `icon` are documented as settable alongside any command. The motivation is in
proposal.md, *Why*, and the requirement in `specs/task-board/spec.md`.

## Decisions

### A hook, not a permission entry

A permission rule matches a tool by name and cannot read its arguments.
Refusing the tool by name would stop every card write, which the board
workflow depends on. Only a hook reads `tool_input`.

### The matcher is a regular expression over the tool name

The matcher is `^mcp__.+__notion-update-page$`. A hook's `matcher` is a
regular expression in Claude Code's hooks reference, unlike a permission
rule's glob, so it does not depend on the server-segment glob that
`policy-gate-beyond-bash` stops to confirm (its task 1.6). Task 2.3 below
confirms it in a fresh session before consumers adopt it, as that change does.

- *Alternative: one literal matcher per server name.* Every server name that
  reaches a session would need its own entry, and a connector renamed later
  would pass silently.

### Fail-open, with no `|| exit 2`

The guard refuses one known misuse. It is not a boundary like the command
guard, which blocks on anything it cannot read. A guard that blocked on an
unreadable event would stop all board writes whenever the connector's event
shape changed. The registration therefore has no `|| exit 2`, the same
choice the turn gate made, and for the same reason.

### What counts as carrying `properties`

The guard refuses when `properties` is an object with at least one key, or
anything else that is not `null` or `undefined`. An empty object is let
through, since it would lose nothing. A non-object is refused, because the
connector would reject it in any case and the reason is more useful than its
error.

### The ledger, if it is there

The refusal records under the id `notion-properties-dropped` through
`bun/gate-ledger.ts`, which `gate-decision-ledger` adds. If this change is
applied first, the record is a task that waits on that module (task 1.4) and
nothing else in this change waits on it.

## Measurements

- **Consumers, 2026-10-10:** neither dota2 nor mellon registers a
  `PreToolUse` matcher other than `Bash`, and both keep a Notion board, so
  both adopt the registration. Their `mcp__` allow entries name read tools of
  the design server, which this matcher does not reach.
- **Cost:** one `bun` start per page update, which the command guard's
  header measures at 16–22 ms. A session that moves a card makes one or two
  such calls.

## Risks / Trade-offs

- [The connector renames the tool or the command] → the guard stops
  matching and lets everything through. The re-read stays in prose for
  exactly that reason, and the ledger shows the guard has stopped firing.
- [The connector starts applying `properties` beside other commands] → the
  guard refuses a call that would have worked. The reason names the split,
  which still works, so the cost is one extra call.
- [`bun/settings.test.ts` stands at 285 of its 300-line cap] →
  `policy-gate-beyond-bash` plans to split it. Whichever change lands second
  puts its cases in the split file, and neither grows the original past the
  cap.

## Migration Plan

Group 1 lands the guard, its registration in the harness, the bootstrap text
and the check. Group 2 is one change per consumer, made in the pull request
that bumps its pin past group 1. Without the registration, the bumped check
fails.
