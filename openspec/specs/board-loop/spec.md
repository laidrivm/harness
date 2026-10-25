# board-loop Specification

## Purpose

A runner the user starts once that takes the next takeable change from the
board and carries its next stage in a fresh unattended session, so that work
moves across the board without a person driving each stage.

## Requirements

### Requirement: The runner is the user's script and starts from a clean clone

The runner SHALL refuse to start when `CLAUDECODE` is in its environment. It
SHALL refuse a clone that `~/.claude.json` does not record as a trusted
workspace under its real path, because a session there ignores the tracked
`permissions.allow`. It SHALL refuse a tracked edit, or a branch tip no
remote-tracking branch contains, except as *An unpushed step branch does not
stop the pass* allows, or when, after its fetch, every commit the branch holds
over the default branch's remote tip is there already by patch (`git cherry`
marks none `+`): such a branch is a merged branch's leftover, which the
runner switches off, keeping it, and says so in one line. Otherwise it SHALL fetch and fast-forward the default
branch, refusing where it cannot. It SHALL never create a merge commit or
reset.
It SHALL then run `bun install --frozen-lockfile` and refuse when that fails,
so that no session it launches has to install.

#### Scenario: Started from an agent's shell

- **WHEN** the runner starts with `CLAUDECODE` set, to any value including
  the empty string
- **THEN** it exits non-zero, saying the user starts it from a terminal of
  their own, and it has run no git, `gh` or `claude` command

#### Scenario: An untrusted clone

- **WHEN** the clone's real path is not a trusted workspace in
  `~/.claude.json`
- **THEN** the pass is refused, naming how to trust it, before any fetch or
  session

#### Scenario: The previous pass's step branch

- **WHEN** the clone is on a step branch that the previous pass pushed and
  the tree is clean
- **THEN** the runner switches to the default branch at its remote's tip and
  the pass goes on

#### Scenario: Unpushed work

- **WHEN** the current branch holds a commit that no remote-tracking branch
  contains, and it is not the step branch of a change the pass computes as
  takeable or as an answer candidate
- **THEN** the runner refuses, naming the branch, launches no session, and
  leaves that branch checked out at the tip it had

#### Scenario: A merged branch's leftover

- **WHEN** the tree is clean and the current branch holds commits that no
  remote-tracking branch contains, but after the fetch the default branch's
  remote tip holds each of them, itself or by patch as a squash merge leaves
  it
- **THEN** the runner prints one line naming the branch, switches to the
  default branch at its remote's tip and the pass goes on; the branch keeps
  its tip, and a later refusal leaves the clone on the default branch

#### Scenario: Unpushed work on a detached HEAD

- **WHEN** `HEAD` names no branch and holds a commit that no remote-tracking
  branch contains
- **THEN** the runner refuses before any fetch, leaving `HEAD` where it was

#### Scenario: An edited tracked file

- **WHEN** a tracked file differs from `HEAD`
- **THEN** the runner refuses. An untracked file alone does not stop it

#### Scenario: The install fails

- **WHEN** `bun install --frozen-lockfile` exits non-zero after the
  fast-forward, for example because `bun.lock` no longer matches
  `package.json`
- **THEN** the runner refuses, records `refused`, prints the install's
  failure, and launches no session

#### Scenario: The pin moved on the default branch

- **WHEN** the fast-forward brings a commit that moves a pinned dependency
- **THEN** the install runs against the new lockfile before any session
  starts

### Requirement: A pass takes only a takeable change

A change SHALL be takeable when it is `proposed` (`bun/board-state.ts`) and
blocked by nothing in its `after:` list. Its `tasks.md` SHALL have a group
with an unticked box, and the first such group is the step. No open pull
request SHALL sit on that step's branch, as `git-and-prs.md` names it, and no
closed one SHALL have used the branch. A change that fails any of these SHALL
be passed over with its reason printed. A pull request query that fails SHALL
make the change untakeable.

A change that fails only because every box of its N groups is ticked SHALL be
an answer candidate instead. Its step is N+1 on `feat/<slug>-<N+1>`, and the
pull request rule above applies to that branch. A pass SHALL be idle without
a pick session only when it has neither a takeable change nor an answer
candidate.

