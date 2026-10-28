# harness

The agent harness shared by several projects: a rulebook, Claude Code skills, and the hooks and gates that hold a session to them. It ships as a package (`package.json`, no lifecycle scripts) that each project pins to one commit. What each piece does in full is in its spec under `openspec/specs/`; this page says what lives where and links the contract.

## Layout

- `core/` — what any project can use: `core/rules.md`, the rulebook, with the docs it links beside it as `core/<doc>.md`, and `core/skills/<name>/SKILL.md`, one [Claude Code skill](https://code.claude.com/docs/en/skills) per directory.
- `bun/` — what assumes Bun and TypeScript: the command guard and the hook text that boots it, the gates, and `check.ts`, which runs every check over a consumer's tree.
- `orchestrator/` — what a host of the user's own runs to start passes with nobody at a terminal ([orchestrator/README.md](orchestrator/README.md), [spec](openspec/specs/orchestrator/spec.md)).
- `openspec/` — the specs (`specs/<capability>/spec.md`) and the changes that made them, with each decision's rationale in the archived `design.md`.

## Consuming

1. Add the harness as one dependency pinned to a full commit, `"harness": "github:laidrivm/harness#<40-hex commit>"`, and run `bun install`.
2. Link each skill the project uses as a tracked relative link, `.claude/skills/<name>` → `../../node_modules/harness/core/skills/<name>`.
3. Put the values the gates run with under a `"harness"` key in `package.json`, typed in `bun/config.ts`; a gate whose key is absent fails, naming it.
4. From the project's root, run `bun node_modules/harness/bun/sync.ts`. It writes the rulebook and its docs into a tracked `harness/`, which the project's `CLAUDE.md` imports, the harness's hooks and its `deny` and `ask` entries into `.claude/settings.json`, and `[install]` into `bunfig.toml` ([harness-updates](openspec/specs/harness-updates/spec.md)). Edit a rule in the harness, never in the copy. So that the review bot reads the rules, name `harness/*.md` yourself under `knowledge_base.code_guidelines.filePatterns` in the project's `.coderabbit.yaml`.
5. Add to `permissions.allow` what sync does not write: `Skill(code-review)` where unattended sessions run the pre-PR sequence's local review — it matches the skill's name, never its arguments, so it also allows `ultra --post`, which posts under the user's account — and `Bash(bun node_modules/harness/bun/notion-ask.ts *)` and `Bash(bun node_modules/harness/bun/work.ts *)` for the commands below.
6. `bun node_modules/harness/bun/check.ts` runs every check over the tree; `bun node_modules/harness/bun/settings-local.ts` sweeps the untracked `.claude/settings.local.json` against the tracked policy ([agent-permissions](openspec/specs/agent-permissions/spec.md)).
7. Bump daily with the workflow below, saved as `.github/workflows/harness-bump.yml`. `verify` moves the pin to the harness's newest green `main` commit and runs sync, check and the command under `"harness": { "bumpTest": … }`, the project's unit tests; `land` pushes only the tree `verify` checked ([harness-updates](openspec/specs/harness-updates/spec.md)). In a public repository GitHub disables the schedule after 60 days without activity; `gh workflow enable harness-bump.yml` restarts it.

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
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.4.2
      - run: bun install --frozen-lockfile --ignore-scripts
      - run: bun node_modules/harness/bun/bump.ts land "$SHA" "$TREE"
        env:
          SHA: ${{ needs.verify.outputs.sha }}
          TREE: ${{ needs.verify.outputs.tree }}
```

## Hooks and commands

Until `bun install` has run, the hooks stand aside: the bootstrap lets only the install through, and in a cloud session the `SessionStart` hook runs that install itself. Each guard and gate records what it decides in the gate ledger, `gates.jsonl` under the user's state directory ([gate-ledger](openspec/specs/gate-ledger/spec.md)).

| Piece | What it is for | Contract |
|---|---|---|
| Bootstrap and command guard (`PreToolUse` Bash) | lets only the install through before it, then checks every command against the policy | [agent-permissions](openspec/specs/agent-permissions/spec.md), [commit-gates](openspec/specs/commit-gates/spec.md) |
| Turn gate (`UserPromptSubmit`, `Stop`) | refuses a turn that completes a task group without the pre-PR gate lines and records; ends a `/goal` run at its round ceiling | [commit-gates](openspec/specs/commit-gates/spec.md), [stage-goal](openspec/specs/stage-goal/spec.md) |
| Loop guard (`PreToolUse`, `PostToolUseFailure`) | warns on the third identical failed call and refuses it until the next prompt | [loop-guard](openspec/specs/loop-guard/spec.md) |
| Flake watch (`PostToolUse`, `PostToolUseFailure` Bash) | names a run that passes after an identical failed one as flaky; never blocks | [flaky-tests](openspec/specs/flaky-tests/spec.md) |
| Notion update guard | refuses a card write whose `properties` the connector would drop | [task-board](openspec/specs/task-board/spec.md) |
| Question gate (`PermissionRequest`) | lets a question to the user on a board card through without a prompt | [agent-permissions](openspec/specs/agent-permissions/spec.md) |
| Stale-install notice (`SessionStart`) | names an install that lags the pin; in a cloud session runs the install first | [harness-updates](openspec/specs/harness-updates/spec.md), [cloud-sessions](openspec/specs/cloud-sessions/spec.md) |
| Transcript archive (`SessionEnd`) | keeps a private (0600) copy of each ended session's transcript for 180 days; nothing is scrubbed from it | [transcript-archive](openspec/specs/transcript-archive/spec.md) |
| `bun/notion-ask.ts <card> <file>` | posts a question on a card from a second Notion integration, not the user's account. That integration reads pages and comments and writes comments, on the boards alone; its settings are `~/.config/harness/notion-ask.json` (or under `$XDG_CONFIG_HOME`), holding its `token` and the user's Notion id as `user`, mode 0600 or 0400 | [agent-permissions](openspec/specs/agent-permissions/spec.md), [task-board](openspec/specs/task-board/spec.md) |
| `bun/work.ts take --card <id>` | prints everything a session needs to take a card; writes nothing | [work-take](openspec/specs/work-take/spec.md) |
| `bun/work.ts finish` | pushes, opens the pull request as a draft and marks it ready unless a question waits on the card | [work-finish](openspec/specs/work-finish/spec.md) |
| `bun/work.ts status --card <id> --to <status>` | how the harness's own sessions move a card's `Status`, only where `origin/main` proves the stage; needs the ask integration's *Update content* capability | [feature workflow](core/feature-workflow.md) |
| `bun/pre-pr.ts [<base>]` | runs the pre-PR sequence's deterministic steps and names the ones the diff requires | [pre-pr-runner](openspec/specs/pre-pr-runner/spec.md), [review toolkit](core/review-toolkit.md) |
| `bun/board-loop.ts` | one unattended pass of the board loop, started only by the user or a host timer | [board-loop](openspec/specs/board-loop/spec.md) |
| `bun/pr-sweep.ts <owner>/<repo>` | one sweep of a repository's open agent pull requests; reads GraphQL, so never in a cloud session | [pr-sweep](openspec/specs/pr-sweep/spec.md) |

## Skills

| Skill | What it does |
|---|---|
| `coderabbit` | Dispose of every CodeRabbit finding on a PR |
| `cloud-probe` | Report whether the harness installed and its gates run in a cloud session or routine |
| `coderabbit-local` | Run CodeRabbit's CLI on the branch, then triage as above |
| `feature-generator` | Expand `spec.md` into a dependency-ordered `features.md` |
| `playwright-cli` | Vendored reference for driving a browser via the Playwright CLI |
| `preflight` | Production pre-flight checklist for a branch |
| `session-wrapup` | End-of-session debrief, capture pass and pipeline yield |
| `spec-generator` | Turn a vague product idea into a structured product spec |
| `triage` | Group a diff into feature areas with risk tiers |
| `warm` | Vet the dependencies a branch adds |
| `zombies` | Suggest tests worth writing via the ZOMBIES heuristic |

To add one, create `core/skills/<name>/SKILL.md` with `name` and `description` frontmatter and add a row here; everything else about it lives in its frontmatter. Use `spec-generator` and `feature-generator` only in a project that does not follow [OpenSpec](https://github.com/fission-ai/openspec).

Severities follow CodeRabbit's ladder, `🔴 Critical` > `🟠 Major` > `🟡 Minor` > `🔵 Trivial`; `triage`'s High/Medium/Low are risk tiers, not severities. Review skills end on a gate line, `PASS`, `OPEN` or `BLOCKED`, and the last one of the turn counts ([review toolkit](core/review-toolkit.md)).

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
- Run `bun install` first, then `git config core.hooksPath .githooks` once per clone, so a push runs `bun test` and the diff budget ([git and PRs](core/git-and-prs.md)).
- Move the pin by hand: set its line in `package.json` to a `main` commit whose `test` run passed, run `bun install`, and open a pull request carrying `package.json` and `bun.lock`.
- `.claude/commands/opsx/` is OpenSpec's output: regenerate it with `openspec update`, never edit it here.

## Cloud sessions

A cloud session or routine runs the harness as a local one does ([cloud-sessions](openspec/specs/cloud-sessions/spec.md)):

- Attach `harness` alone: a session with two repositories reads no hooks, so the harness would be off without a word. Network access Trusted and no variables or secrets. Setup script: `npm i -g bun@1.4.2`, the bun CI runs. Nothing updates that version but a hand edit of every site that names it; `bun/bun-version.test.ts` fails when they disagree.
- GitHub's GraphQL API is closed there, so `gh pr` fails: open the pull request with `gh api -X POST repos/<owner>/<repo>/pulls`. `.githooks` is off, so CI alone runs the tests. A consumer's cloud session gets the proxy's 403 for the harness tarball until its own cloud card is done.
- A routine's prompt is the unattended line and one tracked skill: see *Routines* in [core/autonomy.md](core/autonomy.md).
