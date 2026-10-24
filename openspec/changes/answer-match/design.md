## Context

Three readers decide what a card's answer is, all by one rule, "the user's
first unmarked comment after the last `harness-question`":

- the pick session's prompt, `pickPrompt()` in `bun/board-loop-prompt.ts:58-71`,
  which also takes an answer candidate only while `Assign` holds the user
  (line 66), or with the runner's `harness-answer` (line 60);
- the stage session's prompt, `prompt()` in the same file, lines 20-24, which
  tells an answer step which comment is the answer;
- `waits()` in `bun/notion-bot.ts:104-112`, which the ask command and the
  runner's `post()` read to post nothing while a question waits.

`task-board`'s *An open question waits on its card, assigned to the user*
states the rule, and its scenario *An answer before the last question* makes
an answered question followed by another one "no answer". *An answer the board
loop carries is applied when its pull request opens* keeps `Assign` on the
user until then, "never earlier", because `Assign` is the pick's only sign
that an answer is still to carry: after the answer's step merges, every group
is ticked again and the same answered question would be taken a second time.
`consider()` in `bun/board-loop.ts:64-82` already passes over a change whose
step branch has an open or used pull request, so `Assign` is needed only
after the merge.

## Goals / Non-Goals

**Goals:** a card's answer is the answer to the loop's own question, whoever
else asks on the card; the pick stops depending on `Assign`, so `Assign` is
cleared as soon as a session takes the answer.

**Non-Goals:** questions of the explore, propose and archive stages (card
*Let the board loop carry every status's next stage*, which will tag them the
same way); moving Notion writes to the bot (card *Route every Notion write the
loop makes through the bot integration*); a check that refuses a chat agent's
question on a card the loop carries.

## Decisions

### A reply thread cannot carry the match

The card's option (а), "answer in the question's thread", is out: Notion puts
every page-level comment of a page in one discussion. Both live cards read on
2026-10-25 (runner-isolation, nine comments; loop-reads-feedback, four) hold
exactly one page-level discussion, the bot's REST posts and the user's
replies alike. A comment on a block opens its own thread, but the ask
integration cannot write a block to anchor one, and the pick reads no block
comments.

### The question names the step that carries its answer

The loop's question opens with the mark, a space, and `<slug> step <k>:`,
then the text, e.g. `` `harness-question` runner-isolation step 6: … ``.
`k` is the step that will carry the answer: the carried step when the
session's final message has no `PR-TITLE:` line, the next step when it has
one. A session that blocks has its answer carried by the next session on the
same step; one that opens its step's pull request and still asks has it
carried by the step after, the answer step N+1 when it was the last group.

The tag names the consuming step, never the asking one. With the asking step,
an answer step N+1 would have to accept questions tagged N and N+1, and after
N+1 merged the step-N+2 candidate would re-take an N+1 question a blocked
answer session had asked and N+1 had already carried.

The slug is in the tag so that no other comment matches it by accident: a
chat agent writing "step 6.2" starts with "step 6". The card is already the
change's, so the slug costs the user a few words, not ambiguity.

The runner, which posts every question on the host, writes the tag in code:
`tagged(text, slug, step)` in `bun/board-loop-prompt.ts` inserts it after the
mark unless the text already carries it, and `bun/board-loop.ts` calls it
before `post()` with `chosen.step`, plus one when a `PR-TITLE:` line follows.
A session that posts itself, through the ask command or the connector, is
told the literal tag for both cases in its prompt. The ask command takes no
tag argument: it serves chat sessions too, whose questions carry none.

### An answer is matched to the question before it

An answer to a question is the user's first comment opening with neither mark
after that question and before the next `harness-question` by anyone, or,
with none, the runner's `harness-answer` in that span; the user's comment
wins in either order, as today. The rule reads the same for the card's last
question, whose span runs to the end, so `waits()` and "a question waits"
need no change, and the ask command still posts one open question per card.

### The pick matches an answer candidate by its tag, not by `Assign`

An answer candidate for step `S` is taken when its card holds a question
tagged `<slug> step <S>:` with an answer. `pickPrompt()` is given each
candidate's step beside its slug. A takeable change keeps today's rule:
passed over while the card's last question, anyone's, has no answer — a
chat agent's question waiting on the card holds the loop too, which is the
one-open-question-per-card rule doing its work, not a new cost.

### A session clears `Assign` when it takes the answer

`Assign` stops being state the loop reads, so it means only "the user is
waited on": the stage session clears it in the turn it writes the answer into
`tasks.md`, or files the `idea` card for it. A session that dies after that
leaves the card unassigned and the answer still matched by its tag, so the
next pass carries it again on the branch the session left. This reverses
`task-board`'s "never earlier" and the scenario *The session ends before its
pull request*, both rewritten in the delta.

## Risks / Trade-offs

- [A session drops the tag] → in the runner's path the code adds it; in the
  ask and connector paths an untagged question still makes the card wait, and
  its answer is not taken until a tagged question is asked. The card sits in
  the `Questions` view with `Assign` on the user, so the stall is visible.
- [Questions already on the board carry no tag] → a takeable change's pick
  reads no tag, so only an answer candidate with an answered, untagged
  question stalls. The apply step lists such cards in its pull request
  (task 1.5), for the user to re-ask tagged.
- [Collision with `no-pause-on-question`] → both modify `board-loop`'s *A pass
  takes the first takeable card in the board's order*. This delta is written
  over that change's version, and `.openspec.yaml` names it in `after:`.
- [Collision with `loop-reads-feedback`, on `fix/loop-reads-feedback`] → it
  rewrites the same ask and comment sentences in `prompt()` and
  `core/feature-workflow.md`. No requirement collides; whichever lands second
  merges the other's sentence in.
- [Overlap with the bot-route card] → it plans that the runner clears
  `Assign` when the pull request opens. Under this change the session clears
  it earlier; the bot-route change then moves that write to the runner
  rather than adding a second one.
