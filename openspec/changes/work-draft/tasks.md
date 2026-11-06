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
      and ready calls `gh pr ready 7 --undo -R o/demo` once and prints
      `draft: #7 marked draft, head <sha>` with the full head, exit 0 [2];
      #7 an open draft makes no `gh pr ready` call and prints `draft: #7
      already a draft, head <sha>`, exit 0 [3]. Verify: each fails against
      today's code
- [ ] 1.3 Write failing cases for the refusals, each one line opening
      `draft: refused —`, exit 1 and no `gh pr ready` call: #7 merged, naming
      it merged [15]; #7 closed unmerged, naming it closed [16]; the read
      exiting non-zero [17]; `origin` a local path naming no repository
      [18]; a head that is not 40 hex digits, read as unread [11]. And the
      undo exiting non-zero prints that #7 is still ready, exit 1 [19]; the
      undo killed at `HARNESS_GH_TIMEOUT_MS` does the same [20]. Verify: each
      fails against today's code
- [ ] 1.4 Extend `readPullRequest` in `bun/pull-requests.ts` to return
      `draft` and `head` (design, *Reuse the reads and the call that exist*),
      leaving `work.ts status`'s use as it is. Add `bun/work-draft.ts` with
      `draft(n)`, calling `ready(full, n, "--undo")` from
      `bun/ci-run-draft.ts`; in `bun/work.ts` dispatch `draft` with
      `--pr` checked against `NUMBER` and refused when repeated, and name it
      in `USAGE` [14] and the header comment. Verify: `bun test
      bun/pull-requests.test.ts bun/work-draft.test.ts bun/work-status*.test.ts`
      passes, and `bun bun/check.ts` passes
- [ ] 1.5 Write a failing case, in `bun/work-draft.test.ts`, that
      `core/rules.md`'s Process sublist names `work.ts draft --pr` [21] and
      that `core/git-and-prs.md`'s draft rule names it and no longer tells
      the agent to run `gh pr ready <n> --undo` as it starts [22]; compare
      with whitespace normalised. Then add the Process rule — before handing
      follow-up on an open pull request to a subagent (a review round, a CI
      fix, a merge of `main`), run `bun bun/work.ts draft --pr <n>`, and put
      the head it prints in the brief — and reword `core/git-and-prs.md`'s
      sentence to the dispatching session running the command. Verify: the
      case passes, and the Process sublist holds 19 rules
- [ ] 1.6 In `README.md`, add the `draft` row to the `work.ts` table, linking
      `openspec/specs/work-draft/spec.md` — which exists once this change is
      archived, so link the change's delta until then — and name `draft`
      beside `resolve` in the *Cloud sessions* note as failing there. Grep the
      tree outside `openspec/changes/archive/` for `ready <n> --undo` and
      `ready <N> --undo` and reconcile each instruction to draft at a
      hand-over, leaving the refusal texts of `finish` and the pre-push hook
      (proposal, *Out of scope*). Verify: `bun test` passes, and `openspec
      validate --strict work-draft` passes
