# bot-notion-writes — design

## Context

What a board-loop pass writes to Notion today, with the integration's
settings (`notion-bot.json`) present:

| Write | Who makes it | Under whose name |
|---|---|---|
| the question comment, `Assign` to the user (`post()`, `bun/notion-bot.ts:207`) | runner, REST | integration |
| the `harness-answer` comment of a triaged question | runner, REST | integration |
| the claim, `Status` → `applying` (`pickPrompt()`, `bun/board-loop-prompt.ts:68`) | pick session, MCP | user |
| an `idea` card and `Assign` cleared, for an answer that asks for a change of its own (`prompt()`, `bun/board-loop-prompt.ts:27`) | stage session, MCP | user |
| `Assign` cleared when the answer's pull request opens (`task-board`, *An answer the board loop carries is applied when its pull request opens*) | nobody | — |

The triage session already runs with `--strict-mcp-config` and no MCP tool
(`bun/notion-triage.ts:19`). Both other sessions run with
`--disallowedTools mcp__*__notion-create-comment` alone
(`bun/board-loop.ts:224`); a probe on 2026-10-21 showed the CLI honours the
`*` in the server segment (archived `notion-bot-questions`, design *Risks*).
The stage session of an apply step moves no `Status`: the pick has already
claimed the card, and `applied` waits on the last merge, which no pass sees.

`bun/board-loop.ts` stands at 289 lines against the 300 cap, and
`bun/notion-bot.ts` at 255.

## Goals / Non-Goals

**Goals:** no write of a loop pass reaches Notion under the user's name where
the integration is configured; `Assign` is cleared when the answer's pull
request opens.

**Non-Goals:** a general write language for sessions; `Status` or `Pointer`
writes for stages the loop does not carry yet; the laptop without the
integration, which keeps the MCP form (answer 13в); the pull request's link
on the card.

## Decisions

### The runner makes the writes it can derive, and the sessions name only what it cannot

The claim and the clear need no instruction from a session: the runner knows
the picked change, whether it is an answer candidate, and when `gh pr create`
succeeded. Only the card's id is missing, so the pick names it in one
`CARD: <id>` line. The `idea` card's title and text are the session's, so
the stage session names them in an `IDEA:` line. A general
`NOTION-SET: <property> <value>` form was considered and left out: no stage
the loop carries today writes `Status` or `Pointer`, and the card for
carrying every status adds its lines on this mechanism when it needs them.

### The card is checked before any write

The runner writes only to a card that `carded()` (`bun/notion-bot.ts:186`)
accepts: a page on the board `harness.board` names whose `Pointer` is wholly
the carried change's directory. A `CARD:` line that is missing, malformed or
names another card leaves the claim and the clear unwritten and is printed;
it does not change the pass's outcome, as a failed claim of the pick's does
not today (*A write that fails changes nothing about your answer*). The
runner reads `Status` from the same page read, and writes `applying` only
from `proposed`, or from `applied` for an answer candidate.

### `Assign` loses the user only

After `gh pr create` exits 0, the runner reads the card's `Assign` and, when
it holds the user `notion-bot.json` names, writes it back without that user.
Anyone else on it stays. A pass that ends `open` or `waiting`, a push
refused, or a `gh pr create` that fails — a pull request already open on the
branch included, whose own pass cleared it — leaves `Assign` as it is.
`publish()` takes the clear as a callback run after the create, so the push
module learns no Notion call.

### The `IDEA:` line

One `IDEA: <title>` line, the text below it to a `PR-TITLE:` line or the end
as the card's body, read as `asked()` reads `QUESTION:` (untrusted, one line,
before any `PR-TITLE:`). The runner creates the page in the carried card's
data source, the one `carded()` read, with `Name` the title and `Status`
`idea`, the body as paragraphs, then removes the user from the carried card's
`Assign`. A message with both `QUESTION:` and `IDEA:` posts the question and
files no card, since the answer route and a new question exclude each other.

### Every Notion write tool is withheld, by name

Where the integration is configured, both sessions get `--disallowedTools`
naming each write tool of the connector, under the `*` server wildcard: the
comment tools, page and database create, update, move, duplicate, delete
and restore, data source and view updates, file and attachment uploads,
folder, skill, calendar and agent-session writes. The list lives in one
constant in `bun/board-loop.ts`'s new neighbour `bun/notion-card.ts`. A deny
list is an enumeration, and a write tool the connector adds later stays
reachable until it is listed; Claude Code offers no allow list for one
server's tools beside a server-wide deny, which would take the reads too. A
`PreToolUse` hook refusing every `notion-*` call not on a read list would
close that, at the cost of a hook every consumer installs; this change leaves
it out (question 2 on the card). The probe of task 3.1 lists a session's
tools under the flags, as the 2026-10-21 probe did, and makes no call.

### The schema write of `approved-column`

`approved-column`'s task 1.3 adds `approved` to three boards' `Status`
select. A schema write is not a card write: no loop pass needs one, the
boards include `D2ASS` and `mellon`, which this host's runner never writes,
and a REST `PATCH /v1/data_sources/<id>` rewriting a select's options would
need its own read-back and refusal cases. This change builds no schema
write. `approved-column` is applied after this one (`after:` in its
`.openspec.yaml`); how its task 1.3 goes out under the bot's name is
question 1 on the card.

### File placement

The REST writes go to a new `bun/notion-card.ts` (claim, clear, file, the
`CARD:` and `IDEA:` readers, the withheld list), which imports `client()`
and `carded()` from `bun/notion-bot.ts`; `carded()` is exported for it.
`bun/board-loop.ts` gains only the calls. If that still passes the cap,
`consider()` and `left()` move to `bun/board-loop-steps.ts` in the same
commit, before the calls are added.

### Collision with `no-pause-on-question`

That change modifies the same `board-loop` requirement, *A pass takes the
first takeable card in the board's order*. This change's delta is written on
top of its version and names it in `after:`, so the two archive in order and
the later delta keeps the earlier one's paragraph.

## Risks / Trade-offs

- [The integration cannot write a board] → a consumer's board not shared
  with the integration answers 404 on the page read; the runner prints the
  claim or the clear as not written, and the pass's outcome is unchanged. The
  user shares each board's page with the integration once.
- [A new connector write tool] → reachable under the user's name until the
  list names it; the list's comment says so, and question 2 offers the hook.
- [The pick names a wrong card] → `carded()` refuses a card whose `Pointer`
  is not the picked change's, so no other card is written.
- [`Assign` read and write are two calls] → the user could change `Assign`
  between them; the window is one REST call, as `post()`'s is.

## Migration Plan

None beyond the user sharing each board's page with the integration. A
runner without `notion-bot.json` behaves as before.
