# work-finish — tasks

Two groups, one pull request each: `feat/work-finish-1`, then `-2`. Each
failing case first, its failure recorded, cited as `// spec:
<capability>/<slug>`. `bun/gate-ledger.test.ts` stands at 298 lines.

## 1. Refuse a push into a ready pull request

- [x] 1.1 Dropped: `pre-pr-project-checks` (#316) merged the filter first,
      with its cases in `bun/gate-ledger-rule.test.ts`. Failing cases in `bun/gate-ledger-rule.test.ts`: a passing `pre-pr`
      record of `C` under another rule is not found when the diff budget is
      asked for; the diff budget's own is; a call naming no rule finds either.
      Then give `ran()` its `rule` parameter and pass `diff-budget` from
      `bun/goal-check.ts` and `ranUnder()`; the turn gate passes none.
      Verify with `bun/gate-ledger-rule.test.ts`, `bun/goal-check.test.ts`
      and the `turn-gate*` tests. If a sibling merged the filter first, drop
      this task naming its pull request
- [x] 1.2 Failing cases in `bun/pull-requests.test.ts`: `readPullRequests()`
      given a repository reads that one and spawns no git; `readyOne()`
      answers the open non-draft pull request, none for a draft, a merged
      one or an empty list. Then add both
- [x] 1.3 Failing cases in `bun/push-draft.test.ts`, with a `gh` stub on
      `PATH` and records on stdin: empty stdin makes no `gh` call and exits
      0; a draft passes; an open non-draft one exits non-zero naming `gh pr
      ready 7 --undo`; a failed read exits non-zero naming `gh auth status`;
      two records, one ready, refuse and name it; a push of `feat/x` to
      `refs/heads/release` reads `release`'s pull requests; a deletion
      record, a branch pushed to `refs/tags/` and a local-path remote are
      not read; the https,
      ssh and scp forms of a `github.com` URL are read; each refusal writes
      one `push-draft` record carrying the pushed sha. Then write
      `bun/push-draft.ts`
- [x] 1.4 Make `bun bun/push-draft.ts "$@"` the first command of
      `.githooks/pre-push` after its `unset $(git rev-parse
      --local-env-vars)` line, which stays above it, and add a case to `bun/pre-pr.test.ts` that it
      stands before `bun test`, the hook still naming `diff-budget.sh` and
      not `pre-pr`. Verify with `bun/pre-pr.test.ts`
- [x] 1.5 `core/git-and-prs.md`'s pull request bullet: a push into an open
      pull request that is not a draft is refused by the pre-push hook, and
      the user's own push too — `gh pr ready <n> --undo` first. Grep
      `core/`, `README.md` and `openspec/specs/` for "pre-push" and draft
      wording that the bullet now contradicts

## 2. `work.ts finish` and the ready guard

- [ ] 2.1 Failing cases in `bun/notion-ask.test.ts` for the lifted export:
      the ask command and its new caller read the same settings and client,
      no settings answer a reason, and a mode the settings refuse answers
      that reason. Then lift the settings read and the client out of
      `ask()`, which keeps every existing case green
- [ ] 2.2 Failing cases in `bun/work-finish.test.ts`, with a bare `origin`,
      a `gh` stub logging every call, the Notion stand-in from
      `bun/notion-bot.fixture.ts` and a ledger from
      `bun/goal-check.fixture.ts`, for the arguments: no arguments, no
      `--card`, `--title` without `--body-file`, `--title ""`, `--force`, a
      positional and a 31-hex card each print the usage and exit 2 with no
      call logged; a 32-hex id and a dashed UUID pass
- [ ] 2.3 Failing cases in the same file for the refusals, each exit 1 with
      no push and one `finish` record with its id and `HEAD`: a dirty
      tracked file (no network call made), a detached `HEAD`, `main`, no
      passing diff-budget record of `HEAD`, another rule's record alone, an
      unreadable pull request state, an open non-draft one (naming `gh pr
      ready 7 --undo`), and no open one with no `--title`. An untracked file
      alone does not refuse
- [ ] 2.4 Failing cases in the same file for the sequence: a first finish
      pushes, opens a draft with `--base main`, the title and the body file, re-reads its
      number over REST and marks it ready, in that order; a draft with a new
      commit pushes and marks ready with no create; `origin` already at
      `HEAD` makes no push and still marks ready; one merged and one open
      draft pull request act on the draft; a closed unmerged one alone opens
      a new draft; a waiting question leaves the draft, names the card and
      exits 0; no ask settings, a Notion read that fails, a failed push and
      a ready `gh` refuses each exit 1 with the draft left. The last line
      opens `finish: ready #7`, `finish: draft #7 —` or `finish: refused —`
- [ ] 2.5 Write `bun/work.ts` (strict `util.parseArgs`, the `finish`
      subcommand) and `bun/work-finish.ts` (`finish()`, the `unproven()`
      stub reading the pre-PR runner's diff-budget record, `ready()` from
      `bun/ci-run-draft.ts`, `readyOne()`), until 2.2–2.4 pass
- [ ] 2.6 Failing cases in `bun/ready-guard.test.ts`: `gh pr ready 7`,
      `gh pr ready 7 --undo=false`, `gh -R o/r pr ready 7`, `cd x && gh pr
      ready 7` and `gh pr create --draft` are refused, naming `bun
      bun/work.ts finish`; `gh pr ready 7 --undo` passes; `sh -c 'gh pr
      ready 7'` and `eval 'gh pr ready 7'` pass, the stated exception; a non-Bash event passes; each refusal writes one `ready-guard` record under
      `hand-ready` or `hand-create`. Then export `ghFinishes()` from
      `bun/command-guard-gh.ts` and write `bun/ready-guard.ts`
- [ ] 2.7 Failing cases in `bun/self-pin.test.ts`: the harness's own
      settings register the ready guard in a `PreToolUse` group with no
      matcher, type `command`, no `if`, not async, with the exact pin-path
      text and no `# harness-managed` mark; `HOOKS` holds no entry for it;
      a sync of those settings keeps it. Then add the registration and the
      allow entry `Bash(bun bun/work.ts *)` to `.claude/settings.json`
- [ ] 2.8 Prose: `core/rules.md` drops the Process line *Mark a pull request
      draft …*, which the two refusals and `finish` now hold; its Safety
      rule *Never run an act the command guard … refuses or asks about …*
      names `bun/work.ts finish` as the one script the allow list grants a
      push, a pull request and a ready; `core/git-and-prs.md`'s pull request
      bullet points at `bun bun/work.ts finish --card <id>` for opening and
      ready, keeping `gh pr ready <n> --undo` by hand. Grep `core/`,
      `README.md`, `openspec/specs/` and the card for `gh pr ready` and
      `gh pr create` sites the change makes false, and fix each
- [ ] 2.9 Live probe from the tree on this group's own card: open this
      group's pull request with `bun bun/work.ts finish`, and record in its
      body the draft it opened, the ready it set or the question it waited
      behind, and a push into it while ready refused by the hook. The ready
      guard runs from the pin, so its probe follows the pin bump (design,
      *Migration Plan*)
