# notion-bot-questions — tasks

Five groups, shipped as `feat/notion-bot-questions-1` to
`feat/notion-bot-questions-5`. Groups 1 to 3 are the proposal of #184, its
second group split in two to fit the diff budget; groups 4 and 5 come from
the user's extension (2026-10-20). Each group ships
alone, in order. Numbers in brackets refer to the proposal-stage `/zombies`
lists: [1]–[41] in #184, [42]–[83] in the extension's pull request. Each group
writes its failing cases first and records that they fail against the tree as
it stands. No task calls Notion: every Notion response in a test comes from a
`Bun.serve` stub reached through `HARNESS_NOTION_API_URL`. The user acts in
`proposal.md` are no task of this change.

## 1. The answer follows the last question

Closes `task-board` §*An open question waits on its card, assigned to the
user*, for the wording of the answer rule.

- [x] 1.1 Write the failing case in `bun/board-loop.test.ts`: the pick
      prompt's answer clause takes the first comment by the user `Assign`
      names that does not open with the mark, after the last comment that
      does, whichever account posted that one, the integration included. It
      still names `include_resolved: true` and the page-level discussion alone
      [41]
- [x] 1.2 Reword the answer clause of `pickPrompt()` in `bun/board-loop.ts`
      and see 1.1 pass with the rest of `board-loop*.test.ts` unchanged
- [x] 1.3 Reconcile the restating sites. In `core/feature-workflow.md`'s
      question bullet (*Across the stages*), say that a question is a comment
      opening with the mark, whoever posted it, and that the answer follows
      the last one. Then run `git grep -n -e "after the question's" -e "after
      the last such comment" -- core README.md bun openspec/specs` and check
      that each hit names the last question, or is a live spec this change's
      delta replaces

## 2. The runner posts the question from the integration

Closes no requirement on its own: it adds the settings read, the parse, the
REST calls and the gate's refusal, which nothing calls or sets until group 3
wires them into the pass, so it merges inert.

- [x] 2.1 Write the failing settings cases in a new `bun/notion-bot.test.ts`.
      No file reads as no integration [1]; the pass's half of [1] is
      3.1's. Modes 0600 and 0400 accepted, 0640 and 0604
      refused [2]. An empty, whitespace-only or space-holding token refused
      [3]. A user id accepted as 32 hex digits or as a UUID, and refused at 31
      digits or with a trailing character [4]. The file found under a set
      `XDG_CONFIG_HOME` and under `~/.config` [5]. Not JSON, a JSON array, or
      a directory at the path, each refused, naming the file [6]. No refusal
      holds the token's value [7]
- [x] 2.2 Write the failing `QUESTION:` parse cases in `bun/notion-bot.test.ts`.
      No line: no call [9]. One line and its text, parsed [10]. Two lines
      [11], or one after `PR-TITLE:` or `PR-BODY:` [12], post nothing. The text ends before
      `PR-TITLE:`, and `named()` still reads the title and the body [13]. 1500
      characters posted, 1501 not, counted as the gate counts them [14]. An id
      with text after it refused [15]. A CRLF message's id read trimmed [16].
      Empty text read as `unmarked` [17]. A mention [18], and the mark after
      the first characters [19], refused in the gate's words
- [x] 2.3 Write the failing REST cases in `bun/notion-bot-rest.test.ts` against a
      `Bun.serve` stub. The five calls in order, each with `Notion-Version`
      and the bearer header. The comment's body holds a code-annotated mark
      run, then the rest as plain text, and the `PATCH` body sets
      `Assign.people` alone to the user [20]. A question on the second page of
      comments, reached through `next_cursor`, still found [21]; pages served
      out of `created_time` order still give the latest question and the
      first answer after it (CodeRabbit review). A question
      followed only by another member's comment still waits; one followed by
      the user's unmarked comment does not [22], even when the configured
      `user` is unhyphenated and `created_by.id` is a UUID [22a]. A plain backticked mark
      counts as a question as well as a code run [23]. A data source titled
      `Harness copy`, or `mellon` from the harness's clone, refused [24]. A
      `Pointer` naming another change, or the carried one with text after
      it, refused [24a]. A parent of type `database_id` or `page_id`
      refused [25]. A 404 on the page read prints the status and posts nothing
      [26]. A stub that never answers ends at the timeout, which the test
      shortens, and prints the error's name [27]. A failed `POST` leaves no
      `PATCH` [28]. A failed `PATCH` prints that the question is posted and
      `Assign` is not set, and sends no second `POST` [29]. No printed line
      holds the token [30]
