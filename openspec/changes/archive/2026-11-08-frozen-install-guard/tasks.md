# frozen-install-guard — tasks

Groups 1 and 2 are one pull request; 3.2 and 3.3 follow the self-pin bump
that brings the refusal here. The failing cases come first, their failure seen before the
code changes, each cited as `// spec: agent-permissions/<slug>` where a
scenario names it. The `ask` entries, the bootstrap and the settings text are
not touched.

## 1. The refusal

- [x] 1.1 Failing cases in `bun/command-guard-deps.test.ts`, through
      `verdict()` as its `deps-args` cases do: `bun install --frozen-lockfile`,
      `bun i --frozen-lockfile`, `bun install --frozen-lockfile --ignore-scripts`,
      `bun install --frozen-lockfile 2>&1` and
      `bun --cwd sub install --frozen-lockfile` each block as
      `{ code: 2, rule: "frozen-install" }`, the reason naming `bun run deps`,
      a plain `bun install` and other flags as the user's
      (`a-typed-frozen-install-is-refused`);
      `cd sub && bun install --frozen-lockfile`,
      `bun install --frozen-lockfile | tail -5` and
      `bash -c "bun i --frozen-lockfile"` block the same
      (`a-frozen-install-within-a-compound-line`); `bun install`, `bun i` and
      `bun install lodash` get no `frozen-install` rule
      (`a-literal-install-still-prompts`, beside its citation in
      `bun/settings.test.ts`); `echo bun install --frozen-lockfile`,
      `git commit -m "bun install --frozen-lockfile"`,
      `bun run install --frozen-lockfile` and `bun add --frozen-lockfile x`
      get no `frozen-install` rule (`the-flag-only-as-text`); in a fabricated
      checkout whose committed `package.json` holds
      `"deps": "bun install --frozen-lockfile"` and
      `"setup": "bun install --frozen-lockfile && bun run build"` and
      `"build": "true"`, `bun run deps` and `bun run setup` each pass as
      `{ code: 0, reason: "" }`
      (`a-frozen-install-inside-a-committed-script`) — the existing
      *the script read from package.json* case keeps passing. Verify the
      refusing cases fail on today's guard
- [x] 1.2 Then `frozenInstall(name, rest)` in `bun/command-guard-exec.ts`
      beside `depsArgs`: `bun`, the subcommand found by `subcommand(args(rest),
      ["install", "i"])`, and the word `--frozen-lockfile` after it; the
      reason as the spec's *A typed frozen install is refused* names it. Called
      and blocked as `frozen-install` from `check()` in
      `bun/command-guard.ts` only on a typed line: `check(line, script =
      false)`, `interpreter()` handed `(line) => check(line, true)`, the
      `bash -c` and `eval` recursions passing the flag on (design decision
      3); both header comments name it, and the exec file's comment says a
      miss prompts (design decision 1). Verify
      `bun test bun/command-guard` passes and both files stay under the
      `.ts` line cap

## 2. Docs

- [x] 2.1 In `README.md`'s bootstrap paragraph, «every literal
      `bun install` prompts» says the guard refuses the frozen form, naming
      `bun run deps`; `core/code-style.md`'s «Automated installs — CI jobs,
      hooks, scripts — use `bun install --frozen-lockfile`» adds that an
      agent installs with `bun run deps` (design decision 4). The rule in
      `core/rules.md` is not touched here. Verify `bun test` over the
      rulebook and README suites passes

## 3. Integration

- [x] 3.1 `bunx --no-install openspec validate frozen-install-guard --strict`
      passes, and `bun test` passes whole
- [x] 3.2 After the self-pin passes the apply's merge, an agent's
      `bun install --frozen-lockfile` in this repository is refused with no
      prompt shown, and `bun install` still prompts (design decision 5);
      record both on the card — recorded on 2026-11-08 in the card body's
      section «Живая проверка 08.11» (the live check of 08.11): the typed
      frozen install was refused with the deps message, and `bun run deps`
      passed. The user left a plain `bun install` out of the live check, as
      the record says, since its prompt would have stopped the session; that
      it still prompts rests on the hook letting it through
      (`bun/command-guard-deps.test.ts`) and the `ask` entries this change
      leaves untouched (`bun/settings.test.ts`), both cited under
      *A literal install still prompts*
- [x] 3.3 Then, in the self-pin bump's pull request or one after it, shorten
      the Process rule «Install dependencies with `bun run deps`, never a
      literal `bun install` …» in `core/rules.md` to what the guard cannot
      see (design decision 4): install with `bun run deps`, and type a plain
      `bun install` only after a re-pin, or if `package.json` has
      uncommitted edits or `bun.lock` lacks the pin — the frozen spelling
      and its prompt leave it. Grep `core/`, `CLAUDE.md` and `README.md` for
      other prose stating the frozen prohibition (agent-rulebook's *A
      mechanised prohibition leaves its prose home*); the re-pin line in
      `core/git-and-prs.md` stays, since it asks for a plain `bun install`.
      Verify `bun test` over the rulebook suites passes
