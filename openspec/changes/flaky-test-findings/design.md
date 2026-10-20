# flaky-test-findings — design

## Context

See `proposal.md` for the motivation. The pieces this change builds on:

- **The loop guard** (`bun/loop-guard.ts`) already works the way this change
  needs. It is one fail-open script on `PostToolUseFailure`, with a
  per-session store in the OS temp directory. It answers through
  `additionalContext` and records through `bun/gate-ledger.ts`.
- **Hook registrations** are listed once, in `bun/bootstrap.ts` `HOOKS`.
  `bun/sync-settings.ts` writes them into a consumer's settings, and
  `bun/settings.ts` checks them. A hook with a matcher counts only in a group
  with that same matcher, and a hook that is not `sole` counts only with no
  `if`.
- **The `Bash(` entries of `permissions.ask`** are `bun/settings.ts` `ASK`.
  The check compares them whole and the sync writes them whole.
- **bun 1.4.2's reporter, when it is not writing to a terminal**, prints a
  `(fail) <describe> > <test> [<duration>]` line per failing test and no line
  per passing test. It ends with a ` <n> pass` / ` <n> fail` summary, and a
  passing run prints ` 0 fail` (probe, 2026-10-19).
- **The consumers run their suites in different ways**, read at their `main`
  on 2026-10-19:
  - `mellon` runs `bun run test`, which wraps `bun test --randomize
    --concurrent`. It also runs that script from its pre-commit hook, so a
    `git commit` runs the suite.
  - `dota2` runs `bun run test:coverage`, `bun test` and, from its pre-push
    hook, `bun test --pass-with-no-tests`.
  - The harness runs `bun test` directly and from `.githooks/pre-push`.

## Goals / Non-Goals

**Goals:**

- A flaky run is named to the agent at the moment it happens.
- It is counted where the wrap-up already counts gate decisions.
- The retry forms that would hide a flaky run are refused before they run or
  are committed.

**Non-Goals:**

- Telling a flaky test from one fixed by something outside the tree, such as a
  database that came up between the two runs. The hint names the test, and the
  agent says which it was.
- Catching a re-run narrowed to a file or a `-t` pattern. That run is a
  different command, and its output does not list what passed.
- Blocking anything. The user settled this on 2026-10-18.

## Decisions

### D1. Four groups, the rule first

The explore put the rule and the hook in one group. They split here so the
rule is a working stopgap with something to replace:

1. **The rule** in `core/testing.md`, on its own. It says it is a stopgap,
   and which group's mechanism removes each of its clauses.
2. **The hook**, with its cases and its measured cost, registered nowhere.
   It and its registration came to 859 lines in one pull request, over the
   800-line diff budget, so the script lands first and runs in no session.
3. **The hook's registration.** It removes the rule's "report it by name and
   file a card" clause, because the hint, which now reaches every session,
   carries that request. The clause that remains is "name a cause before
   re-running a failed run", which no hook can check.
4. **The retry refusals and the `gh run` ask entries.** This group removes
   the rule's "configure no retry" clause, which is then mechanised
   (agent-rulebook, *A mechanised prohibition leaves its prose home*).

A rule that landed in the same pull request as the hook would never stand
alone, so it would be no stopgap.

### D2. A hint and a record, never a block

The flake watch answers through `additionalContext` and exits 0. It appends a
`flaky` record to the gate ledger. This is the user's decision of 2026-10-18.

The record is:

- **gate** `flake-watch`;
- **decision** `flaky`;
- **rule** `fail-then-pass`;
- **commit** the `HEAD` the tree was read at.

The commit is allowed by *A record holds no command text*, which lets a gate
that reads a commit add it. Test names, the command and the output never
reach the ledger, since its counts are copied into a public tree. The names
go to the agent only.

### D3. Registered on `Bash` with no `if`

The explore proposed `if: "Bash(bun test *)"`, plus `git push *`, and flagged
as unverified whether that pattern matches a bare `bun test`. Measuring the
consumers settles the registration without that answer:

- `mellon` runs its suite as `bun run test`, and also through `git commit`.
- `dota2` runs its suite as `bun run test:coverage`.

An `if` that lists commands misses each such wrapper, and new ones would come
with every consumer's scripts. A list of covered commands is the scoping
`core/rules.md` forbids for a scan. A permission pattern also matches the
command word literally, which is the reason `bun/command-guard.ts` records
for running without one.

