# flaky-test-findings

## Why

A test that fails and then passes on the same tree is a flaky test, and a
suite retried until it is green stops being trusted: every red run becomes "did
I break it, or did it blink again?". An agent is the worst case, because it
re-runs a failed suite without complaint and reports the second run as green.
The harness holds nothing against that today:

- `core/testing.md` and `core/rules.md` say nothing about flaky tests.
- bun 1.4.2 can retry a test from `--retry=<n>`, a test's `{ retry: N }` option
  or `[test] retry` in `bunfig.toml`. With a retry on, the flake is invisible:
  there is no `(fail)` line, the run exits 0, and the JUnit report does not mark
  the retry (probe, 2026-10-18).
- `Bash(bun test *)` is allowed, so `bun test --retry=3` runs without a prompt.
- `Bash(gh run *)` is allowed, which covers `gh run rerun`, `gh run cancel` and
  `gh run delete`.
- When the agent re-runs a failed suite and it passes, the failing test's name
  is lost. The card for the flaky load test lists three such runs on
  2026-10-18, none of them named.

## What Changes

- **A stopgap rule** in `core/testing.md` covers the gap until the mechanism
  below lands, and says so. A test that failed and then passed on an unchanged
  tree is a `flaky` finding, reported by name with a card filed for it. A failed
  run is not re-run unchanged until a cause is named, and no retry is
  configured. The step that ships each mechanism removes the clause it now
  holds.
- **A new hook, `bun/flake-watch.ts`**, runs on `PostToolUse` and
  `PostToolUseFailure` for Bash. It reads bun's test reporter in the call's
  output. When a run fails and the same command then passes on the same tree
  (same session, same `HEAD`, same uncommitted changes), the hook does two
  things. It names the tests to the agent through `additionalContext`, and it
  appends a `flaky` record to the gate ledger. It never blocks the turn, and it
  fails open. Consumers receive its registration through the existing settings
  sync. A test pins the registration on every field that decides whether the
  hook runs, `if` included.
- **The command guard** refuses `bun test --retry` in every spelling, and a
  `--retry` passed through `bun run <script>`. `--rerun-each`, which finds
  flakes rather than hiding them, stays allowed.
- **`harness:check`** refuses `retry` under `[test]` in any tracked
  `bunfig.toml`, and a `retry` option in any tracked source that imports
  `bun:test`.
- **`gh run rerun`, `gh run cancel` and `gh run delete`** move to `ask`,
  including the forms with a flag before the subcommand. They join the `Bash(`
  ask list that the policy check compares and the sync writes, so every
  consumer gets them with its next pin bump.

The whole change measured over the diff budget's failing threshold, so the
plan, `design.md` and `tasks.md`, follows on `spec/flaky-test-findings-plan`
once this merges.

Out of scope, each held by its own card:

- Flakes in CI (`run_attempt` > 1 on one `head_sha`) wait for the card on the
  "a CI run finished" flow.
- Consumers' Playwright `retries` belong on their own boards; `mellon` is the
  consumer that sets them.
- Fixing the flaky load test itself is its own card.

## User acts

The change cannot finish without these, and only the user can do them:

- **Before the watch's code: run the event probe.** No session runs `claude`
  itself, as with the loop guard's R4. The probe answers three questions:
  - Does a failing `bun test` call reach `PostToolUseFailure` with bun's
    `(fail)` lines in `error`?
  - Does a passing run reach `PostToolUse` with bun's summary in
    `tool_response`?
  - Does the same hold for a `git push` whose pre-push hook runs the suite?
  The answers go in the watch's pull request.
- **Before the `gh run` entries merge: confirm two forms prompt in a live
  session.**
  `gh run -R o/r rerun 1` must prompt under `Bash(gh run * rerun *)` while
  `Bash(gh run *)` is allowed. Bare `gh run rerun` must prompt under
  `Bash(gh run rerun *)`.

## Capabilities

### New Capabilities

- `flaky-tests`: how a flaky test is noticed, named and recorded, and how a
  retry that would hide one is refused.

### Modified Capabilities

- `gate-ledger`: the ledger also records a finding from `flake-watch`, a gate
  that refuses nothing.
- `agent-permissions`: the `gh run` subcommands that re-run, cancel or delete a
  CI run prompt.

## Impact

- New: `bun/flake-watch.ts` and its tests, and a check module for configured
  retries with its tests.
- Changed:
  - `bun/bootstrap.ts` (`HOOKS`);
  - `bun/settings.ts` (`ASK`);
  - `bun/command-guard.ts` and `bun/command-guard-exec.ts`;
  - `bun/check.ts`;
  - the tracked `.claude/settings.json`;
  - `core/testing.md`.
- Consumers: at their next pin bump, the sync writes the two new hook
  registrations and the new ask entries. Neither consumer's tree trips the
  new check. At their `main` on 2026-10-19:
  - `dota2` and `mellon` have no `[test] retry` in a `bunfig.toml`;
  - neither has a `retry` key in a file importing `bun:test`;
  - neither passes `--retry` in a script.
- The settings sync writes the hooks for every consumer. Each Bash call pays
  one more bun start on its post-call event: the command guard measured
  10.7–11.0 ms per call on 2026-10-13.
