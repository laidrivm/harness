# Tasks

## 1. The runner makes the card writes

- [ ] 1.1 Measure `bun/board-loop.ts` and `bun/notion-bot.ts` with
      `bun bun/file-size.ts`; if the calls of 1.4 and 1.5 would take
      `bun/board-loop.ts` past the cap, move `consider()` and `left()` into
      `bun/board-loop-steps.ts` first, in their own commit, with their
      callers and tests switched (design, *File placement*). Verify with
      `bun test bun/board-loop*.test.ts` and the size check
- [ ] 1.2 Extend `bun/notion-bot.fixture.ts`'s stand-in API to answer a
      page's `Status` and `Assign`, record `PATCH /v1/pages/<id>` and
      `POST /v1/pages` bodies, and fail a named call on request; export
      `carded()` from `bun/notion-bot.ts`. Verify with
      `bun test bun/notion-bot*.test.ts`
- [ ] 1.3 Write failing cases in a new `bun/notion-card.test.ts`, then
      `bun/notion-card.ts` until they pass, importing the `CARD:` reader and
      `unassign()` that `draft-until-answered` adds to `bun/notion-bot.ts`
      rather than writing them again (design, *`Assign` loses the user when
      the pass reads the answer*), with cases only for what this change adds
      to them; `idea()` reads one `IDEA:` line, its
      title and its body to `PR-TITLE:` or the end, and refuses two lines,
      one after `PR-TITLE:`, an empty title, or a `QUESTION:` line beside
      it; `claim()` writes `applying` only from `proposed`, or `applied` for
      an answer candidate, after `carded()` accepts the card; `file()` creates the `idea` card in the
      carried card's data source. Each returns the line the runner prints
      and never throws. Cite the ADDED requirement's scenarios. Record the
      red run before the code
- [ ] 1.4 Wire the claim into `pass()`: with the integration, after a valid
      `PICK:` and before the stage session, print `claim()`'s line; the pick
      prompt, with `self` set, asks for the `CARD:` line and no write, and
      without it keeps today's sentence. Cases in `bun/board-loop.test.ts`
      for both prompts and in `bun/board-loop-question.test.ts` for the
      claim against the stand-in (scenarios *A claim from the runner*, *A
      card line that names no card of the pick*, *No integration*). Verify
      with those files
- [ ] 1.5 Before starting, confirm `answer-match` and `draft-until-answered`
      are on the default branch
      (design, *`Assign` loses the user when the pass reads the answer*), and
      re-copy this change's two deltas over its versions. Then, with the
      integration, have `pass()` print `unassign()`'s line right after the
      claim of 1.4, on the same card and before the stage session starts.
      Cases in `bun/board-loop-question.test.ts` against the stand-in: the
      user leaves `Assign` before the stage session's stub runs, anyone else
      stays, nothing is written when the user is not on it or the `CARD:`
      line was refused, and a pass that then ends `open`, `waiting` or with a
      refused push writes no `Assign` again (scenarios *The pass reads the
      answer*, *The pass ends before its pull request*). With the
      integration, drop the `Assign` clear from `answer-match`'s answer
      variant of `prompt()`; without it, keep it (design, item 12), with a
      case for each prompt in `bun/board-loop-question.test.ts`. Verify with
      that file
- [ ] 1.6 File the `idea` card: with the integration, the stage prompt's
      answer variant (`prompt()`, `instead`) asks for the `IDEA:` line after
      `BLOCKED —` instead of a card and an `Assign` write, and `pass()`
      calls `file()` after a clean session whose message names one. Cases for the prompt and the pass (scenarios *An answer
      that asks for a change of its own*, *A malformed idea line*). Verify
      with `bun test bun/board-loop*.test.ts bun/notion-card.test.ts`
- [ ] 1.7 Reconcile the restating sites and read each back: the answer
      variant and the runner's fourth line in `core/feature-workflow.md`,
      the board loop's paragraph in `README.md`, and the cases that quote
      them. Verify with the tests that read `core/feature-workflow.md` and
      `README.md`, and `bun test bun/board-loop*.test.ts`

## 2. The sessions write nothing

- [ ] 2.1 Write a failing case in `bun/board-loop-question.test.ts` that,
      with the integration, both sessions' stub logs name every entry of
      `notion-card.ts`'s withheld list under `--disallowedTools`, the
      comment tool among them, and no read tool (`notion-fetch`,
      `notion-get-comments`, `notion-search`, `notion-query-data-sources`);
      then replace the single entry at `bun/board-loop.ts:224` with the list.
      The list's comment names its known limit (design, *Every Notion write
      tool is withheld, by name*). Verify with that file
- [ ] 2.2 Say in `README.md`'s board-loop paragraph and in
      `core/feature-workflow.md` that, with the integration, the sessions
      keep the Notion read tools alone and the runner makes every card
      write; read both passages back. Verify with the tests that read them

## 3. The probe

- [ ] 3.1 **User act.** On a machine where the hosted Notion connector is
      signed in, run once: `claude -p` asked to list its Notion tools, with
      no call made, under the flags 2.1 builds; record on the card that only
      read tools are listed, and the Claude Code version. A write tool the
      list missed goes into the list in a pull request of this step, with
      its case in `bun/board-loop-question.test.ts`