- [x] 2.5 Write the failing gate cases in `bun/question-gate-unattended.test.ts`.
      With `HARNESS_RUNNER_ASKS=1`, a conforming question is answered `deny`
      with a message naming `QUESTION:`, and recorded `refused` under
      `runner` [36]. The values `true`, `0` and empty decide as today [37].
      With the variable set, an unreadable event gets no answer [38]. The
      variable the runner sets is the gate's exported name and value [39].
      Text that is unmarked and also too long is still `unmarked` once the
      checks are lifted [40]
- [x] 2.6 Lift the text checks and `REMEDY` into exports of
      `bun/question-gate.ts`, switch `verdict()` to them, and add the refusal
      under `HARNESS_RUNNER_ASKS`; see 2.5 pass with the rest of
      `question-gate*.test.ts` unchanged
- [x] 2.7 Add `bun/notion-bot.ts`, holding the settings read, the parse and
      the five calls, as `design.md` says; see 2.1–2.3 pass

## 3. The runner posts the question from the integration — the pass

Closes `board-loop` §*The runner reads the Notion integration's settings from
its own user's file* and §*The runner posts a stage session's question from
the integration*, `agent-permissions` §*A session whose launcher posts its
questions posts no comment*, and `stage-goal` §*An unattended stage runs
under one goal on the check*, for §*A stage whose launcher posts its
question*.

- [ ] 3.1 Write the failing pass cases in `bun/board-loop-question.test.ts`
      through `board-loop.fixture.ts`, whose stub `claude` learns to write its
      environment and print a `QUESTION:` message. With no settings file, the
      stage prompt keeps today's fourth line and neither session carries
      `HARNESS_RUNNER_ASKS` [1]. The token is in neither
      session's environment, nor in any argument the stubs log [8]. A
      timed-out stage session makes no call [31]. A posted question leaves
      the outcome the goal check's [32]. The question is posted before the
      push, so a refused push still prints the posted line [33]. A
      `QUESTION:` line with no settings file prints that no integration is
      configured [34]. The fourth line of the stage prompt, with settings,
      names `QUESTION:`, the mark and that the session posts no comment, and
      matches the variant in `core/feature-workflow.md` [35]
- [ ] 3.2 Wire it into `pass()`. Read the settings before the pick session.
      Choose the launch form's fourth line. Pass the variable through an
      extra environment argument to `session()` in
      `bun/board-loop-session.ts`, so that only the runner adds it, together
      with `--disallowedTools mcp__*__notion-create-comment` on both
      sessions' command lines; see the stub log name it [84]. Probe the real
      CLI once with a session that tries the call, and record whether the
      wildcard was honoured (design.md *Risks*). Make the
      call after the stage session's clean end and before `publish`. See 3.1
      pass. Keep `bun/board-loop.ts` under the cap `bun bun/file-size.ts`
      reports; if it would pass the cap, move `prompt()` and `pickPrompt()`
      into a module of their own in the same commit
- [ ] 3.3 Reconcile the restating sites, and read each one back after the
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

## 4. A laptop session asks through the ask integration

Closes `task-board` §*A session asks through the ask integration where one is
configured*, `agent-permissions` §*A question goes to the ask command where
one is configured*, and `stage-goal` §*An unattended stage runs under one
goal on the check*, for §*A stage launched where the ask integration is
configured*. Needs no orchestrator.

- [ ] 4.1 Write the failing cases in a new `bun/notion-ask.test.ts` against a
      `Bun.serve` stub. Cover no settings file [42], an empty question file
      [43], a question posted [44], and a waiting question on the second page
      [45]. Cover a `harness-answer` that does not unblock [46], 1500 against
      1501 characters [47], the settings modes [48], a bad token [49] and a
      card id with text after it [50]. Check the call order, with no page read
      and no `PATCH` [51], and that `notion-bot.json` is never read in its
      place [52]. Cover a 404 on the comments read [53], a failed `POST` [54]
      and a missing question file [55]
- [ ] 4.2 Write the failing gate cases in a new
      `bun/question-gate-ask.test.ts`. Cover no settings file [56], a
      conforming question denied naming the command [57], and an empty file
      counted as present [58]. A directory at the path also counts as present,
      since the gate reads existence alone [59]. A reply gets no answer [60],
      and `HARNESS_RUNNER_ASKS` wins [61]
