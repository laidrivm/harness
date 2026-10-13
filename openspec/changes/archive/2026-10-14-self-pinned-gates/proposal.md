# self-pinned-gates

## Why

The harness's own sessions run its gates from the working tree: the three
hooks in its `.claude/settings.json` call `$CLAUDE_PROJECT_DIR/bun/command-guard.ts`
and `$CLAUDE_PROJECT_DIR/bun/turn-gate.ts`. A session that edits either
script changes the gate holding that same session the moment the file is
saved, before any test or review has seen the edit — a guard broken or
weakened mid-turn stops guarding the turn that broke it. Consumers do not
have this recursion: their hooks run `node_modules/harness/`, which
`bun.lock` pins to a commit that passed the harness's CI. Only the harness
runs its gates unpinned, and it is the one repository whose sessions edit
them.

## What Changes

- The harness becomes a consumer of itself. `package.json` pins it under
  `devDependencies` as `github:laidrivm/harness#<40-hex>`, `bun.lock` is
  tracked, and `node_modules` is ignored. A session runs the gates from
  `node_modules/harness/`, a merged commit, and the branch's edits to `bun/`
  take effect only once they merge and the pin moves past them.
- The harness's `.claude/settings.json` registers the hook texts
  `bun/bootstrap.ts`'s `HOOKS` gives every consumer, character for
  character, in place of its three working-tree commands. It thereby also
  gains the bootstrap's install-first behaviour and the stale-install
  notice, which today run in no session of the harness itself.
- A test fails when the harness's settings lack a `HOOKS` entry or carry
  any hook that runs a script from `$CLAUDE_PROJECT_DIR/bun/`. It replaces
  the test that pins today's working-tree turn-gate registrations.
- The stale-install notice reads the pin from `devDependencies` when
  `dependencies` names none, so it speaks in the harness too. Both
  consumers pin under `dependencies` (measured on 2026-10-12), so what it
  prints for them does not change.
- `README.md`'s *Working on the harness* says a clone runs `bun install`
  before anything else, and how the pin moves: by hand, in a pull request,
  to a `main` commit whose `test` run passed.

## Non-goals

- Pinning the skills. `.claude/skills/*` stay linked to `core/skills/`: an
  edited skill changes what a session does, never what it is allowed to do,
  and trying a skill edit in the session that made it is how skills are
  developed here. design.md *Skills stay on the working tree*.
- A permission rule on editing the gate files, `.claude/settings.json` or
  `node_modules/harness/`. With the gates pinned, an edit to `bun/` no longer
  reaches the session; which tools besides Bash the policy covers is the
  change `policy-gate-beyond-bash`'s. This change separates the copy under
  development from the copy that gates; it is no defence against a session
  that sets out to edit the pinned copy.
- Moving the self-pin automatically. The consumers' daily bump writes
  `harness/` and runs the consumer check, neither of which fits the harness
  itself. design.md *The pin moves by hand*.
- The pre-push hook and CI. `.githooks/pre-push` and `test.yml` run the
  branch's own suite, which is what they exist to test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-updates`: a new requirement, *The harness's own sessions run its
  gates from its pin*. How the harness adopts its own commit is the same
  question the capability already answers for each consumer.
- `commit-gates`: *A turn that commits reports its gates before it ends*
  states that the harness registers the turn gate from its own working tree,
  because it is not installed as its own package. This change makes that
  false, so the sentence now cites the new requirement instead.

## Impact

- `package.json`, a new tracked `bun.lock`, `.gitignore`.
- `.claude/settings.json`: the `hooks` block only.
- `bun/bootstrap.ts`: `NOTICE` reads `devDependencies` as a fallback. Every
  consumer's check compares that text exactly, so each picks it up through
  `sync.ts` on its next bump, as every hook-text change does.
- `bun/turn-gate-cli.test.ts`'s settings block, `bun/bootstrap-notice.test.ts`.
- `README.md`, and the comments in `.github/workflows/test.yml` and
  `diff-budget.yml` that skip the install because "the package declares no
  dependencies": still no install, for another reason.
- `notion-update-guard`'s step 1 (pull request 52) has merged, and it
  registers the Notion update guard in the harness's settings in
  working-tree form, `bun "$CLAUDE_PROJECT_DIR/bun/notion-guard.ts"`. This
  change's apply replaces that registration with the guard's `HOOKS` entry
  (`NOTION_GUARD` under `NOTION_MATCHER`), like the other hooks, and pins a
  commit that holds `bun/notion-guard.ts`.
- Closest existing artefacts: the archived `ship-turn-gate-to-consumers`,
  which gave consumers the pinned hook texts this change adopts, and
  `harness-auto-bump`, whose notice this change extends.
