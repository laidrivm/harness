# loop-guard — tasks

Test tasks come from the `/zombies` run made when the change was revised on
2026-10-13, and are written before the code they cover (`core/testing.md`,
TDD for edge cases). The numbers in brackets are that run's idea numbers, and
every one is placed below.

There are two groups, each a harness pull request. Group 1 counts, bars and
refuses, in the harness's own sessions only. Group 2 adds the warning the
agent reads, the ledger records and the consumers' registrations. Both need
nothing outside `main`: `bun/gate-ledger.ts` is already there.

## 1. Count and refuse, in the harness's own sessions

- [ ] 1.1 Before any code, the user runs R4 from the scratch kit's `refuse/`
      variant: inside a sub-agent, the barred call is refused, and the
      parent's own call still runs. A session does not run `claude` itself.
      The kit's README gives the command. R1 to R3 already passed on
      2026-10-13 (design.md, *Measurements*): the barred call did not run
      again, and both the refusal and the warning reached the `-p` output.
      Record the R4 answer in the pull request's *Check by hand* list. If the
      bar does not hold in the sub-agent, or refuses the parent's call, name
      it there and in the step's design note before 1.3.
      (Req: loop-guard — A thrice-failed call is refused before it runs)
- [ ] 1.2 Write the guard's tests in `bun/loop-guard.test.ts`, spawning the
      script with an event on stdin and a temp store:
      - for counting:
        - a first failure exits 0 with no output [1];
        - a `PreToolUse` event with no count file exits 0 with no output [2];
        - a second identical failure gives no output [3];
        - two calls failing alternately keep separate counts [6], and so do
          two sessions [7];
        - two processes recording at once leave a count that parses [8];
        - errors differing only in a duration [9] or in whitespace [10] are
          one call, and errors differing in a word are two [11];
        - inputs differing only in `description` are one call [12], in
          `timeout` are two [13], and in key order are one [14];
        - a session id holding `/` or `..` decides nothing [15];
        - the count holds no substring of the input or the error [17];
        - `is_interrupt: true` is not counted [18];
        - a non-JSON failure event [19] and one with no `session_id` [20]
          exit 0 with no output;
      - for refusing:
        - after three identical failures, the same call under the same
          `prompt_id` exits 2, with stderr starting `loop-guard:` and naming
          the tool and 3 [22], and a second attempt is refused again [23];
        - a sub-agent's bar does not refuse its parent's identical call [24];
        - the call under a different `prompt_id` runs [25], and one with no
          `prompt_id` on either side is refused [26];
        - a different input [27] and the same input under another tool [28]
          run;
        - a garbage count file lets the call through [29], and a non-JSON
          `PreToolUse` event exits 0 with no output [30];
        - with the store unwritable, a third failure bars nothing, so the
          fourth call runs [21].
      All of these fail before 1.3. (Req: loop-guard — A repeat is the same
      call failing the same way; A thrice-failed call is refused before it
      runs; The guard fails open)
- [ ] 1.3 Write `bun/loop-guard.ts` as design.md sets out:
      - the call key, the fingerprint and both decisions as pure exported
        functions;
      - the role chosen from `hook_event_name`;
      - the count written to a temp file and renamed into place;
      - a header that says it fails open and why, beside a `ponytail:` comment
        naming pruning of the count files as the upgrade.
      Register it on `PostToolUseFailure` and on `PreToolUse` (no matcher) in
      the harness's own `.claude/settings.json`, as the turn gate is
      registered there. `bun test` must be green, and every file must stay
      under the cap `bun/file-size.ts` sets.

## 2. The warning, the ledger, and the consumers

- [ ] 2.1 Write the cases for this group, failing before 2.2:
      - in `bun/loop-guard.test.ts`:
        - a third identical failure prints `additionalContext` naming the tool
          and 3, and exits 0 [4];
        - that output parses as `hookSpecificOutput` with `hookEventName`
          `PostToolUseFailure` [16];
        - a fourth identical failure, under a new prompt, warns again with
          4 [5];
      - with `XDG_STATE_HOME` set to a temp directory:
        - the warning records `loop-guard`, `warned`, `repeated-failure`
          [31], and a refusal records `refused` [32];
        - a first and a second failure leave the ledger absent [33];
        - with the ledger unwritable, the warning and the refusal are
          unchanged [34];
      - in `bun/bootstrap.test.ts`, each registration exits 0 with no output
        in a tree without `node_modules/harness` [35];
      - a consumer whose settings lack either hook is named by the check, with
        the sync command [36]. Before adding this, measure
        `bun/settings.test.ts`. If the case would take it past its cap, put
        the case in a new `bun/settings-loop-guard.test.ts`;
      - confirm that `bun/sync-settings.test.ts`, which iterates `HOOKS`,
        writes both registrations with no new case, and add one only if it
        does not [37].
      (Req: loop-guard — The third repeat warns the agent; Each warning and
      refusal is recorded in the gate ledger; Every consumer session runs the
      guard)
- [ ] 2.2 Add the warning, and the ledger calls, through `record` in
      `bun/gate-ledger.ts`. Add the two registration texts and their `HOOKS`
      entries to `bun/bootstrap.ts` (no matcher, not `sole`), and add them to
      `settings.test.ts`'s policy-keeping fixture. Confirm that the
      command guard's `sole` check on the `Bash` matcher still counts only
      its own hook. `bun test` must be green.
- [ ] 2.3 In the README's *Consuming* section, name the two hooks beside the
      turn gate's, with the `loop-guard:` refusal. Grep for every other place
      that lists the hooks a consumer runs (`bun/bootstrap.ts` comments,
      `openspec/specs/**`, `core/`) and reconcile each one.
