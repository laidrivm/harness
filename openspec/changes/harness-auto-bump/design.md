# harness-auto-bump — design

## Context

See proposal.md for why. What shapes the approach is what the harness, the
two consumers and GitHub do today, each read on 2026-10-11:

- `bun/settings.ts` asserts the consumer's hook registrations against the
  texts `bun/bootstrap.ts` exports: exactly one `PreToolUse` Bash hook whose
  command is `BOOTSTRAP`, and a `UserPromptSubmit` and a `Stop` hook whose
  commands are `TURN_MARK` and `TURN_STOP`, each a blocking `command` with no
  `if`. Every harness command reaches the package through
  `$CLAUDE_PROJECT_DIR/node_modules/harness/`. It also compares the `Bash(`
  entries of `permissions.deny` and `permissions.ask` with fixed lists, whole
  and in order, requires `Edit(.npmrc)` in `deny` and `Edit(bunfig.toml)` in
  `ask`, and requires `bunfig.toml`'s `[install]` to parse to exactly
  `{ exact, minimumReleaseAge, minimumReleaseAgeExcludes }`. All of it is
  copied by hand; `sync.ts` writes only `harness/`.
- bun records the commit it installed a `github:` dependency from in
  `node_modules/<name>/.bun-tag`, as `<owner>-<repo>-<7-hex>`. That is the
  same string `bun.lock` carries as the entry's third field. It is written
  the same on Linux: in `oven/bun:1.4.2`, the same commit gave the same tag
  and the same lockfile entry, down to its integrity hash. On 2026-10-11
  d2ass's held `laidrivm-harness-1d26cf4` against a pin of `eddf1fd`: a stale
  install, unnoticed.
- Moving the pin by editing `package.json` and running
  `bun install --ignore-scripts` was measured with bun 1.4.2 on copies of
  both consumers' manifests, from `eddf1fd` to `9d321b6`. Two independent
  runs wrote byte-identical lockfiles. Each differed from the original in
  exactly two lines, the workspace's pin and the package entry, and
  `package.json` in one line, under tabs and under spaces. `bun add
  github:laidrivm/harness#<sha>` instead left the old pin in the lockfile's
  workspace section beside the new one. `minimumReleaseAge` did not hold back
  the target commit, which was hours old: it does not apply to a `github:`
  dependency.
- Neither `laidrivm/dota2` nor `laidrivm/mellon` protects `main`, both have
  auto-merge off, and in both `GITHUB_TOKEN` defaults to read and may not
  create or approve pull requests.
- An event caused by `GITHUB_TOKEN` — a push, or a pull request it opens —
  starts no workflow. A bump pull request would run none of the consumer's
  checks, and a bump push runs neither consumer's deploy, both of which
  trigger on `push: main`.
- `GITHUB_TOKEN` cannot push a change under `.github/workflows/`; that needs
  the `workflows` permission, which it is never granted.
- Within one job, any step can rewrite what a later step runs: through
  `$GITHUB_PATH` and `$GITHUB_ENV`, a hook under `.git/hooks`, or
  `git config` (`url.<base>.insteadOf`, a credential helper). A token handed
  only to a job's last step is therefore reachable from every step before it.
- Both consumers hold the pin as `github:laidrivm/harness#<40-hex>` under
  `dependencies`. d2ass formats JSON with tabs, mellon with spaces.
- The consumers run the harness's checks as `harness:check`
  (`bun node_modules/harness/bun/check.ts`), and d2ass has its own
  `checks/harness-consumption*.test.ts` asserting how it consumes the harness.
- The harness's `Test` workflow runs on every push to `main`, as one job
  named `test`.

## Goals / Non-Goals

**Goals:**

- A harness commit that passed its own tests reaches each consumer's `main`
  within a day, with nobody acting, whenever the consumer's checks pass on it.
- A bump that would fail the consumer's checks never lands, and nothing run
  to decide that can push.
- A harness change to a hook text, a permission list or `[install]` lands
  like any other change.

**Non-Goals:**

- Telling the consumer's author why a bump failed beyond the run's log and
  GitHub's own failed-run email.
- Choosing a harness commit other than `main`'s head — walking back to the
  last green one, or batching.
- The harness's own `.claude/settings.json`. The harness runs its guard from
  its own tree, not from `node_modules/`, and nothing here syncs it.

## Decisions

### Step 1 — `bootstrap.ts` holds one list of registrations

