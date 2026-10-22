# interpreter-prompt — tasks

Two task groups: the prompt (group 1, shipped in #222), then the block that
replaced it once task 1.7 measured the prompt (group 2).

The `agent-permissions` delta adds one requirement and modifies none. It
qualifies *The git prohibitions are enforced by a hook* from beside it, whose
scenarios describe the git and `gh` checks this change leaves alone. Task 1.6
asserts they still hold.
Numbers in brackets refer to the proposal-stage `/zombies` list in the PR.

## 1. An interpreter given unread program text prompts

Closes every scenario of `agent-permissions` §*An interpreter given program
text the guard cannot read prompts* but
`a-local-allow-entry-does-not-grant-it`, which task 1.7 measures, and both of
`gate-ledger` §*A prompt a guard asks for is recorded*.

- [x] 1.1 Write the failing cases first in a new
      `bun/command-guard-interpreters.test.ts`, driven through
      `command-guard.fixture.ts`, and record that each fails against the guard
      as it stands. Cover inline code in every listed spelling, wrapped forms,
      a non-shell interpreter reading standard input (`python3`, `node -`,
      `bun -`), throwaway files, a tracked script with a staged or uncommitted
      edit, a file under `node_modules/` outside `harness/`, a tracked or
      `node_modules/harness/` symlink to a throwaway file, `source`,
      and the bun subcommands that run code. Each exits 0, and its whole
      stdout parses as one object with `hookEventName` `PreToolUse`,
      `permissionDecision` `ask` and a reason naming the interpreter [1, 3, 7,
      9, 10, 14, 15, 16, 21]
- [x] 1.2 Write the controls in the same file, which must pass both before and
      after: a clean tracked script, a file under the repository's top-level
      `node_modules/harness/`, the long version and help queries, `bash -c "echo hi"`,
      `bun test` and `bun run <script of a tracked, unedited package.json>`;
      beside them, as cases that must ask, `bun run check` with an edited or
      untracked `package.json`, and with a script whose command line runs an
      untracked file (PR #100 review). Each control has empty stdout and exit
      0. Assert at the module level that `bun x tool` and a bare `sh` reading a
      pipe get no reason from this check. Those two belong to the `bunx` check
      and the shell-stdin check [2, 4, 11, 12, 13, 14, 15, 22]
- [x] 1.3 Add `bun/command-guard-interpreters.ts`. It is given an invocation
      and the guard's `dirs`, and returns an `{ id, reason }` or nothing. It
      holds the interpreter names, the `bun` subcommand constant read from
      bun 1.4.2's `--help`, and the committed-or-installed test on the file's
      `realpath`, through `git ls-files --error-unmatch`, `git diff --quiet
      HEAD --` and `git rev-parse --show-toplevel`. Uncertainty answers `ask`:
      a `null` place, a `$` in the path, a link that does not resolve, a git
      call that fails, a directory outside any work tree [8, 18, 19, 20].
      Verify with 1.1 and 1.2
- [x] 1.4 In `bun/command-guard.ts`, call the module for each invocation that
      the shell `-c` and `eval` branches did not consume, and collect the
      results. After `check(command)`, if any were collected, write one JSON
      object, record one ledger line (`decision` `ask`, the first id) and exit
      0. Update the header comment: name the third outcome, and say who pays
      for git reads. Verify with the many-asks case (one object, one record)
      and the block-wins case `python3 -c 1; git commit` on `main`, which
      exits 2 with no `ask` [5, 6]
- [x] 1.5 Pin the `bun` subcommand constant against the installed `bun --help`
      in both directions, as `bun/settings.ts` pins the manifest-writing forms.
      Verify by deleting one entry and seeing the test fail [17]
- [x] 1.6 Run `bun test`. Every existing guard case still passes unedited,
      which is the control for the scenarios of the hook requirement this
      change qualifies
- [x] 1.7 Measure whether a local `allow` grant silences the hook's `ask`:
      with `Bash(python3 *)` in `.claude/settings.local.json`, run `python3
      -c "print(1)"` in an attended session and refuse the prompt. This needs
      the user, so in an unattended run it goes to the card (unattended:
      card — hand the measurement on). Record the result and the Claude Code
      version in the pull request. If no prompt appears, stop and put the
      exit-2 fallback to the user. No test can cite this scenario, so it
      counts against the spec-coverage floor once the change is archived.
      Measured by the user (2026-10-22, card): no prompt appeared and the
      command ran, so a local `allow` silences the hook's `ask`. Claude Code
      2.1.308 (installed on the measuring machine that day). The user agreed
      to the exit-2 fallback; group 2 switches to it
- [x] 1.8 Propose a rewording of the last Safety rule in `core/rules.md`.
      Its reason clause stops being true once this ships. Hand the wording on
      through fix & capture rather than editing the rule
      (unattended: card — hand the wording on)

## 2. The guard blocks what it asked about

Task 1.7 found that a local `allow` silences the hook's `ask`; the user agreed
to the exit-2 fallback (card, 2026-10-22). See design *Ask, not block*.

- [x] 2.1 Rewrite the `agent-permissions` delta requirement and its scenarios
      from "prompts" to "is refused": the guard exits 2, writes the reasons on
      stderr and records `block`. Replace *A local allow entry does not grant
      it* with a scenario a test can cite: the same line is refused with a
      local `allow` present, since the hook decides before any rule. Update
      `gate-ledger` §*A prompt a guard asks for is recorded* to match
- [x] 2.2 Turn the 1.1 cases from "exits 0 with one `ask` object" into
      "exits 2, stdout empty, stderr names the interpreter and the
      tracked-script route", and record that each fails before 2.3. Keep the
      1.2 controls unchanged, and the block-wins case.
      Before 2.3, 51 of the file's 66 cases failed: every refusal case, the
      two-reasons and record cases, and the new local-allow and unattended
      cases. Ten cases in `command-guard-exec.test.ts` and
      `command-guard-bunx.test.ts` had passed on the `ask`'s exit 0 while
      running an untracked script; the exec ones now run in a checkout that
      tracks their scripts, and the three bunx ones assert only that the
      `bunx` check is not the refusal
- [x] 2.3 In `bun/command-guard.ts`, emit the collected reasons through
      `blocker()` from `bun/gate-ledger.ts` once the line is read, in place
      of the `ask` object (around lines 288–297). Update the header comment's
      third outcome. Verify with 2.2
- [x] 2.4 Unattended passes: a block refuses at once under every permission
      mode, so the stall the card's 2026-10-22 task names is gone. Add one
      case that runs the guard as a pass session would (no terminal attached)
      and asserts exit 2 within the hook's own run, then close that card item
- [x] 2.5 Re-propose the 1.8 wording for the last Safety rule in
      `core/rules.md`, since "a prompt can be approved" is no longer its
      reason (unattended: card — hand the wording on). Proposed in the pull
      request; the rule is edited once the user approves the wording
