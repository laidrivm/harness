# flaky-test-findings — tasks

The test tasks come from the `/zombies` run made on the proposal on
2026-10-19, and from the reviews of the proposal's pull request: [79] and
[82] from the local review, [87] and [88] from CodeRabbit. Each is written
before the code it covers (`core/testing.md`, TDD for edge cases). The numbers
in brackets are idea numbers; a case marked "plan review" came from this
plan's own review and has none.

The explore flagged one question as unverified: whether
`if: "Bash(bun test *)"` matches a bare `bun test`. No task asks it, because
design.md D3 registers the watch with no `if`. Its replacement is idea [39]:
an `if` on the registration fails the check.

There are three groups, each a harness pull request:

1. The stopgap rule.
2. The flake watch, which deletes the rule's clause it now holds.
3. The retry refusals and the `gh run` ask entries, which delete the rule's
   last mechanised clause.

Every new scenario's test carries a `// spec:` citation, so the uncited count
does not rise when the change is archived. For the four agent-permissions
scenarios on what prompts, the test reaches the harness's half, the entries
in `ASK`. Claude Code's half, that those entries prompt, is 3.7's user act.

## 1. The stopgap rule

- [x] 1.1 Add one bullet to `core/testing.md`, after the bullet on suites that
      may skip:
      > A test that failed and then passed on an unchanged tree is a flaky
      > test, never a green run: report it by name as a `flaky` finding and
      > file a card for it; never re-run a failed run unchanged without first
      > naming the cause you suspect; and never configure a retry (`--retry`,
      > a test's `retry` option, `[test] retry`) — a stopgap until change
      > `flaky-test-findings` lands: its step 2 holds the first clause and
      > its step 3 the last.

      Verify:
      - the bullet meets `core/rules.md`'s quality bar;
      - `grep -rn "flaky" core/ openspec/specs/` shows no other statement on
        the subject to reconcile;
      - `bun bun/pre-pr.ts` passes.

## 2. The flake watch

- [x] 2.1 **User act, before any code.** The user runs the event probe from a
      scratch kit: a settings file whose `PostToolUse` and
      `PostToolUseFailure` hooks dump the event to a file, in a throwaway
      repository holding one test that fails once. A session does not run
      `claude` itself. Three things are recorded in the pull request's
      *Check by hand* list:
      - whether a failing `bun test` puts bun's `(fail)` lines in `error`;
      - whether a passing run puts ` 0 fail` in `tool_response.stdout`,
        `tool_response.stderr`, or both;
      - whether a `git push` whose pre-push hook runs the suite does the same.

      If any answer differs from design.md D4, amend D4 through
      `/opsx:update` before 2.3.
- [x] 2.2 Write `bun/flake-watch.test.ts`. Each case spawns the script with an
      event on stdin, a temp store, a temp `XDG_STATE_HOME` and a fixture git
      repository. All of these fail before 2.3.
      - The empty case:
        - a failing event with no store file exits 0 with no output and
          leaves the ledger unchanged [1];
        - a passing event with no store file exits 0 with no output [2];
        - a call whose output holds no reporter text writes no store
          entry [3].
      - The one case:
        - a fail, then a pass of the same command on the same tree, prints a
          hint naming `grp > flips` with no duration [4];
        - that hint adds exactly one ledger record with gate `flake-watch`,
          decision `flaky`, rule `fail-then-pass` and the fixture's `HEAD`.
          The record holds no substring of the test name, the command or the
          output [5].
      - The many cases:
        - fails naming `a`, then `b`, then a pass, name both [6];
        - one name failing twice is named once [7];
        - with commands A and B interleaved, B's pass gives no hint and A's
          later pass does [8];
        - two sessions keep separate entries [9];
        - a sub-agent and its parent keep separate entries [10];
        - two processes writing at once leave a store that parses [11];
        - a fail naming `a` on tree T, an edit, then a fail naming `b` and a
          pass on the new tree, names `b` only (plan review).
      - The boundary cases:
        - a tracked file edited between the runs gives no hint [12];
        - an untracked file created between them gives no hint [13];
        - an untracked file's content changed between them gives no
          hint [14];
        - an ignored file changed between them still gives the hint, pinning
          design.md's stated false-positive side [15];
        - a commit between them gives no hint [16];
        - staging a tracked edit between them, with no content change, still
          gives the hint (plan review);
        - the same command from another `cwd` of the same tree gives no
          hint [17];
        - a `2 fail` summary with no `(fail)` line, then a pass, gives the
          hint saying the names were not in the output [18];
        - a ` 10 fail` summary is read as failing, never as ` 0 fail` [19];
        - output carrying both a `(fail)` line and ` 0 fail` is failing [20];
        - ` 0 pass` with ` 0 fail` is no test run, so a failing run followed
          by an all-skipped one names no flaky test [87];
        - a third, passing run after the hint gives no second hint [21];
        - a test name containing ` [` loses only its trailing duration [22];
        - fail on tree T, pass on tree U, then pass on T gives no hint [23].
      - The interface cases:
        - the hint's `hookEventName` is the event's own. A pass seen on
          `PostToolUseFailure` (a push refused after its suite passed) answers
          under that name [24];
        - a case spawns a real failing bun test against the installed bun and
          asserts that the watch's reader finds its name and its count, so a
          reporter change fails here [25];
        - a pass whose ` 0 fail` arrives only in `tool_response.stderr` is
          read [26];
        - the store file is created with mode `0600` (plan review).
      - The exception cases:
        - a non-JSON event exits 0 with no output [27];
        - a session id holding `/` or `..` decides nothing [28];
        - a `cwd` that is not a git working tree decides nothing [29];
        - with the store unwritable, a fail and then a pass both exit 0 with no
          output [30];
        - a garbage store file counts as empty [31];
        - with the ledger unwritable, the hint is still given [32];
        - across every case above, the exit code is 0 [34].
      - The simple scenarios:
        - `bun run test` fails, then passes [35];
        - `git push` fails on its pre-push suite, then succeeds [36];
        - `bun test 2>&1 | tail -40` exits 0 failing, then exits 0
          passing [37].

      Each case is cited as `// spec: flaky-tests/<slug>`, and [5] also as
      `// spec: gate-ledger/a-flaky-run-named`. Requirements
      covered: flaky-tests, *A run that passes after an identical failed run
      is named as flaky*, *A test run is read from its output*, *The watch
      never blocks*, *Each flaky finding is recorded in the gate ledger* and
      *The watch fails open*; gate-ledger, *Every gate refusal is recorded*.
- [x] 2.3 Write `bun/flake-watch.ts` as design.md D2 and D4–D7 set out:
      - the reader, the tree fingerprint and the decision as pure exported
        functions;
      - the store written beside the final file and renamed into place;
      - the git calls made only on a failing run, or on a passing run whose
        command has an entry;
      - a header saying it never blocks and fails open, and why;
      - a `shortcut:` comment naming command normalisation as the upgrade
        (design.md, Risks);
      - a `shortcut:` comment naming pruning of the store, as the loop
        guard's older `ponytail:` comment does.

      Verify: 2.2 is green and the file is under its cap in
      `bun/file-size.ts`.
- [x] 2.4 Write the registration cases in `bun/settings.test.ts` and
      `bun/sync-settings.test.ts`, failing before 2.5:
      - a consumer whose settings lack the watch's `PostToolUse` or
        `PostToolUseFailure` registration fails the check, which names the
        missing hook and the sync command [38];
      - the registration with an `if` added fails the check [39];
      - the registration with `async: true` fails the check [40];
      - the registration moved to a group with no matcher fails the
        check [41];
      - a sync over the previous version's hooks leaves exactly one watch
        registration per event [42];
      - each registration's command, run where `node_modules/harness` is
        absent, exits 0 with no output [43];
      - the event names in `HOOKS` are the ones the script answers under, read
        from both places [44].

      Requirement: flaky-tests, *Every consumer session runs the watch*.
- [x] 2.5 Add the two `HOOKS` entries to `bun/bootstrap.ts`, matcher `Bash`,
      not `sole`, with no `if`. Write them into the tracked
      `.claude/settings.json` with the sync, so the harness's own sessions
      register exactly what consumers get
      (harness-updates, *The harness's own sessions run its gates from its
      pin*). They take effect in those sessions at the next self-pin bump.
      Verify: 2.4 and the whole `bun test` are green.
- [x] 2.6 Measure the watch on a Bash call that is no test run: 50 runs a
      round, three rounds, as the command guard's header records its own.
      Write the figure into the header. Verify: the header names the date
      and the range.
- [x] 2.7 In `core/testing.md`, delete the stopgap's first clause, which the
      watch's hint now carries. Point the bullet at `bun/flake-watch.ts`
      instead, keeping "never re-run a failed run unchanged without naming a
      cause" and the retry clause. In `README.md`, add a bullet for the watch
      beside the loop guard's, saying what it reads, what it tells the agent,
      that it never blocks, and what it does before the install. Add the
      watch to the ledger bullet's list of what records, with "each flaky run
      it names". Search the four places that restate a statement
      (`feature-workflow.md`, *Across the stages*) for the old wording.
      Verify: grep shows the deleted clause nowhere.

## 3. Retry refusals and the `gh run` ask entries

- [ ] 3.1 Write the guard cases in `bun/command-guard-retry.test.ts`, each
      failing before 3.2:
      - `bun test --retry=3` is blocked, naming `--retry` [45];
      - `bun test --retry 3` is blocked [46];
      - `bun --bun test --retry=1 a.test.ts` is blocked [47];
      - `bun test a.test.ts --retry=1`, with the flag after an operand, is
        blocked [48];
      - `bun run test --retry=2` is blocked [49];
      - `bun test --rerun-each=20` is allowed [50];
      - a word that only starts with `--retry` but is neither `--retry` nor
        `--retry=…` is allowed [51];
      - `bunx --no-install playwright test --retries=2` is allowed [52];
      - `cd x && bun test --retry=1` is blocked [53a];
      - `bash -c "bun test --retry=1"` is blocked [53b];
      - `bun test -t --retry`, where the word is a flag's value, is blocked.
        This pins the stated over-refusal [54];
      - the block is recorded under the ledger id `bun-test-retry` [55];
      - `bun run --retry=2 test` is blocked [56];
      - `/usr/local/bin/bun test --retry=1` is blocked [58].

      Requirement: flaky-tests, *The guard refuses a test run with a retry*.
- [ ] 3.2 Add the check beside `bunxInstall` in `bun/command-guard-exec.ts`
      and call it from `bun/command-guard.ts` under `bun-test-retry`
      (design.md D9). Name the new prohibition in the guard's header.
      Verify: 3.1 is green.
- [ ] 3.3 Write the check cases in `bun/test-retry.test.ts` against fixture
      repositories, each failing before 3.4:
      - a root `bunfig.toml` with `[test] retry = 2` fails, naming the
        file [59];
      - a tracked `email-service/bunfig.toml` with the same fails [60];
      - an untracked `bunfig.toml` with it reports nothing [61];
      - `[test] rerunEach = 3` reports nothing [62];
      - a `retry` key under a table other than `[test]` reports nothing
        (plan review);
      - an unparseable tracked `bunfig.toml` throws, naming the file [64];
      - `{ retry: 2 }` in a file importing `bun:test` fails, naming the file
        and the line [65];
      - the shorthand `{ retry }` fails [66];
      - `retry:` only inside a string, a template or a comment reports
        nothing [67];
      - `retry: true` in a source that neither imports `bun:test` nor has a
        test file's name reports nothing [68];
      - a global `test("x", fn, { retry: 2 })` in a `widget.test.ts` with no
        `bun:test` import fails, naming the file and the line [88];
      - a file naming `bun:test` only in a comment is not scoped [69];
      - a `retryCount:` key reports nothing [70];
      - `.tsx`, `.js` and `.mjs` sources are read as `.ts` ones are [72];
      - `const policy = { retry: 3 }` handed to the code under test reports
        nothing (local review) [79];
      - `test.each(rows)("x", fn, { retry: 1 })` fails [80];
      - `test.if(cond)("x", fn, { retry: 1 })` fails (plan review);
      - `test.concurrent.failing("x", fn, { retry: 1 })` fails, as a chain
        no list names (plan review);
      - `describe("x", { retry: 1 }, fn)` fails [81];
      - a `package.json` script `"test": "bun test --retry=2"` fails, naming
        the file and the script (local review) [82];
      - a `simple-git-hooks` value carrying `bun test --retry=1` fails [83];
      - a workflow `run: bun test --retry=1` fails [84];
      - the same on the second line of a multi-line `run: |` block fails
        (plan review);
      - a `.githooks/pre-push` line `bun test --retry=1` fails [85];
      - a `.githooks/pre-push` comment `# bun test --retry=1` reports nothing
        (plan review);
      - a script running `bun test --rerun-each=5` reports nothing [86].

      Requirement: flaky-tests, *The consumer check refuses a configured
      retry*.
- [ ] 3.4 Write the check as its own module and add it to `gates()` in
      `bun/check.ts` (design.md D10). Verify:
      - 3.3 is green;
      - `bun run harness:check` on this tree reports nothing new [73];
      - running the scan over every file the commit writes finds nothing, as
        `core/rules.md` asks of a fixture that can be valid input to its own
        scan.
- [ ] 3.5 Write the ask cases, each failing before 3.6:
      - in `bun/settings.test.ts`, a fixture whose `ask` lacks
        `Bash(gh run * rerun *)` fails the check [75];
      - in `bun/sync-settings.test.ts`, a sync into a consumer lacking the
        `gh run` entries writes them in the harness's order [76];
      - the `bun --help` form check passes with the `gh` entries present, and
        names none of them [77];
      - a consumer allow entry `Bash(gh run *)` is not reported as gated and
        allowed back [78];
      - `ASK` holds `Bash(gh run <sub> *)` and `Bash(gh run * <sub> *)` for
        each of `rerun`, `cancel` and `delete`, and no `ASK` entry matches
        `gh run view 123 --log-failed`, `gh run list` or `gh run watch 123`
        (plan review).

      Requirement: agent-permissions, *Re-running, cancelling or deleting a
      CI run prompts*.
- [ ] 3.6 Add the `gh run` entries to `ASK` in `bun/settings.ts`, after
      the manifest entries (design.md D8). Write them into the tracked
      `.claude/settings.json` with the sync. Verify: 3.5 and the whole
      `bun test` are green.
- [ ] 3.7 **User act, before merge.** In a live session with
      `Bash(gh run *)` allowed:
      - `gh run -R o/r rerun 1` prompts;
      - a bare `gh run rerun` prompts;
      - `gh run cancel 1` and `gh run delete 1` prompt;
      - `gh run view 1`, `gh run list` and `gh run watch 1` do not prompt.

      Record the answers in the pull request's *Check by hand* list. If a
      form does not prompt, amend D8 through `/opsx:update` before merging.
- [ ] 3.8 In `core/testing.md`, delete the stopgap's retry clause, which the
      guard and the check now hold (agent-rulebook, *A mechanised prohibition
      leaves its prose home*). Search the four places for the old wording.
      Verify: grep shows "configure a retry" nowhere.
