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
the integration is configured; `Assign` is cleared in the pass that reads the
user's answer, before that pass acts on it.

**Non-Goals:** a general write language for sessions; `Status` or `Pointer`
writes for stages the loop does not carry yet; the laptop without the
integration, which keeps the MCP form (answer 13в on the
`loop-reads-feedback` card, 2026-10-24: with neither the integration nor the
ask command, the loop keeps writing through the connector under the user's
name, since another account or another person may run the harness
unconfigured); the pull request's link on the card.

## Decisions

### The runner makes the writes it can derive, and the sessions name only what it cannot

The claim and the clear need no instruction from a session: the runner knows
the picked change, whether it is an answer candidate, and the card's `Assign`
from the same page read. Only the card's id is missing, so the pick names it in one
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

### `Assign` loses the user when the pass reads the answer

Settled by the user on 2026-10-25 (item 5 on the card), replacing the clear
once `gh pr create` succeeds: `Assign` is removed as soon as the user's
answer is read, and set back only when a new question is posted. Right after
the claim, from the same page read and before the stage session starts, the
runner removes the user `notion-bot.json` names from the card's `Assign`,
where it holds them; anyone else on it stays. A card the pick took has no
question waiting without an answer — the pick passes those over — so the user
on it is waited on for nothing. A pass that then ends `open` or `waiting`, a
push refused, or a `gh pr create` that fails leaves `Assign` empty; only a
new question sets it again, through `post()` or the ask command, as today.
`publish()` is not touched.

The clear before the stage session relies on the pick no longer reading
`Assign`: today it takes the user's answer only while `Assign` holds the
user, so a session that died after the clear would strand the answer (the
risk answer 12б on the `loop-reads-feedback` card accepted). `answer-match`
(PR #263) has the pick take an answer by its question's tag instead, so this
change is applied after it; neither is on the default branch yet, so the
order stands here and on the card rather than in `after:`. The same rule
settles `answer-match`'s question 3 and `draft-until-answered`'s question 1
and decision 5, whose designs record it. `draft-until-answered` (PR #262)
lands before this change too (its question 1, (а)): it adds the `CARD:`
reader and `unassign()` in `bun/notion-bot.ts` for its draft candidates, and
this change reuses both for every pick rather than writing its own.

### The `IDEA:` line

One `IDEA: <title>` line, the text below it to a `PR-TITLE:` line or the end
as the card's body, read as `asked()` reads `QUESTION:` (untrusted, one line,
before any `PR-TITLE:`). The runner creates the page in the carried card's
data source, the one `carded()` read, with `Name` the title and `Status`
`idea`, the body as paragraphs; the carried card's `Assign` was already
cleared after the claim. A message with both `QUESTION:` and `IDEA:` posts the question and
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
write. Settled by the user on 2026-10-25 (item 1): the user adds the option
by hand, and `approved-column`'s task 1.3 is a user act carrying the
step-by-step instruction, its apply session only reading each board back.
`approved-column` is still applied after this one (`after:` in its
`.openspec.yaml`, item 8).

### File placement

The REST writes go to a new `bun/notion-card.ts` (claim, file, the `IDEA:`
reader, the withheld list), which imports `client()`, `carded()`, and
`draft-until-answered`'s `CARD:` reader and `unassign()` from
`bun/notion-bot.ts`; `carded()` is exported for it.
`bun/board-loop.ts` gains only the calls. If that still passes the cap,
`consider()` and `left()` move to `bun/board-loop-steps.ts` in the same
commit, before the calls are added.

### Collision with `no-pause-on-question`

That change modifies the same `board-loop` requirement, *A pass takes the
first takeable card in the board's order*. This change's delta is written on
top of its version and names it in `after:`, so the two archive in order and
the later delta keeps the earlier one's paragraph.

### Collision with `answer-match`

`answer-match` modifies the same `board-loop` requirement and renames
`task-board`'s *An answer the board loop carries is applied when its pull
request opens*, whose text this change also modifies. It lands first (see
*`Assign` loses the user when the pass reads the answer*), and this change's
two deltas are re-copied over its versions before this change is applied.

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
- [A `CARD:` line the runner refuses] → neither the claim nor the clear is
  written, and the sessions hold no write tool, so `Assign` stays on the user
  though the answer was read; the runner prints why, for the user to clear it.

## Migration Plan

None beyond the user sharing each board's page with the integration. A
runner without `notion-bot.json` behaves as before.