`bun/bootstrap.ts` exports the harness's hook registrations as one list of
`{ event, matcher?, command }`. `bun/settings.ts` asserts each entry of it,
keeping its present shape rules: the Bash hook alone in its matcher, the
others present in blocking form. `sync.ts` writes each entry. A new hook,
such as the one `notion-update-guard` adds, is one entry here and reaches
both readers. The alternative, `sync.ts` importing the three constants by
name, would leave a fourth hook to be remembered in two places.

### Step 1 — `settings.ts` exports what it asserts

`bun/settings.ts` exports the exact values it compares: the `Bash(` deny
entries, the `Bash(` ask entries, the two `Edit` entries, and `INSTALL`.
`sync.ts` imports them, so what is written and what is checked are one
value, not two lists that agree. The rule this draws: `sync.ts` writes what
the check dictates by value, and leaves alone what the check only refuses
(proposal, Non-goals).

### Step 1 — `sync.ts` replaces the harness's entries and nothing else

In `.claude/settings.json`:

- **Hooks.** An entry is the harness's when its command names
  `node_modules/harness/`, which every registration in the list does and no
  project hook has reason to. `sync.ts` removes each such hook from every
  event, drops a matcher group the removal left empty, then appends each
  registration in its own group. Identifying by text was the alternative,
  and it would fail to recognise the previous version's hook, which is
  exactly the one a bump must replace.
- **`deny` and `ask`.** Their `Bash(` entries are replaced, in place of the
  first one, by the exported lists, in order. Every other entry keeps its
  position: an `mcp__` ask from `policy-gate-beyond-bash`, a project's own
  `Edit(...)`. `Edit(.npmrc)` and `Edit(bunfig.toml)` are appended when
  absent. The harness owns the whole `Bash(` subset because the check
  compares that subset whole, and a project can add no `Bash(` entry to
  either list without failing it today.
- Every other key, the allow list included, is left untouched.

The file is parsed and written back as JSON, with the indentation it was
read with and a final newline. A consumer with no `.claude/settings.json`
gets one holding the hooks and the two lists. `check.ts` still refuses it
for the empty allow list, which is the consumer's to write.

In `bunfig.toml`, Bun parses TOML but cannot write it, and a TOML library
would be a dependency in a package that has none. `sync.ts` replaces the
`[install]` section's text, from its header to the next header or the end,
with the canonical lines, and appends the section when it is missing. A
comment inside that section is lost, such as mellon's `# seconds = 3 days`.
That follows from the section being the harness's. The replacement is a line
scan of a file a tool parses, so it is verified by parsing: the result's
`[install]` must parse to `INSTALL`, and every other table must parse
unchanged. If either fails, `sync.ts` writes nothing and throws.

Re-running `sync.ts` on its own output changes neither file, which the test
asserts.

### Step 2 — pull from the consumer's CI

Each consumer runs the bump on a daily schedule and on `workflow_dispatch`.
Pushing from the harness was the alternative: it needs a token in the
harness's CI that can write to every consumer, and a consumer list kept
here. Running the bump in a session was the other: it writes into whatever
branch is checked out. The consumer's CI owns its own token and its own
`main`, and the harness never learns who consumes it.

### Step 2 — push straight to `main`, no pull request

The bump's own gate is the only check that will ever run on it (see
Context). A pull request would add a page nobody reads, and an auto-merge
that waits forever for checks that never start. If `main` moved after the
run's checkout, the push is rejected as a non-fast-forward, the run fails,
and the next run starts from the new `main`. No retry loop: a day's delay
costs nothing here, and a loop is code to test.

### Step 2 — two jobs: the one that runs the checks cannot push

The gate runs the consumer's unit tests and with them every dependency those
tests load. A write token anywhere in that job is a token that code can take
(see Context), so the token never enters it:

```
 verify   permissions: contents: read     checkout, persist-credentials: false
   bun install --frozen-lockfile
   bun node_modules/harness/bun/bump.ts verify
     target = harness main head, its `test` check run succeeded?  no --> sha=""
     target == pin?                                              yes --> sha=""
     move pin, bun install, sync.ts, check.ts, bumpTest          red --> exit 1
     stage the edit --> outputs: sha=<target>, tree=<git write-tree>
        |
        v  needs: verify, if sha != ""
 land     permissions: contents: write    fresh checkout of the same main
   bun install --frozen-lockfile --ignore-scripts
   bun node_modules/harness/bun/bump.ts land <sha> <tree>
     move pin, bun install --ignore-scripts, sync.ts
     stage the edit; git write-tree != <tree> --> exit 1, nothing pushed
     commit, push HEAD:main
```

