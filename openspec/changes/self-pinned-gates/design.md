# self-pinned-gates — design

## Context

See proposal.md for why. What was measured on 2026-10-12, with bun 1.4.2, in
scratch copies of the harness (never in its checkout):

- **Bun installs a package named like the project that depends on it.** A
  manifest named `harness` with `devDependencies.harness` set to
  `github:laidrivm/harness#<main>` installed one package into
  `node_modules/harness`, and `bun.lock` names it once.
- **The pinned guard holds after the working-tree one is gutted.** With that
  install in place, the bootstrap text from `bun/bootstrap.ts` refused
  `git commit -m x` on `main` with exit 2 and let `ls` through with exit 0.
  After `bun/command-guard.ts` in the working tree was replaced by
  `process.exit(0)`, the same hook still refused the commit, while today's
  registration (`bun "$CLAUDE_PROJECT_DIR/bun/command-guard.ts"`) let it
  through.
- **The suite does not see the install.** `bun test` with
  `node_modules/harness` present ran the same 700 tests across the same 38
  files, all passing: bun collects nothing under `node_modules/`, the scans
  list files with `git ls-files`, and `bun/check-yaml.ts` skips
  `node_modules/` by name.
- **A consumer installs one copy.** A project depending on that self-pinned
  harness through a git URL (`git+file://` to a commit of the scratch copy)
  installed one package and no nested `node_modules/harness/node_modules`.
  The same project depending on it as a `file:` folder installed two, because
  bun treats a folder dependency like a workspace and installs its
  development dependencies — no consumer depends on the harness that way.
  The `github:` form both consumers use was not itself measured; it fetches a
  tarball, which bun installs like the git form.
- **Both consumers pin under `dependencies`** (`d2ass` and `mellon`'s
  `package.json`, read-only).

## Goals / Non-Goals

**Goals:** the harness's sessions run its hooks from a merged commit; its
settings are the consumer form, checked by a test; the stale-install notice
works in the harness.

**Non-Goals:** see proposal.md.

## Decisions

### The harness pins itself in its own lockfile

The hooks run `node_modules/harness/`, installed from
`github:laidrivm/harness#<40-hex>` under `devDependencies`. This is the
mechanism every consumer already runs, so the harness's sessions now run the
same hook texts, including the bootstrap and the notice its own sessions
have never exercised.

- *Alternative: snapshot `bun/` at session start.* A `SessionStart` hook
  copies the working tree somewhere the hooks read. The snapshot is whatever
  the checkout holds, unmerged edits from an earlier session included, so it
  pins nothing that passed review, and it is new code with no consumer.
- *Alternative: run the scripts from `git show main:…`.* The guard imports
  four modules, so the whole of `bun/` must be materialised, and local
  `main` is a ref a session can move. Also new code, also harness-only.
- *Alternative: `dependencies` rather than `devDependencies`.* A consumer
  installs a git dependency's runtime dependencies, so every pinned commit
  would pull the commit it pinned, and so on back through the history.
  A development dependency of a dependency is never installed.

### The settings carry `HOOKS`, checked by a test, not by `settings.ts`

The harness's `.claude/settings.json` hooks block becomes what `sync.ts`
writes for a consumer: each `HOOKS` entry under its event and matcher. A
test in the block that pins today's registrations
(`bun/turn-gate-cli.test.ts`) asserts each `HOOKS` command is present and
that no hook names `$CLAUDE_PROJECT_DIR/bun/`. The settings are written by
hand once, not by `sync.ts`, which would also write a `harness/` copy of the
rules into the harness.

- *Alternative: run `settings()` from `bun/settings.ts` over the harness's
  own root.* It also requires a `bunfig.toml` with the consumer `[install]`
  section and compares every permission list, which is a policy decision for
  the harness's own permissions this card does not take. The narrower test
  covers what this change moves.

### The notice falls back to `devDependencies`

`NOTICE` reads `dependencies.harness ?? devDependencies.harness`. Otherwise
the harness would register a hook that is silent by construction. For a
consumer the output is unchanged, since both pin under `dependencies`; the
text changes, and each consumer's next bump writes it through `sync.ts`
before its check runs.

### The pin moves by hand

To move it: edit the pin line in `package.json` to a `main` commit whose
`test` run passed, run `bun install`, and open a pull request with both
files. `bun/bump-pin.ts` records why the line is edited rather than
re-added with `bun add`: bun 1.4.2 left the old pin in `bun.lock` beside the
new one. A gate change therefore holds the harness's sessions only from the
bump after it merges.

- *Alternative: the consumers' daily `harness-bump.yml`.* `bump.ts` runs
  `sync.ts`, which writes `harness/`, and `check.ts`, which needs a
  `bunfig.toml` and the consumer config keys. Making it fit is a code change
  to a shipped gate, kept for a later card if the manual cadence proves too
  slow.

### Skills stay on the working tree

`.claude/skills/<name>` keeps linking `../../core/skills/<name>`. The card
asked whether the pin should cover them. A skill is instructions: an edited
one changes what a session attempts, and the guard and turn gate still hold
it. Pinning them would also mean a skill edit cannot be tried in the session
that made it, which is how a skill is developed here.

## Risks / Trade-offs

- **The gates lag `main` until someone bumps.** A guard fix merged today
  holds no harness session until the pin moves. The notice says nothing
  about it, since it compares the install with the pin, not the pin with
  `main`.
- **A fresh clone runs nothing but `bun install` first.** The bootstrap
  blocks every other Bash command until the install, as in a consumer.
  `bun install` asks for approval under the `ask` list.
- **The pinned copy is a directory a session can edit.** The pin separates
  the code under development from the code that gates; it does not stop a
  deliberate edit under `node_modules/harness/`. Proposal *Non-goals*.
- **Sibling changes registering a working-tree hook.** `notion-update-guard`
  (pull request 52) adds one to the harness's settings. Whichever of the two
  merges second registers the notion guard in its `HOOKS` form.

## Migration Plan

One pull request; after it merges, each clone runs `bun install` once.
Rollback is reverting it, after which `node_modules/` is inert.
