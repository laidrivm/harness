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
3. (1a) The integration writes only questions, the triage's answers
   (decision 9) and the card's `Assign`. `Status`, `Pointer` and card text
   stay with the user's connector.
4. (2c) An unattended session the runner launches puts its question in its
   final message, and after the session the runner checks it as the gate
   does, posts it from the integration and sets `Assign` to the user. That
   an attended session keeps asking from the user's account is reversed by
   decision 7.
5. The answer is the first comment by the user, without the mark, after the
   last question, whether the integration posted that question or the
   question carried the mark. Decision 9 adds the triage's answer.
6. The `comment.created` webhook is out of scope. Polling stays.

The user extended the change on the same card (user, 2026-10-20):

7. No agent question is posted under the user's account any more, attended
   or not, wherever an integration is configured.
8. (1a) Every question from a session the runner launches goes to an LLM
   triage before anything reaches the card. The triage answers by itself only
   when the answer is already written: in a spec, a design, the rulebook or
   the docs, or the user's own earlier answer on the card. It cites that
   source. Any question that is a choice goes on to the user as a question
   the integration posts, with `Assign` set.
9. (2a) The triage's answer is a card comment the integration posts, opening
   with the mark `harness-answer` and naming its source. It counts as the
   answer, and a comment by the user after the last question overrides it.
10. (3в) Sessions on the laptop ask through a second internal integration
   with comment capabilities only. Its token sits in a file with mode 0600 on
   the laptop, not in the Keychain. The first integration's token still never
   reaches the laptop (decision 2).

## Goals / Non-Goals

**Goals:** no session puts a question on a card under the user's name where
either integration is configured; a question whose answer is already written
is answered without the user; a machine with neither settings file works as
it does today.

**Non-Goals:** the proposal's. Besides those: rendering the question's
markdown, and retrying a failed post.

## Decisions

### Three paths to a card

A question takes the first path that applies:

1. **A session the runner launches with the VPS integration** names it in a
   `QUESTION:` line. The runner hands it to the triage, then posts the
   triage's answer or the question from that integration (groups 2 and 4).
2. **Any session on a machine with the ask settings**, attended or not, a
   worker another session briefs and the hand-launched forms in
   `core/feature-workflow.md` included, posts it with the ask command, from
   the second integration (group 3). It needs no reader of its final
   message, so it reaches the sessions decision 4 left on the user's
   account.
3. **Anywhere else**, a consumer's laptop with no settings for one, it goes
   through the question gate from the user's account, as today. Without a
   token there is nothing else to post with, and dropping the question would
   stall the work silently. Decision 7 is read as applying where an
   integration is configured.

The `QUESTION:` form is named only on path 1, since only the runner reads a
final message.

Laptop questions skip the triage. The triage runs in the runner's pass next
to the VPS integration's token, and the user chose (3в) over a channel from
the laptop to the VPS. A person is usually at the laptop, and a hand-launched
unattended run there posts its question straight to the card, as today.

### Every question carries the mark

The runner posts only text that opens with the mark, so every question opens
with it, whoever posted it. A question is therefore a comment that opens with
the mark (decision 5). The pick prompt keeps telling a question by the mark
alone, and needs to know nothing about how the connector shows the
integration as an author, which nobody has checked. The rule's one change is
its wording, "after the last question". Each comment either integration
posts opens with a mark, `harness-question` or `harness-answer`, so none is
ever read as the user's answer.

`pick-claim-answer` named the hole: a session in which the user approves an
unmarked comment from their own account at the prompt makes that comment
read as an answer. An attended session on a machine with neither settings
file still has that hole. The sessions the runner asks for never comment from
the user's account (*The gate refuses every comment in a session the runner
asks for*), and on a machine with the ask settings the gate refuses a
question from that account, so there every unmarked comment from it is the
user's own.

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

