# harness

The agent harness shared by several projects: a rulebook, Claude Code skills, and the hooks and gates that hold a session to them. It ships as a package (`package.json`, no lifecycle scripts) that each project pins to one commit. What each piece does in full is in its spec under `openspec/specs/`; this page says what lives where and links the contract.

## Layout

- `core/` — what any project can use: `core/rules.md`, the rulebook, with the docs it links beside it as `core/<doc>.md`, and `core/skills/<name>/SKILL.md`, one [Claude Code skill](https://code.claude.com/docs/en/skills) per directory.
- `bun/` — what assumes Bun and TypeScript: the command guard and the hook text that boots it, the gates, and `check.ts`, which runs every check over a consumer's tree.
- `orchestrator/` — what a host of the user's own runs to start passes with nobody at a terminal ([orchestrator/README.md](orchestrator/README.md), [spec](openspec/specs/orchestrator/spec.md)).
- `openspec/` — the specs (`specs/<capability>/spec.md`) and the changes that made them, with each decision's rationale in the archived `design.md`.
- `.githooks/` — the pre-push hook and `gates.sh`, the one list of judged gates it and the pre-PR runner run ([commit-gates](openspec/specs/commit-gates/spec.md)).
- `mutation/` — one stored Stryker result per mutated module, `mutation/<name>.json`, written by `bun/mutation-run.ts` and counted against `harness.mutationFloor` ([mutation-floor](openspec/specs/mutation-floor/spec.md)).
- `biome.json`, `tsconfig.json` and `stryker.config.json` — the formatter and linter, the type check, and Stryker's shared options, its `mutate` the list of modules mutated.

## Consuming

1. Add the harness as one dependency pinned to a full commit, `"harness": "github:laidrivm/harness#<40-hex commit>"`, and run `bun install`.
2. Link each skill the project uses as a tracked relative link, `.claude/skills/<name>` → `../../node_modules/harness/core/skills/<name>`.
3. Put the values the gates run with under a `"harness"` key in `package.json`, typed in `bun/config.ts`; a gate whose key is absent fails, naming it. The one exception is `reviewers`, the check-run names of the reviewers `finish` waits for (`CodeRabbit` the only one understood), whose absence means no reviewer.
4. From the project's root, run `bun node_modules/harness/bun/sync.ts`. It writes the rulebook and its docs into a tracked `harness/`, which the project's `CLAUDE.md` imports, the harness's hooks, its `deny` and `ask` entries, and its plugins under `enabledPlugins` and `extraKnownMarketplaces` (*Plugins* below) into `.claude/settings.json`, `[install]` into `bunfig.toml`, and the `deps` script into `package.json` ([harness-updates](openspec/specs/harness-updates/spec.md)). Edit a rule in the harness, never in the copy. So that the review bot reads the rules, name `harness/*.md` yourself under `knowledge_base.code_guidelines.filePatterns` in the project's `.coderabbit.yaml`.
5. Add to `permissions.allow` what sync does not write: `Skill(code-review)` where unattended sessions run the pre-PR sequence's local review — it matches the skill's name, never its arguments, so it also allows `ultra --post`, which posts under the user's account — `Skill(session-wrapup)`, which an unattended session runs without waiting on the user, and `Bash(bun node_modules/harness/bun/notion-ask.ts *)` and `Bash(bun node_modules/harness/bun/work.ts *)` for the commands below.
6. `bun node_modules/harness/bun/check.ts` runs every check over the tree; `bun node_modules/harness/bun/settings-local.ts` sweeps the untracked `.claude/settings.local.json` against the tracked policy ([agent-permissions](openspec/specs/agent-permissions/spec.md)).
7. Bump daily with the workflow below, saved as `.github/workflows/harness-bump.yml`. `verify` moves the pin to the harness's `main` head when its newest `test` run passed, and otherwise waits for the next day, and runs sync, check and the command under `"harness": { "bumpTest": … }`, the project's unit tests; `land` pushes only the tree `verify` checked ([harness-updates](openspec/specs/harness-updates/spec.md)). In a public repository GitHub disables the schedule after 60 days without activity; `gh workflow enable harness-bump.yml` restarts it. A project whose CodeRabbit posts a check run adds `"reviewers": ["CodeRabbit"]` under `"harness"` before its bump crosses `finish-named-reviewers` — an older harness ignores the key — or `finish` silently stops waiting for the review.

```yaml
name: Harness bump
on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:
concurrency:
  group: harness-bump
  cancel-in-progress: false
jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      sha: ${{ steps.bump.outputs.sha }}
      tree: ${{ steps.bump.outputs.tree }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: main
          persist-credentials: false
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.4.2
      - run: bun install --frozen-lockfile
      - id: bump
        run: bun node_modules/harness/bun/bump.ts verify
        env:
          GITHUB_TOKEN: ${{ github.token }}
  land:
    needs: verify
    if: needs.verify.outputs.sha != ''
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      # Credentials kept: this job pushes, running only the harness's own code.
      # `ref: main` in both jobs: a dispatch from another branch must not land it on main.
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: main
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.4.2
      - run: bun install --frozen-lockfile --ignore-scripts
      - run: bun node_modules/harness/bun/bump.ts land "$SHA" "$TREE"
        env:
          SHA: ${{ needs.verify.outputs.sha }}
          TREE: ${{ needs.verify.outputs.tree }}
```

8. Once, after the bump that moves `session-wrapup`'s yield ledger out of the tree, delete the tracked `docs/context/pipeline-yield-*.md` in a pull request of the project's own; nothing writes to them after that bump, and a pin bump deletes nothing in the project's tree.

## Hooks and commands

Until the install has run, the hooks stand aside: the bootstrap lets only the install through, and in a cloud session the `SessionStart` hook runs that install itself. An agent installs with `bun run deps`, the script `"deps": "bun install --frozen-lockfile"` that sync adds to `package.json`, refusing to overwrite a `deps` of the project's own: the `ask` entries match the typed text, so every literal `bun install` the command guard lets through prompts while the script does not, and the guard refuses a typed `bun install --frozen-lockfile`, naming `bun run deps` ([agent-permissions](openspec/specs/agent-permissions/spec.md)). A project whose `allow` lacks `Bash(bun run *)` may add `Bash(bun run deps)` for the default mode. Each guard and gate records what it decides in the gate ledger, `gates.jsonl` under the user's state directory ([gate-ledger](openspec/specs/gate-ledger/spec.md)).

| Piece | What it is for | Contract |
|---|---|---|
| Bootstrap and command guard (`PreToolUse` Bash) | lets only the install through before it, then checks every command against the policy | [agent-permissions](openspec/specs/agent-permissions/spec.md), [commit-gates](openspec/specs/commit-gates/spec.md) |
| Turn gate (`UserPromptSubmit`, `Stop`) | refuses, once, a turn that completes a task group without passing records of both pre-PR runner steps at its tip, whatever its message says; ends a `/goal` run at its round ceiling; asks an attended session once per context for `/session-wrapup` at 800k tokens | [commit-gates](openspec/specs/commit-gates/spec.md), [stage-goal](openspec/specs/stage-goal/spec.md), [context-window](openspec/specs/context-window/spec.md) |
| Loop guard (`PreToolUse`, `PostToolUseFailure`) | warns on the third identical failed call and refuses it until the next prompt | [loop-guard](openspec/specs/loop-guard/spec.md) |
| Flake watch (`PostToolUse`, `PostToolUseFailure` Bash) | names a run that passes after an identical failed one as flaky; never blocks | [flaky-tests](openspec/specs/flaky-tests/spec.md) |
| Notion update guard | refuses a card write whose `properties` the connector would drop | [task-board](openspec/specs/task-board/spec.md) |
| Question gate (`PermissionRequest`) | lets a question to the user on a board card through without a prompt | [agent-permissions](openspec/specs/agent-permissions/spec.md) |
| Stale-install notice (`SessionStart`) | names an install that lags the pin; in a cloud session runs the install first | [harness-updates](openspec/specs/harness-updates/spec.md), [cloud-sessions](openspec/specs/cloud-sessions/spec.md) |
| Transcript archive (`SessionEnd`) | keeps a private (0600) copy of each ended session's transcript for 180 days; nothing is scrubbed from it | [transcript-archive](openspec/specs/transcript-archive/spec.md) |
| `bun/notion-ask.ts <card> <file>` | posts a question on a card from a second Notion integration, not the user's account, then sets the card's `Assign` to the user. That integration reads pages and comments, writes comments and updates content, on the boards alone; its settings are `~/.config/harness/notion-ask.json` (or under `$XDG_CONFIG_HOME`), holding its `token` and the user's Notion id as `user`, mode 0600 or 0400 | [agent-permissions](openspec/specs/agent-permissions/spec.md), [task-board](openspec/specs/task-board/spec.md) |
| `bun/work.ts take --card <id> [--after <comment id>]` | prints what a session needs to take a card, its change as paths and line counts, ending with the id of the card's last comment; with `--after` that id, only `Status`, `Assign` and what came after it; writes nothing but that it removes the user from the card's `Assign` when no question or pause notice waits there, which needs the ask integration's *Update content* capability, as `finish --card`'s does | [work-take](openspec/specs/work-take/spec.md) |
| `bun/work.ts resolve --pr <n> --head <sha> --comment <id> …` | resolves, under `gh`'s identity, the review bot's threads the named comments open, on the branch's open pull request while its head is `<sha>`; refuses the whole call over an id it cannot place | [work-resolve](openspec/specs/work-resolve/spec.md) |
| `bun/work.ts draft --pr <n>` | marks open pull request `<n>` of `origin`'s repository a draft as follow-up on it starts, or leaves it one, printing its full head, the `--head` `resolve` takes; refuses a merged or closed one, or one it cannot read | [work-draft](openspec/specs/work-draft/spec.md) |
| `bun/work.ts finish [--card <id>] [--title <text> --body-file <path>]` | pushes, opens the pull request as a draft, writes the card's `Pointer` and the pull request's `Ссылки` link where missing — which needs the ask integration's *Update content* and *Insert content* — and marks it ready unless a question waits on the card, removing the user from the card's `Assign` before the ready switch when nothing waits there; where `harness.reviewers` names `CodeRabbit`, it waits up to 12 reads for a completed CodeRabbit run on the head before the ready switch, marking it ready without one when none comes, then reads up to 18 times (about 85 s at the default 5 s interval; three failed reads in a row end either wait) and ends on CodeRabbit's state of the head, asking once with `@coderabbitai review` for a head it skipped or left without a run; with no key it waits for no reviewer; with no `--card` it reads no card | [work-finish](openspec/specs/work-finish/spec.md) |
| `bun/work.ts status --card <id> --to <status> [--why <reason>]` | how the harness's own sessions move a card's `Status`: into `proposed`, `applied` or `done` only where `origin/main` proves it, or into `done` for a fix card whose `Pointer` reads `pr:<N>` only where that pull request is merged into `main`, into `exploring` … `archiving` only under `HARNESS_WIP_LIMIT` (unset: 5), into `discarded` from any other status and out of it to `idea` alone, each with a required `--why` posted on the card first, then removes the user from the card's `Assign` when nothing waits there; needs the ask integration's *Update content* and *Insert comments* capabilities | [work-status](openspec/specs/work-status/spec.md) |
| `bun/pre-pr.ts [--steps] [<base>]` | runs the pre-PR sequence's deterministic steps and names the ones the diff requires; with `--steps`, names them alone, running and recording nothing | [pre-pr-runner](openspec/specs/pre-pr-runner/spec.md), [review toolkit](core/review-toolkit.md) |
| `bun/push-proven.ts` | the pre-push hook's skip: exits 0, and the hook skips its gates, when every ref's tip a push lands has a passing pre-PR record of `project-checks` in this checkout and none that failed or erred, and the push updates or deletes no tag | [commit-gates](openspec/specs/commit-gates/spec.md) |
| `bun/board-loop.ts` | one unattended pass of the board loop, started only by the user or a host timer | [board-loop](openspec/specs/board-loop/spec.md) |
| `bun/pr-sweep.ts <owner>/<repo>` | one sweep of a repository's open agent pull requests; reads GraphQL, so never in a cloud session | [pr-sweep](openspec/specs/pr-sweep/spec.md) |

The wrap-up request has a limit: with `/autocompact` set below 800 000 tokens, or a model whose window is under 1M, compaction comes first and nothing is asked, so leave `/autocompact` at its default or above 800 000.

## Plugins

The tracked settings enable two Claude Code plugins in every consumer, and the check fails without them ([agent-permissions](openspec/specs/agent-permissions/spec.md)):

- `ponytail@ponytail` holds a session to the smallest complete change that `core/code-style.md` asks for, and gives `/ponytail-review` ([review toolkit](core/review-toolkit.md)). Its marketplace is GitHub `DietrichGebert/ponytail` at the tag `v5.3.3`, with `autoUpdate: false`; nothing moves the pin but a hand edit of `MARKETPLACE` in `bun/settings.ts` and of the harness's own settings, which consumers take on their next bump. After every turn it writes a row for its task board under `~/.config/ponytail/band/`, on the machine alone; its webhook is empty.
- `cc-plugin-you-should-know@builtin`, from Claude Code's built-in marketplace, which needs no entry. Anthropic ships it off by default, and its side agent, by third-party reports, spends the plan's limit. It runs only in first-party sessions, not under Bedrock, Vertex or Foundry, and is undocumented, so a build may rename or drop it.

The check reads both ids by name, never against what is installed: a renamed plugin loads nothing and the check still passes. On Claude Code 2.1.316 the settings alone did not keep ponytail installed: on a machine that never had it, run `claude plugin install ponytail@ponytail` once in a trusted clone. The VPS's start script does that itself ([orchestrator/README.md](orchestrator/README.md), step 12), for its persistent session alone; a board loop's pass there may run without ponytail. To turn a plugin off for yourself, set it to `false` in `.claude/settings.local.json`. Cloud sessions do not load either plugin. A revert of the harness leaves both entries in consumers, since sync removes nothing it does not own: delete them by hand.

## Skills

| Skill | What it does |
|---|---|
| `coderabbit` | Dispose of every CodeRabbit finding on a PR |
| `cloud-probe` | Report whether the harness installed and its gates run in a cloud session or routine |
| `feature-generator` | Expand `spec.md` into a dependency-ordered `features.md` |
| `playwright-cli` | Vendored reference for driving a browser via the Playwright CLI |
| `preflight` | Production pre-flight checklist for a branch |
| `session-wrapup` | End-of-session debrief, capture pass and pipeline yield, its ledger kept outside the tree under `~/.local/state/harness/pipeline-yield/` |
| `spec-generator` | Turn a vague product idea into a structured product spec |
| `triage` | Group a diff into feature areas with risk tiers |
| `warm` | Vet the dependencies a branch adds |
| `zombies` | Suggest tests worth writing via the ZOMBIES heuristic |

To add one, create `core/skills/<name>/SKILL.md` with `name` and `description` frontmatter and its instructions in the body below, and add a row here — name and one line, nothing the frontmatter already says. Use `spec-generator` and `feature-generator` only in a project that does not follow [OpenSpec](https://github.com/fission-ai/openspec).

Severities follow CodeRabbit's ladder, `🔴 Critical` > `🟠 Major` > `🟡 Minor` > `🔵 Trivial`; `triage`'s High/Medium/Low are risk tiers, not severities. Review skills end on a gate line, `PASS`, `OPEN` or `BLOCKED`, and the last one of the turn counts ([review toolkit](core/review-toolkit.md)); the line is the report to the model and the human, which no hook reads.

Skills listed in `skills-lock.json` are vendored: never edit them, re-vendor instead. The skills CLI writes to `.claude/skills/`, where the tracked link to `core/skills/` sits, so from the repository root take the link away first, move the result by hand and restore the link; the installer updates the hash in `skills-lock.json` itself:

```bash
rm .claude/skills/playwright-cli
npx -y skills add microsoft/playwright-cli --skill playwright-cli --agent claude-code
[ -f .claude/skills/playwright-cli/SKILL.md ] && rm -rf core/skills/playwright-cli && mv .claude/skills/playwright-cli core/skills/playwright-cli
ln -s ../../core/skills/playwright-cli .claude/skills/playwright-cli
git diff            # see what changed upstream
```

## Working on the harness

- The repository is its own consumer: it pins itself under `devDependencies`, so a session runs its gates from `node_modules/harness/`, and an edit to `bun/` holds no session until it merges and the pin moves past it. Three hooks are its own and reach no consumer: the skill recorder, the ready guard and the status guard ([harness-updates](openspec/specs/harness-updates/spec.md)).
- Run `bun run deps` first, then `git config core.hooksPath .githooks` once per clone. A push then runs the gates [commit-gates](openspec/specs/commit-gates/spec.md) lists, through `.githooks/gates.sh` (Biome and the type check need the install), unless the pre-PR runner passed every ref's tip it lands here, and the diff budget ([git and PRs](core/git-and-prs.md)).
- The mutation step reads the working tree: an uncommitted edit to a module `stryker.config.json`'s `mutate` lists, its tests, the fixtures they import or `bunfig.toml` fails every push. A push that changes one of them re-runs that module (a change to `bunfig.toml`, its preloads or Stryker's options, every module), needs Node on `PATH` and a tree with nothing modified or untracked outside `mutation/`, and fails until the rewritten `mutation/<name>.json` is committed and `harness.mutationFloor` set to the count the floor then names: before pushing, run `bun bun/mutation-run.ts`, commit what it writes, run it again and then `bun bun/mutation-floor.ts`, and commit the floor it names. `bun bun/mutation-run.ts --all --force` re-runs every listed module whole, about 6 minutes on the laptop. A module joins the list by a line in `mutate` and a run that writes its stored file, both in one pull request, if its suite runs in-process, it has no `import.meta.main` block, and no test it runs starts it with an environment built from scratch ([mutation-floor](openspec/specs/mutation-floor/spec.md)).
- Move the pin by hand: set its line in `package.json` to a `main` commit whose `test` run passed, run `bun install`, and open a pull request carrying `package.json` and `bun.lock`.
- `.claude/commands/opsx/` is OpenSpec's output: regenerate it with `openspec update`, never edit it here.

## Cloud sessions

A cloud session or routine runs the harness as a local one does ([cloud-sessions](openspec/specs/cloud-sessions/spec.md)):

- Attach `harness` alone: a session with two repositories reads no hooks, so the harness would be off without a word. Network access Trusted and no variables or secrets. Setup script: `npm i -g bun@1.4.2`, the bun CI runs. Nothing updates that version but a hand edit of every site that names it; `bun/bun-version.test.ts` fails when they disagree.
- GitHub's GraphQL API is closed there, so `gh pr` fails: open the pull request with `gh api -X POST repos/<owner>/<repo>/pulls -f title=<title> -f head=<branch> -f base=main`. `bun/work.ts resolve` fails there, having changed nothing, since it reads and resolves threads through GraphQL, and `bun/work.ts draft` fails there on a ready pull request, since `gh pr ready` goes through it. `.githooks` is off, so CI alone runs the tests. A consumer's cloud session gets the proxy's 403 for the harness tarball until its own cloud card is done.
- A routine's prompt is the unattended line and one tracked skill: see *Routines* in [core/autonomy.md](core/autonomy.md).
