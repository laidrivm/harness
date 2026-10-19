# notion-bot-questions — design

## Context

Today every question reaches a card through the user's connector:
`notion-create-comment`, allowed without a prompt by `bun/question-gate.ts`
when the text opens with `` `harness-question` ``, stays under 1500
characters, mentions nobody, and lands on a card the session has read, along
with that card's comments. The pick session in `bun/board-loop.ts` finds an
answer through the same connector. It looks for a comment by the user that
does not open with the mark, after the last comment that does. The runner
itself never touches Notion. `pick-claim-answer`'s design rejected a runner
that reads or writes the board through the REST API and left that choice to
the user. The user has now made it, within the bounds below.

The user decided the following on the card *Post agents' Notion comments and
card writes from a bot integration, not under my name* (2026-10-18 and
2026-10-20). They are fixed here and not reopened:

1. A Notion internal integration, "harness agent", exists. It can read,
   update and insert content, read and insert comments, and read user info
   without email. It is connected to the `D2ASS`, `Harness` and `mellon`
   boards.
2. Its token lives only on the VPS, in a file only the runner's user reads.
   Sessions run as another user with a clean environment. The token never
   reaches the laptop.
3. (1a) The integration writes only questions and the card's `Assign`.
   `Status`, `Pointer` and card text stay with the user's connector.
4. (2c) An attended session keeps asking through the question gate, which
   stays. An unattended session puts its question in its final message, and
   after the session the runner checks it as the gate does, posts it from the
   integration and sets `Assign` to the user.
5. The answer is the first comment by the user, without the mark, after the
   last question, whether the integration posted that question or the
   question carried the mark.
6. The `comment.created` webhook is out of scope. Polling stays.

## Goals / Non-Goals

**Goals:** a board-loop pass whose stage session asks the user puts nothing
on the card under the user's name; the same runner on the laptop, with no
token, works as it does today.

**Non-Goals:** the proposal's. Besides those: rendering the question's
markdown, and retrying a failed post.

## Decisions

### Decision 4 applies to the sessions the runner launches

Only the board loop's runner reads a session's final message and acts on it.
The proposal and archive forms in `core/feature-workflow.md`, and a worker
that another session briefs, have no such reader. They keep today's path:
the question gate, from the user's account. The `QUESTION:` form is named
only to a session the runner launches while the integration is configured.
Asking the others to use it would drop their questions where nobody reads
them.

### Every question carries the mark

The runner posts only text that opens with the mark, so every question opens
with it, whoever posted it. A question is therefore a comment that opens with
the mark (decision 5). The pick prompt keeps telling a question by the mark
alone, and needs to know nothing about how the connector shows the
integration as an author, which nobody has checked. The rule's one change is
its wording, "after the last question". The integration's comments always
open with the mark, so none of them can be taken for an answer.

`pick-claim-answer` named the hole: a session in which the user approves an
unmarked comment from their own account at the prompt makes that comment
read as an answer. An attended session still has that hole. The sessions the
runner asks for never comment from the user's account (*The gate refuses
every comment in a session the runner asks for*), so in their runs every
unmarked comment from that account is the user's own.

### The settings are a file in the runner's config home

The file is `$XDG_CONFIG_HOME/harness/notion-bot.json`, or
`~/.config/harness/notion-bot.json` when that variable is unset. It holds
`{"token": "...", "user": "<user id>"}`. The runner reads it before the pick
session, and from then on the token exists only in the runner's memory. It
reaches `fetch` only as a header, never as an argument or a variable.

Why not environment variables, as `github-app-identity` uses: on the VPS,
`vps-board-loop`'s `pass.sh` starts the runner with `env -i` and a fixed list
of variables, so a new variable needs that wrapper changed, and that change
is still to be applied. The runner's home there is a volume no session can
reach, and on the VPS `pass.sh` sets `HOME` to it. A file there needs nothing
from the wrapper.

The runner refuses the file when its mode grants the group or others
anything. On the VPS, the runner and the session user share a group for the
clones, so a group-readable file would be the session's too. The user id
comes from the file, and nothing in the tree holds it: the repository is
public. Validation covers the whole value (`rules.md` Code). The token must
be a non-empty string with no whitespace. The user id must be 32 hex digits,
alone or in UUID form.

### The gate refuses every comment in a session the runner asks for

When the integration is configured, the runner adds `HARNESS_RUNNER_ASKS=1`
to both sessions' environments, beyond the allowlist. A variable is the
signal because a session can set none in the environment its hooks inherit.
Reading the prompt's wording would tie the gate to one line of text. In such
a session the gate answers `deny` to every `notion-create-comment` it can
read. It records the call as `refused` under the rule `runner`, and its
message names the `QUESTION:` line. The name and its value are exported from
`bun/question-gate.ts` and imported by the runner (`rules.md` Code: a name one
system looks up in another is pinned where it is defined).