The runner also launches both sessions with `--disallowedTools` naming
`mcp__*__notion-create-comment`, so Claude Code itself refuses the call
whether or not the hook sees the variable. The variable is what lets the
gate's refusal name `QUESTION:`; the withheld tool is what fails closed. A
question therefore never falls back to the user's account where the
integration is configured (decision 7; CodeRabbit on #191).

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
move into one exported function of `bun/question-gate.ts`. The gate, the
runner and the ask command call it. `REMEDY` is exported beside it, so the runner prints the
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
   page-level comments, every page collected, then ordered by `created_time`,
   ties kept in the order the API returned them (CodeRabbit review). A
   question waits when the last comment opening with
   the mark has none after it by `user` that does not open with it. A
   comment is by `user` when its `created_by.id` and `user`, each brought to
   32 lower-case hex digits, are equal: the settings take either form. In the
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
output, and before `publish`, so the post never waits on the push. A session
that asks has usually not met its before-push check, and then `publish`
pushes nothing. It prints one line, `question: posted on <id>, Assign set`, or
`question: not posted — <reason>`, and changes neither the outcome nor the
`loop` record. A session that asks usually ends `BLOCKED —`, so the check
reads `goal open` and the pass is `open`, as it is today. The code lives in a
new `bun/notion-bot.ts`. `bun/board-loop.ts` gains the read before the pick,
the prompt's variant and the call.

### The ask command and its settings (group 3)

`bun/notion-ask.ts <card id> <file>` reads the question from the file it names
and posts it from the second integration. A file, which the session writes
with its editing tool, keeps the mark's backticks out of the shell. Its settings file is
`$XDG_CONFIG_HOME/harness/notion-ask.json`, or `~/.config/...` when the
variable is unset. It has the same shape, mode rule and validation as
`notion-bot.json`, read by the same function with another path. Its own name
keeps the VPS token from ever being read in its place.

The command checks the text with the gate's lifted checks. It reads the
card's comments (REST step 3) and posts nothing while a question waits, then
posts the comment (step 4). It skips steps 1, 2 and 5:

- **No page read.** An integration with comment capabilities only cannot read
  a page. The connection stands in for the board check: the integration is
  connected to the three boards alone, so a card elsewhere answers 404. A user
  act confirms both facts before the first use.
- **No `Assign` write.** The integration cannot update a page. The session
  sets `Assign` through the user's connector, as decision 3 already leaves
  `Status` there. Only the comment changes author.

It prints one line, `question: posted on <id>`, or `question: not posted —
<reason>`, and exits non-zero on the second. The session then reports the
question unposted, as *A permission prompt in a run that cannot show it*
does.

The command posts as the integration, never as the user. So it is not the act
the `notion-create-comment` ask entry guards, which is sending as the user.
It is a tracked command with the gate's checks inside, not a throwaway
script (`rules.md` Safety). The harness's `.claude/settings.json` allows it
as `Bash(bun bun/notion-ask.ts *)`. `sync-settings.ts` writes no allow entry,
so the README tells a consumer to add the `node_modules/harness/` form to its
own allow list. Without that entry, an attended session prompts for the
command and an unattended one is refused and reports the question unposted.

The token sits in a file the session's own user can read, so a session could
use it beyond the command. The user accepted that with (3в). What it buys is
one comment from an integration that can comment on three boards and do
nothing else.

### The gate sends a question to the ask command (group 3)

When the ask settings file exists, the question gate answers `deny` to a call
that meets every condition of *A question on a card*, in any session, the
attended ones included. Its message names the ask command and is recorded as
`refused` under the rule `ask`. The gate reads only whether the file exists,
never its contents. Every other call keeps today's answer, so a comment that
is not a question still prompts and the user may approve it. Under
`HARNESS_RUNNER_ASKS` the runner's refusal comes first.

This departs from the gate's rule that it never refuses where a person may be
at the prompt. The user decided that no question goes out under their name
(decision 7), so an approval at that prompt would contradict it.

The launch form's fourth line names the ask command, in place of the
comment's form, when the runner finds the ask settings, as it names
`QUESTION:` when it finds the VPS ones. `core/feature-workflow.md`'s
hand-launched forms name both, each with its condition. The first question
from such a session therefore needs no refusal to find its way.

### The triage (group 4)

On path 1, once the runner has checked a `QUESTION:` line, it starts a triage
session before it posts anything. This is a `claude -p` run with no goal,
started like a stage session: the session user, a clean environment, no
token. It may read the clone and do nothing else. The prompt holds the
unattended line, the question, and the card's comments the runner already
fetched, as untrusted data, so the triage needs no Notion access. It ends on
one of two:

- `ANSWER-SOURCE: <source>`, then `ANSWER-QUOTE:` and the words of the
  source that settle the question, copied verbatim, then `ANSWER:` and the
  text;
- `ESCALATE`.

A source is one of two kinds, and nothing else: a Markdown file (`*.md`)
tracked in the clone, optionally with `#` and a heading or line, or the id of
a comment by the user on that card. Decision 8 names what may settle a
question — a spec, a design, the rulebook or docs, or the user's own earlier
answer — and in this repository every one of those is a Markdown file. Code
and configuration are not on the list: a tracked `.ts` or `.json` file could
otherwise authorise an answer no written decision gives (CodeRabbit on #191).
The runner checks the source exists — `git ls-files` for a path ending in
`.md`, or the fetched comments for an id — and that the quote, whitespace
normalised, appears in it: in the file at `HEAD`, or in that comment's text.
Existence alone would let the triage cite a real file that says nothing of
the kind (CodeRabbit on #191). A quote that is not there is a source that
does not hold. Right before posting, the runner reads the card's comments
again (REST step 3) and compares them with the ones it read before the
triage. If any comment opening with the mark or with `harness-answer`
appeared since, it posts nothing, whether or not the user has already
answered that question (CodeRabbit on #191): the triage was judged against
comments that are no longer the card's state. Checking only whether a
question still waits would let a question asked and answered during the
triage pass, and the stale answer or question would follow it. With a
source that holds, it posts
`` `harness-answer` <text>\n> <quote>\nSource: <source> `` from the
integration and sets no `Assign`, so the user sees the words the answer rests
on. The next pass's pick session finds the answer and carries it, as
it carries the user's. On `ESCALATE`, a source that does not hold, a time
limit of ten minutes passed, or any failure, the runner posts the question as
group 2 does. A doubt therefore always ends with the user.

The triage answers only what is already written, and every choice goes on to
the user (decision 8). That is the test `task-board`'s *An agent meets a
question* already sets for asking at all: a question the docs, the specs, the
card or the history settle is not asked. The triage applies the same test a
second time. It decides nothing new, so `core/autonomy.md`'s `card` class,
which says that handing a question on never answers it, stays true. The
session hands the question on, and what answers it is either the user or a
written answer the triage cites. No requirement of `agent-autonomy` changes.

The code lives in a new `bun/notion-triage.ts`, since `bun/board-loop.ts`
has no room under its cap. The triage needs only the runner and the VPS
settings, not the workflow engine. It acts wherever group 2's settings are, which is the VPS host that
`vps-board-loop` group 3 builds. Until that host exists, group 4 merges inert.

### `harness-answer` counts as the answer (group 4)

The answer rule gains one source. After the last question, the answer is the
first comment by the user without a mark. With none, it is the first comment
opening with `harness-answer` whose author is the VPS integration. A comment
by the user after the last question therefore overrides the triage's answer,
whichever came first.

The author check matters because the ask token is within a laptop session's
reach (3в), and a session could post `harness-answer` with it to answer its
own question. The ask command posts only text opening with `harness-question`,
but the token works without the command. So the runner reads the VPS
integration's own id once, with `GET /v1/users/me` next to the settings, and
names it in the pick prompt. A pick without that id, a laptop runner's,
counts no `harness-answer`. Every answer the triage gives is to a question a
VPS-launched session asked, and the VPS loop is the one that carries it. The
REST step 3 check, *a question waits*, takes the same rule.

## Risks / Trade-offs

- [Connecting a database may not give the integration its cards] → a user
  act checks it before the first pass relies on it. Until then, step 1 fails
  with Notion's status, and the pass prints the question it did not post.
- [A verbatim quote can still be cited out of context] → the comment shows
  the quote beside the answer, and the user's comment after it overrides it
  (decision 9).
- [Two posts can still cross between the second comment read and the post]
  → the window is one REST call long, not the triage's minutes; Notion offers
  no conditional post, and a second question is the user's to ignore.
- [Hooks may not inherit the session's environment] → the gate then reads
  the variable as unset, but the tool is withheld at launch, so the call is
  refused all the same and nothing goes out under the user's account. Only
  the refusal's wording loses its pointer to `QUESTION:`, which the launch
  form's line already names.
- [`--disallowedTools` may not take the `*` server wildcard] → task 2.4's
  stub logs the argument, and task 2.8 probes the real CLI once with a
  session that tries the call; if the wildcard is not honoured, the runner
  names the connector's server as the hook's matcher sees it.
- [The API may list unresolved comments only] → a question the user resolved
  unanswered counts as not waiting, so a new one may follow it. The pick
  session still reads resolved discussions for answers.
- [The question's markdown shows as plain text] → only the mark is rendered
  as code. A question is prose, and its links still read as text.
- [The comment posts and `Assign` fails] → the card misses the `Questions`
  view. The printed line names it, and the user sets `Assign` by hand.
- [Whether an API write notifies the user is unknown] → a user act observes
  it. Nothing here depends on it.
- [An integration with comment capabilities alone may not reach a card's
  comments, or may reach pages outside the boards] → a user act checks both
  before the first use. Until then, the ask command prints Notion's status
  and posts nothing.
- [A laptop session can use the ask token beyond the command] → accepted
  (3в). It can only comment on the three boards, and a `harness-answer` from
  it is never an answer.
- [The triage cites a source that exists but does not say what it claims] →
  the runner checks that the source exists, not what it means. The source is
  named in the comment, so the user can read it, and a comment of theirs
  overrides the answer.
- [The question's text steers the triage] → the triage can only read, and
  its one outcome is a comment that cites a source the runner checked. A
  stage session could at worst get an answer to its own question from a real
  file, which the user sees on the card.
- [How the connector shows an integration as an author is unchecked] → the
  pick prompt compares ids, not names. A user act reads one triage answer
  back through the connector before the loop relies on it.

## Migration Plan

Step 1 changes the rule's wording alone. Step 2 merges inert: with no
settings file, every pass runs as it does today. It acts once the user acts
in `proposal.md` are done on the VPS. Deleting the file returns the runner
to today's behaviour. Step 3 merges inert on any machine without
`notion-ask.json`. Step 4 merges inert without the VPS settings, and acts on
the VPS host `vps-board-loop` group 3 builds. Deleting `notion-ask.json`
returns the laptop to path 3.

## Open Questions

"A comment by a human" in decision 5 is the user's account alone, and no
other member (user, 2026-10-20). That keeps `task-board`'s *Another member
comments in the discussion*. The settings stay a file, not environment
variables (user, 2026-10-20).

A comment of the user's that comes after a `harness-answer` the loop has
already carried into a step is a new answer, and the loop carries it too: the
user's word overrides the bot's (user, 2026-10-20).
