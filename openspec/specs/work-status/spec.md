# work-status Specification

## Purpose

The command a session moves a card's `Status` with, the WIP limit and the
evidence on `origin/main` it checks before the write, and the hook that keeps
the connector's own `Status` write from walking round it in the harness.

## Requirements

### Requirement: Status reads its arguments strictly

`bun bun/work.ts status` SHALL take `--card <id>`, a Notion page id as `take`
reads one, and `--to <status>`, both required. `--to` SHALL name one of the
eleven statuses task-board defines. `--why <text>` SHALL be required with
`--to discarded` and `--to idea` and SHALL NOT be taken with any other
`--to`; its text SHALL hold a character other than whitespace. Any other
option, a positional argument, a missing value, a malformed id, another
`--to`, a missing, misplaced, blank or repeated `--why` SHALL print the usage
and exit 2 before any git or Notion call.

#### Scenario: A status the board does not have

- **WHEN** `status` runs with `--to merged`, or without `--to`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A discard with no reason

- **WHEN** `status` runs with `--to discarded` and no `--why`, or with
  `--why "  "`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A reason on another move

- **WHEN** `status` runs with `--to exploring --why duplicate`
- **THEN** it prints the usage, exits 2, and calls nothing

### Requirement: The user's statuses are refused

`status` SHALL refuse `--to approved` before any call. It SHALL refuse
`--to idea` after the page read for a card that does not read `discarded`,
and any target but `idea` for a card that reads `discarded`, naming `idea`
as its way out: only the user moves a card to `approved`, or to `idea` from
a status other than `discarded` (task-board).
A session sets `discarded` from any other status and `exploring` to `done`,
and
returns a `discarded` card to `idea`.

#### Scenario: Approved as the target

- **WHEN** `status` runs with `--to approved`
- **THEN** it refuses naming the user, exits 1, and makes no Notion call

#### Scenario: Idea from a card in the work

- **WHEN** the card reads `exploring` and `status` runs with `--to idea
  --why …`
- **THEN** it refuses naming the user after the page read, and posts and
  writes nothing

#### Scenario: A discarded card

- **WHEN** the card reads `discarded` and `status` runs with `--to exploring`,
  or with `--to discarded --why …`
- **THEN** it refuses naming `idea` as the way out, and posts and writes
  nothing

#### Scenario: An idea card a session is directed at

- **WHEN** the card reads `idea`, the range has room, and `--to` is
  `exploring`
- **THEN** `status` writes the status: the user's instruction is the
  approval (`core/feature-workflow.md`), which the command cannot see, and an
  unattended session's taking no work from `idea` stays that file's rule

### Requirement: Entering the work range is held to the WIP limit

When the card reads a status outside `exploring` … `archiving` and `--to` is
one of those seven that needs no evidence, `status` SHALL count the cards of
the card's own board at the seven and refuse when the count has reached
`HARNESS_WIP_LIMIT`, which reads 5 when unset and SHALL be a whole number. A
move within the seven, to `done`, or to a status `origin/main` proves SHALL
NOT be counted: a proven move records work already done.

#### Scenario: The limit reached

- **WHEN** the card reads `approved`, five cards of its board are at
  `exploring` … `archiving`, and `HARNESS_WIP_LIMIT` is unset
- **THEN** `status --to exploring` refuses naming the limit and writes
  nothing, where four cards would let it write

#### Scenario: A move within the range

- **WHEN** the card reads `proposing`, the range holds five cards and `--to`
  is `proposed`
- **THEN** no count is made and the WIP limit refuses nothing

#### Scenario: A card behind its floor at a full limit

- **WHEN** the card reads `approved`, five cards are in the range, and
  `origin/main` proves `proposed` for its change
- **THEN** `status --to proposed` makes no count and writes the status

#### Scenario: More cards than one page

- **WHEN** the board's query answers a full page and says it has more
- **THEN** `status` refuses the entry whatever the limit

#### Scenario: A limit that is not a number

- **WHEN** `HARNESS_WIP_LIMIT` is `five` and the move enters the range
- **THEN** `status` refuses naming the variable and writes nothing

### Requirement: Merged statuses are proven on origin/main

For `--to proposed`, `applied` or `done`, `status` SHALL fetch `main` from
`origin` and read the evidence from the `openspec/changes` tree of
`origin/main` alone — never the checkout's files, `HEAD` or local `main`. A
fetch or a tree read that fails SHALL refuse. A card whose `Pointer` names a
pull request SHALL NOT fetch or read the tree: its `done` alone is proven, by
GitHub, and `proposed` or `applied` refuses (*A fix card's done is proven by
its merged pull request*).