`land` runs bun, which fetches and extracts packages but runs no lifecycle
script under `--ignore-scripts`, plus the harness's own code: `bump.ts` from
the pin on `main`, and `sync.ts` from the target. It never runs a consumer
dependency's code. The tree comparison means it pushes exactly the files
`verify` gated, not a recomputation that could differ. The harness's code
running beside the token adds no exposure: a compromised harness already runs
inside every agent session (Risks).

`verify` reads the harness's `main` and its check runs through GitHub's REST
API with its read token. The target commit passes from `verify` to `land`
as a job output, so both act on the same commit even if the harness moves
between them.

The alternative the review raised — one job, the token passed only to the
push step — is the one the Context's fourth point rules out.

### Step 2 — the logic lives in the package, the workflow stays thin and unasserted

`bun/bump.ts` holds every step of both jobs, so it is tested by the
harness's `bun test` like the other gates. The consumer's workflow is the
two jobs above: checkout, setup-bun, one install, one `bump.ts` call each,
and a concurrency group so two runs never race.

The workflow text is **not** asserted by `check.ts`, unlike the hook texts.
An asserted text would have to carry one set of action pins for every
consumer, but d2ass's Dependabot moves its action pins weekly and mellon
does not pin them at all. And since a bump cannot push a workflow file, a
harness change to that text would turn every bump red. README states the
workflow. A consumer that drifts from it breaks only its own bump, which
then fails visibly.

`bump.ts` runs from the installed pin, so a fix to the bump itself takes
effect one bump later. That is accepted: the alternative is running the bump
from a commit that has not yet passed the consumer's checks.

### Step 2 — the gate: sync, the harness's check, the consumer's unit tests

In `verify`, each runs from the consumer's root after the pin moved and
`bun install` ran, so the **new** harness's code runs:

1. `bun node_modules/harness/bun/sync.ts` — the rules copy and the hooks
   follow the pin.
2. `bun node_modules/harness/bun/check.ts` — every harness check over the
   tree, the hook assertions included.
3. The consumer's `bumpTest` command — d2ass's harness-consumption tests
   live in its own suite, and `check.ts` cannot see them.

The first failure stops the bump with a non-zero exit, and `land` does not
run. A quiet day — the harness's head not green yet, or equal to the pin —
exits 0, sends no email, and skips `land`.

### Step 2 — `bumpTest` is a `"harness"` key, with no default

d2ass's unit suite is `bun test`, whose database cases skip without a
connection string. mellon's is `bun run test`, which names its directories
because a bare `bun test` would collect its Playwright specs. Run from a
clean export of mellon's `HEAD` with no `.env` and no CouchDB, as `verify`
will run it, it passed 124 of 124. No single
command fits both, and `bun/config.ts` already refuses a missing key by name
rather than defaulting.

### Step 2 — moving the pin

The bump replaces the pin's 40 hex digits in `package.json`'s text and
runs `bun install --ignore-scripts`, which rewrites `bun.lock`. It does not
use `bun add`, which leaves the old pin in the lockfile (Context). The text
edit is guarded the way the rule for a malformed-input guard asks: the old
spec must match `github:laidrivm/harness#<40-hex>` whole, exactly once,
and after the edit the parsed manifest's `dependencies.harness` must equal
the new spec. Otherwise the bump fails before installing.

`land` pushes with no git hook installed, and it skips no hook either. d2ass's
`prepare` script runs `simple-git-hooks`, which installs a `pre-push` hook
running lint, Stryker and the diff budget, and so runs consumer
dependencies. A fresh checkout holds no hook, and `--ignore-scripts` keeps
`prepare` from installing one. That is why `land` needs no `--no-verify`,
which `core/git-and-prs.md` forbids.

`--ignore-scripts` in both jobs, not only in `land`: a lifecycle script
could write a tracked file in `verify` that `land` never writes, and the
tree comparison would then refuse every bump. The tests in `verify` run
after the install, so they need no script the install skipped. Its own
`bun install --frozen-lockfile` at the start keeps scripts, as the
consumer's other workflows do.

### Step 2 — the commit

Authored as `github-actions[bot]`, with the subject
`Bump harness <old7>..<new7>`. The range is enough to read what arrived with
`git log` in the harness. Copying the subjects into the body would just
restate that log.

### Step 3 — a `SessionStart` notice that cannot block

One more registration in step 1's list: a `SessionStart` hook that compares
the installed harness's commit with the pin in `package.json`. The installed
commit is the hex after the last `-` of `node_modules/harness/.bun-tag`, and
it matches when the pin starts with it. When they differ, it prints one line
naming both and `bun install`.

