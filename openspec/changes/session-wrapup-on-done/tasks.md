# session-wrapup-on-done — tasks

One group, one pull request on `feat/session-wrapup-on-done`: the line must
not reach the VPS before the wrap-up it starts keeps the clone's tree clean.
Each failing case first, its failure seen, cited as `// spec:
work-status/<slug>` or `// spec: agent-rulebook/<slug>`. Written at the
recommended answer to question 2 on the card (`design.md`, decision 3); the
other answer rewrites 1.3–1.4.

## 1. A written done names the wrap-up, and the wrap-up leaves the tree alone

- [ ] 1.1 Failing cases in `bun/work-status.test.ts`, a new describe "the
      next step", over `work-status.fixture.ts`. A card at `archiving` moved
      to `done` over a clone whose `origin/main` archives the change, as the
      `done` cases of `work-status-tree.test.ts` build it, with `assign:
      [USER]`: the output's lines are the move, `assign: removed the user from
      <card>`, then the `next:` line, exit 0 (`a-card-moved-to-done`); the same
      move with the restore failing, as `work-release.test.ts`'s [38] stubs
      it: the `next:` line is still last, exit 1
      (`a-failed-restore-after-done`); `--to applied` written: no line opens
      `next:` (`a-move-to-another-status`); `--to done` refused under
      `no-evidence`: no `next:` line (`a-refused-done`); `--to done` with the
      write answered `archiving` (`page: { answer }`): no `next:` line, exit 1
      (`notion-answers-another-status`); a card reading `done` written to
      `done` again: no `next:` line (`a-card-already-done`); the skill the
      printed line names — read from the line, never retyped — has a
      `.claude/skills/<name>/SKILL.md` whose `name:` matches, and the
      harness's `.claude/settings.json` allows `Skill(<name>)`
      (`the-skill-the-line-names`). The first, second and last fail on today's
      code
- [ ] 1.2 Then `bun/work-status.ts`: append the `next:` line, exported as a
      constant the cases read, when the read-back `now` is `done` and `from`
      is not, after the release's line and independent of the exit code; a
      comment on the constant says its quoted Russian phrase is the user's own
      (`design.md`, decision 1), and the header comment gains one sentence on
      the line. Add `Skill(session-wrapup)` to the allow list of
      `.claude/settings.json`, between `Skill(playwright-cli)` and
      `Skill(triage)`. The `done` cases that pin `run.last` to the move read
      the move's line from the output's lines instead: `wrote()` in
      `bun/work-status-tree.test.ts`, the pr:350 case in
      `bun/work-status-pr.test.ts`, and the `done` row of "from approved to a
      %s origin/main proves, five cards make no count" in
      `bun/work-status.test.ts`. Verify with `bun test bun/work-status*
      bun/work-release.test.ts`
- [ ] 1.3 Failing cases in `bun/session-wrapup-yield.test.ts`, over step 5's
      flattened text as the file reads it: step 5 appends to
      `<state>/harness/pipeline-yield-<yyyy-mm>.md` and names no
      `docs/context/` file as its target (`a-wrap-up-on-main`,
      `a-wrap-up-on-a-feature-branch`); `<gates-since>`, `<since>` and the
      measured `first review` lines are read from that ledger, or from
      `docs/context/pipeline-yield-*.md` while it holds no entry
      (`the-first-entry-on-a-machine`); the heading names the detached commit
      as `git status` prints it when there is no branch
      (`a-wrap-up-on-a-detached-head`); the frontmatter's `allowed-tools`
      holds `Edit(~/.local/state/harness/pipeline-yield-*.md)`. Each fails on
      today's skill
- [ ] 1.4 Then `core/skills/session-wrapup/SKILL.md`: step 5's append
      paragraph targets the state ledger as `design.md` decisions 3–4 set
      out, and says that with `$XDG_STATE_HOME` set elsewhere the write asks;
      the three reads of the previous entry name the state ledger and the
      seed; the heading's detached form; the `allowed-tools` entry; the Rules
      section's list of the files the skill may touch names the state ledger
      and drops the tree's. Confirm against Claude Code's permission docs that
      an `Edit` rule covers the Write that creates a new month's file, and
      record the answer in `design.md` decision 4. In `core/git-and-prs.md`,
      the rule on committing wrap-up artefacts names the save point alone,
      says the ledger is kept outside the tree (`session-wrapup` step 5), and
      that a save point on a branch the guard refuses a commit on stays
      uncommitted and is named in the report. In `core/review-toolkit.md`,
      the sentence pointing at `docs/context/pipeline-yield-*.md` names the
      ledger step 5 keeps. Verify with `bun test
      bun/session-wrapup-yield.test.ts bun/review-docs.test.ts`
- [ ] 1.5 Rule 4 of the VPS rules (card 40c39875c31b81f0b1d1cbea945696bc):
      if `orchestrator/runner/CLAUDE.md` is on `origin/main` (`git ls-tree
      --full-tree origin/main orchestrator/runner/CLAUDE.md`), shrink its
      rule 4 — "When a card reaches done, run `/session-wrapup`, then write
      «можно /clear»…" — to one line telling the session to act on the
      `next:` line `bun bun/work.ts status` prints, renumbering nothing a
      test or another rule cites by number; if it is not on `main` yet,
      leave a comment on that card saying rule 4 shrinks to that pointer
      once this change merges. Verify by reading the file back, or the
      card's comments
- [ ] 1.6 Run the whole `bun test` and `bun bun/pre-pr.ts`, and confirm
      `openspec validate session-wrapup-on-done --strict` passes
