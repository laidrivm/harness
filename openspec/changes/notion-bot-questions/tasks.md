# notion-bot-questions — tasks

Two groups, shipped as `feat/notion-bot-questions-1` and
`feat/notion-bot-questions-2`. Numbers in brackets refer to the
proposal-stage `/zombies` list in the proposal's pull request. Each group
writes its failing cases first and records that they fail against the tree as
it stands. No task calls Notion: every Notion response in a test comes from a
`Bun.serve` stub reached through `HARNESS_NOTION_API_URL`. The user acts in
`proposal.md` are no task of this change.

## 1. The answer follows the last question

Closes `task-board` §*An open question waits on its card, assigned to the
user*, for the wording of the answer rule.

- [ ] 1.1 Write the failing case in `bun/board-loop.test.ts`: the pick
      prompt's answer clause takes the first comment by the user `Assign`
      names that does not open with the mark, after the last comment that
      does, whichever account posted that one, the integration included. It
      still names `include_resolved: true` and the page-level discussion alone
      [41]
- [ ] 1.2 Reword the answer clause of `pickPrompt()` in `bun/board-loop.ts`
      and see 1.1 pass with the rest of `board-loop*.test.ts` unchanged
- [ ] 1.3 Reconcile the restating sites. In `core/feature-workflow.md`'s
      question bullet (*Across the stages*), say that a question is a comment
      opening with the mark, whoever posted it, and that the answer follows
      the last one. Then run `git grep -n -e "after the question's" -e "after
      the last such comment" -- core README.md bun openspec/specs` and check
      that each hit names the last question, or is a live spec this change's
      delta replaces

## 2. The runner posts the question from the integration

Closes `board-loop` §*The runner reads the Notion integration's settings from
its own user's file* and §*The runner posts a stage session's question from
the integration*, `agent-permissions` §*A session whose launcher posts its
questions posts no comment*, and `stage-goal` §*An unattended stage runs
under one goal on the check*, for §*A stage whose launcher posts its
question*.

- [ ] 2.1 Write the failing settings cases in a new `bun/notion-bot.test.ts`.
      No file: no call to Notion, today's launch form, and no
      `HARNESS_RUNNER_ASKS` [1]. Modes 0600 and 0400 accepted, 0640 and 0604
      refused [2]. An empty, whitespace-only or space-holding token refused
      [3]. A user id accepted as 32 hex digits or as a UUID, and refused at 31
      digits or with a trailing character [4]. The file found under a set
      `XDG_CONFIG_HOME` and under `~/.config` [5]. Not JSON, a JSON array, or
      a directory at the path, each refused, naming the file [6]. No refusal
      holds the token's value [7]
- [ ] 2.2 Write the failing `QUESTION:` parse cases in `bun/notion-bot.test.ts`.
      No line: no call [9]. One line and its text, parsed [10]. Two lines
      [11], or one after `PR-BODY:` [12], post nothing. The text ends before
      `PR-TITLE:`, and `named()` still reads the title and the body [13]. 1500
      characters posted, 1501 not, counted as the gate counts them [14]. An id
      with text after it refused [15]. A CRLF message's id read trimmed [16].
      Empty text read as `unmarked` [17]. A mention [18], and the mark after
      the first characters [19], refused in the gate's words
- [ ] 2.3 Write the failing REST cases in `bun/notion-bot.test.ts` against a
      `Bun.serve` stub. The five calls in order, each with `Notion-Version`
      and the bearer header. The comment's body holds a code-annotated mark
      run, then the rest as plain text, and the `PATCH` body sets
      `Assign.people` alone to the user [20]. A question on the second page of
      comments, reached through `next_cursor`, still found [21]. A question
      followed only by another member's comment still waits; one followed by
      the user's unmarked comment does not [22]. A plain backticked mark
      counts as a question as well as a code run [23]. A data source titled
      `Harness copy` refused [24]. A parent of type `database_id` or `page_id`
      refused [25]. A 404 on the page read prints the status and posts nothing
      [26]. A stub that never answers ends at the timeout, which the test
      shortens, and prints the error's name [27]. A failed `POST` leaves no
      `PATCH` [28]. A failed `PATCH` prints that the question is posted and
      `Assign` is not set, and sends no second `POST` [29]. No printed line
      holds the token [30]
- [ ] 2.4 Write the failing pass cases in `bun/board-loop-question.test.ts`
      through `board-loop.fixture.ts`, whose stub `claude` learns to write its
      environment and print a `QUESTION:` message. The token is in neither
      session's environment, nor in any argument the stubs log [8]. A
      timed-out stage session makes no call [31]. A posted question leaves
      the outcome the goal check's [32]. The question is posted before the
      push, so a refused push still prints the posted line [33]. A
      `QUESTION:` line with no settings file prints that no integration is
      configured [34]. The fourth line of the stage prompt, with settings,
      names `QUESTION:`, the mark and that the session posts no comment, and
      matches the variant in `core/feature-workflow.md` [35]
- [ ] 2.5 Write the failing gate cases in `bun/question-gate-unattended.test.ts`.
      With `HARNESS_RUNNER_ASKS=1`, a conforming question is answered `deny`
      with a message naming `QUESTION:`, and recorded `refused` under
      `runner` [36]. The values `true`, `0` and empty decide as today [37].
      With the variable set, an unreadable event gets no answer [38]. The
      variable the runner sets is the gate's exported name and value [39].
      Text that is unmarked and also too long is still `unmarked` once the
      checks are lifted [40]
- [ ] 2.6 Lift the text checks, `BOARDS` and `REMEDY` into exports of
      `bun/question-gate.ts`, switch `verdict()` to them, and add the refusal
      under `HARNESS_RUNNER_ASKS`; see 2.5 pass with the rest of
      `question-gate*.test.ts` unchanged
- [ ] 2.7 Add `bun/notion-bot.ts`, holding the settings read, the parse and
      the five calls, as `design.md` says; see 2.1–2.3 pass
- [ ] 2.8 Wire it into `pass()`. Read the settings before the pick session.
      Choose the launch form's fourth line. Pass the variable through an
      extra environment argument to `session()` in
      `bun/board-loop-session.ts`, so that only the runner adds it. Make the
      call after the stage session's clean end and before `publish`. See 2.4
      pass. Keep `bun/board-loop.ts` under the cap `bun bun/file-size.ts`
      reports; if it would pass the cap, move `prompt()` and `pickPrompt()`
      into a module of their own in the same commit
- [ ] 2.9 Reconcile the restating sites, and read each one back after the
      edit:
      - the comment above `pickPrompt()`, which says the runner has no access
        to the board, now says that it reads no card's `Status`;
      - `core/feature-workflow.md`'s *Unattended stages* gains the board
        loop's question variant beside the fourth line, which stays as it is
        for the hand-launched forms;
      - its question bullet says that a session the runner launches with the
        integration names its question in the final message, and that the
        runner posts the question and sets `Assign`;
      - `README.md`'s runner paragraph names the settings file, its mode, and
        that the file stays on the VPS.

      Verify with `git grep -n -e "page-level comment" -e "sets \`Assign\`"
      -e "set \`Assign\`" -- core README.md` that each hit names either the
      runner's case or the session's own
