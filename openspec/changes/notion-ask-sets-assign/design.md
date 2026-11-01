# notion-ask-sets-assign — design

## Context

`bun/notion-ask.ts` makes two calls: the comments read, through `waiting()`,
and the post, through `comment()`. It refuses while a question waits, and its
header says the session sets `Assign` itself. That followed the archived
`2026-10-22-notion-bot-questions` design (decision 10, the user's 3в), which
gave the ask integration comment capabilities alone. Since
`2026-10-29-notion-status-gate` the same integration holds *Update content*,
and `bun bun/work.ts status` PATCHes `Status` with it; this card's own move to
`exploring` went through that way.

`bun/notion-bot.ts` already has `assign(call, card, user)`, which sets
`Assign` to the user alone, and the runner's `post()` uses it with the lines
`question: posted on <id>, Assign set` and `…, Assign not set — <why>`.
`waits()` decides whether a question waits: the last comment opening with
`harness-question` has no comment after it by the user without a mark (or a
`harness-answer` by the integration whose id the reader was given). `finish`,
`take` and `post()` all read it.

The prose step lives in `core/feature-workflow.md` (the ask launch form and
the *Ask the user* bullet), in `bun/board-loop-prompt.ts`'s ask line, which
`bun/board-loop-question.test.ts` pins to the doc, and in the question gate's
`ask` message. The rule "one open question per card" lives in task-board's
*An open question waits on its card, assigned to the user* (its body and the
scenario *A second question for a card*) and in the same bullet of
`core/feature-workflow.md`.

## Goals / Non-Goals

**Goals:**

- A question the ask command posts leaves the card assigned to the user, or
  says plainly that it did not.
- A question that arises while another waits on the card is posted at once.
- A card that `status`, `take` or `finish --card` touches keeps `Assign` on
  the user only while a question or a pause notice waits.

**Non-Goals:**

- The runner's refusal (`board-loop`, *A question already waits*): see
  *The runner keeps its refusal*.
- Any change to what `waits()` counts as an answer, or to `finish` and `take`
  beyond the release.
- Setting `Assign` on the four cards left unassigned on 2026-10-31: a one-off
  for the main session.

## Decisions

### The user's decisions (card and chat, 2026-10-31 and 2026-11-01)

1. (card, 20:21) `notion-ask` posts a question even when another one already
   waits on the card; the refusal "a question already waits" goes. Numbering is
   continuous across the card's questions: a new question continues the
   numbers of the previous ones. `notion-ask` sets `Assign` to the user on
   every post, and sets it again if it was cleared. The rule stays that
   questions known at the same time go in one comment, and a separate comment
   is only for a question that arose later.
2. (card, 20:21, answer a) When the post landed and the `Assign` write
   failed, the command exits 1 and prints `question: posted on <id>, Assign
   not set — <why>`.
3. (card, 20:31, item 3 a) The session keeps the continuous numbering; no
   code checks it, and `notion-ask` reads no comments: it posts and writes
   `Assign` (*Numbering* below).
4. (chat, widening the change) `bun bun/work.ts status` clears the card's
   `Assign` when it moves the card and no question waits there, by the rule
   `waits()` applies, and leaves it when one waits. Cards moved to
   `proposing` kept `Assign` on the user with no question open.
5. (card, 2026-11-01 10:44, item 4 b) `status` clears `Assign` on any move
   when no question waits, `applying` and `applied` included, and the board
   loop's pick stops requiring `Assign` on a card that carries an answer.
   Decision 9 supersedes that second half: the pick is unchanged, and only
   the `status` half stands.
6. (chat, 2026-11-01, «Да, добавь») `bun bun/work.ts take`, when a session
   picks the card up, and `bun bun/work.ts finish --card`, on every push,
   clear `Assign` by the same rule, through one helper all three commands
   call. The user had answered and the work resumed, but no `Status` moved,
   so `Assign` stayed on them.
7. (card, 2026-11-01 11:10, item 5 c) Nothing marks an answer as carried
   once decision 5 holds: no time mark, no `Assign` exception. The risk that
   the board loop carries an answer twice is accepted, since it lives only
   in the old board loop, which roadmap stage 2.5 switches off and stage 7
   deletes (*Risks*).
8. (card, 2026-11-01 11:10, item 6 a) The exit stays 1 when the post landed
   and the `Assign` write failed, with no refusal left to stop a rerun: the
   line opens `question: posted`, and its text forbids running it again.
9. (card, 2026-11-01 12:04, item 7 a) The pick is not changed: it keeps
   requiring `Assign` on a card carrying an answer, which narrows decision
   5 to its first half. Only `status`, `take` and `finish --card` release
   `Assign`. The old loop's hourly Windmill schedule is already off.
10. (card, 2026-11-01 12:52, item 8 a, on CodeRabbit's two Majors) The ask
    command keeps writing the user alone to `Assign`, and the release keeps
    writing back the list it read: the boards put no one but the user on
    `Assign`, so neither drops anyone today.
11. (card, 2026-11-01 12:52, item 9 a, on CodeRabbit's Major) The runner
    keeps taking one `QUESTION:` block within the length cap: the old loop's
    schedule is off, and the ask command splits a long set.
12. (card, 2026-11-01 14:03, item 10 a, on CodeRabbit's Major on #374)
    Concurrent `Assign` writes stay as they are, with no lock and no
    conditional write: only the user is ever assigned, which extends
    decision 10.
13. (card, 2026-11-01, item 11 b, on the local review of the apply pull
    request) The check that Notion's answer no longer holds the user lives
    in `release()`, so every caller, `unassign()` included, has it from one
    place: `core/rules.md`'s "write logic a second time only by lifting it
    into one module" (the user extended it: a copy that would fail loudly
    is no exception). `unassign()` then prints `assign: failed —` and the
    runner refuses the pass in that case.

The user left two details to this proposal: *Numbering*, which the user
settled as decision 3, and *What answers several questions*. Decision 4 met
an existing requirement, which decisions 5 and 9 settled; the local
review's findings became decisions 7, 8 and 9.

### The write: `assign()`, then the user read back from its answer

After `comment()` resolves, the command calls `assign()` and checks that the
PATCH's answer holds the user's id in `properties.Assign.people`, compared as
`hex()` compares ids. That is how `work-status` reads `Status` back from its
own PATCH, and it costs no second call. The check stays in the command, not
in `assign()`: the runner's `post()` and its pause notice print `Assign set`
on any accepted PATCH, and changing that is a `board-loop` change no failure
has asked for yet. An accepted PATCH whose answer lacks
the user (a renamed property, a people list Notion trimmed) prints `Assign not
set — the Assign write did not hold the user`. A thrown error prints the
client's message, which names the step and Notion's status and never the
token. Both exit 1 (decision 2).

`assign()` replaces `Assign` with the user alone, which is what task-board's
"holds the user while its questions wait and nothing at any other time"
asks; a card someone cleared is set again by the next post (decision 1).
Rejected: a GET of the page after the PATCH, a second call that proves no
more than the PATCH's own answer.

### Numbering: the session keeps it, no check in code

Proposed: the session numbers on from the highest number on the card, as the
launch forms already ask it to number in one sequence; the launch forms ask
it to read the card and its comments before writing the question, though no
gate checks that for the ask command, which the question gate never sees.
Nothing mechanical then stops a session from posting a question already
open on the card, as the old refusal did; task-board's *A question already
open is not asked again* stays a rule the session keeps. The command then
needs no read of the comments at all and makes two
calls: the post and the `Assign` write.

Rejected for now: the command refusing when the new question's first number
is not greater than the highest on the card. A question is free text: items
read `3.`, `3)` or `3 —`, the options are lettered, and the text carries
other numbers ("1500 символов", a PR number, a time). A check would need a
parser over every past question's text, and a false refusal blocks a real
question for a cosmetic fault, while a duplicate number is one the user sees
and answers around. Asked on the card as item 3, since the user named both;
the user chose this proposal (decision 3).

### What answers several questions: unchanged

The questions on a card wait while no comment by the user without a mark
follows the last question; such a comment answers them all. That is
`waits()` today, so `finish` keeps the draft, `take` prints `question
waiting: yes`, and the board loop's pick passes over the card, all while the
latest question has no reply. It matches how the user answers: one comment
naming each number. A reply that answers only some numbers ends the wait;
the session applying it posts the rest again as a new question, numbered on.
A user's comment between two questions answers the earlier one for the
session that reads the card, but the card waits until the later one is
answered, as task-board's scenario *An answer before the last question*
already says. No real choice is left here, so nothing is asked.

### The prose step and the pins

Where each piece runs decides when the prose can go:

- In the harness itself the command runs from the tree (`bun bun/notion-ask.ts`),
  so it carries the change on merge.
- In a consumer the command (`bun node_modules/harness/bun/notion-ask.ts`)
  and the docs `sync.ts` writes into `harness/` come from the same pin, and
  the daily bump moves both together.
- The board loop's runner, and so `bun/board-loop-prompt.ts`, runs from the
  harness tree on the host, while the session it launches runs the consumer's
  pinned command. The prompt can be ahead of the command.
- The question gate runs from the pin, the harness's self-pin included.

So the step is not deleted: it becomes "once it prints `question: posted`,
unless that line ends `Assign set`, set the `Assign` of the card to the user
and read the card back", with "and never run it again for that question". It
reads right under a pin from before this change, whose line never ends
`Assign set`, so the session sets `Assign` as today; and under one after it,
where the session does nothing on success and sets `Assign` itself only on
the `Assign not set` exit. It therefore stays after every pin has moved, as
that exit's fallback, and no follow-up card is needed to remove it. The same
wording goes into the gate's `ask` message.

Under a pin from before this change, a second question is still refused with
`a question already waits`; the session then keeps it in its final message
under `QUESTION:`, which every launch form already asks of it. The doc's
"a second waits in your report" sentence changes to the grouping and
numbering rule, which holds under either pin.

### The runner keeps its refusal

`post()` refuses while a question waits. A pass never launches a stage on a
card whose question waits (the takeable list passes over it), so a waiting
question at post time means a pass that already posted and is being run
again, or a race with another poster. Either way a second post would put the
same question on the card twice. The user's decision names `notion-ask`,
whose sessions do meet a second question while the first waits; the runner's
sessions do not.

### Releasing `Assign`: one function, three callers

Decisions 4 to 6. `unassign()` in `bun/notion-unassign.ts` already reads the
page, refuses at 25 people (the most a page read lists), and PATCHes
`Assign` without the user, keeping everyone else. Its read and write are
lifted into one function, `release(call, card, user, go)`, which `unassign()`
calls after its card checks, which asks `go` with the list it read before
the cap and the write, and which reads the user's absence back from the
write's answer (decision 13); `unassign()`'s behaviour and lines stay as
they are but when that answer still holds the user or lists no `Assign`,
where it now prints `assign: failed —` and the runner refuses the pass. A
second function, `cleared(call, card, user)`, is what the three
commands call: it reads the page, and only when `Assign` holds the user
reads the comments with `discussion()` and decides with `waits()`. `waits()`
gains a `mark` argument, defaulting to `harness-question`, so the
`harness-pause` test is the same function with the other mark, not a second
copy (no integration id either way, as `finish` does today, so a triage's
`harness-answer` keeps `Assign`, the side that keeps a question visible).
When nothing waits it calls `release()`, which reads the user's absence back
from the PATCH's answer. It then reads the comments once more, after any
write that may have landed, its answer read back or not, and, when a
question or a pause notice now waits by the same test, or when that read
fails, PATCHes the list it read with the user kept, and reads the user back.
It returns `{ line, back, restoreFailed }`: `unassign()`'s line forms plus
`assign: restored the user on <card>`, or no line when it wrote nothing;
`back` says whether it put the user back for something waiting or for an
unread second read, which `finish` reports as its own failed comments read
(local review on the apply pull request).

`status` calls it after its `Status` write and `take` after its reads (its
comments print as read before). `finish` calls it after its own comments
read and before the ready switch, and leaves the draft when the release put
the user back. Its own page read, made just before the write, keeps the
window for a question posted meanwhile to one round trip, where reusing the
command's earlier page read would stretch it over `status`'s evidence
checks; for `take` and `finish` the extra reads are accepted for one code
path. A failed release prints its line and changes no other outcome, except
`restoreFailed`, which makes the command exit 1: a question then waits with
no one on `Assign`.

The `harness-pause` test comes from the local review. The orchestrator's
pause notice sets `Assign` on a card that holds no question, and a release
by the question rule alone would hide the pause from the user. A pause the
user ends by removing the stop file, with no comment, keeps `Assign` on the
user until a comment of theirs or a hand clear: accepted, as the side that
never hides a pause.

Rejected: the `Status` and `Assign` in one PATCH, which only `status` could
use, and which takes the stale `Assign` its early page read gives; writing
the rule in each command, which `core/rules.md` forbids.

### The pick keeps reading `Assign`

Decision 9. The board loop's pick takes an answer candidate only while its
`Assign` holds the user, and that stays: dropping it (decision 5's second
half) would make almost every fully ticked card at `applied` with an
answered question, an explore-stage one included, a candidate on every
pass. task-board's *An answer the board loop carries is applied when its
pull request opens* changes only from "never earlier" to "by then at the
latest", since a release may now clear `Assign` first. A release before
the answer step then hides that answer from the old loop's pick, which is
accepted: its hourly schedule is off, and decision 7's risk of carrying an
answer twice goes with the pick change.

## Risks / Trade-offs

- [The ask integration writing a People property is unmeasured: it may need
  *Read user information*, which it was never granted.] → The first real post
  is the probe. A refusal prints `Assign not set — the Assign write answered
  <status>`, exits 1, and the session sets `Assign` through the connector, as
  today. The session that makes that post reports the line it printed.
- [With the refusal gone, nothing stops a session that reruns the command
  after exit 1 from posting the same question twice.] → The line still opens
  `question: posted`, and the prose and the gate's message say never to run
  the command again for a question it printed as posted (decision 8).
- [Numbering drifts when a session miscounts.] → The user sees it and answers
  by the numbers as written; decision 3 keeps the check out.
- [A release clears `Assign` on a card whose answer has not been applied
  yet, and the old loop's pick then passes over it.] → Accepted (decision
  9): that loop's hourly schedule is off; a session that resumes the card
  reads the answer from the comments.
- [A question posted between `cleared()`'s comments read and its PATCH.] →
  The read after the write sees it, its post having landed before the
  release's write, and puts the user back; a post after the write sets
  `Assign` itself (local review).
- [`status`, `take` and `finish` make up to four more Notion calls.] → Only
  while `Assign` holds the user; a failure prints a line and changes
  nothing else, so a Notion fault never blocks a move, a brief or a push.
- [A 2xx post whose body does not parse.] → It counts as posted, so it is
  never reported `not posted` and rerun: the client's `response.json()`
  throws a plain `SyntaxError` there, which the command takes as a post
  that held.
- [A triage's `harness-answer` keeps `Assign` on the user.] → The narrow
  case of an earlier question the user answered, then a triaged one; the
  next answer or move after it clears it. Accepted: no integration id is in
  the ask settings to count it by.
- [The post reaches Notion but its answer does not (a timeout, a 5xx), and
  with the refusal gone a rerun posts the question twice.] → On no answer,
  the timeout or a 5xx (the client's `Transient` less its 429, which Notion
  refused unprocessed; `Transient` gains the `status` it was raised for, no
  status when no answer came, so the command reads the number, never the
  message), the command prints `question: may be
  posted on <id> — <why>; read the card's comments before running it
  again`, exits 1, and writes no `Assign`; the prose says to read the card
  before any rerun.
- [Two sessions posting on one card at once.] → Each sets `Assign` to the
  same value; both questions stand, numbered by whoever read the card first.

## Migration Plan

None beyond the merge: the harness's own sessions carry it at once, and
consumers on their next daily bump. Rollback is a revert; the prose's
conditional wording is right under either version.
