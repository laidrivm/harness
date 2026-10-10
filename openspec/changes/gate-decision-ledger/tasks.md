# gate-decision-ledger — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`, TDD for edge cases). The numbers in
brackets are that run's idea numbers, and all 25 are placed below.

There are two groups, each a harness pull request: `feat/gate-decision-ledger-1`
and then `-2`. Each test runs with `XDG_STATE_HOME` and `CLAUDE_PROJECT_DIR`
built from what the case needs, in a directory that holds no `.env`.

## 1. The writer, and the guard's refusals

- [ ] 1.1 Write the writer's tests in `bun/gate-ledger.test.ts`:
      - a first record creates the state directory and the file, and holds
        one line [1];
      - an empty `XDG_STATE_HOME` falls back to `$HOME/.local/state` [2], and
        so does an unset one [8];
      - a second record appends without rewriting the first [5];
      - two processes recording at once leave two whole JSON lines [7];
      - the project is `CLAUDE_PROJECT_DIR` as an absolute path, and one with
        a trailing slash records the same path without it [11]. Without the
        variable, the project is the event `cwd`, resolved the same way [9].
        Without either, it is `unknown` [10]. Two directories that share a
        basename record different projects, and a project reached through
        a symlink records its real path;
      - an event with no string `session_id` still records [12];
      - each line parses as JSON with exactly the six keys [13], and `at` is
        ISO 8601 UTC [14];
      - an unwritable state directory throws nothing [16].
      All of these fail before 1.3. (Req: gate-ledger — The ledger lives
      outside every working tree; A record holds no command text; Recording
      never changes a decision)
- [ ] 1.2 Write the guard's cases in the same file, spawning
      `bun/command-guard.ts`:
      - a commit on `main` records `command-guard`, `block`, `main-commit` [3];
      - a non-JSON event records `unreadable-event` [18];
      - `blockDestination` with a destination records `push-to-main`, and
        without one records `unbounded-push` [15];
      - a blocked push carrying a credential in its URL leaves no part of
        the command in the file [19];
      - `git status` leaves the file absent [20];
      - with the state directory unwritable, a force-push still exits 2 with
        its reason on stderr [16].
      Also add a test that reads the guard's source and asserts no two
      `block(` call sites pass the same id [6]. All of these fail before 1.3.
      (Req: gate-ledger — Every gate refusal is recorded; Each prohibition has
      a stable id; Recording never changes a decision)
- [ ] 1.3 Write `bun/gate-ledger.ts`: the append, best-effort and silent,
      carrying a `ponytail:` comment that names rotation as the upgrade; and
      `block(id, reason)`, which records and exits 2. Move the guard onto
      it, with one id per prohibition. `bun test` must be green, and
      `bun/command-guard.ts` must end at or below its starting 299 lines
      (`bun/file-size.ts` caps `.ts` at 300).
- [ ] 1.4 Run the existing `bun/command-guard.test.ts` unchanged and confirm
      that every decision and every reason's text is the same as before. A
      changed exit code or message is a regression this change does not buy.

## 2. The turn gate's decisions, and the wrap-up line

- [ ] 2.1 Write the turn gate's cases in `bun/gate-ledger.test.ts`, using
      `bun/turn-gate.fixture.ts`:
      - a refusal records `turn-gate`, `refused`, `pre-pr-sequence` [4];
      - a refused turn continued to an end with gate lines records a refusal,
        then a pass [25];
      - a refused turn continued to an end with no gate lines again records a
        refusal, then a release, and no pass [23];
      - a turn that completed nothing leaves the file absent [21], and so
        does a turn with no mark [22];
      - a turn that commits, completes no group and prints a gate line
        records no pass [24];
      - with the ledger unwritable, a refusal still exits 2 with its
        reason [17].
      All of these fail before 2.2. (Req: gate-ledger — Every gate refusal is
      recorded; A refusal walked past is recorded; Recording never changes a
      decision)
- [ ] 2.2 In `bun/turn-gate.ts`, compute the completed groups before
      checking `reported`, then record `refused`, `passed` and `released` as
      design.md *The turn gate records only when a group completed* sets
      out. `bun test` must be green, with every existing turn-gate test
      unchanged and the file under the 300-line cap.
- [ ] 2.3 In `core/skills/session-wrapup/SKILL.md` step 5, add the `gates`
      line: this project's records since the previous yield entry's date,
      counted per gate, decision and id with `jq`. The line keeps the records
      whose project is `git rev-parse --show-toplevel` or a path under it, and
      reads `gates: none fired` when there are none.
      Run it once by hand against a ledger holding records for two projects
      and one record from a subdirectory of this project. Confirm that this
      project's records are counted, the subdirectory's record among them,
      and that no other project's are. (Req:
      gate-ledger — The wrap-up reports the gate decisions)
- [ ] 2.4 In the README, name the ledger's path in the *Consuming* section
      beside the hooks that write it. Grep for every other place that lists
      what the hooks do, and reconcile each one.