So the watch is registered on `PostToolUse` and `PostToolUseFailure` with
matcher `Bash` and no `if`. It decides from the output (D4). The pin test
asserts the event, the matcher, the absence of `if`, the type, the command,
and the absence of `async`, `asyncRewake`, `args` and `shell`. `settings.ts`
already reads all of these for a hook that is not `sole`. The
`bun test *`-matches-bare question is no longer asked, since nothing rests on
it.

Alternative rejected: a separate registration for each wrapper, each with its
own `if`. It is longer and still incomplete.

**Cost:** one bun start per Bash call, on whichever post-call event fires. The
command guard measured 10.7–11.0 ms for that on 2026-10-13. Group 2 measures
the watch's own cost on a call that is not a test run, and records it in the
script's header as the guard does.

### D4. The outcome is read from the output

| Output | Outcome |
| --- | --- |
| a `(fail) ` line, or a summary line `<n> fail` with n > 0 | failing |
| a summary line `0 fail`, a summary line `<n> pass` with n > 0, and no `(fail) ` line | passing |
| neither, or `0 pass` and `0 fail` (every test skipped) | not a test run |

The rule is the same on both events, whatever the exit code. A piped
`bun test | tail` exits 0 while failing, and a `git push` fails while its
suite is only one of its steps.

- Names are the text of each `(fail) ` line with the trailing
  `[<duration>]` removed.
- On `PostToolUseFailure` the output is `error`. On `PostToolUse` it is
  `tool_response`'s `stdout` and `stderr`.
- Group 2's user probe confirms both fields against real events before any
  code depends on them.
- A test spawns a real failing bun test once and pins the reporter's format
  against the installed binary. A bun that changes the format fails that test,
  where it would otherwise make the watch silently blind.

### D5. The key and the tree

**An entry is keyed by:**

- the session id, and the sub-agent id when there is one, as the loop guard
  keys its count;
- the event's `cwd`;
- the exact command string.

**The tree is fingerprinted from** `cwd`'s:

- `HEAD`;
- `git diff HEAD --binary`;
- the paths and blob hashes of its untracked files that are not ignored.

The explore named `git diff HEAD` alone. The untracked part is added because
the commonest TDD loop writes a new, untracked test file, fails it, then edits
the file until it passes. A fingerprint blind to untracked files would call
every such pass flaky.

Ignored files, such as `.env` or a local database, are left out. A change to
one reads as no change, which is the false-positive side. The hint's wording
leaves room for it: "if something outside the tree changed, say so".

The git calls run only when they can matter:

- on a failing run;
- on a passing run whose command already has an entry.

Every other Bash call costs one JSON parse and one file read.

### D6. The store

The store is one JSON file per session (and sub-agent) under
`$TMPDIR/flake-watch/`. It is written beside the final file and renamed into
place, as the loop guard writes its count. For each hashed key it holds the
tree fingerprint and the failing names seen on that tree.

- **A failing run on the same tree** adds its names to the entry.
- **A failing run on a new tree** replaces the entry.
- **A passing run on the same tree** gives the hint, writes the record, and
  deletes the entry.
- **A passing run on another tree** deletes the entry silently.

Two calls writing at once can lose one of the two writes, as the loop guard's
count can. A lost write drops a name from the hint, or drops the entry so
that no hint is given. That is the silent side: no lock is taken, and no
false finding comes of it.

Test names are held here, unlike the loop guard's hashes-only count, because
the passing run's output does not list them. The file is private (`0600`),
sits outside every tree, and the OS clears it.

### D7. The hint

The hint reads: "flake-watch: this run passed on the tree where the same
command failed: <names>. That is a flaky test, not a green run. Report it as
a `flaky` finding naming these tests, and file a card for it on the project's
board. If something outside the tree changed between the runs, say what."

When no names were in the output, `<names>` reads "(the failing names were
not in the output)".

### D8. `gh run` writes go to `ask`, not to the guard

The user chose `ask` on 2026-10-18. The guard's `GH_WRITES`
(`bun/command-guard-gh.ts`) refuses outright, and `settings.ts`'s
`GH_WRITES` feeds `deny`. Neither is the right list.

`ASK` gains, for each of `rerun`, `cancel` and `delete`, two entries:

- `Bash(gh run <sub> *)`;
- `Bash(gh run * <sub> *)`, for the form with a flag first
  (`gh run -R o/r rerun 1`).

