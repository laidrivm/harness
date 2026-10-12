# self-pinned-gates — tasks

One group, so one pull request on `feat/self-pinned-gates`. The numbers in
brackets are the proposal-stage `/zombies` ideas each task closes. Each test
cites the scenario it closes in a `// spec: harness-updates/<slug>` comment.

## 1. The harness runs its own gates from its pin

- [ ] 1.1 Before any install, add `node_modules` to `.gitignore`, with no
      trailing slash. Verify: `git check-ignore node_modules` prints it.
- [ ] 1.2 Write the tests first, in a new `bun/self-pin.test.ts` reading the
      tracked files: each `HOOKS` entry's command is registered in
      `.claude/settings.json` under its event and, where it has one, its
      matcher, and a missing one is named [1]; no hook command anywhere in
      that file contains `$CLAUDE_PROJECT_DIR/bun/` [2]; `package.json` pins
      the harness under `devDependencies` as `github:laidrivm/harness#<40-hex>`
      and names no `dependencies.harness` [3]. All fail before 1.4. Delete the
      *registrations in this repository's settings* block from
      `bun/turn-gate-cli.test.ts`, which pins the working-tree text. (Req:
      harness-updates — The harness's own sessions run its gates from its
      pin, §*A registration is missing from the harness's settings*, §*A hook
      runs a working-tree script*)
- [ ] 1.3 Write the notice tests in `bun/bootstrap-notice.test.ts`: a pin
      only under `devDependencies`, with an install from another commit,
      prints the line [5]; a pin under both, at different commits, is
      compared from `dependencies` [6]; a `devDependencies.harness` that is
      not `#<40-hex>` prints nothing [7]. The first fails before 1.5. (Req:
      harness-updates — The harness's own sessions run its gates from its
      pin, §*The notice reads a development-dependency pin*, §*A runtime pin
      is preferred*)
- [ ] 1.4 Pin the harness: add `devDependencies.harness` at the newest `main`
      commit whose `test` run passed, run `bun install` (it asks), confirm
      `bun.lock`'s workspace block names `harness` once, and replace the
      `hooks` block of `.claude/settings.json` with the `HOOKS` texts. If
      `notion-update-guard` has merged, its registration takes its `HOOKS`
      form too. Verify: 1.2's tests pass; `bun test` green; `bun.lock` and
      `package.json` staged together.
- [ ] 1.5 In `bun/bootstrap.ts`, make `NOTICE` read
      `dependencies?.harness ?? devDependencies?.harness`, and write the new
      text into the `SessionStart` entry of `.claude/settings.json` in the
      same commit. The notice is inline text the settings run, not a script
      in the package, so it takes effect without moving the pin. Verify: 1.3's
      tests pass, 1.2's still do, and `bun/sync-settings.test.ts` passes
      unchanged.
- [ ] 1.6 Docs: `README.md`'s *Working on the harness* says a clone runs
      `bun install` before any other command, that the sessions run the gates
      from the pin, and how the pin moves (design.md *The pin moves by hand*);
      the comments in `.github/workflows/test.yml` and `diff-budget.yml` that
      give "the package declares no dependencies" as the reason for not
      installing say the job needs no install instead. Grep
      `README.md`, `core/` and `openspec/specs/` for "runs itself", "own
      working tree" and "no dependencies", and fix each site this change makes
      false.
- [ ] 1.7 By hand, in a scratch copy with the pin installed and recorded in
      the pull request: replace the working tree's `bun/command-guard.ts` with
      `process.exit(0)` and feed the registered bootstrap a `git commit` on
      `main` — still refused, exit 2 [4]; run the registered `SessionStart`
      text with the install at another commit than the pin — it prints the
      line naming both; install the branch's harness into a
      scratch consumer through a git URL — one package, no nested
      `node_modules/harness` (§*A gate edited in the working tree does not
      hold the session*, §*A consumer installs one copy of the harness*).