#### Scenario: A step waiting for the user's merge

- **WHEN** step 2 of a change has an open pull request on `feat/<slug>-2`
- **THEN** the change is not takeable, and the reason printed names that pull
  request

#### Scenario: The next group of a multi-group change

- **WHEN** a change's first group is ticked and its second is not
- **THEN** the step is 2, on `feat/<slug>-2`. A change with a single group
  has step 1, on `feat/<slug>`

#### Scenario: Every group ticked

- **WHEN** every box in a change's `tasks.md` is ticked, in N groups, and no
  pull request has used `feat/<slug>-<N+1>`
- **THEN** the change is an answer candidate for step N+1, and the pass runs
  the pick session even when no change is takeable

#### Scenario: An answer's step

- **WHEN** the pick session names an answer candidate
- **THEN** the stage session carries step N+1 on `feat/<slug>-<N+1>`. Its
  goal names writing the card's answer into `tasks.md` as group N+1 and
  carrying that group, and its condition is the check for `apply`, the change
  and N+1

#### Scenario: No takeable change

- **WHEN** no change is takeable and none is an answer candidate
- **THEN** the pass is idle. It launches no session and exits 0

#### Scenario: `gh` unavailable

- **WHEN** the pull request query fails or `gh` is missing
- **THEN** no change is takeable, and the line printed for each change says
  the query failed

### Requirement: A pass carries one step unattended and records the check's verdict

A pass SHALL launch the step as one fresh `claude -p` session. The session
runs in auto mode with nobody to answer prompts, and in the launch form
`stage-goal` fixes, under a prompt that declares it unattended. The pass
SHALL end the session one hour after launch. It SHALL then run the step's
goal check itself, and SHALL write one ledger record and one printed line per
pass.

#### Scenario: The step met its goal

- **WHEN** the session ends and the check's last line reads `goal met`
- **THEN** the pass records `loop`, `met`, `apply`, prints the change and the
  step, and exits 0

#### Scenario: The session claims success that the check denies

- **WHEN** `claude` exits 0 and the check reads `goal open`
- **THEN** the pass records `open`, prints what the check says is missing,
  and exits 1

#### Scenario: The step waits on the user's answer

- **WHEN** the check reads `goal open`, and the runner posted the
  session's question on the carried card or found a question already waiting
  there
- **THEN** the pass records `waiting`, prints the change, the step and the
  card, and exits 0

#### Scenario: A question the runner could not post

- **WHEN** the check reads `goal open` and the question line reads
  `question: not posted` for any reason but a question already waiting
- **THEN** the pass records `open` and exits 1

#### Scenario: The session runs past the limit

- **WHEN** the session is still running one hour after launch
- **THEN** the pass ends it, records `timeout`, and exits 1

#### Scenario: Every pass leaves a record

- **WHEN** a pass is refused, finds no takeable change, or carries a step
- **THEN** the ledger gains exactly one `loop` record. A ledger that cannot
  be written changes neither the printed line nor the exit status

#### Scenario: Permissions are never bypassed

- **WHEN** the runner launches any session
- **THEN** its command line carries neither `bypassPermissions` nor
  `--dangerously-skip-permissions`

### Requirement: A pass takes the first takeable card in the board's order

A pass SHALL take the takeable change whose card comes first in `Board view`.
A card whose open question the user has answered comes first, then the
`applying` column, then `proposed`. Within each, the user's order applies
(`task-board`, *A column is a queue the user orders*). A short session SHALL
read the board that `harness.board` names, and SHALL return one `PICK:` line.
The runner SHALL accept only a change from its own takeable list or its answer
candidates. It SHALL take no change on the user's word or by its own order.

The pick session SHALL take an answer candidate only when its card's
page-level discussion, resolved or not, holds an answer after the last
question there, as `task-board`'s *An open question waits on its card,
assigned to the user* defines the answer: the user's, when the card's `Assign`
holds the user, or a `harness-answer` by the integration's own id, whatever
`Assign` holds (*The runner has a stage session's question triaged before it
posts it*). Such a
card stands in `applied` or `applying`, so the pick session SHALL read
`applied` too.

