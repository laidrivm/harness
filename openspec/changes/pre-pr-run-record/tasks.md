# pre-pr-run-record — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the code they cover (`core/testing.md`). The numbers in brackets are
that run's idea numbers, and all 35 are placed below. Each test points
`XDG_STATE_HOME` at a temporary directory, so no case reads or writes the
real ledger.

There is one group, shipped as `feat/pre-pr-run-record`. It is cut after
`gate-decision-ledger` step 2 merges (design.md, *Migration Plan*).

## 1. The runner, its record, and the turn gate that reads it

- [ ] 1.1 Write the runner's tests in `bun/pre-pr.test.ts`, spawning
      `bun/pre-pr.ts` in a scratch repository with a base branch:
      - a branch with nothing past its base records `pass` [1];
      - the first run creates the ledger with one line [2];
      - within budget, the `PASS` line is printed unchanged and the exit is 0
        [3]. The record has gate `pre-pr`, rule `diff-budget`, decision
        `pass`, and `commit` equal to the full `HEAD` [4];
      - two runs at one commit leave two records [5], and runs at `A` then `B`
        leave records naming each, in order [6];
      - a `WARN`-band branch exits 0 and records `pass` [7]. A branch at the
        failing threshold exits 1 and records `fail` [8];
      - an unstaged edit [9] and a staged edit [10] each print the line and
        record nothing, with one line saying why. An untracked file alone
        still records [11];
      - an empty `CLAUDE_CODE_SESSION_ID` records the writer's fallback session
        [12];
      - the record holds the six ledger keys and `commit`, and no gate-line
        text [13]. The exit status equals the diff budget's for 0, 1 and 2
        [14];
      - an unresolvable base exits 2 with the `ERROR` line and records `error`
        [15]. An unwritable state directory changes neither the line nor the
        exit [16];
      - `commit` is `HEAD` as read when the run began [17];
      - `.githooks/pre-push` and `.github/workflows/diff-budget.yml` call
        `diff-budget.sh` and never `pre-pr.ts`, read from those files [18].
      All of these fail before 1.3. (Req: pre-pr-runner — all four;
      gate-ledger — A record holds no command text)
- [ ] 1.2 Write the turn gate's record cases in `bun/turn-gate-record.test.ts`,
      using `bun/turn-gate.fixture.ts`:
      - no ledger file means one refusal, then a release [19]. An empty one
        reads as no record [20];
      - a record for the tip ends the turn [21]. Without one the turn is
        refused, and the reason names the tip and the runner's path [22];
      - the tip's record is found among other projects' and other gates'
        records [23]. Records for earlier commits only do not discharge [24].
        A prefix of the tip does not match [25];
      - a record for the tip from another clone does not discharge. One
        whose project is a subdirectory of this checkout does;
      - a tip read from the remote-tracking ref needs that ref's record [26];
      - the reason names `bun/pre-pr.ts` from the harness tree [27] and
        `node_modules/harness/bun/pre-pr.ts` from an installed copy [28];
      - a `fail` record discharges [29];
      - a torn line does not hide the record after it [30]. A ledger path
        that is a directory reads as no record, without throwing [31];
      - a `turn-gate` record naming the tip does not discharge [32];
      - a record with no gate line is refused [33]. A named `BLOCKED` with no
        record ends the turn [34].
      Then give the existing cases where a turn completes a group and reports
      a record for the tip, and add a twin without one to
      `bun/turn-gate-cli.test.ts`'s "a reported turn exits 0" that is refused
      [35]. All of the new cases fail before 1.4. (Req: commit-gates — A turn
      that commits reports its gates before it ends)
- [ ] 1.3 Write `bun/pre-pr.ts`. It runs `diff-budget.sh` from its own
      directory with output inherited, and maps the exit status to `pass`,
      `fail` or `error`. It records through `gate-decision-ledger`'s writer
      with `commit`, unless `git status --porcelain --untracked-files=no`
      prints anything, and exits with the step's status. Extend the writer to
      take an optional `commit`. Verify: 1.1 is green.
- [ ] 1.4 In `bun/turn-gate.ts` `decide()`, on the path where a group completed
      and the message carries a gate line but no named `BLOCKED`, read the
      ledger for a `pre-pr` record whose `commit` is the tip and whose
      `project` is the checkout's `git rev-parse --show-toplevel` or a path
      under it (design.md, *The turn gate matches the commit and the
      checkout*). Refuse without
      one, naming the tip and the runner's path relative to the event's
      `cwd`. Correct the header comment's "a gate line written without
      running the gate passes it". Verify: `bun test` is green and the file
      stays under the 300-line cap (`bun/file-size.ts`).
- [ ] 1.5 In `core/review-toolkit.md`, make step 1 the runner. Say to run it
      again after the sequence's last commit, and replace "it does not prove
      it ran" with what the record proves and what it does not. In `README.md`
      *Consuming*, the turn-gate line names the run record. Grep for the
      superseded wording ("does not prove", "gate line written without
      running", "ends without the pre-PR sequence's gate lines") across the
      tree, excluding `openspec/changes/archive/` and this change's own
      directory, which quotes them on purpose, and reconcile each hit.
      `openspec/specs/commit-gates/spec.md` is expected to match, because
      this change's delta rewrites it at archive. Verify: no other hit
      remains outside the lines this task rewrote.
- [ ] 1.6 Run the branch's `bun/pre-pr.ts` once in the harness and once with
      d2ass and then mellon as the working directory. It writes only to the
      ledger, so their trees stay untouched. Verify: `jq` over the ledger
      shows one `pre-pr` record per tree, each naming that tree's `HEAD`, and
      `git status` in each consumer is unchanged.
