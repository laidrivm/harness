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
- A card `status` moves keeps `Assign` on the user only while a question
  waits.

**Non-Goals:**

- The runner's refusal (`board-loop`, *A question already waits*): see
  *The runner keeps its refusal*.
- Any change to `waits()`, `finish`, `take` or the board loop's answer pick.
- Setting `Assign` on the four cards left unassigned on 2026-10-31: a one-off
  for the main session.

## Decisions

### The user's decisions (card and chat, 2026-10-31)

1. (card, 20:21) `notion-ask` posts a question even when another one already waits on the
   card; the refusal "a question already waits" goes. Numbering is
   continuous across the card's questions: a new question continues the
   numbers of the previous ones. `notion-ask` sets `Assign` to the user on
   every post, and sets it again if it was cleared. The rule stays that
   questions known at the same time go in one comment, and a separate comment
   is only for a question that arose later.
2. (card, 20:21, answer а) When the post landed and the `Assign` write
   failed, the command exits 1 and prints `question: posted on <id>, Assign
   not set — <why>`.
3. (card, 20:31, item 3 а) The session keeps the continuous numbering; no
   code checks it, and `notion-ask` reads no comments: it posts and writes
   `Assign` (*Numbering* below).
4. (chat, widening the change) `bun bun/work.ts status` clears the card's
   `Assign` when it moves the card and no question waits there, by the rule
   `waits()` applies, and leaves it when one waits. Cards moved to
   `proposing` kept `Assign` on the user with no question open.

The user left two details to this proposal: *Numbering*, which the user
settled as decision 3, and *What answers several questions*. Decision 4
meets an existing requirement on one move, asked on the card as item 4
(*Clearing `Assign` on a move*).

### The write: `assign()`, then the user read back from its answer

After `comment()` resolves, the command calls `assign()` and checks that the
PATCH's answer holds the user's id in `properties.Assign.people`, compared as
`hex()` compares ids. That is how `work-status` reads `Status` back from its
own PATCH, and it costs no second call. An accepted PATCH whose answer lacks
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
launch forms already ask it to number in one sequence; it has read the card's
comments before posting, which the launch forms and the question gate already
require. The command then needs no read of the comments at all and makes two
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

### Clearing `Assign` on a move

Decision 4. Once every check of `status` has passed, it reads the card's
comments with `waiting(call, card, user)`, as `finish` does, and the page it
has already read gives `Assign`. When no question waits and `Assign` holds
anyone, the `Status` PATCH also carries `Assign: { people: [] }`: one call,
so the two land or fail together. The line reads `status: <card> <from> →
<to>, Assign cleared` when Notion's answer holds no one in `Assign`, and
`…, Assign not cleared` with exit 1 when it still holds someone. With a
question waiting, or `Assign` already empty, the PATCH carries `Status`
alone and the line is today's. A failed comments read refuses under
`unread` and writes nothing, as *Status fails closed* asks of every read.

`waiting()` is given no integration id, as in `finish`, so a triage's
`harness-answer` does not count as an answer here and `Assign` stays: the
side that keeps a question visible.

Rejected: clearing at `finish`, when the pull request opens, which the user
did not name and which misses moves with no pull request (`exploring`,
`explored`); a second PATCH after the `Status` write, which can leave the
two split.

One move meets an existing requirement. task-board's *An answer the board
loop carries is applied when its pull request opens* clears `Assign` when
that step's pull request opens "and never earlier", and the board loop's
pick takes an answer candidate only while its `Assign` holds the user. The
pick moves such a card to `applying` before the step. In a consumer it does
so through the connector, so `status` is not on that path; in the harness
the status guard refuses the connector's `Status` write and names `status`,
so a pick there can make that move through it. Proposed, as card item 4 a: a
move into `applying` leaves `Assign` as it is, and every other move clears
it when no question waits. Rejected for now: clearing on that move too and
dropping the pick's `Assign` condition (4 b), which widens the change into
`board-loop`; or accepting that a step which fails before its pull request
loses its answer to the next pass (4 c). The tasks follow 4 a; another
answer changes them before apply.

## Risks / Trade-offs

- [The ask integration writing a People property is unmeasured: it may need
  *Read user information*, which it was never granted.] → The first real post
  is the probe. A refusal prints `Assign not set — the Assign write answered
  <status>`, exits 1, and the session sets `Assign` through the connector, as
  today. The session that makes that post reports the line it printed.
- [With the refusal gone, nothing stops a session that reruns the command
  after exit 1 from posting the same question twice.] → The line still opens
  `question: posted`, and the prose and the gate's message say never to run
  the command again for a question it printed as posted.
- [Numbering drifts when a session miscounts.] → The user sees it and answers
  by the numbers as written; decision 3 keeps the check out.
- [`status` clears `Assign` on a card whose answer has not been applied yet,
  when a session moves it before applying the answer.] → Outside `applying`
  no reader of `Assign` tells an applied answer from an unapplied one; the
  session reads the answer from the comments, which stay.
- [`status` makes one more Notion read per move.] → The same comments read
  `finish` and `take` make; a failure refuses, as a failed page read does.
- [Two sessions posting on one card at once.] → Each sets `Assign` to the
  same value; both questions stand, numbered by whoever read the card first.

## Migration Plan

None beyond the merge: the harness's own sessions carry it at once, and
consumers on their next daily bump. Rollback is a revert; the prose's
conditional wording is right under either version.
