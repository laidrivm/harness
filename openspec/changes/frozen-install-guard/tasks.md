# frozen-install-guard — tasks

One pull request. The failing cases come first, their failure seen before the
code changes, each cited as `// spec: agent-permissions/<slug>` where a
scenario names it. The `ask` entries, the bootstrap and the settings text are
not touched.

## 1. The refusal

- [ ] 1.1 Failing cases in `bun/command-guard-deps.test.ts`, through
      `verdict()` as its `deps-args` cases do: `bun install --frozen-lockfile`,
      `bun i --frozen-lockfile`, `bun install --frozen-lockfile --ignore-scripts`,
      `bun install --frozen-lockfile 2>&1` and
      `bun --cwd sub install --frozen-lockfile` each block as
      `{ code: 2, rule: "frozen-install" }`, the reason naming `bun run deps`
      and a plain `bun install` (`a-typed-frozen-install-is-refused`);
      `cd sub && bun install --frozen-lockfile`,
      `bun install --frozen-lockfile | tail -5` and
      `bash -c "bun i --frozen-lockfile"` block the same
      (`a-frozen-install-within-a-compound-line`); `bun install`, `bun i` and
      `bun install lodash` get no `frozen-install` rule
      (`a-literal-install-still-prompts`, beside its citation in
      `bun/settings.test.ts`); `echo bun install --frozen-lockfile`,
      `git commit -m "bun install --frozen-lockfile"`,
      `bun run install --frozen-lockfile` and `bun add --frozen-lockfile x`
      get no `frozen-install` rule (`the-flag-only-as-text`). Verify they fail
      on today's guard
- [ ] 1.2 Then `frozenInstall(name, rest)` in `bun/command-guard-exec.ts`
      beside `depsArgs`: `bun`, the subcommand found by `subcommand(args(rest),
      ["install", "i"])`, and the word `--frozen-lockfile` after it; the
      reason as the spec's *A typed frozen install is refused* names it. Called
      and blocked as `frozen-install` from `check()` in
      `bun/command-guard.ts`; both header comments name it, and the exec
      file's comment says a miss prompts (design decision 1). Verify
      `bun test bun/command-guard` passes and both files stay under the
      `.ts` line cap

## 2. The prose leaves

- [ ] 2.1 Delete the Process rule «Install dependencies with `bun run deps`,
      never a literal `bun install` …» from `core/rules.md`, and grep
      `core/`, `CLAUDE.md` and `README.md` for prose stating the same
      prohibition (*A mechanised prohibition leaves its prose home*); the
      re-pin line in `core/git-and-prs.md` stays, since it asks for a plain
      `bun install`. In `README.md`'s bootstrap paragraph, «every literal
      `bun install` prompts» says the guard refuses the frozen form, naming
      `bun run deps`. Verify `bun test` over the rulebook and README suites
      passes

## 3. Integration

- [ ] 3.1 `bunx --no-install openspec validate frozen-install-guard --strict`
      passes, and `bun test` passes whole
- [ ] 3.2 After the self-pin passes the merge, an agent's
      `bun install --frozen-lockfile` in this repository is refused with no
      prompt shown, and `bun install` still prompts (design decision 4);
      record both on the card
