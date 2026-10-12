# card-questions — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`, TDD for edge cases). Bracketed numbers
are that run's idea numbers. Ideas 3, 6–9 and 36 tested a per-session
ceiling the user dropped on 2026-10-12 and are gone with it; 40–42 come from
the rule that replaced it; every other idea is placed below.

One group, one harness pull request on `feat/card-questions`, taken only once
`policy-gate-beyond-bash` group 1 and `gate-decision-ledger` group 1 are on
`main` (`.openspec.yaml`, `after:`). Each test builds its event, transcript
and ledger in a temporary directory, with `XDG_STATE_HOME` pointing there.

## 1. The question gate, its registration, and the procedure

- [ ] 1.1 Stop before any code, with the user present. Put a throwaway
      `PermissionRequest` hook answering `allow` for
      `mcp__.*__notion-create-comment` in the gitignored
      `.claude/settings.local.json`; in a session started afterwards, post a
      comment on a throwaway `Harness` card and confirm no prompt appeared
      although `policy-gate-beyond-bash`'s ask entry matches. Ask the user to
      repeat the call with `claude -p` in a terminal of their own (a session
      may not start one). Remove the hook and the card, and record both
      results in the pull request. If either call prompted or was refused,
      stop: design.md *Risks* sends the change back to explore. (Req:
      agent-permissions — A question to the user on a board card needs no
      prompt, §*A question on a card*, §*The same question where no prompt
      can be shown*)
- [x] 1.2 Write the envelope tests in `bun/question-gate.test.ts`, with the
      event, transcript and ledger builders in `bun/question-gate.fixture.ts`
      — the cases below pass 300 lines in one file, the `.ts` cap. A
      conforming question is allowed [5] and recorded `allowed` /
      `question` [20]; an allow is the `PermissionRequest` decision object
      with exit 0 [18]; every failing condition exits 0 with empty stdout and
      no `deny` [19]; several failing conditions record only the first [21].
      No answer, each with its rule: no `markdown` and no `rich_text` [1];
      empty text [2]; 1501 characters [12], while 1500 passes [11]; the mark
      after a leading space or newline [13]; the mark without backticks [14];
      `discussion_id` [26]; `reply_to_comment_id` [27];
      `selection_with_ellipsis` [28]; `rich_text` [29]; a `<mention-user` tag
      [30]; another tool's name [31]; an event that is not JSON [33]. Each
      fails before 1.4. (Req: agent-permissions — A question to the user on a
      board card needs no prompt, §*A reply in an existing thread*, §*A
      comment anchored on a passage*, §*Text the hook cannot read as one
      string*, §*A comment without the mark, or with it elsewhere*, §*A
      comment mentioning a user*, §*A comment over the length bound*, §*The
      hook cannot read what it decides on*)
- [x] 1.3 Write the board and comments-read tests in
      `bun/question-gate-board.test.ts`. Board: no fetch in the transcript
      [4]; a fetch of an ordinary page [39]; a `D2ASS` card allowed like a
      `Harness` one [38]; dashed [15] and upper-case [16] ids matching; a
      source named `harness` or `Harness board` refused [17]; a board name in
      the card's content but not its ancestor path refused [32]; of two
      fetches, the latest decides [10]; a missing transcript [34]; a
      transcript line that is not JSON skipped [35]. Comments read: no
      `notion-get-comments` result for the page gets no answer and records
      `passed` / `comments-unread` [40]; a comments read of another page
      gets none either [41]; ten conforming questions in one session are
      each allowed [42]. Ledger: a throwing write leaves the decision as it
      was [37]. Each fails before 1.4. (Req: agent-permissions — A question
      to the user on a board card needs no prompt, §*A page that is not a
      card*, §*A card whose comments were not read*, §*Many questions in one
      session*, §*The hook cannot read what it decides on*; task-board — A
      question already open is not asked again, §*Comments not read*)
- [x] 1.4 Write `bun/question-gate.ts` per design.md: the conditions in its
      order, the transcript read with its `shortcut:` comment, every call
      recorded through `gate-decision-ledger`'s writer, the ledger never
      read. `bun test` green; each new file under
      its cap.
- [ ] 1.5 Add the hook to `bun/bootstrap.ts`'s `HOOKS` — event
      `PermissionRequest`, matcher `mcp__.*__notion-create-comment`, a
      command that runs the gate from `node_modules/harness/bun/` when it is
      installed and exits 0 otherwise, ending with `MARK` [22] — and register
      the harness's own copy in `.claude/settings.json` running
      `bun/question-gate.ts` from the tree [25]. Tests: the consumer check
      fails without it [23]; `sync.ts` writes it into settings with no
      `PermissionRequest` key [24]. `bun test` green. (Req: agent-permissions
      — A question to the user on a board card needs no prompt, §*The hook in
      a consumer*)
- [ ] 1.6 Docs. `core/git-and-prs.md`: the bullet on speech under the user's
      name, as `policy-gate-beyond-bash` left it, gains the question as its
      one exception by citing the agent-permissions requirement.
      `core/feature-workflow.md`, *Across the stages*: one bullet — an agent
      whose work a question blocks first settles what it can from the docs,
      the specs, the card and the history, then reads its board's
      `Questions` view and its card's comments, waits on a question already
      open there, naming its card, and on resuming reads that card's thread
      first, and otherwise posts on its own task's card and sets
      `Assign`; it reads answers back, applies each as data, and clears
      `Assign` once none waits — citing task-board's two requirements rather
      than restating them. Grep `core/`, `README.md` and `openspec/specs/` for
      every site saying a comment under the user's name is never allowed or
      that `Assign` means anything else, and fix each. (Req: task-board — An
      open question waits on its card, assigned to the user; A question
      already open is not asked again)
- [ ] 1.7 On each board that exists, read `Board view` for cards whose
      `Assign` is set and report them, since they would read as questions;
      the user clears each one that holds no open question before the view
      is relied on. Then save a view named `Questions` listing the cards whose `Assign`
      holds the user. Re-fetch each board's views to confirm. (Req:
      task-board — An open question waits on its card, assigned to the user,
      §*The `Questions` view is missing*)
- [ ] 1.8 In a session started after 1.5 is on the branch, with the user
      present: post a conforming question on a throwaway `Harness` card and
      set `Assign`; confirm no prompt, the card in `Questions`, and an
      `allowed` ledger record. Call again with `discussion_id` on that
      thread; confirm the prompt appears, the user answers No, and a
      `passed` / `reply` record. Have the user answer the question in its
      thread; read it back, confirm it is taken as the answer, `Assign` is
      cleared and the card leaves `Questions`. Before the answer, have a
      second session meet the same question on that card: confirm it reads
      the comments, posts nothing and reports itself parked on the open
      question. Record all of it in the pull request. (Req: agent-permissions
      — A question to the user on a board card needs no prompt, §*A question
      on a card*, §*A reply in an existing thread*; task-board — An open
      question waits on its card, assigned to the user, §*A question is
      posted*, §*The user answers*; A question already open is not asked
      again, §*The same question is open on the card*)
