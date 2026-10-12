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

## Goals / Non-Goals

**Goals:** one hook that widens the ask entry for exactly the act the
proposal describes, failing closed; one place the cap, the view and the
`Assign` meaning are fixed; prose that cites both.

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

### The envelope: mark, one question, no mention, a length bound

The mark is the inline-code token `harness-question` as the comment's first
characters — a token a person does not type in a reply, so the read-back can
take the first comment after it that lacks it, by the user's account, as the
answer (rules.md: recognise what a tool owns by a mark only that tool
writes). The account rules out another member; the mark rules out the agent,
which writes as the same account. One question
per comment keeps one thread per decision. A user mention is refused because
it notifies its subject of text that reads as the user's. The bound of 1500
characters holds a question, its options and a link to its branch, and not a
report. Everything else about the question's form — a recommended answer,
rounds of independent questions — is the idea card *Ask proposal-stage
questions with a recommended answer, in rounds of independent ones*.

### Recorded and counted through the gate ledger

Each call the hook sees is one `gate-decision-ledger` record: gate
`question-gate`, decision `allowed` or `passed`, and as the rule the first
condition that failed — `reply`, `anchored`, `rich-text`, `unmarked`,
`mention`, `length`, `not-a-card`, `ceiling`, `unreadable` — or `question`.
The per-session ceiling counts this session's `allowed` records. An absent
ledger file is zero records; one that exists and cannot be parsed is
`unreadable`.

Shortcut: `claude -r` keeps a session's id, so a resumed session that has
asked its two falls back to the prompt for a third even after both were
answered. Upgrade when the orchestrator's register can say which questions
are answered.

- *Alternative: a counter of the hook's own in the temp directory.* A second
  store of gate decisions, which the orchestrator card's *one store, not two*
  rules out.

### The cap is two, counted on the boards

Two, from the card's own source: more than two parallel interviews are more
than a person holds. The session holding the board counts the `Questions`
views before posting — view mode, which spends no SQL quota. The hook's
ceiling cites the same requirement, so a runaway session stops at the number
the boards allow even when its count of the views is wrong.

The count is not a reservation: two sessions counting at once could each see
one place free. It holds because one session holds the boards at a time — the
one the user started to orchestrate — so posting is serialised by
construction. Coordinating several holders is the card *Run several changes
in parallel*'s; until then a second holder is outside this design, and the
per-session ceiling bounds what it can add.

### `Assign` means a question waits, and nothing else

The card *Run several changes in parallel* proposed `Assign` as a worker's
lock. One property with two meanings makes the `Questions` view list locked
cards as questions, so the lock goes to that card's own design.

### Only the board's holder asks

A worker returns its question in its report; the session holding the board
decides whether it is a question at all — settled by the docs, the specs, the
card or the history, or reversible enough to decide and flag in the pull
request — and posts it. The hook cannot tell the two sessions apart, so this
stands as procedure in `core/feature-workflow.md`, citing task-board.

## Risks / Trade-offs

- [A `PermissionRequest` `allow` might not answer an ask-rule prompt in
  practice, or not in `-p`] → Task 1.1 confirms both in fresh sessions before
  any code is written, and stops the change if either fails.
- [`dontAsk` may refuse a question before the hook is consulted] → Left
  unspecified: the orchestrator card runs unattended sessions with `-p`, which
  task 1.1 covers, and a session in `dontAsk` that cannot ask reports the
  refusal as any other.
- [Text the agent read persuades it to post a marked comment] → Bounded to a
  card on the user's board, 1500 characters, no mention, the per-session
  ceiling, and a reader who is the user.
- [Until the bot-integration card named in *Decisions* lands, every question
  stands on the boards as written by the user] → The mark is the only sign it is the agent's.
- [A board shared with other members shows them a comment under the user's
  name] → The mark says whose it is. Whether any board is shared is the
  user's to check (PR, *Check by hand*).
- [Notion may notify the user of their own comment or assignment after all]
  → The `Questions` view costs nothing either way; task 1.8 records which.
- [A failed ledger write undercounts the ceiling] → The boards' cap is the
  bound that holds; the ceiling is its backstop.
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
