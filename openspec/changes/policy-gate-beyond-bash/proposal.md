# policy-gate-beyond-bash

## Why

The harness's policy gate reaches the shell only: the `PreToolUse` hook is
registered with `matcher: "Bash"`, and every `deny` entry but `Edit(.npmrc)`
names a Bash command. A session also holds MCP tools that write under the
user's name — a mail connector's `send_message`, `reply` and `forward`, a
workspace's `notion-create-comment` — and nothing in the harness stands in
front of them. `core/git-and-prs.md` forbids exactly that ("Never reply,
comment or review under the user's name anywhere the `gh` deny entries do not
reach"), so today the boundary on every non-`gh` channel is prose, the
mechanism `agent-permissions` exists to replace.

The harness-schematic exploration of 2026-10-10 placed this as the first of
four gaps: its *Policy Gate* box covers one tool of many.

## What Changes

- `.claude/settings.json` asks before the MCP tools that send or post as the
  user, by tool name under any server: `mcp__*__send_message`,
  `mcp__*__reply`, `mcp__*__forward` and `mcp__*__notion-create-comment`. A
  call reaches the user as a prompt they approve or refuse, and an allow from
  any source cannot skip it. A permission entry is the first rung that holds:
  an MCP tool has one name and no spelling to walk around it, unlike a shell
  command, so no hook is needed.
- `bun/settings.ts` compares a consumer's `mcp__` ask entries whole against
  that list, as it compares the Bash ask list, and fails an `mcp__` rule
  written with parentheses, which Claude Code skips when it loads settings.
- `core/git-and-prs.md`'s prohibition becomes a rule of approval: the agent
  sends under the user's name only through a call the user approved at the
  prompt, and never through a channel no entry reaches — a browser form, a
  direct HTTP call — per `agent-rulebook`'s *A mechanised prohibition leaves
  its prose home*.
- Each consumer bumps its pin and adds the entries in one commit, since the
  bumped check fails without them.

## Non-goals

- Edit and Write. A file `Edit` rule already applies to every built-in tool
  that edits files, and no prohibition in the rulebook names a path the
  current `Edit(.npmrc)` and `Edit(bunfig.toml)` entries miss.
- MCP writes that are not speech: board updates, drafts, labels, design-tool
  edits. The task-board workflow requires Notion page writes, and a draft
  sends nothing. The guard on a card write that loses its properties is the
  change `notion-update-guard`'s.
- A tool that sends under a name not listed. The list is an enumeration of
  verified tool names, and a connector added later with its own verb is not
  covered until the list names it — see design.md *Enumeration, not a
  catch-all*.
- A project that wants these tools refused outright. Its own deny entry wins
  over the harness's ask, since deny is evaluated first; this change neither
  requires nor forbids one beyond what design.md *Deny still overrides ask*
  sets out.

## Decisions the user settled

- **Ask, not deny, for all four tools.** A send the user has read and
  approved is legitimate; what the rule forbids is one they never saw.
- **The server-segment glob stands.** A local CodeRabbit review claimed a
  wildcard in the server segment does not cross-match; the reference says
  deny and ask rules accept a glob matched against the full tool name, and
  the user accepted that dismissal. Task 1.6 remains the stop that confirms
  it in a fresh session.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: a new requirement, *Sending as the user through an MCP
  tool prompts*, with its pinning in the consumer check.

### Unmodified, but adjacent

- `agent-rulebook`'s *A mechanised prohibition leaves its prose home* is the
  requirement the prose edit applies, not one it changes.
- The active change `gh-api-guard` narrows the same `core/git-and-prs.md`
  bullet for `gh api`. The two cover different channels and neither depends
  on the other; whichever lands second narrows from the wording the first
  left.

## Impact

- `.claude/settings.json`, `bun/settings.ts`; `bun/settings.test.ts` gives
  its fixture to a new `bun/settings.fixture.ts`, and the new cases go in
  `bun/settings-mcp.test.ts`.
- `core/git-and-prs.md`: one bullet rewritten.
- dota2 and mellon: a pin bump, four ask entries and a refreshed rules copy
  each, in their own pull requests.
- No runtime cost: an ask rule is evaluated by Claude Code, with no process
  launched. The cost is a prompt on each send, which is the point.