The pick session SHALL pass over a takeable change whose card's page-level
discussion holds a question no answer follows, as the same definition reads
it, so a card waiting on the user costs no stage session.

Before it returns, the pick session SHALL move the card it picks to the status
of the stage the pass carries: `applying` for an apply step, from `proposed`
or, for an answer candidate, from `applied`. It SHALL then read the card back,
and SHALL write nothing else. The runner SHALL NOT read or wait on that move.
A card the pick moved SHALL stay where the move left it, whatever the pass
then does, so the next pass takes it first.

#### Scenario: The user dragged a card up

- **WHEN** two changes are takeable and the user has dragged the second
  one's card above the first in `proposed`
- **THEN** the pass carries the second

#### Scenario: A picked card is claimed

- **WHEN** the pick session picks a card at `proposed`
- **THEN** the card reads `applying` before the stage session starts, and no
  other card or property was written

#### Scenario: A card already applying

- **WHEN** the card the pick session picks is at `applying`
- **THEN** its `Status` is not written

#### Scenario: An answered card goes first

- **WHEN** an answer candidate's card in `applied` holds the user's answer and
  another change's card leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card holds, after its last question, neither
  the user's comment opening with neither `harness-question` nor
  `harness-answer` while its `Assign` holds the user, nor a `harness-answer`
  by the integration's own id
- **THEN** the pick session passes over it

#### Scenario: A takeable card waiting on the user

- **WHEN** a takeable change's card holds a question with no answer after it
- **THEN** the pick session passes over it, and takes it again once the user
  has answered

#### Scenario: A pick outside the list

- **WHEN** the pick session names a change that is neither takeable nor an
  answer candidate, names none, or returns no single `PICK:` line
- **THEN** the pass launches no stage session, and records `idle` for
  `PICK: none` and `refused` otherwise

#### Scenario: No board named

- **WHEN** the project's `package.json` holds no `harness.board`
- **THEN** the pass refuses, naming the key, and launches no session

### Requirement: A pull request query that does not answer fails

The runner SHALL end its pull request query for a candidate once the query
has run past the time limit that `stage-goal`'s *A pull request read that
does not answer is a failed try* gives the goal check's read, and SHALL treat
it as a query that failed, which *A pass takes only a takeable change* makes
untakeable.

#### Scenario: `gh` hangs on the query

- **WHEN** `gh` neither answers nor exits on the pull request query
- **THEN** the runner ends the query at the limit, passes the change over
  saying the query failed, and the pass ends as it would with `gh` failing

### Requirement: A step branch a session left is continued

When the branch of the step a pass carries already exists, in the clone or on
`origin`, the pass SHALL launch the stage session to continue it. The first
line of the launch form SHALL name that branch as one a session left, and
SHALL tell the session to switch to it rather than create it. The other lines
SHALL be those of the launch form for a step with no branch left, including
its `--before-push` check and its `PR-TITLE:` and `PR-BODY:` lines. The runner SHALL NOT delete, reset or
recreate the branch, and SHALL push it only as *The runner pushes the step and
opens its pull request* allows.

#### Scenario: A local branch a session left

- **WHEN** the step's branch exists in the clone and no pull request has used
  it
- **THEN** the stage session's first line names the branch and tells the
  session to switch to it rather than create it, and the branch's tip is the
  one the earlier session left

#### Scenario: A branch pushed without a pull request

- **WHEN** the step's branch exists on `origin` alone and no pull request has
  used it
- **THEN** the stage session's first line names the branch in the same way

#### Scenario: No branch left

- **WHEN** the step's branch exists neither in the clone nor on `origin`
- **THEN** the stage session's prompt is the launch form `stage-goal` fixes,
  unchanged

#### Scenario: An answer step's branch

- **WHEN** an answer candidate's branch for step N+1 already exists
- **THEN** the answer form's first line names that branch in the same way

### Requirement: An unpushed step branch does not stop the pass

