# work-draft — tasks

One group, one pull request, on `feat/work-draft`: the change is about 250
lines of diff, under the 800-line budget. Each failing case is written first,
its failure recorded, and cited as `// spec: work-draft/<slug>`. The bracketed
numbers are the proposal-stage `/zombies` ideas.

## 1. `work.ts draft --pr <n>` and the rule naming it

- [ ] 1.1 Write failing cases in `bun/pull-requests.test.ts` for
      `readPullRequest`: an open draft reads `draft: true` and its head's 40
      hex digits, an open ready one `draft: false` [12]. Verify: each fails
      against today's code
- [ ] 1.2 Write failing cases in a new `bun/work-draft.test.ts`, running
      `bun bun/work.ts draft` in `work-finish.fixture.ts`'s checkout with a
      `gh` stub that logs every call, as `bun/work-resolve.fixture.ts` does.
      Arguments, each printing the usage, exiting 2 and making no `gh` call:
      no argument [1]; `--pr 7 --pr 8` [4]; `--pr 0` [5]; `--pr 07` [6];
      `--pr 7x` [7]; `--pr` with no value and `--pr=` [8]; a positional `7`
      [9]; an unknown `--card <id>` beside `--pr 7` [10]. Outcomes: #7 open
      and ready calls `gh pr ready 7 -R o/demo --undo` once and prints
      `draft: #7 marked draft, head <sha>` with the full head, exit 0 [2];
      #7 an open draft makes no `gh pr ready` call and prints `draft: #7
      already a draft, head <sha>`, exit 0 [3]. Verify: each fails against
      today's code
- [ ] 1.3 Write failing cases for the refusals, each one line opening
      `draft: refused —`, exit 1 and no `gh pr ready` call: #7 merged, naming
      it merged [15]; #7 closed unmerged, naming it closed [16]; the read
      exiting non-zero [17]; `origin` set to a URL of one path segment,
      naming `origin` and making no `gh` call at all [18]; a head that is not
      40 hex digits, read as unread [11]. And the undo exiting non-zero
      prints one line opening `draft: failed —` that says `gh pr ready
      --undo` failed and #7 could not be confirmed a draft, claiming no
      state, exit 1
      [19]; the undo killed at
      `HARNESS_GH_TIMEOUT_MS` does the same [20]. Verify: each fails against
      today's code
- [ ] 1.4 Extend `readPullRequest` in `bun/pull-requests.ts` to return
      `draft` and `headRefOid` (design, *Reuse the reads and the call that
      exist*), leaving `work.ts status`'s use as it is, and widen the exact
      shapes `bun/pull-requests.test.ts`'s existing `readPullRequest` cases
      assert by the two fields; update the module's header comment and
      `readPullRequest`'s doc comment to its second caller and the fields it
      returns. Add `bun/work-draft.ts` with `draft(n)`, reading
      `originRepository()` first, then calling `ready(full, Number(n),
      "--undo")`, as `finish` converts its number, from
      `bun/ci-run-draft.ts`; in `bun/work.ts` dispatch `draft` with
      `--pr` checked against `NUMBER` and refused when repeated, and name it
      in `USAGE` [14] and the header comment. Verify: `bun test
      bun/pull-requests.test.ts bun/work-draft.test.ts bun/work-status*.test.ts`
      passes, and `bun bun/check.ts` passes
- [ ] 1.5 Write a failing case, in `bun/work-draft.test.ts`, that
      `core/rules.md`'s Process sublist names `work.ts draft --pr` in a rule
      covering both follow-up handed to a subagent and follow-up the session
      carries itself [21], and
      that `core/git-and-prs.md`'s draft rule names it and no longer tells
      the agent to run `gh pr ready <n> --undo` as it starts [22]; compare
      with whitespace normalised. Then add the Process rule — before
      follow-up on an open pull request starts (a review round, a CI fix, a
      merge of `main`), whether handed to a subagent or carried yourself, run
      `bun node_modules/harness/bun/work.ts draft --pr <n>` (`bun
      bun/work.ts` in the harness), put the head it prints in any brief, and
      name a failed `draft` in the report without stopping the follow-up —
      reword `core/git-and-prs.md`'s sentence to name the command, and add
      `bun bun/work.ts draft` to the Safety rule naming the scripts the allow
      list grants a `gh` write, as the one it grants a switch to draft; the
      case checks that too. Verify: the case passes, and the Process sublist
      holds 19 rules
- [ ] 1.6 In `README.md`, add the `draft` row to the `work.ts` table, linking
      the change's delta, which the archive re-points to
      `openspec/specs/work-draft/spec.md` as `coderabbit-resolve-fixed-threads`'
      archive did for `resolve`'s row — and name `draft`
      beside `resolve` in the *Cloud sessions* note as failing there. Grep the
      tree outside `openspec/changes/archive/` for `ready <n> --undo` and
      `ready <N> --undo` and reconcile each instruction to draft at a
      hand-over, leaving the refusal texts of `finish` and the pre-push hook
      (proposal, *Out of scope*). Verify: `bun test` passes, and `openspec
      validate --strict work-draft` passes
