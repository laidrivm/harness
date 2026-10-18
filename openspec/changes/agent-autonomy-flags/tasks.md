# agent-autonomy-flags — tasks

The tests come from the proposal-stage `/zombies` run, and each one is written
before the code it covers (`core/testing.md`). The numbers in brackets are
that run's idea numbers, and 1.2 places all eight.

This is one group and one harness pull request, on `feat/agent-autonomy-flags`.
The five deleted skills are 462 of the roughly 600 lines this step changes.
`bun bun/pre-pr.ts` is expected to warn but stay under its failing threshold.
If it fails instead, split the step at 1.1: the removals become group 1, and
1.2 to 1.8 become group 2.

## 1. Removals, flags, guard and prose

- [ ] 1.1 Remove the five skills (design.md D1 and D6):
      - delete `core/skills/{checklist,code-review,first-five,pr-brief,review-order}/`
        and the links `.claude/skills/{checklist,first-five,review-order}`;
      - drop their five rows from the README's skill table, and drop the
        table's sentence on `code-review`'s old severity levels;
      - in `session-wrapup`'s example, drop the `first-five` line and the
        `review-order` and `code-review` names from `Not run:`;
      - make `triage`'s gate-line text stop naming `pr-brief`;
      - rewrite `ship` step 1's gate rule, and step 3's title and body, as
        D6 sets out.
      Leave `bun/check.test.ts`, whose `review-order` is a fabricated
      consumer's.
      Verify: `git grep -n "first-five\|review-order\|pr-brief\|code-review\|skills/checklist" -- ':!docs/context' ':!openspec/changes'`
      names only the `bun/check.test.ts` fixture. `bun test` passes.
- [ ] 1.2 Add a `describe` block on flagged skills to `bun/autonomy.test.ts`.
      Each case builds its tree with the existing `tree()` helper:
      - a `skills/x/SKILL.md` with no frontmatter reports nothing [1];
      - a flagged skill holding `(unattended: user — x)` reports nothing [2];
      - a flagged skill whose only markers are `card` is reported [3] —
        `// spec: agent-permissions/a-flag-with-no-step-that-stays-with-the-user`;
      - `disable-model-invocation: false` with no marker reports nothing [4];
      - the flag written as the string `"true"` is reported [5];
      - a `user` marker wrapped after the colon counts [6];
      - a `user` marker found only in `skills/x/references/a.md` does not
        count, and the flagged `SKILL.md` is reported [7];
      - frontmatter that is not YAML is reported, naming the file [8].
      Verify: `bun test bun/autonomy.test.ts` fails on cases 3, 5, 7 and 8,
      and passes the rest.
- [ ] 1.3 Extend `check()` in `bun/autonomy.ts` as design.md D5 sets out.
      Keep its "nothing is exempt" walk, and update its header comment.
      Verify: the cases from 1.2 pass. The repository case fails until 1.4,
      naming `coderabbit`, `session-wrapup` and `ship`.
- [ ] 1.4 Remove the flag from `coderabbit` and `session-wrapup`. Mark
      `ship`'s merge step `(unattended: user — leave the merge to the user and
      report BLOCKED naming the pull request)`.
      Verify: `bun test bun/autonomy.test.ts` passes. Then put the flag back
      in `coderabbit`, watch the repository case fail naming it, and remove
      it again.
- [ ] 1.5 Implement design.md D2 in `core/skills/coderabbit/SKILL.md`:
      - step 1 reads the head commit with `gh pr view --json headRefOid`,
        then runs the existing reviews call. With no `coderabbitai` review
        of the head commit, it ends on
        `CODERABBIT gate: OPEN — no CodeRabbit review of <short sha> yet.`;
      - step 6 lists that gate line;
      - one rule covers both runs. A run that finds no review of the head
        commit reads once. A run that finds one keeps its single re-fetch
        before the gate line. Neither sleeps, polls or loops;
      - a `card` marker goes on step 5's "Wait for approval" and on the
        project override's dismissal sentence.
      Add no new `gh` command form, and leave the `gh api graphql` line as it
      is.
      Verify: `bun test bun/autonomy.test.ts bun/command-guard-gh-api.test.ts`
      passes. Reading the skill through meets *The head commit has no review
      yet*, *A review lands while the run disposes of the first* and *A
      landed review with a dismissal*.
- [ ] 1.6 Mark `session-wrapup` step 2 as design.md D3 sets out, and drop
      `Write` from its `allowed-tools` (D7).
      Verify: the marker check passes, step 2 holds the skill's only marker,
      and `allowed-tools` no longer names `Write`.
- [ ] 1.7 Write `core/autonomy.md`'s paragraph under `user` (D4). In
      `core/review-toolkit.md`'s `/coderabbit` bullet:
      - replace the flag's reason with "run it once the bot has reviewed the
        head commit, never to wait for that";
      - replace "Invoking it is the approval … present by definition" with
        the review policy's reason;
      - mark the dismissal `card`;
      - make the closing "whenever the user chooses to run it" agree.
      Verify: `grep -rn "present by definition\|reserves it for the user\|whenever the user chooses" core/`
      prints nothing.
- [ ] 1.8 Grep `disable-model-invocation`, `user-only` and `runs only when the
      user` across `core/`, `README.md`, `openspec/specs/` and the active
      changes, and correct every site this step makes false. Name in the pull
      request body the `capture-as-mechanism` proposal's claim that
      `session-wrapup` runs only when the user invokes it, for that change to
      reconcile.
      Verify: every remaining hit describes `ship`, or the flag in general.
- [ ] 1.9 `bun bun/pre-pr.ts` reports the step's diff under the failing
      threshold. The pull request body names the requirements this change
      adds or modifies as the ones it closes.