A branch tip that no remote-tracking branch contains SHALL NOT stop the pass
when its branch is the step branch of a change the pass computes as takeable
or as an answer candidate. The runner SHALL switch from it to the default
branch as from any other branch, and the branch SHALL keep its commits. A
pass refused after that switch SHALL first switch the clone back to the
branch, unless it is refused because a session's process group outlived the
session, which may still be writing to the tree.

#### Scenario: A dead session's unpushed commits

- **WHEN** `HEAD` is on a takeable change's step branch, the tree is clean,
  and the branch holds a commit that no remote-tracking branch contains
- **THEN** the pass goes on from the default branch's tip, the step branch
  keeps its tip, and a pass that carries that step continues the branch

#### Scenario: Refused after the switch

- **WHEN** a pass that switched from such a branch is refused, for example
  because `bun install --frozen-lockfile` fails
- **THEN** the clone is back on that branch at its tip

#### Scenario: A session's process group outlived it

- **WHEN** a pass that switched from such a branch is refused because a
  session's process group outlived the session
- **THEN** the runner switches nothing, and the clone is left on the branch
  and tree the session left

### Requirement: The runner pushes the step and opens its pull request

The stage session SHALL push nothing and open no pull request. Once it and
everything it started have ended, the runner SHALL push the step's branch to
`origin`'s repository, never by force, and open its pull request against the default
branch, only when `HEAD` is on that branch, the before-push goal check that
`stage-goal` fixes reads `goal met`, and the session's final message names the
pull request's title and body. Its verdict SHALL then be the full goal check.

#### Scenario: A step ready to push

- **WHEN** the session ends on the step's branch, the before-push check reads
  `goal met`, and the final message holds one `PR-TITLE:` line and one
  `PR-BODY:` line with a body below it
- **THEN** the runner pushes that branch without force, opens a pull request
  ready for review with that title and body, and records the full check's
  verdict

#### Scenario: A step not ready

- **WHEN** the before-push check reads `goal open`, the session ran past the
  limit, or `HEAD` is on any branch but the step's
- **THEN** the runner pushes nothing, opens nothing, and the branch keeps its
  commits for the pass that continues it

#### Scenario: No title or body

- **WHEN** the final message holds no `PR-TITLE:` line, two of them, no
  `PR-BODY:` line, or an empty title or body
- **THEN** the runner opens no pull request, and the pass records `open`
  naming what the message lacked

#### Scenario: The push is refused

- **WHEN** `origin` refuses the push, because its branch moved or the step
  touches a file the pushing identity may not write
- **THEN** the runner neither forces nor retries, opens nothing, and the pass
  records `open` with the push's failure

#### Scenario: The pull request already exists

- **WHEN** opening fails because a pull request whose head is `HEAD` already
  exists on the branch
- **THEN** the verdict is the full check's, which reads `goal met`

### Requirement: A session's environment is an allowlist

The runner SHALL start the pick session and the stage session with an
environment holding only the variables its allowlist names and the commit
identity *The runner pushes as the GitHub App when one is configured* adds,
never a copy of its own. The allowlist SHALL name no variable that carries a
GitHub credential or an SSH agent, and no App setting.

#### Scenario: A token in the runner's environment

- **WHEN** the runner starts with `GH_TOKEN`, `GITHUB_TOKEN`,
  `SSH_AUTH_SOCK` and the App settings set
- **THEN** neither session's environment holds any of them

#### Scenario: What a session needs

- **WHEN** the runner starts with `PATH`, `HOME` and `XDG_STATE_HOME` set
- **THEN** both sessions see them unchanged, so the pre-PR record a session
  writes is the one the runner's check reads

### Requirement: The runner pushes as the GitHub App when one is configured

When the runner's environment names an App's ID and the path of its private
key, the runner SHALL push and open the pull request with an installation
token minted after the stage session ends, for the clone's repository alone,
and SHALL author and commit the session's commits as the App's `[bot]` user.
The token SHALL reach no session, command line or file, and SHALL stay in the
runner's environment as `GH_TOKEN` until the full goal check after the pull
request has run. With neither setting, the runner SHALL use its user's own
credentials.

