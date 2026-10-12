# policy-gate-beyond-bash — design

## Context

See proposal.md for why. The permission policy is `agent-permissions`; its
consumer half is `bun/settings.ts`, which compares the Bash deny and ask lists
whole and asserts the hook texts `bun/bootstrap.ts` exports. A consumer's
`harness:check` runs it in the pre-push hook and in CI. Since
`harness-auto-bump` (archived 2026-10-11, after this change was proposed),
`bun/sync-settings.ts` writes every value that check compares exactly, and
each consumer's automatic bump runs the sync, the check and its `bumpTest`
before it lands a new pin on the consumer's `main`.

MCP tools reach a session from three places: a claude.ai connector, whose
tools Claude Code names `mcp__claude_ai_<server>__<tool>`; a server the user
registered on their machine, named as they chose; and a project's `.mcp.json`.
The rule syntax and its precedence were checked against the permissions and
permission-modes references (`code.claude.com/docs/en/permissions` and
`/permission-modes`, read 2026-10-10):

- `mcp__<server>`, `mcp__<server>__*` and `mcp__<server>__<tool>` match a
  whole server or one tool.
- Deny and ask rules accept a glob in the tool-name position, matched against
  the full tool name; allow rules accept one only after a literal
  `mcp__<server>__` prefix.
- Rules are evaluated deny, then ask, then allow, across every settings
  source, and the first match decides: an allow cannot skip an ask, and an
  ask cannot reach a call a deny already refused.
- A tool matched by an explicit ask rule is among the actions no mode
  auto-approves: it prompts in `auto` and `bypassPermissions` alike, and
  `dontAsk` refuses it rather than prompting.
- A tool matched by a bare-name deny rule, glob included, is removed from the
  session's context; one matched by an ask rule stays in it.
- An `mcp__` rule with parentheses is skipped at load, with a warning.

## Measurements

Taken 2026-10-10, read-only, against each consumer's checked-out tree; dota2
re-measured after its `main` was pulled the same day.

- **dota2 and mellon** carry the same eight deny entries as the harness —
  four package managers, three `gh` writes, `Edit(.npmrc)` — and the same
  sixteen ask entries, none of them `mcp__`. Each allows three read tools of
  one design server (`list_projects`, `list_files`, `read_file`), written
  with a literal server prefix and no parentheses, so the new check leaves
  them alone. Neither has a `.mcp.json`.
- **No tracked text** in either consumer or in the harness, outside those
  allow entries, names an MCP tool, and none names one of the four, so no
  skill or doc relies on calling them.
- **The user-level settings** on the measuring machine allow two Notion tools
  under the server name `notion`, while this session's connector exposes the
  same tools as `claude_ai_Notion`. One tool reaches sessions under two server
  names on one machine, which is what decides the wildcard below.
- Neither consumer carries an `mcp__` ask entry (re-read 2026-10-12), so a
  sync that writes the four replaces none of theirs.

## Decisions

### Ask, not deny — the user's choice

The user chose `ask` for all four. A send the user has read and approved at
the prompt is legitimate; the rule forbids one they never saw. `deny` would
remove the tool from context and leave no path to a send the user wants the
agent to make, which is the case the prompt keeps. The prose this replaces
says *never*; it becomes *only with the user's approval at the prompt*.

What `ask` costs over `deny`: the tool stays in the session's context, so the
agent can still reach for it, and the prompt — not the tool's absence — is
the boundary. That boundary holds in every mode except one that answers it
for the user (see *Risks*).

### Deny still overrides ask

A project wanting a tool refused outright adds its own deny entry. Deny is
evaluated first, so the call is refused without a prompt and the tool leaves
the session's context; the harness's ask entry for it is then unreachable.
The check compares the `mcp__` ask entries only and does not object to a
project's `mcp__` deny entries: refusing is stricter than prompting, and the
choice is the project's. This differs from `Edit(bunfig.toml)`, whose deny the
check refuses, because the workflow needs to make that edit, while no
workflow here needs to send under the user's name.

### Permission entries, not a hook

A hook earns its cost on Bash because a command has many spellings — an
absolute path, `command gh`, a wrapper — that a literal pattern misses. An MCP
tool has one name, assigned by Claude Code, so a pattern sees every call. An
ask entry also launches no process, cannot fail open, and is evaluated before
any allow from any source.

Alternative: a `PreToolUse` hook with matcher `mcp__.*` returning `ask` by
tool name. Rejected: one `bun` launch per MCP call to decide what a pattern
decides, and a second failure mode — a guard that cannot launch — that the
pattern does not have.

### A wildcard server segment — confirmed by the user

The server segment is `*` because the server name is chosen per machine (see
*Measurements*). Naming `claude_ai_Gmail` would prompt for the connector and
miss a locally registered `gmail`. The cost is that any server exposing a
tool with exactly one of these four names prompts; a tool so named that is
not speech under the user's name has not been seen.