- [ ] 4.3 Add `bun/notion-ask.ts` on `notion-bot.ts`'s settings read and
      REST calls, as `design.md` *The ask command and its settings* says, and
      see 4.1 pass. Take the settings read's path as an argument rather than
      writing it a second time
- [ ] 4.4 Add the gate's `ask` refusal in `bun/question-gate.ts`, after the
      runner's, and see 4.2 pass with the rest of `question-gate*.test.ts`
      unchanged
- [ ] 4.5 Write the failing launch-form case [62] in
      `bun/board-loop-question.test.ts`, then make the runner name the ask
      command when it finds `notion-ask.json` and no VPS settings
- [ ] 4.6 Add `Bash(bun bun/notion-ask.ts *)` to `.claude/settings.json`'s
      allow list, and run `bun test bun/settings*.test.ts`
- [ ] 4.7 Reconcile the restating sites, and read each one back after the
      edit:
      - `core/feature-workflow.md`'s question bullet and its hand-launched
        forms name the ask command with its condition;
      - `README.md` names `notion-ask.json`, its mode, that it stays on the
        laptop, and the allow entry a consumer adds.

      Verify with `git grep -n -e "notion-create-comment" -e "question gate"
      -- core README.md` that each hit is true with the ask settings present

## 5. The triage, and its answer counted

Closes `board-loop` §*The runner has a stage session's question triaged
before it posts it*, and `task-board` §*An open question waits on its card,
assigned to the user*, for §*The triage's answer*, §*The user after the
triage* and §*A `harness-answer` from another author*. It acts only where
the settings groups 2 and 3 read are, which is the VPS host
`vps-board-loop` group 3 builds, and merges inert before that.

- [ ] 5.1 Probe once, on a stub session, which `claude -p` flags leave the
      triage able to read the clone and nothing else. Record the flags and
      what each refused in `design.md`'s *The triage*, and use them in 5.4
- [ ] 5.2 Write the failing triage cases in a new `bun/notion-triage.test.ts`,
      with a stub `claude`. Cover no `QUESTION:` line [63], the question then
      the answer posted with no `Assign` [64], a failed answer post that sets
      `Assign` [93], two source lines [65], an untracked path [66], a path leaving the
      clone [67], another card's comment id [68] and the time limit [69].
      Check the environment and the flags [70] and the prompt's data and its
      rule that a choice ends with `ESCALATE` [71].
      Cover `ESCALATE` [72], a `claude` that cannot start [73], a failed
      answer post [74] and the pass's outcome [75]. Cover a quote the cited
      file on `origin`'s default branch does not hold, including one only
      the step's branch holds [92], and one that differs from it only in
      whitespace [85]; a quote absent from the cited comment [86]; and a
      question that appears on the card while the triage runs, which posts
      neither the answer nor the question [87]. Cover a tracked file that is
      not Markdown (a `.ts` and a `.json` holding the quote), which escalates
      [88]; and a question that appears and is answered by the user while
      the triage runs, so that none waits at the second read, which still
      posts neither the answer nor the question [89]; a `Pointer` changed
      or a page moved during the triage, which posts nothing [90]; a
      `harness-answer` comment by another author during the triage, which
      suppresses nothing [91]
- [ ] 5.3 Write the failing answer-rule cases in `bun/board-loop.test.ts` and
      `bun/notion-bot.test.ts`. Cover the pick prompt naming the id [76], a
      triage answer that unblocks a card whose `Assign` is empty [77], and the user's comment winning in
      either order [78, 79]. Cover id normalisation [80], another author
      [81], a failed `GET /v1/users/me` [82] and no integration [83]
- [ ] 5.4 Add `bun/notion-triage.ts` as `design.md` *The triage* says. Call it
      from the runner between the question's checks and its post, and see 5.2
      pass. Keep `bun/board-loop.ts` under its cap
- [ ] 5.5 Read the integration's id with `GET /v1/users/me` beside the
      settings, name it in `pickPrompt()`, and extend REST step 3's
      *a question waits* to the triage's answer. See 5.3 pass with the rest
      of `board-loop*.test.ts` unchanged
- [ ] 5.6 Reconcile the restating sites, and read each one back after the
      edit:
      - `core/feature-workflow.md`'s answer rule names the triage's answer
        and that the user's comment overrides it;
      - `README.md`'s runner paragraph names the triage and its limit.

      Verify with `git grep -n -e "first comment" -e "the answer" -- core
      README.md` that each hit names both sources or is about another answer
