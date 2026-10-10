# board-state-per-project — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md` — TDD for edge cases). The bracketed
numbers are that run's idea numbers, and all 24 are placed below.

The open questions in proposal.md are taken at their stated defaults:
`harness:check` does not require the key, the hook lives in the policy-gate
change, reconciliation runs at the board read only, and pointers in an old
format are listed rather than rewritten. A different answer from the user
changes 1.3, 1.5 and 2.1 before group 1 is applied.

There are two groups. Group 1 is one harness pull request on
`feat/board-state-per-project-1`. Group 2 is one change in each consumer,
carried by the pull request that bumps its pin past group 1.

## 1. The key, the command and the prose

- [ ] 1.1 Write the command tests in a new `bun/board-state-cli.test.ts`. Each
      case runs `bun/board-state.ts` as a process against a fabricated
      repository holding a `package.json`, with an environment built from
      what the case needs and started in a directory with no `.env`. Every
      case below fails before 1.3.
      - The key is absent: the run exits non-zero naming `harness.board` and
        the file [1], and stdout is empty [2]. `null` fails the same way [3].
      - `""` [4], whitespace only [5], a number, an array and an object [19]
        each fail naming the key.
      - `"Harness"` with one complete change prints `Harness` beside that
        change's `proposed` [6].
      - The output names its own board exactly once and neither of the other
        two names [8].
      - Stdout parses as JSON whose keys are exactly `board`, `status` and
        `edges` [14].
      - `https://x`, `collection://x` and `view://x` are refused [9]. So are
        an upper-case hyphenated UUID [10], a 32-hex UUID without hyphens
        [11], and a UUID inside a longer name [12]. `D2ASS` is accepted [13].
      - A refused value appears in neither stream [18].
      - A malformed `package.json` fails naming the file, with stdout
        empty [20].
      - An `after:` typo in the tree still fails with today's message and no
        board on stdout [21].

      (Req: task-board — A repository names the board its tree decides,
      §*The key is absent*, §*The key holds an identifier rather than a
      name*, §*The key holds no name at all*)
- [ ] 1.2 Update `bun/board-state-hygiene.test.ts`. Keep *the output names no
      board* for `boardState(tree)`, and add a case that the command, given
      `"board": "Harness"`, names that board and no other [15]. Widen the
      import allow-list to `./config.ts`, and have the module walk assert
      that `config.ts` imports only `node:fs` and `node:path` [16]. Leave the
      socket case's tokens as they are; it must keep passing over the new
      source [17]. Add a case that the command run in this repository prints
      `Harness` [7]. (Req: task-board — Three statuses are derived and six
      are moved by hand, §*A card on a board whose tree is elsewhere*,
      §*The derivation reaches no network*; A repository names the board its
      tree decides, §*The harness reads its own board*)
- [ ] 1.3 Implement. Add `board: string` to `Config` in `bun/config.ts` with
      its one-line comment. In `bun/board-state.ts`'s `import.meta.main`,
      read the key through `read`, refuse a non-string, a blank string, a
      value carrying `://`, or a UUID with or without hyphens in either case,
      naming the key without the value, then print `{ board, status, edges }`
      and leave `boardState` untouched. Update the module header, which says
      the script answers for "this repository" alone. Add `"board":
      "Harness"` to this repository's `package.json` `harness` object. The
      new source may not name the service the socket case forbids. `bun
      test` green, and both files under the cap that `bun/file-size.ts`
      applies.
- [ ] 1.4 Run `bun bun/board-state.ts` here and record in this task's commit
      message that it prints `Harness` and the statuses design.md measured,
      plus this change's own slug.
- [ ] 1.5 Rewrite the two passages in `core/feature-workflow.md` that tie
      derivation to `D2ASS`: "and only on `D2ASS`. The other six, and every
      card on `Harness` or `mellon`, are honoured", and the closing sentence
      of the board list. Say instead that each repository's
      `harness.board` names its board, and that the session reconciles at
      the `Board view` read it makes to choose work: it runs
      `bun/board-state.ts`, corrects each card behind its floor whose
      `Pointer` is wholly a directory of this tree, and lists the cards whose
      pointer is empty, decorated, foreign, or names a slug the tree lacks.
      Cite `task-board` for the statuses rather than restating them. Then
      grep `core/`, `README.md` and `openspec/specs/` for `only on`,
      `D2ASS alone` and `honoured rather than mechanised`, and fix each site
      or name the change that will. (Req: task-board — A repository names
      the board its tree decides, §*A card behind its floor at the board
      read*, §*A card whose pointer names no directory of this tree*)
- [ ] 1.6 After group 1 merges, in the first session that reads `Board view`
      on `Harness`: run the reconciliation, and report what it corrected and
      what it listed [22] [24]. Expected to correct nothing, since every card
      was moved by hand that turn. A correction it does make is reported, not
      hidden.

## 2. Each consumer

- [ ] 2.1 dota2, on a branch of its own checkout and never in a worktree, in
      the pull request that bumps its pin past group 1: add `"board":
      "D2ASS"` to the `harness` object, run `bun
      node_modules/harness/bun/board-state.ts`, and confirm it prints `D2ASS`
      beside the 47 slugs design.md measured, or the count its tree then
      holds. Reconcile `D2ASS` once and report the listed cards, the
      `harness: openspec/…` pointers among them, without rewriting them
      [23].
- [ ] 2.2 mellon, the same on its `main` with `"board": "mellon"`. Confirm it
      prints `mellon` and an empty `status`.
