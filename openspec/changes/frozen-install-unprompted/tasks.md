# frozen-install-unprompted — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: <capability>/<slug>`
where a scenario names it. The guard lands before the `ask` entries leave
(groups 1 then 2), so no commit of the branch carries the policy without the
check. The harness's own hooks run from its pin, so its sessions get the
check only at the self-pin bump after merge (`design.md`, *Risks*).

## 1. The guard refuses every install but the frozen form

- [ ] 1.1 `X+=1` is an assignment: a failing case in
      `bun/command-guard.test.ts`, through `run()` on a checkout on `main` as
      its main-commit cases do: `GIT_X+=1 git commit -m x` blocks as
      `main-commit` (no test calls `invocations()` directly, so the guard's
      verdict is the observable). Then `NOT_A_NAME` in `bun/command-words.ts` takes
      `[A-Za-z_][A-Za-z0-9_]*\+?=`, its comment naming the appending form and
      that dash, which has none, fails on it. Verify `bun test bun/command`
      passes
- [ ] 1.2 Lift the walk that finds bun's subcommand — today written twice,
      in `bunxInstall` (for `x`) and `bunTestRetry` (for `test`/`run`) in
      `bun/command-guard-exec.ts` — into one helper taking the verbs sought,
      and switch both callers to it in the same commit (`core/rules.md`,
      *Write logic a second time only by lifting it*). Verify
      `bun test bun/command-guard-bunx bun/command-guard-retry` passes
      unchanged
- [ ] 1.3 Failing cases in a new `bun/command-guard-install.test.ts`, through
      `verdict()` from `bun/command-guard.fixture.ts` as
      `bun/command-guard-bunx.test.ts` does; each refusal asserts
      `{ code: 2, rule: "bun-install" }`: `bun install` and `bun i`, the
      stderr naming `bun install --frozen-lockfile` and `terminal`
      (`a-bare-install`, with a comment that exit 2 blocks whatever a
      permission entry allows, for
      `a-local-allow-entry-does-not-reopen-the-bare-install`);
      `bun install lodash`, `bun i foo`
      (`an-install-that-names-a-package`);
      `bun install --frozen-lockfile --production`,
      `bun install --frozen-lockfile=false`,
      `bun install --frozen-lockfile > package.json`
      (`another-word-beside-the-flag`);
      `bun --cwd ../x install --frozen-lockfile`
      (`an-option-before-the-subcommand`);
      `timeout 600 bun install --frozen-lockfile`,
      `env -C /tmp/x bun i --frozen-lockfile`,
      `echo --config=x.toml | xargs bun i --frozen-lockfile`,
      `>package.json bun install --frozen-lockfile` (`something-before-bun`);
      `CI=1 …`, `BUN_CONFIG_SKIP_LOAD_LOCKFILE=1 …`,
      `BUN_CONFIG_SKIP_LOAD_LOCKFILE+=1 …` and
      `env BUN_CONFIG_REGISTRY=https://x.test bun i --frozen-lockfile`
      (`a-variable-assigned-before-bun`); `X+=1 bun install`
      (`an-appending-assignment-is-not-the-command`);
      `bun install --frozen-lockfile; bun install`, `bash -c "bun install"`,
      `X=1 bash -c "bun install --frozen-lockfile"`,
      `eval bun i --frozen-lockfile` and
      `bun install --frozen-lockfile$(printf ' --production')`
      (`each-command-of-a-compound-line-is-judged-alone`). Each fails on
      today's guard, which allows them all
- [ ] 1.4 In the same file, cases that must exit 0:
      `bun install --frozen-lockfile`, `bun i --frozen-lockfile`
      (`the-frozen-form-runs-without-a-prompt`), `bun  i --frozen-lockfile`,
      `bun "install" --frozen-lockfile`, `~/.bun/bin/bun i --frozen-lockfile`
      (`the-frozen-form-however-it-is-quoted-spaced-or-reached`),
      `bun install --frozen-lockfile && bun test`
      (`each-command-of-a-compound-line-is-judged-alone`); and `bun add preact`,
      `bun run install`, `bun pm ls` get no `bun-install` rule
      (`another-package-command-is-not-refused-by-this-check`)
- [ ] 1.5 Then `bunInstall(part, name, rest)` in
      `bun/command-guard-exec.ts`, beside `bunxInstall`: `undefined` unless
      `name` is `bun` and the subcommand, found by the 1.2 helper, is
      `install` or `i`; `undefined` when `part` is exactly
      `[<bun word>, "install" | "i", "--frozen-lockfile"]`, the bun word
      first, `part` not in `FED`, and the line not a shell's or `eval`'s
      program (`check()` passes that down); otherwise the reason in `design.md` decision 6. `check()` in `bun/command-guard.ts` calls it beside
      `bunxInstall` and blocks under `bun-install`; the header comment of each
      file names the new prohibition, and the guard's header that a local
      `allow` silencing a hook's `ask` is why this one blocks. Verify
      `bun test bun/command-guard-install.test.ts` passes
- [ ] 1.6 `bun/command-guard-interpreters.test.ts`: the `"bun install"` row of
      *gets no decision* becomes `"bun install --frozen-lockfile"`, since the
      whole guard now refuses the bare form. Verify `bun test
      bun/command-guard` passes

