# pick-claim-answer — tasks

Test tasks come from the proposal-stage `/zombies` run, and are written before
the code they cover (`core/testing.md`). The numbers in brackets are that
run's idea numbers. All 24 are placed below. A bare `[21]`, `[9]` or `[19]`
names an existing `board-loop` case.

Every case runs `bun/board-loop.ts` in a scratch repository through
`bun/board-loop.fixture.ts`. Stub `gh`, `claude` and `goal-check` sit first on
`PATH`. The pick session reads and writes the board, which no stub can show,
so the claim and the answer read are tested through the prompt the runner
hands it. The pull request's *Check by hand* tests them live.

There are two groups, each a harness pull request: `feat/pick-claim-answer-1`,
then `feat/pick-claim-answer-2`. Both are cut once `board-loop`'s archive
(#125) has merged.

## 1. The pick claims its card

- [x] 1.1 Write the claim tests in `bun/board-loop.test.ts`, under *the pick*:
      - extend [21]: the pick prompt no longer reads "change nothing
        anywhere", and it tells the session to set `applying` on the card its
        `PICK:` line names, and on no other card [1];
      - it says to leave a card already at `applying` unwritten [2], and to
        fetch the card again after the write [3];
      - the stage session's prompt is still the launch form's three lines,
        with no claim line [4];
      - a pick whose output says the move failed, above a valid `PICK:` line,
        still launches the stage session [5].
      [1]–[3] fail before 1.2, and [4] and [5] pass before and after. (Req:
      board-loop — A pass takes the first takeable card in the board's order,
      §*A picked card is claimed*, §*A card already applying*)
- [x] 1.2 In `bun/board-loop.ts`, rewrite `pickPrompt`: change nothing but the
      `Status` of the one card named in `PICK:`, set it to `applying` when it
      reads `proposed`, leave an `applying` card as it is, and fetch it again.
      Update the function's comment, which says it has nothing to write.
      Verify: 1.1 is green, the runner's three test files are green, and the
      file is under its cap in `bun/file-size.ts`.
- [x] 1.3 Search the four places `core/feature-workflow.md` names for the
      claim this replaces, "the card is the stage session's to move" and the
      pick session that writes nothing. Reconcile each live site, or name
      `board-loop`'s archived design as history. `README.md`'s *Consuming*
      line says the pick moves its card to `applying`. Verify: the grep in
      the pull request body.
- [x] 1.4 The pull request's *Check by hand* gives the user one live pass on a
      change at `proposed`. The card must read `applying` before the runner
      prints `carrying …` [6], and it reports whether the stage session
      met an existing local step branch. Verify: the pull request body holds
      it.

## 2. An answered question makes its change takeable again

- [x] 2.1 Measure, in a dedicated clone, whether a `claude -p` session under
      `--permission-mode auto --permission-prompts none` can call
      `notion-get-comments` on a card. This needs the user's terminal, so in
      an unattended run it goes to the card (unattended: card — hand the
      measurement on). If the call is refused, 2.5 passes `--allowedTools` for
      it, under both server names in design.md, to the pick session and to an
      answer step's stage session. Record the result and the Claude Code
      version in the pull request.
- [x] 2.2 Write the candidate tests in `bun/board-loop-takeable.test.ts`:
      - replace [9]: a tree whose only change has every group ticked starts
        the pick session [7];
      - a single-group ticked change queries `feat/<slug>-2` [8], and a
        three-group ticked change queries `feat/<slug>-4` [10]. A change with
        one box left is a normal step [12];
      - an open pull request [18] or a closed one [19] on
        `feat/<slug>-<N+1>` passes the candidate over, naming it. So does an
        open `after:` predecessor, which names the blocker [20]. A failing
        `gh` leaves no candidate [21].
      (Req: board-loop — A pass takes only a takeable change, §*Every group
      ticked*, §*No takeable change*)
- [x] 2.3 Write the answer-step tests in `bun/board-loop.test.ts` and
      `bun/board-loop-stage.test.ts`:
      - a pick that names a candidate gets a verdict run of
        `goal-check.ts apply <slug> 2` [9]. A goal check printing
        `tasks.md has no group 2` gives `open` [23];
      - with a takeable change and a candidate, each appears in its own list
        of the prompt only [11];
      - the answer launch form's first line names writing the answer as group
        N+1 [13]. Its second line is the unattended line, and its condition
        names `apply <slug> N+1` [14];
      - the pick prompt names `Assign`, the `harness-question` mark and
        resolved discussions [15]. It puts answered cards before `applying`,
        names `applied` [16], and moves an answered card from `applied` to
        `applying` [17];
      - re-fixture [19] [22]: its "not takeable" change must be neither
        takeable nor a candidate, for example blocked by `after:`.
      All fail before 2.4 except [22]. (Req: board-loop — A pass takes only a
      takeable change, §*An answer's step*; A pass takes the first takeable
      card in the board's order, §*An answered card goes first*, §*A
      candidate with no answer*)
- [x] 2.4 In `bun/board-loop.ts`, make `consider()` return an answer candidate
      for an all-ticked change, and make the pass idle only when both lists
      are empty. Add the second list and the order to `pickPrompt`. Accept a
      `PICK:` from either list, and launch a candidate with the answer form.
      Verify: 2.2 and 2.3 are green, `bun test` is green, and the file is under
      its cap.
- [x] 2.5 Where 2.1 found the call refused, pass the `--allowedTools` it names
      in `bun/board-loop-session.ts`, and assert the flag in
      `bun/board-loop-stage.test.ts`. Otherwise record that nothing was
      needed. Verify: the case, or the line in the pull request.
- [x] 2.6 In `core/feature-workflow.md`, add to the question bullet that an
      answer the loop carries counts as applied when its step's pull request
      opens, citing `task-board`. Add to *Unattended stages* that an answer
      step's first line names the answer it writes as group N+1. In
      `README.md`'s *Consuming* line, the pass lists the takeable changes and
      the answer candidates. Verify:
      `bun test` is green, and `grep -n board-loop README.md` reads that way.
- [x] 2.7 The pull request's *Check by hand* gives the user a live pass on a
      card with an answered question in `applied`. The pass must carry step
      N+1, the card must move to `applying`, and `Assign` must be cleared in
      the turn the pull request opens [24]. (Req: task-board — An answer the
      board loop carries is applied when its pull request opens) Verify: the
      pull request body holds it.
