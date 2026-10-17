# harness

The agent harness shared by several projects. It ships as a package (`package.json`, no lifecycle scripts).

## Layout

`core/` holds what any project can use. `core/rules.md` is the rulebook, and the docs it links sit beside it as `core/<doc>.md`, laid out as a project's copy holds them. `core/skills/` holds personal [Claude Code skills](https://code.claude.com/docs/en/skills), one per directory as `core/skills/<name>/SKILL.md`.

`bun/` holds what assumes Bun and TypeScript: the command guard and the hook text that boots it, the gates, and `check.ts`, which runs every check over a consumer's tree.

## Working on the harness

The repository runs itself as its own consumer. `package.json` pins the harness under `devDependencies` and `.claude/settings.json` registers the hooks `bun/bootstrap.ts` lists, so a session runs its gates from `node_modules/harness/`, a merged commit, and an edit to `bun/` holds no session until it merges and the pin moves past it. A clone therefore runs `bun install` before any other command, which the bootstrap lets through alone. The pin moves by hand: edit its line in `package.json` to a `main` commit whose `test` run passed, run `bun install`, and open a pull request carrying both files. The skills stay linked to the working tree, `.claude/skills/<name>` → `../../core/skills/<name>`. Run `git config core.hooksPath .githooks` once per clone so a push runs `bun test` and reports the diff budget; CI runs both too, and fails the budget there. `.claude/commands/opsx/` is OpenSpec's output: regenerate it with `openspec update` and take a defect in it upstream, never edit it here.

## Skills

| Skill | What it does |
|---|---|
| `checklist` | Convert the current plan/review/task list in context into a persistent markdown checklist under `.claude/plans/` |
| `code-review` | Review staged changes or a specific area, optionally delegating to a chosen agent |
| `coderabbit` | Chew through CodeRabbit's PR comments: skip Trivial/Minor with a reason, verify Major+ against current code, plan, then apply after approval |
| `coderabbit-local` | Run CodeRabbit via the `coderabbit` CLI on the branch's changes since it diverged (no PR needed), gated on `coderabbit doctor`, then triage as above |
| `feature-generator` | Expand `spec.md` into a dependency-ordered `features.md`, and keep the two in sync |
| `first-five` | Scan a diff against the First Five checklist (error handling, input boundaries, external calls, state mutations, assumed dependencies) |
| `playwright-cli` | Vendored from [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) — reference for driving a browser via the Playwright CLI; do not edit, see Skill provenance |
| `pr-brief` | Compose the PR title and description once the gates pass — reads the gate lines, the diff and the plan, writes nothing |
| `preflight` | Production pre-flight checklist for a branch: env vars, config, migrations — everything needed once it merges |
| `review-order` | Scannable review checklist grouped by feature, four-pass order (types, data flow, business logic, edge cases) |
| `session-wrapup` | End-of-session debrief: confidence check, fix & capture pass, OpenSpec state + next command + the session's board cards reconciled, optional save-point doc, pipeline yield per review skill |
| `ship` | Push, open or update the PR, wait for CodeRabbit on that SHA, work the findings, repeat, then merge on approval and return to an up-to-date base |
| `spec-generator` | Turn a vague product idea (plus sketches/notes) into a structured product spec |
| `triage` | Group a diff into feature areas with risk tiers to decide where review time goes |
| `warm` | Vet dependencies a branch adds against the WARM check (Worth it, Alive, Right-sized, Maintained securely) plus a supply-chain Safety check (install scripts, typosquatting, release freshness) |
| `zombies` | Suggest tests worth writing via the ZOMBIES heuristic (Zero, One, Many, Boundaries, Interface, Exceptions, Simple) |

Whether a skill answers only to `/name` (`disable-model-invocation: true`) and whether it takes a base branch are recorded once, in each skill's frontmatter and `argument-hint`. This README deliberately doesn't restate them: a restatement drifts silently, because nothing breaks when it's wrong.

## Severity

One vocabulary everywhere: `🔴 Critical` > `🟠 Major` > `🟡 Minor` > `🔵 Trivial` — CodeRabbit's ladder, adopted because that one arrives from outside and can't be changed. `code-review` used to have its own five levels (Error/Warning/Suggestion/Nitpick); it doesn't any more. `triage` is the exception on purpose: its High/Medium/Low are risk tiers for budgeting attention, not severities of findings.

## Gate lines