#### Scenario: A checkout behind origin

- **WHEN** `origin/main` holds the change archived and the checkout's own
  tree and local `main` still hold it unarchived
- **THEN** `status --to done` writes the status

#### Scenario: A checkout ahead of origin

- **WHEN** the checkout holds a commit archiving the change that `origin`
  does not
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: The fetch fails

- **WHEN** `git fetch` cannot reach `origin`
- **THEN** `status --to proposed` refuses and writes nothing

### Requirement: Each merged status has its own evidence

On `origin/main`, `proposed` SHALL be proven when the board state derives
`proposed` or `done` for the change, `done` when it derives `done`, and
`applied` when it derives `done`, or `proposed` with every `## ` group of
the change's `tasks.md` holding a ticked box and no open one. A derived
`proposing` proves nothing. A ticked `Dropped …` task counts as ticked. A
card whose `Pointer` names a pull request names no change, and its `done` is
proven as *A fix card's done is proven by its merged pull request* sets out.

#### Scenario: A proposal not complete on main

- **WHEN** `origin/main` holds the change without its `design.md`
- **THEN** `status --to proposed` refuses and writes nothing

#### Scenario: One group still open

- **WHEN** the change's `tasks.md` on `origin/main` has group 1 ticked and
  group 2 with an open box
- **THEN** `status --to applied` refuses naming the open group

#### Scenario: Every group ticked, one task dropped

- **WHEN** every group is ticked and one ticked task reads `Dropped: …`
- **THEN** `status --to applied` writes the status

#### Scenario: A task list with no group

- **WHEN** the change's `tasks.md` has no `## ` group with a box
- **THEN** `status --to applied` refuses

#### Scenario: An archived change asked for applied

- **WHEN** `origin/main` holds the change only under the archive
- **THEN** `status --to applied` writes the status

### Requirement: The card's Pointer names the change proven

For a merged status, the change SHALL be the one the card's `Pointer` names
when it is wholly `openspec/changes/<slug>/`, with that slug active or
archived on `origin/main`, or `openspec/changes/archive/<date>-<slug>/`, with
that directory there. The same path behind this repository's own name, as
task-board's cross-repository form writes it, SHALL count alike. A `Pointer`
naming a pull request is read by *A fix card's done is proven by its merged
pull request*. An empty, decorated or other repository's `Pointer`, or a path
`origin/main` lacks, SHALL refuse, quoting the `Pointer`.

#### Scenario: An empty pointer

- **WHEN** the card's `Pointer` is empty and `--to` is `done`
- **THEN** `status` refuses and writes nothing

#### Scenario: Text around the path

- **WHEN** the `Pointer` reads `openspec/changes/foo/ (step 2)`
- **THEN** `status --to proposed` refuses quoting it

#### Scenario: A slug main does not hold

- **WHEN** the `Pointer` is wholly `openspec/changes/foo/` and `origin/main`
  has no `foo` under `openspec/changes/` or its archive
- **THEN** `status --to proposed` refuses

#### Scenario: An archived pointer

- **WHEN** the `Pointer` is `openspec/changes/archive/2026-10-27-foo/` and
  `origin/main` holds that archive
- **THEN** `status --to done` writes the status

#### Scenario: An archive dated otherwise

- **WHEN** the `Pointer` is `openspec/changes/archive/2026-10-27-foo/` and
  `origin/main` holds `foo` active and no archive of that name
- **THEN** `status --to proposed` refuses

#### Scenario: This repository's change from another board

- **WHEN** the `Pointer` is `harness: openspec/changes/foo/` in the harness,
  and `origin/main` holds `foo`
- **THEN** it is read as `openspec/changes/foo/`, and `d2ass:
  openspec/changes/foo/` refuses

### Requirement: The other statuses need no evidence and no order

`exploring`, `explored`, `proposing`, `applying` and `archiving` SHALL be
written without evidence, and `status` SHALL NOT check the order of the
statuses: a move the order skips passes when the WIP limit has room. Order is
held only once a failure shows the need (roadmap clarification 11).

#### Scenario: A jump the order skips

- **WHEN** the card reads `approved`, the range has room, and `--to` is
  `archiving`
- **THEN** `status` writes the status

#### Scenario: Explored needs no evidence

- **WHEN** the card reads `exploring` and `--to` is `explored`
- **THEN** `status` reads no tree and writes the status