## 2. The install family leaves `ask`; the frozen form enters `allow`

- [ ] 2.1 Failing cases: in `bun/settings.test.ts` (or
      `bun/settings-gh-run.test.ts`, whose `matches()` helper reads an entry
      as Claude Code does), no `ASK` entry matches `bun install`,
      `bun i --frozen-lockfile` or `bun install lodash`, and some entry matches
      `bun add preact` and `bun remove preact`
      (`the-install-command-carries-no-ask-entry`); in
      `bun/sync-settings.test.ts`, a consumer whose `permissions.ask` carries
      `Bash(bun install *)` and `Bash(bun i *)` has neither after sync
- [ ] 2.2 Then drop `"bun install"` and `"bun i"` from `MANIFEST_WRITES` in
      `bun/settings.ts`, and the comment above it says the install command is
      the guard's (`agent-permissions`' *An install runs only in its frozen
      form*); drop the two entries from `bun/settings.fixture.ts`' `policy()`
      and from `.claude/settings.json`'s `permissions.ask`
- [ ] 2.3 Add `Bash(bun install --frozen-lockfile)` and
      `Bash(bun i --frozen-lockfile)` to `.claude/settings.json`'s
      `permissions.allow` (`design.md` decision 5)
- [ ] 2.4 `bun/settings-local.test.ts` case [12]: the made-up input becomes
      `ask: ["Bash(bun add *)"]` against a local `Bash(bun add:*)`, and the
      expected line `decided: Bash(bun add:*) — ask holds Bash(bun add *)`
      (`an-entry-the-tracked-file-already-decides`)
- [ ] 2.5 Verify `bun test bun/settings bun/sync-settings bun/self-pin`
      passes — `bun/self-pin.test.ts` compares the harness's own
      `.claude/settings.json` with the policy

## 3. The bootstrap and the notice name the frozen form

- [ ] 3.1 Failing cases in `bun/bootstrap.test.ts`: *before the install*
      lets through only `bun install --frozen-lockfile` and
      `bun i --frozen-lockfile`; `bun install` and `bun i` join the blocked
      rows, and every blocked row's stderr contains
      `bun install --frozen-lockfile`
      (`cloud-sessions/the-agent-s-own-install-before-the-harness-is-installed`).
      In `bun/bootstrap-notice.test.ts`
      the stale-install and not-installed cases expect
      `bun install --frozen-lockfile`
      (`harness-updates/a-stale-install-is-named-at-session-start`,
      `no-harness-installed`)
- [ ] 3.2 Then `bun/bootstrap.ts`: `BOOTSTRAP`'s test becomes
      `/^bun (install|i) --frozen-lockfile$/` and its hint
      `run bun install --frozen-lockfile first`; `NOTICE`'s two lines name
      `bun install --frozen-lockfile`; the header comments over both follow,
      the one over `NOTICE` no longer citing an `ask` entry as what stops the
      agent's install. Carry the same two strings into the bootstrap and
      `SessionStart` hook commands of `.claude/settings.json` (the JSON
      escaping of `BOOTSTRAP`'s and `NOTICE`'s text), confirm this task's
      diff of that file, against the commit that closed group 2, touches only
      those two commands, and verify
      `bun test bun/self-pin` passes, which compares them character for
      character
- [ ] 3.3 `bun/board-loop-clone.ts`'s refusal for a missing pinned check
      names `bun install --frozen-lockfile`, and
      `bun/board-loop-stage.test.ts`'s assertion follows; the comment in
      `bun/board-loop.ts` says the loop installs before any session because
      a session cannot be relied on to, not because of an `ask` entry
- [ ] 3.4 Verify `bun test bun/bootstrap bun/board-loop` passes

## 4. Docs

- [ ] 4.1 `README.md`: step 1 (line ~14) and the manual pin move (~133) say
      the user runs `bun install` in their own terminal, since both rewrite
      `bun.lock`; the bootstrap paragraph (~78) says the bootstrap lets only
      `bun install --frozen-lockfile` through; the clone setup (~132) names
      `bun install --frozen-lockfile`; a sentence says a consumer may add the
      two `allow` entries of task 2.3 to skip the prompt in the default mode
- [ ] 4.2 `core/git-and-prs.md` (~217): the re-pin step says the user runs
      `bun install` in their terminal; `orchestrator/README.md` (~121) names
      `bun install --frozen-lockfile`
- [ ] 4.3 `git grep -nE "bun (install|i)([^a-z-]|$)" -- ':!openspec/changes'`
      lists no text telling the agent to run a non-frozen install

## 5. Integration

- [ ] 5.1 `bunx --no-install openspec validate frozen-install-unprompted
      --strict` passes, and `bun test` passes whole
- [ ] 5.2 In a fresh worktree of the branch with the pin moved to a commit
      holding this change, an agent's `bun install --frozen-lockfile` runs
      with no prompt and a bare `bun install` is refused naming the frozen
      form; record both in the PR body. If the pin cannot move before merge,
      record that this check waits for the pin bump and file it on the card
