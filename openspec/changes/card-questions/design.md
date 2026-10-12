# card-questions — design

## Context

See proposal.md for why. `policy-gate-beyond-bash` puts
`mcp__*__notion-create-comment` under `permissions.ask`; its design records
the rule syntax and precedence this change builds on. What this change adds
was read on 2026-10-12 from Claude Code's hooks and permission-modes
references (`code.claude.com/docs/en/hooks`, `/permission-modes`):

- A `PreToolUse` hook's `allow` does not get past an ask rule: "Deny and ask
  rules are still evaluated regardless of what the hook returns".
- A `PermissionRequest` hook runs when a call needs a permission decision and
  can answer `allow` or `deny`. "In modes that ask, a `PermissionRequest`
  hook can answer the prompt" raised by an explicit ask rule.
- "In sessions that can't show a prompt, such as background subagents in
  non-interactive mode, Claude Code still runs these hooks, and if no hook
  returns a decision, it denies the tool call."
- `dontAsk` "auto-denies every tool call that would otherwise prompt you";
  the reference does not say whether a `PermissionRequest` hook is consulted
  first.
- A matcher holding characters other than letters, digits, `_`, `-`, spaces,
  `,` and `|` is an unanchored JavaScript regular expression.

The connector's `notion-create-comment` takes `page_id` and one of
`markdown` or `rich_text`, and targets a page, a passage
(`selection_with_ellipsis`) or a thread (`discussion_id`,
`reply_to_comment_id`). Its comments, like every connector write, carry the
user as their author.

Consumers, measured read-only on 2026-10-12: neither dota2 nor mellon, nor
the user-level settings on this machine, registers a `PermissionRequest`
hook, and neither consumer has an `mcp__` ask entry yet.

Settled by the user on 2026-10-12: the boards are seen by the user and the
bot only, nobody else; and Notion does not notify the user of a comment or an
assignment their own account made, which they do not need — the comment
count on the card's page-level comments block growing is signal enough, with
the `Questions` view listing the cards. So a question is a top-level page
comment, as designed.

## Goals / Non-Goals

**Goals:** one hook that widens the ask entry for exactly the act the
proposal describes, failing closed; one place the view, the `Assign`
meaning and the rule against asking twice are fixed; prose that cites both.

**Non-Goals:** a reader script for answers, a notifier, and any change to
what `policy-gate-beyond-bash` asks for.

## Decisions

### The question speaks as the user, marked — not as a bot

The comment goes through the connector the session already holds, under the
user's name, with an opening mark that tells it from the user's own words.

- *Alternative: a Notion integration of the agents' own.* Its comments would
  carry a bot as their author, and a mention from it would notify the user.
  But its token would sit in the session, which the card *Keep credentials
  out of agent sessions* exists to stop, and its calls would go by direct
  HTTP — the channel `policy-gate-beyond-bash`'s rewritten bullet forbids
  because no entry reaches it. Its planned successor is the card *Post
  agents' Notion comments and card writes from a bot integration, not under
  my name*, which takes this up once the credentials card lands.
- *Alternative: the question in the card's body.* A page write needs no
  permission. It was rejected because a body has no thread per question and
  no way to tell an answered question from an open one, and the user chose
  the comment.

### A `PermissionRequest` hook answers the ask; nothing else changes

The ask entry stays, and the hook answers its prompt for a question only.
Every failure of the hook — a crash, a timeout, a bun that cannot start —
gives no answer, and no answer is the prompt or, unattended, a refusal. The
hook therefore fails closed by construction and never needs `|| exit 2`.

- *Alternative: a `PreToolUse` hook returning `allow`.* It does not get past
  the ask rule (see *Context*).
- *Alternative: drop the ask entry for this tool, allow it, and have a
  `PreToolUse` hook return `ask` for anything that is not a question.* A hook
  that cannot launch is non-blocking, so the call would run on the allow —
  the open failure `policy-gate-beyond-bash` rejected a hook for.

The hook never answers `deny`: a call it does not recognise is still one the
user may approve at the prompt, and refusing it would take that from them.

### Which board: read from the session's own record

The hook cannot call Notion. It reads the session's transcript, the path the
event carries, for the connector's fetch result of the same page — ids
compared as 32 lower-case hex digits, dashes removed — and takes the parent
data source's name from that result's ancestor path, never from its content,
which a card's author writes. The name must be one of the three boards.

Shortcut: the transcript's format is Claude Code's and undocumented; a change
to it makes every question fall back to the prompt rather than pass, and the
ledger's count of `not-a-card` shows when. Upgrade when the orchestrator's
register records which cards a session holds.

- *Alternative: a local list of board ids.* Ids are private, so the list
  could not be tracked, and a page id still does not say which board holds it
  without a call the hook cannot make.
- Names rather than ids: a database elsewhere in the workspace named
  `Harness` would pass. Accepted: the workspace is the user's, and the other
  conditions still hold there.

The same record answers whether the session read the card's comments before
asking: it must hold a `notion-get-comments` result for that page. That is
the mechanised half of *A question already open is not asked again* — the
hook cannot judge whether two questions are the same, but it can refuse to
let a session ask on a card whose open questions it never looked at.