### Requirement: Status fails closed and records each refusal

A Notion read that fails, no ask settings, or a card on no board SHALL
refuse. Each refusal SHALL exit 1, write nothing in Notion, and append one
gate-ledger record under gate `status` with its own id. A write SHALL print
the status the card reads back from Notion's answer, and exit 0 only when
that status is the one asked for, 1 otherwise.

#### Scenario: Notion does not answer

- **WHEN** the card's page read fails
- **THEN** `status` refuses, exits 1, and the ledger gains one `status`
  record

#### Scenario: A move written

- **WHEN** a move passes every check
- **THEN** `status` writes the card's `Status`, prints the card, the old and
  the new status as Notion answered it, and exits 0

### Requirement: The connector's Status write is refused in the harness

In the harness's own sessions a `PreToolUse` hook on the connector's
`notion-update-page` and `notion-create-pages`, under any server name, SHALL
refuse a `notion-update-page` call whose `properties` carry `Status`,
whatever its command, and a `notion-create-pages` call in which any page's
`properties` carry `Status` with a value other than `"idea"` or `null`,
whatever its parent, naming `idea` and `bun bun/work.ts status`, and record
it. On `notion-create-pages` a page with no `Status` or a `null` one SHALL
pass. Every other call, and an event it cannot read, SHALL pass. It SHALL
be registered in the harness's `.claude/settings.json` alone.

#### Scenario: A status set through the connector

- **WHEN** a session calls `notion-update-page` with `update_properties` and
  `properties` holding `Status`
- **THEN** the call is refused, naming `bun bun/work.ts status`

#### Scenario: Assign alone

- **WHEN** the call's `properties` hold `Assign` and no `Status`
- **THEN** the hook lets it through

#### Scenario: A card created past idea

- **WHEN** a session calls `notion-create-pages` with two pages, the first at
  `Status` `idea` and the second at `approved`
- **THEN** the call is refused, naming the second page, `idea` and `bun
  bun/work.ts status`, and nothing is created

#### Scenario: A card created at idea or with no status

- **WHEN** a session calls `notion-create-pages` with pages whose `Status` is
  `idea`, `null` or absent, under a data source or a page parent
- **THEN** the hook lets it through

#### Scenario: An event it cannot read

- **WHEN** the event is not JSON
- **THEN** the hook lets the call through

#### Scenario: A consumer's settings

- **WHEN** `sync` writes a consumer's `.claude/settings.json`
- **THEN** the status hook is not among the hooks it writes, and a sync of
  the harness's own settings keeps it

### Requirement: A fix card's done is proven by its merged pull request

When the card's `Pointer` is wholly `pr:<N>`, `N` a positive whole number with
no leading zero, or that behind this repository's own name, `status --to done`
SHALL read pull request `N` of the repository `origin` names from GitHub, and
SHALL write only when it is merged and its base branch is `main`. `--to
proposed` or `applied` with such a `Pointer` SHALL refuse without the read. A
read that fails SHALL refuse.

#### Scenario: A pull request merged into main

- **WHEN** the `Pointer` is `pr:350` and pull request 350 of `origin`'s
  repository is merged into `main`
- **THEN** `status --to done` writes the status, and fetches nothing from
  `origin`

#### Scenario: A pull request still open

- **WHEN** pull request 350 is open, or a draft
- **THEN** `status --to done` refuses naming it, and writes nothing

#### Scenario: A pull request closed without merging

- **WHEN** pull request 350 is closed and not merged
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: A pull request merged into another branch

- **WHEN** pull request 350 is merged into `release`
- **THEN** `status --to done` refuses naming the base, and writes nothing

#### Scenario: Applied asked of a pull request

- **WHEN** the `Pointer` is `pr:350` and `--to` is `applied` or `proposed`
- **THEN** `status` refuses without reading the pull request

#### Scenario: A pull request from another board

- **WHEN** the `Pointer` is `harness: pr:350` in the harness
- **THEN** it is read as `pr:350`, and `d2ass: pr:350` refuses quoting it

#### Scenario: A pointer that is not a number

- **WHEN** the `Pointer` reads `pr:abc`, `pr:0`, `pr:035`, `pr: 350`,
  `PR:350`, `#350` or `pr:350 (fix)`
- **THEN** `status --to done` refuses quoting it, without reading a pull
  request

#### Scenario: GitHub does not answer

- **WHEN** `gh` exits non-zero, does not answer within its limit, prints what
  is not a pull request, or `origin` names no owner and repository
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: A proven pull request at a full limit