### The `QUESTION:` form

The fourth line of the stage launch form becomes: a question only the user
can settle goes in the final message, never on the card, as a line
`QUESTION: <the card's id>` with the question below it, opening with the
mark. The runner posts it after the session. The line comes before any
`PR-TITLE:`. The session still reads the card, its comments and the
`Questions` view first, as `task-board`'s *A question already open is not
asked again* asks of an agent about to ask. The runner reads the line as
untrusted text, as `named()` reads the pull request's title and body:

- exactly one line starts `QUESTION:`, and it does not come after `PR-BODY:`,
  whose body runs to the end;
- its value, trimmed, is wholly 32 hex digits or a UUID;
- the question is the lines below it, up to a `PR-TITLE:` line or the end,
  trimmed.

### The text checks are the gate's, lifted

`verdict()`'s three checks on the text (`unmarked`, `mention`, `length`)
move into one exported function of `bun/question-gate.ts`. Both the gate and
the runner call it. `REMEDY` is exported beside it, so the runner prints the
gate's own words (`rules.md` Code: logic written twice is lifted into one
module both callers import). The gate's other conditions do not apply. The
runner always posts a page-level comment, with rich text it builds itself.
In place of the gate's `not-a-card`, it checks the card more narrowly than
the gate's three boards. The card must sit on the board `harness.board`
names, which the runner already reads, and carry the carried change's
`Pointer`, so a session cannot steer the integration to another card. In
place of `comments-unread`, the runner reads the comments itself, as below.

### Five REST calls, in order, each stopping the rest on failure

The base is `HARNESS_NOTION_API_URL`, `https://api.notion.com` by default, so
a test can serve it with `Bun.serve`. Every call sends `Notion-Version:
2025-09-03` and has a 30 s timeout.

1. `GET /v1/pages/{id}`: its `parent` must be a `data_source_id`, and the
   plain text of its `Pointer` property must be wholly
   `openspec/changes/<slug>/`.
2. `GET /v1/data_sources/{id}`: its title must be wholly the board's name.
3. `GET /v1/comments?block_id={id}`, following `next_cursor`: the
   page-level comments. A question waits when the last comment opening with
   the mark has none after it by `user` that does not open with it. In the
   API a comment opens with the mark when its first rich-text run is
   code-annotated `harness-question`, or when its plain text starts with the
   backticked mark.
4. `POST /v1/comments`: `parent.page_id`, and `rich_text` holding a
   code-annotated `harness-question` run, then the rest of the text as one
   plain run.
5. `PATCH /v1/pages/{id}`: `properties.Assign.people` set to `[{id: user}]`
   and nothing else.

A failure prints the step and Notion's status, or the error's name. It never
prints the token. After step 4 there is no retry: a second post would put two
questions on the card.

### Where it sits in the pass

The call sits after the stage session's clean end and the print of its
output, and before `publish`. A failed push then still leaves the question
posted. It prints one line, `question: posted on <id>, Assign set`, or
`question: not posted — <reason>`, and changes neither the outcome nor the
`loop` record. A session that asks usually ends `BLOCKED —`, so the check
reads `goal open` and the pass is `open`, as it is today. The code lives in a
new `bun/notion-bot.ts`. `bun/board-loop.ts` gains the read before the pick,
the prompt's variant and the call.

## Risks / Trade-offs

- [Connecting a database may not give the integration its cards] → a user
  act checks it before the first pass relies on it. Until then, step 1 fails
  with Notion's status, and the pass prints the question it did not post.
- [Hooks may not inherit the session's environment] → the gate then reads
  the variable as unset and allows a marked question from the user's
  account, as today. The launch form's line still asks for `QUESTION:`. The
  fail-safe side is today's behaviour.
- [The API may list unresolved comments only] → a question the user resolved
  unanswered counts as not waiting, so a new one may follow it. The pick
  session still reads resolved discussions for answers.
- [The question's markdown shows as plain text] → only the mark is rendered
  as code. A question is prose, and its links still read as text.
- [The comment posts and `Assign` fails] → the card misses the `Questions`
  view. The printed line names it, and the user sets `Assign` by hand.
- [Whether an API write notifies the user is unknown] → a user act observes
  it. Nothing here depends on it.

## Migration Plan

Step 1 changes the rule's wording alone. Step 2 merges inert: with no
settings file, every pass runs as it does today. It acts once the user acts
in `proposal.md` are done on the VPS. Deleting the file returns the runner
to today's behaviour.

## Open Questions

None that change what gets built. Whether "a comment by a human" in decision
5 admits a member other than the user is read here as no. That keeps
`task-board`'s *Another member comments in the discussion*. The proposal's
pull request puts the reading to the user.
