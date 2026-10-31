# notion-ask-sets-assign — tasks

Two groups, one pull request each, on `feat/notion-ask-sets-assign`. Each
failing case is written first, its failure recorded, and cited as
`// spec: <capability>/<slug>`. The bracketed numbers are the proposal-stage
`/zombies` ideas. Group 2 follows card item 4 a (design, *Clearing `Assign`
on a move*); another answer changes it before it is applied.

## 1. The ask command sets `Assign` and posts while a question waits

- [ ] 1.1 Failing cases in `bun/notion-ask.test.ts`, its stub given a PATCH
      answer (status and body) of the case's own. On a card with no
      comments the calls are exactly `POST /v1/comments` then
      `PATCH /v1/pages/<card>`, with no comments read [1]. The PATCH carries
      the version, the bearer and the body
      `{ properties: { Assign: { people: [{ id: USER }] } } }`, and the line
      is `question: posted on <card>, Assign set`, exit 0 [2]; this replaces
      the case "no page read and no PATCH". The two cases under
      `a-question-already-waits` [45] [46] flip to a post and a PATCH, exit
      0 [3]. These
      print `question: posted on <card>, Assign not set — <why>` and exit 1,
      with exactly one POST: a PATCH answer whose `Assign` holds another
      person alone [4], whose `people` is empty [6], or `{}` [7], each with
      the reason `the Assign write did not hold the user`; and a PATCH
      answered 500 [8] or 403 [9], with `the Assign write answered <status>`.
      A user id written as 32 hex digits in the settings matches the UUID
      form of the answer [5]. A failed POST makes no PATCH [10]. Verify:
      each new case fails against today's command, and `bun test
      bun/notion-ask.test.ts` fails only on them
- [ ] 1.2 In `bun/notion-ask.ts`, drop the `waiting()` read and its refusal.
      After `comment()`, call `assign()` and check the answer's
      `properties.Assign.people` for the user's id, compared as `hex()`
      compares ids. Print the three lines the spec names, exit 0 only on
      `Assign set`. Rewrite the header to say what the command reads and
      writes now (design, decision 3). Verify: `bun test
      bun/notion-ask.test.ts` passes
- [ ] 1.3 Change the ask line in `bun/board-loop-prompt.ts` and the doc's ask
      launch form in `core/feature-workflow.md` alike: "and once it prints
      `question: posted`, unless that line ends `Assign set`, set the `Assign`
      of the card to the user and read the card back to confirm it holds the
      user; never run the command again for a question it printed as
      posted" (design, decision 6). Extend the [62] case in
      `bun/board-loop-question.test.ts` to assert both new parts [11].
      Change the question gate's `ask` message in `bun/question-gate.ts` to
      the same conditional, and assert it in `bun/question-gate-ask.test.ts`
      [12]. Verify: `bun test bun/board-loop-question.test.ts
      bun/question-gate-ask.test.ts` passes, the doc and the prompt still
      equal
- [ ] 1.4 In `core/feature-workflow.md`'s *Ask the user* bullet, replace "a
      card holds one open question at a time: a second waits in your report
      until the first is answered" with the grouping and numbering rule
      (questions known together in one comment, a later one in its own
      comment numbered on from the card's highest number), and "sets `Assign`
      itself" with the conditional of 1.3. In `README.md`'s row for the
      command, say the integration also sets `Assign`. Verify: `git grep -n
      "one open question at a time\|sets \`Assign\` itself"` prints nothing,
      and `bun bun/check.ts` passes

## 2. `status` clears `Assign` when no question waits

- [ ] 2.1 Let `bun/notion-bot.fixture.ts`'s stand-in apply a PATCH's
      `Assign` to `state.assign`, unless a case's own option keeps it, and
      let `bun/work-status.fixture.ts`'s `Run` pass `assign`, `pending` and
      that option through. Verify: `bun test bun/work-status bun/work-take
      bun/notion-bot` passes unchanged
- [ ] 2.2 Failing cases in `bun/work-status.test.ts`, cited
      `// spec: work-status/<slug>`. With `Assign` on the user and no
      question pending, `--to exploring` sends `Status` and
      `Assign: { people: [] }` in one PATCH, prints `status: <card>
      approved → exploring, Assign cleared`, exit 0 [13]. A card with no
      question at all clears it the same way [14]. A pending question sends
      `Status` alone and prints the move alone [15], as does a card whose
      only comment after the question is a `harness-answer` [16], `--to
      applying` with no question pending [17], and an empty `Assign` [18]. A
      PATCH answer still holding the user prints `Assign not cleared`,
      exit 1 [19]. A comments read answered 500 refuses under `unread` with
      no PATCH [20]. A refusal under `user-only` or `wip-full` makes no
      comments read [21]. Verify: each new case fails against today's
      command, and the existing cases pass
- [ ] 2.3 In `bun/work-status.ts`, after the checks, read `waiting(found.call,
      card, found.settings.user)` inside the same `try` as the page read, and
      add `Assign: { people: [] }` to the PATCH when none waits, `Assign`
      holds anyone and `to` is not `applying`; read both properties back
      from the answer. Update the module's header. Verify: `bun test
      bun/work-status` passes
- [ ] 2.4 In `core/feature-workflow.md`'s *Ask the user* bullet, after "clear
      `Assign` once it is applied", say that in the harness `bun bun/work.ts
      status` clears it with the card's next move when no question waits,
      except a move into `applying`; in `README.md`'s row for `status`, name
      the clear. Verify: `bun bun/check.ts` passes