The hook's logic is inline text in `bootstrap.ts`, a `bun -e` like
`BOOTSTRAP`'s fallback, not a script in the package. A stale install is by
definition an older package, which may predate the script. d2ass's on
2026-10-11 predates `bun/` itself. In that state `BOOTSTRAP` blocks every
command with "The harness is not installed", which is false, and the turn
gate's hooks skip silently. A notice that lived in the package would be
missing in exactly the state it exists to name.

`.bun-tag` is bun's own file and no bun document promises it. The code reading it says so, as a `shortcut:` comment.
When it is absent or not of that form, the hook prints nothing: the notice
is a convenience, and a false alarm in every session would teach people to
ignore it. Claude Code adds a
`SessionStart` hook's output to the session's context, so the agent sees it
as well as the person. It always exits 0. Without the package it prints that
the harness is not installed, which `BOOTSTRAP` already enforces, and exits
0. It runs once per session, not per command, so it adds nothing to the
guard's per-call cost.

## Risks / Trade-offs

- [A compromised `laidrivm/harness` `main` reaches both consumers' agent
  sessions within a day, through a guard that runs on every Bash call — and,
  in `land`, runs beside a token that can push to `main`] → accepted: the
  harness has one committer, who chose no cooldown. Its `test` gate catches
  breakage, not intent. The two-job split keeps that trust from extending to
  the consumers' other dependencies.
- [A compromised dependency of a consumer runs in `verify`] → it sees only
  a read token and the job's own workspace. What it writes into the tree
  reaches `main` only if `land`, which never runs it, reproduces the same
  tree.
- [A new required `"harness"` config key still makes every bump red until
  someone adds it by hand] → the failed run names the key. It is a value only
  the project can choose, so no sync can write it.
- [`verify` and `land` run on different runners, and the lockfile could
  come out differently] → measured identical across two independent runs
  (Context). If it ever differs, `land` refuses, and the next day's run tries
  again.
- [bun stops writing `.bun-tag`, or changes its form] → step 3's notice
  falls silent. Nothing else reads the file.
- [GitHub disables the scheduled bump] → In a public repository, which both
  consumers are, GitHub disables a scheduled workflow after 60 days without
  repository activity. That rule is documented; what counts as activity is
  not. The bump's own pushes probably count, since keepalive actions rely on
  bot-authored commits to the default branch. No GitHub document confirms
  that. If they count, the schedule stops only after the harness itself has
  been quiet for 60 days, and it then stays off when the harness resumes.
  If they do not, it stops 60 days after the consumer's last human activity.
  Either way it stops silently and stays off until someone runs
  `gh workflow enable` or edits the cron line. README's workflow section
  says so.
- [A feature branch cut before a bump conflicts on `package.json`,
  `bun.lock`, `harness/` and `.claude/settings.json` when rebased] → at most
  one bump a day. The conflicts are resolved by taking `main`'s side and
  running `bun install`.
- [`sync.ts` now writes two files a person also edits] → it touches only
  hooks naming `node_modules/harness/`, the `Bash(` subsets of `deny` and
  `ask`, and the `[install]` section. Its tests pin that a project hook, a
  non-Bash permission entry, the allow list, unknown keys and every other
  TOML table come through with equal values.

## Migration Plan

0. Before any step, each consumer's local checkout must be installed at its
   pin. Run `bun install` there, since step 1's manual bump starts from it.
   On 2026-10-11 d2ass's was not (Context). Its sessions have run with every
   Bash command blocked and the turn gate off, and that state persists until
   step 3 is there to name it.
1. Merge step 1. In each consumer, bump by hand once and run `sync.ts`. It
   replaces hand-copied values with identical ones, so the only expected
   diff is mellon losing the comment inside `[install]`. Any other change in
   `.claude/settings.json` or `bunfig.toml` means the replacement rule
   misread a real file.
2. Merge step 2. In each consumer, by hand: bump to a commit that contains
   `bun/bump.ts` — the pin it holds then has none, so this bump cannot be
   automatic — add `bumpTest`, add the workflow, then run it once through
   `workflow_dispatch` and expect a quiet exit.
3. Merge step 3. It reaches both consumers through the next scheduled bump,
   with no manual step: the first bump that carries it in.
4. Rollback: delete the consumer's workflow; revert a bad bump commit like
   any other. Step 1 rolls back by reverting it in the harness. The hook
   texts it wrote are the same ones a person would have copied.
