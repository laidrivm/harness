# session-wrapup-on-done — tasks

One group, one pull request on `feat/session-wrapup-on-done`: the line must
not reach the VPS before the wrap-up it starts keeps the clone's tree clean.
Each failing case first, its failure seen, cited as `// spec:
work-status/<slug>` or `// spec: agent-rulebook/<slug>`. The ledger's place
is the user's answer to question 2 on the card (03.11, «а», widened to the
whole harness; `design.md`, decisions 3–4).

## 1. A written done names the wrap-up, and the wrap-up leaves the tree alone

- [x] 1.1 Failing cases in `bun/work-status.test.ts`, a new describe "the
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
- [x] 1.2 Then `bun/work-status.ts`: append the `next:` line, exported as a
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
- [x] 1.3 Failing cases in `bun/session-wrapup-yield.test.ts`, over step 5's
      flattened text as the file reads it: step 5 appends to
      `~/.local/state/harness/pipeline-yield/<repo>/<yyyy-mm>.md`, names
      `git remote get-url origin`'s `<owner>/<name>` as `<repo>` and
      `local/<basename>` of `<top>` without an `origin`, and the whole
      skill names no `pipeline-yield` path under `docs/context/`
      (`a-wrap-up-on-main`, `a-wrap-up-on-a-feature-branch`);
      `<gates-since>`, `<since>` and the measured `first review` lines are
      read from `<repo>`'s files alone (`two-repositories-on-one-machine`),
      and its first entry takes the first-entry-ever rules with the gates
      query's project filter unchanged (`the-first-entry-on-a-machine`); the
      heading names the detached commit as `git status` prints it when there
      is no branch (`a-wrap-up-on-a-detached-head`); the frontmatter's
      `allowed-tools` holds `Edit(~/.local/state/harness/pipeline-yield/**)`
      and `Bash(git remote get-url origin)`. And one case
      over the repository: `git ls-files` for
      `:(top)docs/context/pipeline-yield-*.md` exits 0 and lists nothing
      (`no-ledger-in-the-harness-tree`). Each fails today
- [x] 1.4 Then `core/skills/session-wrapup/SKILL.md`: step 5's append
      paragraph targets `<repo>`'s file as `design.md` decisions 3–4 set out;
      the three reads of the previous entry name that file's ledger alone; the
      heading's detached form; the two `allowed-tools` entries; the Rules section's
      list of the files the skill may touch names the state ledger and drops
      the tree's. Confirm against Claude Code's permission docs that an
      `Edit` rule covers the Write that creates a new month's file, and record
      the answer in `design.md` decision 4. In `core/git-and-prs.md`, the rule
      on committing wrap-up artefacts names the save point alone, says the
      pipeline-yield ledger never enters git (`session-wrapup` step 5), and
      that a save point on a branch the guard refuses a commit on stays
      uncommitted and is named in the report. In `core/review-toolkit.md`,
      the sentence pointing at `docs/context/pipeline-yield-*.md` names the
      ledger step 5 keeps. Verify with `bun test
      bun/session-wrapup-yield.test.ts bun/review-docs.test.ts`
- [x] 1.5 Delete `docs/context/pipeline-yield-2026-10.md` with `git rm`, and
      grep the tree — `bun/`, `core/`, `openspec/specs/`, `.claude/`,
      `README.md`, `CLAUDE.md`, configs — for `pipeline-yield` and
      `docs/context`, leaving only the save point's mentions and archived
      changes; the 1.3 tree case passes. In `README.md`, the `session-wrapup`
      row of *Skills* says where the ledger lives, and *Consuming* gains the
      one-time step of `design.md` decision 4: after the bump that carries
      this change, delete the tracked `docs/context/pipeline-yield-*.md` in a
      pull request of the consumer's own (`dota2` and `mellon` hold them).
      Verify with `bun test bun/session-wrapup-yield.test.ts` and by reading
      the README passages back
- [x] 1.6 Rule 4 of the VPS rules (card 40c39875c31b81f0b1d1cbea945696bc;
      merged in #412 as `orchestrator/runner/session-rules.md`, copied to
      `/etc/claude-code/CLAUDE.md`, and shrunk there, its eleven rules kept):
      if `orchestrator/runner/CLAUDE.md` is on `origin/main` (`git ls-tree
      --full-tree origin/main orchestrator/runner/CLAUDE.md`), shrink its
      rule 4 — "When a card reaches done, run `/session-wrapup`, then write
      «можно /clear»…" — to one line telling the session to act on the
      `next:` line `bun bun/work.ts status` prints, renumbering nothing a
      test or another rule cites by number; if it is not on `main` yet,
      leave a comment on that card saying rule 4 shrinks to that pointer
      once this change merges. Verify by reading the file back, or the
      card's comments
- [ ] 1.7 Run the whole `bun test` and `bun bun/pre-pr.ts`, and confirm
      `openspec validate session-wrapup-on-done --strict` passes