- **WHEN** the card reads `approved`, five cards are in the range, and pull
  request 350 is merged into `main`
- **THEN** `status --to done` makes no count and writes the status

### Requirement: Status releases `Assign` after its write

After a `Status` write, on any move, `status` SHALL run the release that
`task-board`'s *The work commands release `Assign` when nothing waits*
fixes, and print its line after its own. A refusal SHALL release nothing.

#### Scenario: A move releases

- **WHEN** a move is written on a card whose `Assign` holds the user and
  nothing waits on the card
- **THEN** `status` prints the move, then `assign: removed the user from
  <card>`, and exits as the move alone decides

#### Scenario: A refused move

- **WHEN** a check refuses the move
- **THEN** `status` makes no release and reads no comments

### Requirement: A written done names the wrap-up next

When `status --to done` writes a card that read another status and the
read-back is `done`, it SHALL print last, after the release's line and
whatever exit code that leaves, `next: run /session-wrapup unless it is
already running, then tell the user «можно /clear»; a subagent passes this
line to its caller instead`. Any other `--to`, a refusal, a failed write, a
read-back other than `done`, or a card already at `done` SHALL print no such
line.

#### Scenario: A card moved to done

- **WHEN** `origin/main` proves `done` for a card at `archiving`, `status
  --to done` writes it, and the release removes the user from `Assign`
- **THEN** `status` prints the move, then the release's line, then the
  `next:` line, and exits 0

#### Scenario: A move to another status

- **WHEN** `status --to applied` is written
- **THEN** no `next:` line is printed

#### Scenario: A refused done

- **WHEN** `status --to done` is refused for want of evidence
- **THEN** it prints the refusal alone, with no `next:` line

#### Scenario: Notion answers another status

- **WHEN** `status --to done` is written and Notion's answer reads `archiving`
- **THEN** no `next:` line is printed, and `status` exits 1

#### Scenario: A card already done

- **WHEN** the card reads `done` and `status --to done` writes it again
- **THEN** no `next:` line is printed, so a finished wrap-up is not started a
  second time

#### Scenario: A failed restore after done

- **WHEN** `status --to done` is written and the release's restore fails
- **THEN** the `next:` line is still printed last, and `status` exits 1

### Requirement: The harness allows the wrap-up the line names

The harness's `.claude/settings.json` SHALL allow `Skill(session-wrapup)`, and
the skill the `next:` line names SHALL be one Claude Code finds under
`.claude/skills/`, so the session starts it without a permission prompt.

#### Scenario: The skill the line names

- **WHEN** the `next:` line names `/session-wrapup`
- **THEN** `.claude/skills/session-wrapup/SKILL.md` exists with that `name:`,
  and the harness's settings allow `Skill(session-wrapup)`

### Requirement: A move into or out of discarded posts its reason first

For `--to discarded` from any status but `discarded`, and `--to idea` from
`discarded`,
`status` SHALL make no WIP count and read no evidence. After the page read it
SHALL post one page-level comment on the card from the ask integration,
opening with the code mark `harness-status`, then `<from> → <to>: ` and the
`--why` text, where `<from>` is the status the page read gave. Only after the
post succeeds SHALL it write the `Status`, and release `Assign` as after any
write. A post that fails SHALL write no status, print one line opening
`status: <card> not written —`, exit 1 and record nothing in the gate ledger.

#### Scenario: A duplicate discarded

- **WHEN** the card reads `approved`, five cards are in the range, and
  `status` runs with `--to discarded --why "duplicate of <card>"`
- **THEN** it makes no count, posts `harness-status` `approved → discarded:
  duplicate of <card>` on the card, then writes `discarded`, prints
  `status: <card> approved → discarded` and exits 0

#### Scenario: A card in the work discarded

- **WHEN** the card reads `applying` and `status` runs with `--to discarded
  --why …`
- **THEN** it reads no evidence, posts the reason and writes the status

#### Scenario: A discarded card returned

- **WHEN** the card reads `discarded` and `status` runs with `--to idea
  --why "needed after all"`
- **THEN** it posts `discarded → idea: needed after all`, writes `idea`, and
  exits 0

#### Scenario: The post fails

- **WHEN** the comment's post answers 500
- **THEN** `status` makes no `Status` write, prints a line opening
  `status: <card> not written —`, exits 1, and records no refusal

#### Scenario: The write fails after the post

- **WHEN** the post succeeds and the `Status` write answers 500
- **THEN** the reason stays on the card, the line says the status was not
  written, and `status` exits 1
