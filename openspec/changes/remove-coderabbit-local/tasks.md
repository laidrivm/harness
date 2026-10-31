# Tasks

The consumer cards (design.md, *Consumers*) are on the mellon and D2ASS
boards, not here: the goal check reads only this tree.

## 1. The skill and its permissions go

- [ ] 1.1 In `bun/review-docs.test.ts`, delete the `CLI` constant and the
      case *the /coderabbit-local bullet is in no sequence and no gate*; add
      `// spec: local-review-loop/the-session-writes-the-gate-line` above the
      case *has the session write the `CODE-REVIEW gate:` line*; and to the
      case citing `local-review-loop/the-review-does-not-return` add that the
      bullet says the session writes no `CODE-REVIEW gate:` line only when
      no pass returned a review, that a pass failing after one that returned
      ends the loop on the line the earlier passes left, and that `BLOCKED`
      wins over `OPEN` and `OPEN` over `PASS` (design.md decision 5), citing
      `local-review-loop/a-later-pass-does-not-return` beside it; and add
      `// spec: agent-autonomy/the-third-round-still-gets-its-fixes` above
      the case *shares /code-review's finding-disposal terms alone, keeping
      its pull-request behaviour*, which pins what that scenario now says.
      Verify with `bun test bun/review-docs.test.ts` that each new assertion
      fails on its own, and record it
- [ ] 1.2 Edit `core/review-toolkit.md` with the editing tool: delete the
      `/coderabbit-local [base]` bullet, and make the `/code-review` bullet
      say the three things 1.1 pins, beside «the push goes on without the
      gate». Verify with `bun test bun/review-docs.test.ts` green
- [ ] 1.3 `git rm -r core/skills/coderabbit-local` and `git rm
      .claude/skills/coderabbit-local`; delete `README.md`'s `coderabbit-local`
      table row; delete `Skill(coderabbit-local)`, `Bash(coderabbit
      --version)`, `Bash(coderabbit doctor *)` and `Bash(coderabbit review *)`
      from `.claude/settings.json` (design.md decision 1). Verify with `bun
      test bun/pre-pr-steps.test.ts bun/review-docs.test.ts
      bun/skills-table.test.ts` green and `git
      ls-files .claude/skills core/skills` naming no `coderabbit-local` (`bun
      bun/check.ts` is a consumer's check and does not run in this tree)

## 2. No CLI in the runner image

- [ ] 2.1 In `orchestrator/runner/Dockerfile`, drop `coderabbit` from the
      header comment's tool list, the `CODERABBIT_VERSION` pin with its
      «moved by hand» note, and the `RUN` that installs the CLI; in
      `orchestrator/README.md`, drop the `coderabbit auth login` step — the
      sentence that leads to it, its code block and «A `localhost` callback
      it prints is handed over the same way.» — keeping «`/exit`» where the
      step began, and add one line saying that a host which ran it revokes
      that login in CodeRabbit and deletes the CLI's config from `agent`'s
      home, naming the directory the CLI's own docs give (design.md
      decision 2, *Risks*). Merge `origin/main` first if
      `host-deploy` has landed. Verify with `bun test orchestrator/` green and
      `git grep -n -i coderabbit -- orchestrator` printing nothing

## 3. Verify

- [ ] 3.1 Grep the tree case-insensitively for `coderabbit-local`,
      `coderabbit doctor`, `coderabbit review --`, `coderabbit review \*`,
      `coderabbit auth`, `CODERABBIT_VERSION` and `CodeRabbit's CLI` — not
      a bare `coderabbit review`, which matches prose about the bot's
      review — leaving the archive,
      `docs/context/`, other open changes and this change's own artefacts;
      list any remaining hit and its disposition in the commit message. Then
      `openspec validate remove-coderabbit-local --strict` and `bun test
      bun/board-state-hygiene.test.ts bun/spec-coverage-sweep.test.ts
      bun/spec-coverage-floor.test.ts`, green

## 4. At archive

Ticked by the archive, not by the apply.

- [ ] 4.1 Re-copy the `MODIFIED` block of *The local review runs after
      triage and before the push* from main if another change modified it
      since, re-applying this change's edits; and rewrite the Purpose of
      `openspec/specs/local-review-loop/spec.md`, which no delta reaches, to
      drop «which guidelines CodeRabbit's CLI reads when a session runs
      `/coderabbit-local` by hand» (design.md decision 7). Verify with `git
      grep -n coderabbit-local -- openspec/specs` printing nothing