Their place is after the manifest entries. Claude Code evaluates `ask` before
`allow`, as agent-permissions' *Every manifest-mutating invocation prompts,
whatever else allows it* already relies on. So the consumers' own
`Bash(gh run *)` allow entries, present in both `dota2` and `mellon`, need no
edit. A bare `Bash(gh run <sub> *)` matching the subcommand with no arguments
rests on the same behaviour as `Bash(bun i *)` matching a bare `bun i`, which
that requirement's scenarios already state. Group 4's user act confirms both
forms in a live session.

The API spelling, `gh api -X POST …/runs/<id>/rerun`, is already refused by
the guard's `gh api` write check.

`bunForms` in `settings.ts` reads only `Bash(bun …` entries, so the `gh`
entries pass through it untouched.

### D9. The guard reads `--retry` from a bun invocation

A check beside `bunxInstall` in `bun/command-guard-exec.ts` finds bun's
subcommand the way that function finds `x`. Two cases refuse, under the ledger
id `bun-test-retry`:

- when the subcommand is `test`, any later word that is `--retry` or starts
  `--retry=`;
- when the subcommand is `run`, the same in any later word, before the
  script name or after it.

The guard cannot read what a script runs, so a forwarded `--retry` refuses
whatever the script is. The same holds for a `--retry` that is only the value
of another flag (`bun test -t --retry`). Refusing on uncertainty is the
direction the guard already errs in.

The guard does not refuse:

- `--rerun-each`;
- Playwright's `--retries`, which is a different word.

### D10. The check is scoped by content

Three checks join `harness:check`:

- **Every tracked `bunfig.toml`, at any depth.** bun reads the one in the
  directory a run starts in, and `mellon`'s `email-service/` runs its own
  `bun test`. Each file is parsed with `Bun.TOML`, and `test.retry` being
  present is a problem.
- **Every tracked JS or TS source whose code imports `bun:test`, or whose
  name `bun test` discovers as a test file** (`*.test.*`, `*_test.*`,
  `*.spec.*`, `*_spec.*`): there `test`, `describe` and the hooks are globals
  and need no import (CodeRabbit on #170). The import is read from the
  source as `bun/scan.ts`'s `blank` leaves it, so the text of strings and
  comments is excluded. In the same blanked source, a
  property key `retry` (written `retry:` or as the shorthand `{ retry }`) is
  a problem only in an object literal that is itself an argument of a call
  to `test`, `it`, `describe` or a hook, with any chain of member accesses
  and calls between the name and the call. bun 1.4.2 has more than a dozen
  modifiers (`.each(…)`, `.if(…)`, `.skipIf(…)`, `.concurrent`, `.failing`
  among them, probe 2026-10-19), so the walk follows any chain rather than a
  list that a bun release would outdate. The walk tracks
  the bracket position from the call's `(` rather than counting depth
  (`core/rules.md`). A `retry` key in a fixture handed to the code under test
  is not a problem: `dota2`'s retry-policy tests are where one would come
  from.
- **Every command the tree holds**, read with the guard's own
  `command-parse.ts` and D9's check. That covers:
  - each `scripts` and `simple-git-hooks` value of every tracked
    `package.json`;
  - each `run:` of every tracked workflow;
  - every tracked file under `.githooks/`.

  A `--retry` inside a script passes the guard, which sees only
  `bun run test`. `mellon`'s pre-commit and pre-push live in
  `simple-git-hooks`, not in `scripts`.

The scope is decided by what a file holds, never by a list of test-file
names. Measured at `main` on 2026-10-19, none of the checks finds anything in
the harness, `dota2` or `mellon`.

## Risks / Trade-offs

- **[Risk] The agent re-runs with a different pipe** (`bun test` failed,
  `bun test 2>&1 | tail` passed), so the watch misses it. → The rule's
  remaining clause asks for a named cause before a re-run. The keying is
  conservative on purpose (Non-Goals). A `shortcut:` comment names
  normalising the command as the upgrade.
- **[Risk] bun changes its reporter.** → The format test in D4 fails at the
  bun bump.
- **[Risk] A false `flaky`** after a change to an ignored file or to an
  external service. → The hint asks the agent to say so. The ledger count is
  read beside the wrap-up's notes.
- **[Risk] Two sessions share a tree.** One session's edit changes the tree
  the other's re-run reads, so the second session says nothing. → That is the
  silent side. No false finding comes of it.
- **[Trade-off] One more bun start per Bash call.** → It is measured in
  group 2 and recorded in the header.

## Migration Plan

Consumers get the hooks and the ask entries from the sync at their next pin
bump, and nothing in their trees needs an edit (Impact, `proposal.md`). To
roll back, revert the group's pull request; the next sync removes the
registrations, since they carry the harness's mark.
