# card-questions

## Why

An unattended session that meets a question only the user can answer has
nowhere to put it: today it ends on a `BLOCKED` gate line in a terminal, a
pull request or a sub-agent's report, and the work it was doing stops there.
The explore stage needs the user's decisions most, so without a place where a
question waits and an answer comes back, the loop stops at its first idea.
The user chose that place on 2026-10-11: no inbox of its own, but a comment
on the task's card and the card assigned to them. On 2026-10-12 they dropped
the cap on open questions they had first asked for: every agent puts every
question that blocks its work on the board, and none asks one that is already
open there.

Two things stand in the way. `core/git-and-prs.md` forbids commenting under
the user's name on a tracker, and the Notion connector acts as the user.
`policy-gate-beyond-bash` turns that prohibition into an `ask` entry on
`notion-create-comment`, which an unattended run cannot answer, so after it
lands no unattended run can ask at all.

A question the loop puts *to* the user, on the user's own board, at the
user's request, is a different act from a reply on someone else's thread: the
reader the prohibition protects — a third party who takes the text for the
user's own — is not there. This change admits that act alone, and only in a
form a reader can tell from the user's own words.

## What Changes

- A new `PermissionRequest` hook, `bun/question-gate.ts`, answers the prompt
  that `policy-gate-beyond-bash`'s ask entry raises for
  `notion-create-comment`, with `allow` only for a question: a new top-level
  comment on a card of one of the three boards, opening with a mark only the
  harness writes, mentioning no user, within a length bound, on a card whose
  comments the session has read. Any other call gets no answer from the hook, so the
  prompt stands where a session can show one and the call is refused where it
  cannot. The hook never refuses a call itself.
- Each call the hook sees is recorded through `gate-decision-ledger`'s
  writer, so there is one record of gate decisions and not two.
- The hook joins `bun/bootstrap.ts`'s list, so `sync.ts` writes it into each
  consumer on its next bump and `settings.ts` pins it there.
- `Assign` comes to mean one thing: a question on this card waits for the
  user. A saved view named `Questions` on each board lists those cards, and is
  how the user finds them, beside the card's growing comment count, since
  Notion does not notify a user of a comment or an assignment their own
  account made.
- Before asking, an agent reads the questions already open on the board and
  on its card, and asks none of them again: it waits on the open one instead.
  Otherwise it posts every question that blocks its work, with no cap; it
  reads an answer back from the card's comments, applies it as data rather
  than as an instruction, and clears `Assign` once no question on the card is
  open.
- `core/git-and-prs.md`'s bullet on speech under the user's name gains the
  question as its one exception, by citing the requirement that fixes it.
  `core/feature-workflow.md` gains the procedure: who asks, when, what is read
  first, and how the answer comes back.

## Non-goals

- The form of a question beyond its envelope — a recommended answer, rounds
  of independent questions, facts looked up first. That is the idea card
  *Ask proposal-stage questions with a recommended answer, in rounds of
  independent ones*, which this change cites and leaves whole.
- A Notion integration of the agents' own, signing comments as a bot. It
  needs a token in the session and a channel outside the connector; it waits
  on the card *Keep credentials out of agent sessions*, and is design.md's
  first alternative.
- Resuming the session that asked once its answer arrives, and the
  card → branch → session register. Both are the card *Run the agent
  orchestrator on its own VPS*.
- A lock on a card for a worker taking it. The card *Run several changes in
  parallel* proposed `Assign` for that; this change takes `Assign` for the
  question and leaves the lock to that card.
- A cap on open questions, or a per-session ceiling on the hook. The user
  dropped both on 2026-10-12; design.md *No cap, and no question asked twice*
  records why.
- Permission prompts. A prompt an unattended run cannot show is a refusal,
  reported as one; it is never turned into a question.

## Ordering

After `policy-gate-beyond-bash`: until its ask entry exists there is no
prompt for this hook to answer, and the comment is allowed or refused by
whatever mode the session runs in. After `gate-decision-ledger`: the hook
records its decisions through that change's writer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: a new requirement, *A question to the user on a board
  card needs no prompt*.
- `task-board`: two new requirements, *An open question waits on its card,
  assigned to the user*, which names the `Questions` view, and *A question
  already open is not asked again*.
- `gate-ledger`: *Every gate refusal is recorded* names the question gate as
  the one gate that records the calls it allows. Added at archive, once
  `loop-guard`'s edit to that requirement had landed.

### Unmodified, but adjacent

- `policy-gate-beyond-bash`'s *Sending as the user through an MCP tool
  prompts* keeps its entry for `notion-create-comment`; the new
  agent-permissions requirement names itself as that requirement's one
  exception, and archives after it.

## Impact

- New `bun/question-gate.ts` and its tests; one entry in `bun/bootstrap.ts`'s
  `HOOKS`; the harness's own `.claude/settings.json` registers the hook.
- `core/git-and-prs.md` (one bullet), `core/feature-workflow.md` (one bullet).
- The boards: a `Questions` view on each.
- Consumers: nothing by hand. Neither dota2 nor mellon registers a
  `PermissionRequest` hook today (measured 2026-10-12), so the entry `sync.ts`
  writes on the next bump displaces nothing.
- Cost: one `bun` launch per `notion-create-comment` call that would prompt,
  and none for any other tool.