A local CodeRabbit review claimed the wildcard does not cross-match servers.
It was rejected: the reference states that deny and ask rules accept a glob
in the tool-name position matched against the full tool name, and reserves
the glob-free server segment for allow rules. The user confirmed the
rejection, with task 1.6 kept as the stop that checks it in a fresh session.

### Enumeration, not a catch-all

The list names four verified tools. The catch-all — `ask` on `mcp__*` — would
prompt for every MCP call, every board write included, and nothing can be
allowed back, since an ask is evaluated before every allow. A verb glob such
as `mcp__*__*send*` is broader than any verified tool and would catch names
not yet seen. The enumeration's ceiling is the proposal's third non-goal, and
the fix & capture loop is its upgrade path: a new send tool, once met, joins
the list.

### The check compares the `mcp__` ask subset whole

As with the Bash lists, an exact comparison pins every entry and its form at
once, so a dropped entry and a mistyped one fail alike, and an entry moved to
deny reads as missing from ask. Parentheses get their own message, in deny,
ask or allow, because they are the form that reads as a boundary and does
nothing.

### The sync writes the `mcp__` ask entries — revised 2026-10-12

`bun/sync-settings.ts` writes the four into a consumer's `ask` the way it
writes the `Bash(` subset: every `mcp__` ask entry is replaced, where the
first one stood, by the exported list, which is appended when the consumer
has none. `mcp__` entries in `deny` and `allow` are left where they are.

The `harness-auto-bump` design assumed the opposite. It listed "an `mcp__`
ask from `policy-gate-beyond-bash`" among the entries a sync keeps in place,
as the consumer's own, and `harness-updates` pinned that with a scenario.
That held only while the check did not read those entries. Once it compares
them whole, as this change has it do, the harness owns them for the same
reason the auto-bump design gave for the `Bash(` subset: the check compares
the subset whole, so a project can add no entry of its own without failing
it. Kept as the consumer's, they would break *Sync writes every value the
policy check dictates*, and each consumer's automatic bump would fail its
check from group 1's merge until a hand edit landed.

Alternative: exempt the `mcp__` ask entries from that requirement and add
them by hand in each consumer, as this change first planned. Rejected: every
later change to the list costs a hand edit in every consumer, and the
automatic bump stalls until each one lands.

The cost: a project's own `mcp__` ask entry, one the harness does not list,
is replaced by the next sync rather than kept. The check already refuses such
an entry. Neither consumer carries one (*Measurements*), and a project that
wants another tool gated denies it, which neither the check nor the sync
touches.

## Risks / Trade-offs

- [The reference shows a tool-name glob only as a trailing `*` (`mcp__*`);
  no example puts it in the server segment] → Task 1.6 confirms in a fresh
  session that `mcp__*__send_message` prompts for the connector's tool. It
  needs the user, who starts that session and answers the prompt, and it
  must pass before group 1 merges: once group 1 is on `main` and green, each
  consumer's automatic bump adopts the entries unattended. If it does not
  pass, the entries become literal per server name met, and group 1 does not
  merge until that is settled.
- [A `PermissionRequest` hook can answer the prompt, and a mod handling
  `tool.check` can approve a call on a personal plan without managed
  settings] → Outside what project settings can hold; recorded so the ask
  entries are not read as absolute.
- [The approval is a prompt the user may answer while reading something
  else] → Accepted with the user's choice of `ask`; a project that wants no
  such prompt denies the tool (*Deny still overrides ask*).
- [A connector renames a tool] → The entry prompts for nothing and the check
  still passes. Mitigation: the scenario naming the tool is confirmed in a
  fresh session as a task, and a rename met later goes through fix & capture.
- [The prose changes before every repository carries the entries] → It ships
  with group 1, and the rules copy reaches a consumer only with the pin bump
  whose sync also writes the entries, so no repository reads the new prose
  without the mechanism.
- [The automatic bump lands the entries with nobody reviewing the consumer's
  commit] → The bump lands only after the check and `bumpTest` pass. The
  live prompt is confirmed by task 1.6 before group 1 merges, and group 2
  reads what each bump landed.

## Adjacent finding

`agent-permissions` *Every manifest-mutating invocation prompts* says a
broader `allow` in another settings source suppresses an `ask` prompt. The
permissions reference read for this design says the opposite: an ask rule
prompts even where an allow also matches. This change does not edit that
requirement. `bun-version-sites`, which already re-asserts it whole, carries
the correction.

## Migration Plan

Group 1 lands the harness side. Each consumer's automatic bump then moves its
pin, and the sync it runs writes the four ask entries and refreshes the rules
copy in the commit it lands. Rollback is reverting group 1 in the harness. The
next bump leaves the entries in place, since the reverted sync no longer owns
them, and they remove no capability a workflow uses, so a consumer deletes
them when it chooses.