`warm`, `zombies`, `triage`, `coderabbit` and `coderabbit-local` end their output with a machine-readable last line — `WARM gate: PASS — 3 dependencies vetted.`, `ZOMBIES gate: BLOCKED — 3 gaps unaddressed.`, `TRIAGE gate: OPEN — 4 groups, 2 high-risk — High/Medium unread.`, `CODERABBIT gate: PASS — 7 findings, 7 dispositioned.` A driving agent reads the outcome without re-parsing the report, and a PR template or pre-push hook can require the lines to be present and `PASS`. The three states mean:

- **PASS** — nothing to act on, or everything dispositioned with a stated reason.
- **OPEN** — findings exist, nobody has dispositioned them yet. Transient: it must not survive the turn. `triage` and `zombies` can only ever emit `OPEN`, because by design they decide nothing themselves.
- **BLOCKED** — the agent may not proceed alone: a `warm` Hold, a failed `coderabbit doctor`, a real defect the user declined to fix.

Whoever acts on a report re-emits its gate line after acting. **The last gate line of the turn is the one that counts** — that's what makes "the report alone is never the deliverable" mechanically checkable instead of a rule in prose.

## Consuming

A project takes the harness as one dependency pinned to a full commit, `"harness": "github:laidrivm/harness#<40-hex commit>"`, so `bun.lock` records exactly what a session, a hook and CI run. Then:

- Each skill the project uses is a tracked relative link, `.claude/skills/<name>` → `../../node_modules/harness/core/skills/<name>`. It resolves once `bun install` has run.
- The Bash `PreToolUse` hook in `.claude/settings.json` is the bootstrap, one of the hooks `bun/bootstrap.ts` lists. Before the install it lets only the install through; after it, it hands every command to the guard.
- The `UserPromptSubmit` and `Stop` hooks there run the turn gate, which refuses a turn that completes a task group and ends without the pre-PR sequence's gate lines and the record `bun/pre-pr.ts` writes in the gate ledger for the commit the turn ends on, unless it ends on a `BLOCKED — <what the user must decide>` line instead. It also ends a `/goal` run at the round ceiling in `bun/goal-rounds.ts`, counted in stops the goal continued since the prompt, with a `goal-ceiling:` reason and the goal left set for a resume. Before the install they let every prompt and turn through.
- The `PreToolUse` and `PostToolUseFailure` hooks there with no matcher run the loop guard. It counts each tool call that fails the same way, in one session or sub-agent: the same tool and input, and the same error once digits and whitespace are set aside. On the third such failure it adds a warning beside the error. Until the next prompt it then refuses that identical call before it runs, with a reason starting `loop-guard:`, so a launcher can tell this refusal from any other. Before the install, every call runs and no failure is counted.
- The `PreToolUse` hook there matching the Notion connector's `notion-update-page` under any server name runs the Notion update guard, which refuses a call carrying `properties` beside any command but `update_properties`, since the connector drops them without an error; before the install it lets every call through.
- The `PermissionRequest` hook there matching `notion-create-comment` under any server name runs the question gate, which answers the prompt for that tool with `allow` only for a question to the user on a board card, and gives every other call no answer, so it prompts as before; before the install it answers nothing.
- The command guard, the Notion update guard, the question gate, the loop guard, the turn gate, the pre-PR runner, the goal check and the board loop record what they decide in `$XDG_STATE_HOME/harness/gates.jsonl` when that variable is an absolute path, and in `~/.local/state/harness/gates.jsonl` otherwise. One file serves every project, and each line names its project. Each guard records each refusal. The question gate records every call it sees, allowed or passed to the prompt. The loop guard records each warning and each refusal. The turn gate records each refusal, pass and release of a turn that completed a task group, and each end at the round ceiling. The runner records each run with the commit it read, the goal check each verdict with the commit it read, and the board loop the outcome of each pass. No line holds command text. The file lives outside the tree, so the project has nothing to ignore. `session-wrapup` counts this project's lines into the pipeline-yield entry.
- The values the gates run with live under a `"harness"` key in the project's `package.json`, typed in `bun/config.ts`. A gate whose key is absent fails, naming it.
- `bun node_modules/harness/bun/sync.ts`, from the project's root, writes `core/rules.md` and the docs beside it into a tracked `harness/`, which the project's `CLAUDE.md` imports and which its review bot reads once the project's `.coderabbit.yaml` names `harness/*.md` under `knowledge_base.code_guidelines.filePatterns`. A copy that differs from the pin fails the check below, naming each file; an edit to a rule belongs here, not in the copy. It also writes the harness's hooks, the `Bash(` entries of the `deny` and `ask` lists and the `mcp__` entries of the `ask` list into `.claude/settings.json`, and `[install]` into `bunfig.toml`, leaving every other entry and key as it found them; nobody copies those by hand. A hook it writes ends with `# harness-managed`, which is how it tells its own from a project's, so a project hook that calls a harness script survives.
- `bun node_modules/harness/bun/check.ts`, from the project's root, runs every check over its tree.
- `bun node_modules/harness/bun/settings-local.ts`, from the project's root, sweeps the untracked `.claude/settings.local.json` against the tracked `.claude/settings.json`. It names each entry the tracked file already decides and each gap it leaves, and it fails until only machine-local entries remain. It runs only where that file exists, which is never a clone or CI, so it is not one of `check.ts`'s checks.
- `bun node_modules/harness/bun/board-loop.ts` is one pass of the board loop, and only the user starts it: from a terminal of their own, never from a Claude Code session, at the root of a clone used for nothing else. It takes no argument. It refuses a clone Claude Code has not trusted, since a session there ignores the tracked `permissions.allow`: run `claude` once in the clone, accept the trust dialog and `/exit`. A pass brings that clone to the default branch's tip by fast-forward alone and installs from the lockfile, so no session it launches has to. It refuses a tracked edit, and a commit no remote holds unless that commit sits on the branch of a step the pass could carry: that branch keeps it for the session that carries the step, and a pass refused after leaving it switches back to it first. It then lists the takeable changes and the answer candidates, changes whose every group is ticked. A short `claude -p` session reads `Board view` on the board `harness.board` names, picks the one whose card comes first, an answer candidate's card only when it holds the user's answer and then ahead of the rest, and moves that card from `proposed` or `applied` to `applying`. The pass carries that change's next apply step, or the answer as its next group, in one unattended `claude -p` session under that step's goal. When the step's branch already exists, in the clone or on `origin`, the pass tells the stage session that an earlier session left it, and to switch to it rather than create it; the runner never deletes, resets or pushes the branch. Afterwards it runs the goal check itself, from a copy of the pin under `node_modules/harness/` taken before any session, prints one line, records the outcome, and exits 0 only when the step met its goal or nothing was takeable. Nothing registers it, and `check.ts` does not run it.
- A session whose installed harness is not the pinned one, as after a `git pull` that brought a bump, starts with one line naming both commits; `bun install` clears it. The `SessionStart` hook that prints it is another of the hooks `sync.ts` writes.
- The project bumps itself daily with the workflow below, saved as `.github/workflows/harness-bump.yml`. `verify` moves the pin to the harness's newest `main` commit once its `test` run passed, then runs the new harness's sync and check and the command under `"harness": { "bumpTest": … }`. That command is the project's unit tests, the ones needing no database, Docker or browser. It has no default because each project spells it differently. `verify` holds a read-only token while it runs the project's tests. `land` holds the write token: it redoes the edit running only bun and the harness's own code (the pinned `bump.ts` and the new harness's `sync.ts`), never the project's other dependencies, and pushes to `main` only the tree `verify` checked. Bumps arrive unattended only while the schedule is enabled. In a public repository GitHub disables it after 60 days without activity, no later harness commit restarts it, and `gh workflow enable harness-bump.yml` does.

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