#### Scenario: An App configured

- **WHEN** both settings are present and the step is ready to push
- **THEN** the push and the pull request are the App's, over HTTPS even when
  `origin` is an SSH URL, the token named only the clone's repository, and the
  session's commits name `<app>[bot]` as author and committer

#### Scenario: Half an App

- **WHEN** one setting is present without the other, the key cannot be read,
  or `origin` names no GitHub repository
- **THEN** the pass refuses before any session, naming the setting or the
  remote and never the key's contents

#### Scenario: GitHub does not answer

- **WHEN** a call to GitHub's API fails before the pick session
- **THEN** the pass refuses and launches no session; when the token cannot be
  minted after the stage session, the runner pushes nothing and the pass
  records `open`

#### Scenario: No App

- **WHEN** neither setting is present
- **THEN** the runner pushes and opens with its user's git and `gh`
  credentials, and the commits carry the clone's own identity

### Requirement: The runner reads the Notion integration's settings from its own user's file

Before any session, the runner SHALL read the integration's token and the
user's Notion id from one settings file under its own user's config home. No
file SHALL mean no integration, and the pass SHALL run as it would without
this requirement — except on the host, where the launcher is set: there no
file SHALL refuse the pass before any session, naming the file, since a
session would keep `notion-create-comment` and the host's Notion server is
signed in as the user. A file the runner cannot use SHALL refuse the pass before
any session, naming the file and never its contents. Neither value SHALL
reach a session.

#### Scenario: No settings file

- **WHEN** the runner's config home holds no settings file
- **THEN** the stage session's launch form asks it to comment on the card as
  before, no session carries the variable the question gate reads, and the
  pass makes no call to Notion

#### Scenario: No settings file on the host

- **WHEN** the launcher is set and the runner's config home holds no settings
  file
- **THEN** the pass refuses before any session, naming the file

#### Scenario: A usable settings file

- **WHEN** the file holds a non-empty token and a user id, and only its owner
  may read it
- **THEN** both sessions carry the variable the question gate reads, the stage
  session's launch form names the `QUESTION:` line, and neither session's
  environment nor any command's arguments hold the token

#### Scenario: A settings file others may read

- **WHEN** the file's mode grants its group or others any access
- **THEN** the pass refuses before any session, naming the file and its mode

#### Scenario: A settings file the runner cannot use

- **WHEN** the file cannot be read, is not a JSON object, holds a token that
  is empty or holds whitespace, or holds a user id that is not, as a whole
  value, 32 hexadecimal digits with or without a UUID's hyphens
- **THEN** the pass refuses before any session, naming the file and the key at
  fault, and prints no value from it

### Requirement: The runner posts a stage session's question from the integration

