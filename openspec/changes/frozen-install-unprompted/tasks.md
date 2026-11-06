# frozen-install-unprompted — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: <capability>/<slug>`
where a scenario names it. The `ask` entries and the command guard's checks
are not touched.

## 1. The script and its check

- [x] 1.1 Failing cases in `bun/settings.test.ts`, beside the
      `bunfig.toml: [install]` case: a consumer fixture whose `package.json`
      has no `scripts.deps`, and one whose `scripts.deps` is `pnpm install`,
      each fail naming `package.json` and `bun install --frozen-lockfile`
      (`harness-updates/the-check-reads-the-script`); the fixture
      `bun/settings.fixture.ts` builds a passing consumer with the script
- [x] 1.2 Then `DEPS = "bun install --frozen-lockfile"` exported from
      `bun/settings.ts`, and its check pushes
      `package.json: scripts.deps is not exactly "<DEPS>"` when the script
      is missing or differs; the header comment names `package.json` among
      the files read. Add `"scripts": { "deps": "bun install --frozen-lockfile" }`
      to the harness's own `package.json`. Verify `bun test bun/settings
      bun/self-pin` passes

## 2. Sync writes the script

- [x] 2.1 Failing cases in a new `bun/sync-settings-package.test.ts`, its
      name under the module's so the mutation step runs it
      (`sync-settings.test.ts` sits at the line cap): a `package.json` with
      no `scripts` and one with `scripts` but no `deps` gain
      `scripts.deps`, every other key and the indentation unchanged
      (`a-consumer-without-the-script`); one already holding it is left byte
      for byte (`a-consumer-that-already-holds-it`); one holding
      `pnpm install` makes `syncSettings` throw naming `pnpm install`, with
      `package.json`, `.claude/settings.json` and `bunfig.toml` unchanged
      (`a-consumer-s-own-deps-script`); and in `bun/sync-bunfig.test.ts`,
      `sync.ts` run over that `pnpm install` consumer exits non-zero with no
      `harness/` written
- [x] 2.2 Then a `packageText()` in `bun/sync-settings.ts` beside
      `bunfigText()`, joined to the writes `settingsWrites()` computes before
      any write; `sync.ts` calls it before it writes the rules copy, then
      `applyWrites()`; the header comment names `package.json`.
      Indentation is read as `settingsText()` reads it. Verify
      `bun test bun/sync-settings bun/sync` passes

- [x] 2.3 From the local review: a `package.json` with a trailing comma bun
      accepts gains the script and passes the check — sync and the check read
      it as JSONC, as bun does — and `settingsText()` and `packageText()`
      share one parse-and-name helper and one indentation reader

## 3. The guard reads the script

- [x] 3.1 In `bun/command-guard-deps.test.ts` (3.3's file;
      `bun/command-guard-interpreters.test.ts` sits at the line cap): a checkout whose
      committed `package.json` holds `deps: bun install --frozen-lockfile`
      lets `bun run deps` pass with no decision
      (`agent-permissions/the-script-runs-without-a-prompt`), and refuses it
      as `untracked-script` once `package.json` is edited
      (`agent-permissions/a-script-the-tree-does-not-vouch-for`). Both pass
      on today's guard; they pin it. Verify `bun test
      bun/command-guard-deps` passes
- [x] 3.2 `agent-permissions/a-literal-install-still-prompts` is Claude Code's
      behaviour over the unchanged `ask` list: cite it on the existing case
      *an ask entry dropped is named* in `bun/settings.test.ts`, its one
      dropped entry widened to `Bash(bun install *)`, `Bash(bun i *)` and
      `Bash(bun r *)`
- [x] 3.3 Failing cases in a new `bun/command-guard-deps.test.ts`, through
      `verdict()` as `bun/command-guard-bunx.test.ts` does:
      `bun run deps --no-verify`, `bun run deps --production`,
      `bun run deps lodash`, `bun run deps > package.json` and
      `bun run deps $(printf -- --no-verify)` and
      `bun run $(printf deps) --no-verify` each block as
      `{ code: 2, rule: "deps-args" }`, the stderr naming `bun run deps`
      (`agent-permissions/words-after-the-script-s-name`); `bun run deps` and
      `bun run test --watch` get no `deps-args` rule. Then `depsArgs(part,
      name, rest)` in `bun/command-guard-exec.ts` beside `bunxInstall`: `bun`
      then `run`, and either `deps` then any word, or `part` in `FED` whatever
      the script — the parse drops a substitution's output, the script's name
      included, from the words; redirections are passed over to find `run`,
      through `args()`, lifted from `command-guard-interpreters.ts` into
      `command-words.ts` — called and blocked
      from `check()` in
      `bun/command-guard.ts`; both header comments name it. Verify
      `bun test bun/command-guard` passes
- [x] 3.4 From the local review: `echo --no-verify | xargs bun run deps` and
      `BUN_OPTIONS=--no-verify bun run deps` block as `deps-args`
      (`agent-permissions/words-before-bun`), and so does
      `bun run --silent deps --no-verify`; `bun run test deps` does not. Then
      `depsArgs` finds `run` and the script's name past bun's options, and
      refuses a `bun run deps` whose command is not exactly those three
      words; a fed `bun run` names the substitution in its reason

## 4. The bootstrap and the notice

- [x] 4.1 Failing cases: in `bun/bootstrap.test.ts`, *before the install*
      lets `bun run deps` through beside today's three, and a blocked row's
      stderr names `bun run deps`
      (`cloud-sessions/the-local-policy-is-unchanged`); in
      `bun/bootstrap-notice.test.ts`, the stale-install and not-installed
      lines name `bun run deps`
      (`harness-updates/a-stale-install-is-named-at-session-start`)
- [x] 4.2 Then `bun/bootstrap.ts`: `BOOTSTRAP`'s test becomes
      `/^(bun (install|i)( --frozen-lockfile)?|bun run deps)$/` and its hint
      `run bun run deps first`; `NOTICE`'s two lines name `bun run deps`;
      the header comments follow. Carry both strings, JSON-escaped, into the
      two hook commands of `.claude/settings.json`, and confirm that file's
      diff touches only them. Verify `bun test bun/bootstrap bun/self-pin`
      passes

## 5. Docs

- [x] 5.1 `README.md`: the bootstrap paragraph (~78) and the clone setup
      (~141) name `bun run deps`; a sentence says a consumer whose `allow`
      lacks `Bash(bun run *)` may add `Bash(bun run deps)` for the default
      mode, and that sync adds the script and refuses a `deps` of its own

## 6. Integration

- [x] 6.1 `bunx --no-install openspec validate frozen-install-unprompted
      --strict` passes, and `bun test` passes whole
- [x] 6.2 In a fresh worktree, an agent's `bun run deps` installs with no
      prompt under auto mode, while `bun install --frozen-lockfile` still
      prompts; record both in the PR body