## Adding a skill

Create `core/skills/<name>/SKILL.md` with `name` and `description` frontmatter; a consumer links it by name. Add a row to the table above — name and one line, nothing the frontmatter already says.

## Skill provenance

Skills listed in `skills-lock.json` are **vendored** — reference docs for someone else's tool, never edit them locally (edits get wiped on re-vendor, and an unedited copy is what keeps the doc in sync with the binary); re-vendor to update. Everything else is **owned** — forked or written here, edit freely via fix & capture. The lock's `computedHash` doubles as a drift detector: if it stops matching, someone edited a vendored skill.

To re-vendor (the skills CLI expects `.claude/skills/`, but this repo keeps skills in `core/skills/`, so the move is manual), from the repository root:

```bash
npx -y skills add microsoft/playwright-cli --skill playwright-cli --agent claude-code
[ -f .claude/skills/playwright-cli/SKILL.md ] && rm -rf core/skills/playwright-cli && mv .claude/skills/playwright-cli core/skills/playwright-cli
rmdir .claude/skills
git diff            # see what changed upstream
git add -A && git commit -m "re-vendor playwright-cli skill"
```

The installer updates the hash in `skills-lock.json` itself, so the lock stays consistent without hand-editing.

## Notes

Use `spec-generator` and `feature-generator` skills only if you don't want to follow [OpenSpec framework](https://github.com/fission-ai/openspec). Otherwise, don't link them to your project.