When the integration is configured and a stage session ends clean, the
runner SHALL read the final message for a `QUESTION: <card id>` line and the
text below it. It SHALL post that text from the integration on that card only
when the question gate's checks on a comment's text pass, the card sits on
the board `harness.board` names with a `Pointer` that is wholly the carried
change's directory, and no question waits unanswered there. It SHALL then
set `Assign` to the user alone, unless the triage answered the question
(*The runner has a stage session's question triaged before it posts it*), and
print one line saying what it did. The pass's outcome SHALL stay the goal check's,
except that a `goal open` behind a question posted or already waiting on the
card SHALL end `waiting` (*A pass carries one step unattended and records the
check's verdict*).

#### Scenario: A question posted

- **WHEN**, in the harness's clone, the final message holds one `QUESTION:`
  line naming the carried change's card on `Harness`, on which no question
  waits, and below it text that opens
  with the mark and is at most 1500 characters long
- **THEN** the runner posts the text as a page-level comment from the
  integration, sets the card's `Assign` to the user alone, prints that it did
  both, and the pass ends `waiting` when the goal check reads `goal open`,
  and as the goal check says otherwise

#### Scenario: Where the question ends

- **WHEN** a `PR-TITLE:` line follows the question
- **THEN** the question's text ends before it; with no such line, it ends at
  the end of the message

#### Scenario: No question

- **WHEN** the final message holds no line starting `QUESTION:`
- **THEN** the runner makes no call to Notion and prints nothing about a
  question

#### Scenario: A malformed question line

- **WHEN** the final message holds two `QUESTION:` lines, one after the
  `PR-TITLE:` or the `PR-BODY:` line, or one whose value is not, as a whole, a card id of 32
  hexadecimal digits with or without a UUID's hyphens
- **THEN** the runner posts nothing and prints why

#### Scenario: Text the question gate would not allow

- **WHEN** the text does not open with the mark, mentions a user, or is 1501
  characters long
- **THEN** the runner posts nothing and prints the condition the text failed,
  in the question gate's words

#### Scenario: A page that is not a card

- **WHEN** the page's parent data source is not the board `harness.board`
  names, or Notion answers the read of the page with an error
- **THEN** the runner posts nothing and prints the reason, with Notion's
  status where it answered one

#### Scenario: The card of another change

- **WHEN** the card's `Pointer` is not wholly
  `openspec/changes/<slug>/` for the change the pass carries
- **THEN** the runner posts nothing and prints that the card is not the
  carried change's

#### Scenario: A question already waits

- **WHEN** the card's last question has no answer after it, as `task-board`'s
  *An open question waits on its card, assigned to the user* reads one
- **THEN** the runner posts nothing and prints that a question already waits
  on that card

#### Scenario: The comment posted and `Assign` refused

- **WHEN** the comment is posted and the write of `Assign` fails
- **THEN** the runner prints that the question is posted and `Assign` is not
  set, and neither retries nor posts the comment again

#### Scenario: A session that did not end clean

- **WHEN** the stage session ran past its limit, or its process group outlived
  it
- **THEN** the runner reads no question from it

#### Scenario: A question with no integration

- **WHEN** no settings file is configured and the final message holds a
  `QUESTION:` line
- **THEN** the runner posts nothing and prints that no integration is
  configured

### Requirement: The runner has a stage session's question triaged before it posts it

With the integration configured, the runner SHALL read the integration's own
id before the pick session and name it in the pick prompt as the author of
`harness-answer` comments. Once a `QUESTION:` line has passed every check of
*The runner posts a stage session's question from the integration*, the
runner SHALL start a triage session, with no goal, that may read the clone
and nothing else. It SHALL hold no token, and its prompt SHALL carry the
question and the card's comments as data, and the rule that a choice, or
anything no written source settles, ends with `ESCALATE`. When the triage ends naming a
source, a verbatim quote and an answer, the source is a Markdown file
(`*.md`) tracked on the default branch as `origin` holds it, never the
step's branch, or the id of a comment by the user's account on
that card, and the quote, whitespace normalised, appears in that file as the
default branch holds it or in that comment's text, the runner SHALL check the page's parent, the
board's title and the carried `Pointer` again, read the card's comments
again and, when all three still hold and no comment opening with the mark,
nor a `harness-answer` comment by the integration's own id, appeared since
its read before the triage, post the question from the integration, then the
answer from the integration as a page-level comment opening with
`harness-answer` and holding the quote and the source, and SHALL set no
`Assign` unless the answer's post fails. The runner SHALL make
the same checks, and post nothing when one fails, before posting the
question on every other ending too. Any other source SHALL be one
that does not hold. On any
other ending the runner SHALL post the question as that requirement fixes.
The pass's outcome SHALL stay the goal check's, with the same `waiting`
exception that requirement fixes, a question the triage answered included.

#### Scenario: An answer already written

- **WHEN** the triage ends with a source that is a Markdown file tracked on
  the default branch, a quote that file holds there, and an answer
- **THEN** the runner posts the question, then a comment opening with
  `harness-answer` that holds the answer and the source, sets no `Assign`,
  and prints that it answered

#### Scenario: The answer's post fails

- **WHEN** the question is posted and the answer's post fails
- **THEN** the runner sets `Assign` to the user, as it would on `ESCALATE`

#### Scenario: A choice for the user

- **WHEN** the triage ends with `ESCALATE`
- **THEN** the runner posts the question from the integration and sets
  `Assign` to the user, as it would with no triage

#### Scenario: A source that does not hold

- **WHEN** the triage names a path the default branch does not track, a
  tracked file that is not Markdown, a comment id that is not the user's on
  that card, or a quote the source does not hold
- **THEN** the runner posts the question as it would on `ESCALATE`, and
  prints that the source did not hold

#### Scenario: A quote only the step's branch holds

- **WHEN** the triage quotes a `design.md` whose quoted words exist on the
  step's branch, which the asking session wrote, and not on the default branch
- **THEN** the source does not hold, and the runner posts the question as it
  would on `ESCALATE`

#### Scenario: A card moved or re-pointed while the triage ran

- **WHEN** the card's `Pointer` changed, or the page left the board, while the
  triage ran
- **THEN** the runner posts neither the answer nor the question

#### Scenario: A question posted while the triage ran

- **WHEN** a comment opening with the mark, or one opening with
  `harness-answer` by the integration's own id, appears on the card while the
  triage runs, whether or not the user has answered it
- **THEN** the runner posts neither the answer nor the question, and prints
  that the card changed during the triage

#### Scenario: A triage that fails

- **WHEN** the triage cannot be started, runs past its limit, or ends with
  neither form
- **THEN** the runner posts the question as it would on `ESCALATE`

#### Scenario: The triage's reach

- **WHEN** the triage session runs
- **THEN** its environment holds no token and no variable naming one, and its
  launch allows it no tool that writes or runs a command

#### Scenario: The pick prompt names the integration

- **WHEN** the integration is configured and the pick session starts
- **THEN** its prompt names the integration's id as the author whose
  `harness-answer` comments count as answers, and takes a card whose last
  question that integration's `harness-answer` follows though `Assign` does
  not hold the user; with no integration it names none, and no
  `harness-answer` counts

### Requirement: A timer the user set up may start the runner

The runner SHALL accept a start by a timer the user set up on a host of their
own, as `orchestrator` fixes, and SHALL then behave as it does when started
from the user's terminal. It SHALL require no terminal: no TTY on standard
input and no `TERM` in its environment. The refusal for `CLAUDECODE` in *The
runner is the user's script and starts from a clean clone* SHALL apply
whatever started it.

#### Scenario: Started with no terminal

- **WHEN** the runner starts with standard input not a TTY, no `TERM`, and no
  `CLAUDECODE`
- **THEN** the pass runs as it would from a terminal, and its line and record
  are the same

#### Scenario: A timer started inside a Claude Code session

- **WHEN** a timer's command starts the runner with `CLAUDECODE` in its
  environment
- **THEN** the runner refuses, as *Started from an agent's shell* fixes

### Requirement: The runner records the session of each step it pushes

The runner SHALL start each stage session with a session id it chose. Before
it pushes a step's branch, it SHALL append one record to the PR → session
table naming the repository, the branch, the session id, the clone and the
time. When the record cannot be written, the runner SHALL push nothing and
open nothing, and the pass SHALL record `open` naming the table.

#### Scenario: A step ready to push

- **WHEN** the runner is about to push a step's branch
- **THEN** the table's last line names that repository, branch, the stage
  session's id and the clone, and the push follows

#### Scenario: A step continued by a second session

- **WHEN** a later pass continues the step's branch in a new session and
  pushes it
- **THEN** a second record names the new session, and a lookup returns it

#### Scenario: A step not ready

- **WHEN** the step is not ready, so the runner reaches no push
- **THEN** the table is unchanged

#### Scenario: A push refused after the record

- **WHEN** the record is appended and the push is then refused
- **THEN** the record stays: a branch never pushed has no pull request whose
  failure looks it up, and a later push of the branch appends a newer record,
  which the lookup returns

#### Scenario: The table cannot be written

- **WHEN** appending the record fails
- **THEN** the runner pushes nothing and opens nothing, the pass records
  `open` naming the table's path, and the branch keeps its commits for the
  pass that continues it
