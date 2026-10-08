# ship-turn-gate-to-consumers — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (core/testing.md — TDD for edge cases). Bracketed numbers
are that run's idea numbers; all 20 are placed below.

Three groups. Groups 1 and 2 are harness pull requests on
`feat/ship-turn-gate-to-consumers-1` and `-2`. Group 3 is one pull request in
each consumer, after group 2 is merged and its commit can be pinned.

## 1. What the gate decides, and how fast

- [ ] 1.1 Turn the test at `bun/turn-gate.test.ts` "a group that did not
      exist at the mark does not qualify the turn" around: a group the mark
      does not hold, complete at the tip, qualifies [12]. Add: a group
      committed unticked and then ticked within one turn qualifies [13]; a
      change directory added within the turn qualifies on its complete group
      and not on its open one [14]; a complete group whose heading the turn
      renamed refuses once and ends on the next stop [15]. Each fails before
      1.3. (Req: commit-gates — A turn that commits reports its gates before
      it ends, §*A group created and completed in the same turn*, §*A complete
      group the turn renamed*)
- [ ] 1.2 Write the batch-read tests: thirteen active changes with one group
      completed in the turn name that group and its path only [16]; a task
      list holding a line shaped like a `cat-file` header (`<sha> blob 12`)
      parses as one file [17]; an empty `tasks.md` at the mark reads as no
      groups and not as the next file [18]; a path the mark lacks reads as an
      empty task list [19]. 16 and 19 pass before 1.3 and pin that the
      rewrite keeps the behaviour; 17 and 18 pin the framing it introduces.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends)
- [ ] 1.3 In `bun/turn-gate.ts`, qualify a group not complete at the mark,
      absent included, and read both sides of every active task list
      through one `git cat-file --batch`, deleting the `ponytail:` ceiling
      comment on the loop it replaces. `bun test` green, file under the
      300-line cap.
- [ ] 1.4 Re-measure both halves on dota2's tree, read-only and with the
      method in design.md *Measurements*, and record the medians there.
      The `Stop` half must be under the 100 ms budget the archived
      `pre-pr-sequence-gate` design set; over it, stop and report before
      group 2 [20].

## 2. The text a consumer carries, and the check that pins it

- [ ] 2.1 Write the hook-text tests in `bun/bootstrap.test.ts`, running each
      string through `sh -c` as the bootstrap tests do: without the package,
      `stop` exits 0 with both streams empty [1] and `mark` exits 0 with
      stdout empty [2]; with a stand-in script that refuses, `stop` exits
      exactly 2 with its stderr [3]; with a stand-in that fails to parse,
      `stop` exits other than 2 [4]; a `$CLAUDE_PROJECT_DIR` holding a space
      still runs the stand-in [5]. (Req: commit-gates — A turn that commits
      reports its gates before it ends, §*A consumer clone before install*)
- [ ] 2.2 Write the registration tests in `bun/settings.test.ts`: no
      `hooks.Stop` is named [6]; no `hooks.UserPromptSubmit` is named [7]; an
      extra consumer hook on `UserPromptSubmit` beside the harness's reports
      nothing [8]; a `Stop` command one character off is named [9]; the two
      texts registered on each other's events are both named [10]; the
      policy-keeping fixture gains both registrations and still reports
      nothing [11]. (Req: commit-gates — A turn that commits reports its
      gates before it ends, §*A consumer without the registrations*)
- [ ] 2.3 Export the two strings from `bun/bootstrap.ts` beside `BOOTSTRAP`,
      with the header naming why they carry no `|| exit 2`, and make
      `bun/settings.ts` fail an event that holds no hook equal to its
      string. `bun test` green.
- [ ] 2.4 Shorten `core/review-toolkit.md`'s pre-PR paragraph: drop "where it
      is not, never ask whether to run it" and the clause scoping the hook to
      where it is registered, keep the trigger and what the hook cannot see.
      Grep `core/` and `README.md` for every other site that says the hook is
      harness-only, and fix each. (Req: agent-rulebook — A mechanised
      prohibition leaves its prose home)

## 3. Each consumer

- [ ] 3.1 dota2, in a worktree off its `origin/main`, since its checkout
      belongs to another session: bump the pin to group 2's merge commit, run
      `bun install` and confirm the lockfile names `harness` once, run
      `harness:check` and report any failure this change did not cause, then
      add both registrations and refresh the rules copy with `sync.ts` in the
      same commit. `harness:check` green. Confirm in a session started
      afterwards that a prompt writes a mark, since a hook change is only
      observable in a session started after it.
- [ ] 3.2 mellon: the same steps on its `main`. `harness:check` green and a
      mark written in a fresh session.
