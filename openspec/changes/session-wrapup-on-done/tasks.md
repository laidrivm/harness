# session-wrapup-on-done — tasks

One group, one pull request on `feat/session-wrapup-on-done`: the line must
not reach the VPS before the wrap-up it starts keeps the clone's `main` clean.
Each failing case first, its failure seen, cited as `// spec:
work-status/<slug>` or `// spec: agent-rulebook/<slug>`.

## 1. A written done names the wrap-up, and the wrap-up leaves main clean

- [ ] 1.1 Failing cases in `bun/work-status.test.ts`, a new describe "the
      next step", over `work-status.fixture.ts`. A move to `done` over a clone
      whose `origin/main` archives the change, as the `done` cases of
      `work-status-tree.test.ts` build it, with `assign: [USER]`: the output's
      lines are the move, `assign: removed the user from <card>`, then the
      `next:` line, exit 0 (`a-card-moved-to-done`); the same move with the
      restore failing, as `work-release.test.ts`'s [38] stubs it: the `next:`
      line is still last, exit 1 (`a-failed-restore-after-done`); `--to
      applied` written: no line opens `next:` (`a-move-to-another-status`);
      `--to done` refused under `no-evidence`: no `next:` line
      (`a-refused-done`); `--to done` with the write answered `archiving`
      (`page: { answer }`): no `next:` line, exit 1
      (`notion-answers-another-status`); the skill the printed line names —
      read from the line, never retyped — has a `core/skills/<name>/SKILL.md`
      whose `name:` matches, and the harness's `.claude/settings.json` allows
      `Skill(<name>)` (`the-skill-the-line-names`). The first, second and last
      fail on today's code
- [ ] 1.2 Then `bun/work-status.ts`: append the `next:` line, exported as a
      constant the cases read, when the read-back `now` is `done`, after the
      release's line and independent of the exit code; extend the header
      comment by one sentence on it. Add `Skill(session-wrapup)` to the allow
      list of `.claude/settings.json`, between `Skill(playwright-cli)` and
      `Skill(triage)`. The `done` cases that pin `run.last` to the move —
      `wrote()` in `bun/work-status-tree.test.ts` and the pr:350 case in
      `bun/work-status-pr.test.ts` — read the move's line from the output's
      lines instead. Verify with `bun test bun/work-status* bun/work-release.test.ts`
- [ ] 1.3 Failing cases in `bun/session-wrapup-yield.test.ts`, over step 5's
      flattened text as the file reads it: step 5 names `git branch
      --show-current`, `main` and a detached `HEAD` as the checkouts whose
      entry goes to `<state>/harness/pipeline-yield-<yyyy-mm>.md`, and
      `docs/context/pipeline-yield-<yyyy-mm>.md` for any other branch
      (`a-wrap-up-on-main`, `a-wrap-up-on-a-detached-head`,
      `a-wrap-up-on-a-feature-branch`); step 5 reads the previous entry, for
      `<gates-since>`, `<since>` and the measured `first review` lines, from
      the ledger it appends to (`the-previous-entry-on-a-host`); the
      frontmatter's `allowed-tools` holds `Bash(git branch --show-current)`
      and `Edit(~/.local/state/harness/pipeline-yield-*.md)`. Each fails on
      today's skill
- [ ] 1.4 Then `core/skills/session-wrapup/SKILL.md`: step 5's append
      paragraph chooses the ledger by the branch as `design.md` decision 3–4
      set out, and says that with `$XDG_STATE_HOME` set elsewhere the write
      asks; the three places that read "the previous entry" or
      `docs/context/pipeline-yield-*.md` read the ledger in use; the
      `allowed-tools` gain the two entries; the Rules section's list of the
      files the skill may touch names the state-directory ledger. Confirm
      against Claude Code's permission docs that an `Edit` rule covers the
      Write that creates a new month's file, and record the answer in
      `design.md` decision 4. In `core/git-and-prs.md`, the rule on committing
      wrap-up artefacts gains its exception: on `main` the ledger goes outside
      the tree (`session-wrapup` step 5). Verify with `bun test
      bun/session-wrapup-yield.test.ts` and `bun test bun/review-docs*`
- [ ] 1.5 Rule 4 of the VPS rules (card 40c39875c31b81f0b1d1cbea945696bc):
      if `orchestrator/runner/CLAUDE.md` is on `origin/main` (`git ls-tree
      --full-tree origin/main orchestrator/runner/CLAUDE.md`), delete its
      rule 4 — "When a card reaches done, run `/session-wrapup`, then write
      «можно /clear»…" — or shrink it to one line saying `bun bun/work.ts
      status` prints that step after a written `done`, renumbering nothing
      that a test or another rule cites by number; if it is not on `main`
      yet, leave a comment on that card saying rule 4 is mechanised by this
      change and leaves its draft. Verify by reading the file back, or the
      card's comments
- [ ] 1.6 Run the whole `bun test` and `bun bun/pre-pr.ts`, and confirm
      `openspec validate session-wrapup-on-done --strict` passes
