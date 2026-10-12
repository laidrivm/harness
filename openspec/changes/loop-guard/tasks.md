# loop-guard — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`, TDD for edge cases). The numbers in
brackets are that run's idea numbers, and every one is placed below.

There are two groups, each a harness pull request. Group 1 runs in the
harness's own sessions only and needs nothing outside `main`. Group 2 adds
the warning, the ledger records and the consumers, and it applies after
`gate-decision-ledger` step 1 has merged, because it calls the writer that
step adds to `bun/gate-ledger.ts`.

## 1. Count and stop, in the harness's own sessions

- [ ] 1.1 Probe before any code, in a scratch directory outside every
      repository, with a `.claude/settings.json` whose `PostToolUseFailure`
      hook prints `{"continue": false, "stopReason": "loop-guard: probe"}`.
      Confirm four things:
      - a `claude -p` run whose prompt runs `false` ends, and its result
        carries the reason;
      - the same hook firing inside a sub-agent the run launches either stops
        only that sub-agent or stops the run;
      - with a `Stop` hook that exits 2, the stop still ends the run;
      - with a `PreToolUse` hook on Bash that exits 2, the blocked call does
        not fire the hook.
      Record each answer in the pull request's *Check by hand* list. If the
      first does not hold, stop the step and report `BLOCKED`: design.md's
      approach depends on it. (Req: loop-guard — A repeat past the warning
      stops the session; A repeat is the same call failing the same way)
- [ ] 1.2 Write the guard's tests in `bun/loop-guard.test.ts`, spawning the
      script with an event on stdin and a temp store:
      - a first failure exits 0 with no output [1], and creates the session's
        count [2];
      - a second identical failure gives no output [3];
      - a fourth gives `continue: false` with a `stopReason` starting
        `loop-guard:` [5], and a fifth stops again, naming 5 [6];
      - two calls failing alternately keep separate counts [7], and so do two
        sessions [8], and a sub-agent and its parent [9];
      - two processes recording at once leave a count that parses [10];
      - errors differing only in a duration [11] or in whitespace [12] are
        one call, and errors differing in a word are two [13];
      - inputs differing only in `description` are one call [14], in
        `timeout` are two [15], and in key order are one [16];
      - a session id holding `/` or `..` decides nothing [17];
      - the stop output parses as JSON with exactly `continue` and
        `stopReason` [19];
      - the count holds no substring of the input or the error [20];
      - a non-JSON event [21] and an event with no `session_id` [22] exit 0
        with no output;
      - `is_interrupt: true` is not counted [23];
      - a count file holding garbage is read as empty [24];
      - with the store unwritable, a fourth failure does not stop [25].
      All of these fail before 1.3. (Req: loop-guard — A repeat is the same
      call failing the same way; A repeat past the warning stops the session;
      The guard fails open)
- [ ] 1.3 Write `bun/loop-guard.ts` as design.md sets out: the fingerprint
      and the decision as pure exported functions, the count written to a
      temp file and renamed into place, and a header that says it fails open
      and why, beside a `ponytail:` comment naming pruning of the count files
      as the upgrade. Register it on `PostToolUseFailure` in the harness's own
      `.claude/settings.json`, as the turn gate is registered there. `bun
      test` must be green, and every file must stay under the cap
      `bun/file-size.ts` sets.

## 2. The warning, the ledger, and the consumers

- [ ] 2.1 Write the cases for this group, failing before 2.2:
      - in `bun/loop-guard.test.ts`, a third identical failure prints
        `decision: "block"` with a reason naming the tool and 3, and exits 0
        [4]. That output parses as the documented `PostToolUseFailure` shape
        [18];
      - with `XDG_STATE_HOME` set to a temp directory, the third failure
        records `loop-guard`, `warned`, `repeated-failure`, and the fourth
        records `stopped` [27]. A first and a second failure leave the ledger
        absent [28];
      - with the ledger unwritable, the third still warns and the fourth still
        stops [26];
      - in `bun/bootstrap.test.ts`, the loop guard's registration exits 0 with
        no output in a tree without `node_modules/harness` [29];
      - a consumer whose settings lack the loop guard's hook is named by the
        check, with the sync command [30]. Before adding this, measure
        `bun/settings.test.ts`. If the case would take it past its cap, put
        the case in a new `bun/settings-loop-guard.test.ts`, as
        `policy-gate-beyond-bash` does with its own split;
      - confirm that `bun/sync-settings.test.ts`, which iterates `HOOKS`,
        writes the new registration with no new case, and add one only if it
        does not [31].
      (Req: loop-guard — The third repeat warns the agent; Each warning and
      stop is recorded in the gate ledger; Every consumer session runs the
      guard)
- [ ] 2.2 Add the warning at three, and the ledger calls, through the writer
      in `bun/gate-ledger.ts`. Add the `LOOP_GUARD` text and its `HOOKS`
      entry to `bun/bootstrap.ts` (no matcher, not `sole`), and add the
      registration to `settings.test.ts`'s policy-keeping fixture. `bun test`
      must be green.
- [ ] 2.3 In the README's *Consuming* section, name the `PostToolUseFailure`
      hook beside the turn gate's, with its `loop-guard:` stop. Grep for every
      other place that lists the hooks a consumer runs (`bun/bootstrap.ts`
      comments, `openspec/specs/**`, `core/`) and reconcile each one.