### The envelope: mark, one question, no mention, a length bound

The mark is the inline-code token `harness-question` as the comment's first
characters — a token a person does not type in a reply, so the read-back can
take the first later comment in that question's own thread, by the user's
account and without the mark, as the answer, and ignore every other comment
(rules.md: recognise what a tool owns by a mark only that tool writes). The account rules out another member; the mark rules out the agent,
which writes as the same account. One question
per comment keeps one thread per decision. A user mention is refused because
it notifies its subject of text that reads as the user's. The bound of 1500
characters holds a question, its options and a link to its branch, and not a
report. Everything else about the question's form — a recommended answer,
rounds of independent questions — is the idea card *Ask proposal-stage
questions with a recommended answer, in rounds of independent ones*.

### Recorded through the gate ledger

Each call the hook sees is one `gate-decision-ledger` record: gate
`question-gate`, decision `allowed` or `passed`, and as the rule the first
condition that failed — `reply`, `anchored`, `rich-text`, `unmarked`,
`mention`, `length`, `not-a-card`, `comments-unread`, `unreadable` — or
`question`. Those names are the stable ids the ledger's rule field holds, one
per condition, and the session is the `session_id` of the `PermissionRequest`
event, as the ledger records it for every gate. The hook writes the ledger and
never reads it.

### No cap, and no question asked twice — the user's choice

The card first asked for at most two open questions, from the observation
that more than two parallel interviews are more than a person holds, and the
first draft of this design added a per-session ceiling on the hook as a
backstop. The user dropped both on 2026-10-12: a ceiling that is hit still
leaves a pile of questions to clean up or lift, and an agent stops on its own
— its context runs out, it has nothing left to ask, or the loop guard refuses
the call it keeps repeating. In their place the user asked for one rule:
before asking, an agent reads the `Questions` view of its board and the
comments of its card, and a question already open there is waited on, not
asked again — so the pile holds each question once.

- *Alternative: the cap of two, counted through the `Questions` views.* It
  parked work behind a count, and needed one session holding the boards so
  that two sessions counting at once could not both post.
- *Alternative: a per-session ceiling counted from the ledger.* It never
  retired an answered question, so a resumed session stopped asking after its
  second for good.

### `Assign` means a question waits, and nothing else

The card *Run several changes in parallel* proposed `Assign` as a worker's
lock. One property with two meanings makes the `Questions` view list locked
cards as questions, so the lock goes to that card's own design.

### The agent whose work is blocked asks

With no count to serialise, no session needs to hold the boards: the agent
the question blocks first settles what it can from the docs, the specs, the
card and the history, then reads the open questions, and posts what is left
on its own task's card. This stands as procedure in
`core/feature-workflow.md`, citing task-board, except for the comments read,
which the hook checks.

## Risks / Trade-offs

- [A `PermissionRequest` `allow` might not answer an ask-rule prompt in
  practice, or not in `-p`] → Task 1.1 confirms both in fresh sessions before
  any code is written, and stops the change if either fails.
- [`dontAsk` may refuse a question before the hook is consulted] → Left
  unspecified: the orchestrator card runs unattended sessions with `-p`, which
  task 1.1 covers, and a session in `dontAsk` that cannot ask reports the
  refusal as any other.
- [Text the agent read persuades it to post a marked comment] → Bounded to a
  card on the user's board, 1500 characters, no mention, and a reader who is
  the user.
- [Nothing bounds how many questions wait, and a runaway session can post
  many] → The user's choice: an agent stops on its own, and the loop guard
  refuses a post one keeps repeating after it failed. The ledger counts what
  was posted.
- [The same question, worded differently, is asked twice] → The hook only
  proves the card's comments were read; judging sameness is the agent's, and
  a duplicate costs the user one extra answer.
- [The hook checks the card's comments were read, not the `Questions` view]
  → Accepted: the view read stays the rule's prose. The hook knows the page it
  posts on, not each board's view id. Work parked on another card's question
  finds its answer through the card its report names, so a skipped view read
  costs at most one duplicate answer, as above.
- [The comments were read before another agent posted the same question] →
  Accepted: the window runs from the read to the post, and the duplicate
  costs as above.
- [Until the bot-integration card named in *Decisions* lands, every question
  stands on the boards as written by the user] → The mark is the only sign it is the agent's.
- [A `PermissionRequest` hook or a mod outside the project can also answer
  the prompt] → Recorded by `policy-gate-beyond-bash`; unchanged here.
- [Cost] → One `bun` launch per `notion-create-comment` prompt; none for any
  other tool.

## Migration Plan

One group in the harness. Consumers receive the hook through `sync.ts` on
their next bump, which `settings.ts` already requires. Before
`policy-gate-beyond-bash` group 2 gives them the ask entry, a prompt their
mode raises for the tool is answered on the same terms. The `Questions` views are made on the boards in the apply. Rollback:
remove the `HOOKS` entry, and every question prompts again.
