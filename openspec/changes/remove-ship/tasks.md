# remove-ship — tasks

There is one group, so the change ships whole on `feat/remove-ship`. Check that
name against the closed pull requests before branching.

The tests come from the proposal-stage `/zombies` run. Each is written before
the edit it guards (`core/testing.md`), and the numbers in brackets are that
run's idea numbers.

## 1. Remove the skill and the prose that names it

- [x] 1.1 Write `bun/skills-table.test.ts` over the real tree. It reads the
      backticked first cell of each row in the README's `## Skills` table,
      and the skills from `git ls-files` of `core/skills/*/SKILL.md`, since
      only tracked files count. It checks two things:
      - every row names a tracked skill, and a failure names the row [1];
      - every tracked skill has a row, and a failure names the skill [2].
      Verify: it passes on the tree as it stands, with `ship` in both lists.
      Then remove only the `ship` row: the test fails naming `ship`. Restore
      the row from a copy taken first.
- [x] 1.2 Delete `core/skills/ship/` and its row in the README's skill table,
      in one commit (design.md D1).
      Verify: `bun test bun/skills-table.test.ts bun/autonomy.test.ts`
      passes. The autonomy test's repository case now runs on a tree where
      no skill carries the flag.
- [x] 1.3 Drop the clause "— the prefix is what `ship` files it under" from
      `core/skills/triage/SKILL.md`, leaving the rest of the sentence intact
      (design.md D3). Read the paragraph back afterwards.
- [ ] 1.4 Check that no site outside the records still names the skill. The
      live specs change at archive (design.md D4).
      Verify: ``git grep -n -E '`ship`|/ship\b|skills/ship' -- ':!openspec' ':!docs/context'``
      prints nothing, since the step leaves no other site. Then `bun test`
      passes.
