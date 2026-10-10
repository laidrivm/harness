# policy-gate-beyond-bash — design

## Context

See proposal.md for why. The permission policy is `agent-permissions`; its
consumer half is `bun/settings.ts`, which compares the Bash deny and ask lists
whole and asserts the hook texts `bun/bootstrap.ts` exports. A consumer's
`harness:check` runs it in the pre-push hook and in CI.

MCP tools reach a session from three places: a claude.ai connector, whose
tools Claude Code names `mcp__claude_ai_<server>__<tool>`; a server the user
registered on their machine, named as they chose; and a project's `.mcp.json`.
The rule syntax was checked against the permissions reference
(`code.claude.com/docs/en/permissions`, read 2026-10-10):

- `mcp__<server>`, `mcp__<server>__*` and `mcp__<server>__<tool>` match a
  whole server or one tool.
- Deny and ask rules accept a glob in the tool-name position, matched against
  the full tool name; allow rules accept one only after a literal
  `mcp__<server>__` prefix.
- A tool matched by a bare-name deny rule, glob included, is removed from the
  session's context.
- An `mcp__` rule with parentheses is skipped at load, with a warning.
- Rules are evaluated deny, then ask, then allow, across every settings
  source; an allow cannot carve an exception out of a deny.

## Measurements

Taken 2026-10-10, read-only, against each consumer's checked-out tree.

- **dota2 and mellon** carry the same eight deny entries as the harness —
  four package managers, three `gh` writes, `Edit(.npmrc)` — and no `mcp__`
  entry, in deny, ask or allow. Neither has a `.mcp.json`.
- **No tracked text** in either consumer or in the harness names one of the
  four tools, so no skill or doc relies on calling them.
- **The user-level settings** on the measuring machine allow two Notion tools
  under the server name `notion`, while this session's connector exposes the
  same tools as `claude_ai_Notion`. One tool reaches sessions under two server
  names on one machine, which is what decides the wildcard below.
- The new check fails both consumers until group 2 lands its entries, by
  design: the bumped pin and the entries arrive in one commit.

## Decisions

### Deny entries, not a hook

A hook earns its cost on Bash because a command has many spellings — an
absolute path, `command gh`, a wrapper — that a literal pattern misses. An MCP
tool has one name, assigned by Claude Code, so a pattern sees every call. A
deny entry also launches no process, cannot fail open, and is evaluated
before any allow from any source.

Alternative: a `PreToolUse` hook with matcher `mcp__.*` and a script deciding
by tool name. Rejected: one `bun` launch per MCP call to decide what a
pattern decides, and a second failure mode — a guard that cannot launch —
that the pattern does not have.

### A wildcard server segment

The server segment is `*` because the server name is chosen per machine (see
*Measurements*). Naming `claude_ai_Gmail` would deny the connector and miss a
locally registered `gmail`. The cost is that any server exposing a tool with
exactly one of these four names is denied; a tool so named that is not speech
under the user's name has not been seen.

### Enumeration, not a catch-all

The list names four verified tools. The catch-all — `ask` on `mcp__*` with
read tools allowed back — does not work: an ask rule prompts even where an
allow rule matches, so nothing can be allowed back, and every board write
would prompt. A deny on a verb glob such as `mcp__*__*send*` is broader than
any verified tool and would catch names not yet seen. The enumeration's
ceiling is the proposal's third non-goal, and the fix & capture loop is its
upgrade path: a new send tool, once met, joins the list.

### Deny, pending the user's answer

`deny` matches the prose it replaces, which says *never*. If the user prefers
`ask` for some tool, the entry moves to the ask list and the check compares
that list's `mcp__` entries whole as well. The proposal's open question holds
the choice; the tasks name the deny form until it is answered.

### The check compares the `mcp__` subset whole

As with the Bash lists, an exact comparison pins every entry and its form at
once, so a dropped entry and a mistyped one fail alike. Parentheses get their
own message, because they are the form that reads as a boundary and denies
nothing.

## Risks / Trade-offs

- [The reference shows a tool-name glob only as a trailing `*` (`mcp__*`) and
  says `*` "stands in for whatever text is in its place"; no example puts it
  in the server segment] → Task 1.6 confirms in a live session that
  `mcp__*__send_message` removes the connector's tool before group 2 asks a
  consumer to adopt it. If it does not, the entries become literal per server
  name met — `mcp__claude_ai_Gmail__send_message` and so on — and the
  *A wildcard server segment* decision is reversed in this design before
  group 1 merges.
- [A mod handling `tool.check` can approve a call a deny rule refuses, on a
  personal plan without managed settings] → Outside what project settings can
  hold; recorded so the deny entries are not read as absolute.
- [A connector renames a tool] → The entry denies nothing and the check still
  passes. Mitigation: the scenario that names the tool is verified in a live
  session as a task, and a rename met later goes through fix & capture.
- [The prose shrinks before every repository carries the entries] → It ships
  with group 1, and the rules copy reaches a consumer only with the pin bump
  that also requires the entries, so no repository reads the shorter prose
  without the mechanism.

## Migration Plan

Group 1 lands the harness side. Each consumer then bumps its pin, adds the
four entries and refreshes `harness/` in one commit. Rollback is reverting
that commit; the entries remove no capability a workflow uses.
