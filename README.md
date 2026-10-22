# harness

The agent harness shared by several projects. It ships as a package (`package.json`, no lifecycle scripts).

## Layout

`core/` holds what any project can use. `core/rules.md` is the rulebook, and the docs it links sit beside it as `core/<doc>.md`, laid out as a project's copy holds them. `core/skills/` holds personal [Claude Code skills](https://code.claude.com/docs/en/skills), one per directory as `core/skills/<name>/SKILL.md`.

`bun/` holds what assumes Bun and TypeScript: the command guard and the hook text that boots it, the gates, and `check.ts`, which runs every check over a consumer's tree.

`orchestrator/` holds what a host of the user's own runs to start passes with nobody at a terminal: `pass.sh`, the wrapper a timer runs for one board-loop pass, at most one per repository at a time and none after a failed pass until the user removes its stop file.

## Working on the harness

The repository runs itself as its own consumer. `package.json` pins the harness under `devDependencies` and `.claude/settings.json` registers the hooks `bun/bootstrap.ts` lists, so a session runs its gates from `node_modules/harness/`, a merged commit, and an edit to `bun/` holds no session until it merges and the pin moves past it. A clone therefore runs `bun install` before any other command, which the bootstrap lets through alone; in a cloud session the `SessionStart` hook runs that install itself (*Cloud sessions* below). The pin moves by hand: edit its line in `package.json` to a `main` commit whose `test` run passed, run `bun install`, and open a pull request carrying both files. The skills stay linked to the working tree, `.claude/skills/<name>` → `../../core/skills/<name>`. Run `git config core.hooksPath .githooks` once per clone so a push runs `bun test` and reports the diff budget; CI runs both too, and fails the budget there. `.claude/commands/opsx/` is OpenSpec's output: regenerate it with `openspec update` and take a defect in it upstream, never edit it here.

## Cloud sessions

A Claude Code cloud session or routine on this repository runs the harness as a local one does, within what the cloud gives:

- **The environment.** Attach `harness` alone: a session with two repositories reads no hooks, so the harness would be off without a word. Network access Trusted, no variables and no secrets. Setup script: `npm i -g bun@1.4.2`, the bun CI runs. Nothing updates that version but a hand edit of every site that names it, the workflows' `bun-version` and the bump workflow below included; `bun/bun-version.test.ts` fails when they disagree.
- **The install.** When `CLAUDE_CODE_REMOTE` is `true`, the `SessionStart` hook runs `bun install --frozen-lockfile --ignore-scripts` before the stale-install notice. A hook's command is no tool call, so no permission prompt stops it, and a `bun install` the agent types still prompts. A failed install prints one line, and the notice then says the harness is not installed.
- **What the cloud lacks.** GitHub's GraphQL API, so `gh pr` commands and the `coderabbit` skill's thread read fail; a session opens its pull request with `gh api -X POST repos/<owner>/<repo>/pulls`, the one `gh api` write the command guard allows. `gates.jsonl` outlives no VM. `.githooks` is off, so a push runs no `bun test`; CI runs it. The cloud's built-in GitHub tools post as the user past every gate: `core/git-and-prs.md` forbids that channel.
- **Routines** are an option, not where timer flows live: those run on the VPS (`orchestrator/`), audits and blog reading included. A routine's prompt is the unattended line and one skill the repository tracks or its pinned harness ships: see *Routines* in `core/autonomy.md`. `cloud-probe` is the skill a routine probing the cloud calls.

## Skills

| Skill | What it does |
|---|---|
| `coderabbit` | Chew through CodeRabbit's PR comments: skip Trivial/Minor with a reason, verify Major+ against current code, plan, then apply after approval |
| `cloud-probe` | Report, in a cloud session or routine, whether the harness installed and its gates run: the install, the pin, `origin`'s form, the turn gate's mark, the guard's refusal on `main`, and the goal check's REST read; changes nothing |
| `coderabbit-local` | Run CodeRabbit via the `coderabbit` CLI on the branch's changes since it diverged (no PR needed), gated on `coderabbit doctor`, then triage as above |
| `feature-generator` | Expand `spec.md` into a dependency-ordered `features.md`, and keep the two in sync |
| `playwright-cli` | Vendored from [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) — reference for driving a browser via the Playwright CLI; do not edit, see Skill provenance |
| `preflight` | Production pre-flight checklist for a branch: env vars, config, migrations — everything needed once it merges |
| `session-wrapup` | End-of-session debrief: confidence check, fix & capture pass, OpenSpec state + next command + the session's board cards reconciled, optional save-point doc, pipeline yield per review skill, gate and capture kind |
| `spec-generator` | Turn a vague product idea (plus sketches/notes) into a structured product spec |
| `triage` | Group a diff into feature areas with risk tiers to decide where review time goes |
| `warm` | Vet dependencies a branch adds against the WARM check (Worth it, Alive, Right-sized, Maintained securely) plus a supply-chain Safety check (install scripts, typosquatting, release freshness) |
| `zombies` | Suggest tests worth writing via the ZOMBIES heuristic (Zero, One, Many, Boundaries, Interface, Exceptions, Simple) |

Whether a skill answers only to `/name` (`disable-model-invocation: true`) and whether it takes a base branch are recorded once, in each skill's frontmatter and `argument-hint`. This README deliberately doesn't restate them: a restatement drifts silently, because nothing breaks when it's wrong.

## Severity

One vocabulary everywhere: `🔴 Critical` > `🟠 Major` > `🟡 Minor` > `🔵 Trivial` — CodeRabbit's ladder, adopted because that one arrives from outside and can't be changed. `triage` is the exception on purpose: its High/Medium/Low are risk tiers for budgeting attention, not severities of findings.

## Gate lines

`warm`, `zombies`, `triage`, `coderabbit` and `coderabbit-local` end their output with a machine-readable last line — `WARM gate: PASS — 3 dependencies vetted.`, `ZOMBIES gate: BLOCKED — 3 gaps unaddressed.`, `TRIAGE gate: OPEN — 4 groups, 2 high-risk — High/Medium unread.`, `CODERABBIT gate: PASS — 7 findings, 7 dispositioned.` A driving agent reads the outcome without re-parsing the report, and a PR template or pre-push hook can require the lines to be present and `PASS`. The three states mean:

- **PASS** — nothing to act on, or everything dispositioned with a stated reason.
- **OPEN** — findings exist, nobody has dispositioned them yet. Transient: it must not survive the turn, unless what it waits on is the user's dismissal or, for `coderabbit`, a review of the head commit that has not landed. `triage` and `zombies` can only ever emit `OPEN`, because by design they decide nothing themselves.
- **BLOCKED** — the agent may not proceed alone: a `warm` Hold, a failed `coderabbit doctor`, a real defect the user declined to fix.

Whoever acts on a report re-emits its gate line after acting. **The last gate line of the turn is the one that counts** — that's what makes "the report alone is never the deliverable" mechanically checkable instead of a rule in prose.

## Consuming

A project takes the harness as one dependency pinned to a full commit, `"harness": "github:laidrivm/harness#<40-hex commit>"`, so `bun.lock` records exactly what a session, a hook and CI run. Then:

- Each skill the project uses is a tracked relative link, `.claude/skills/<name>` → `../../node_modules/harness/core/skills/<name>`. It resolves once `bun install` has run.
- The Bash `PreToolUse` hook in `.claude/settings.json` is the bootstrap, one of the hooks `bun/bootstrap.ts` lists. Before the install it lets only the install through; after it, it hands every command to the guard.
- The `UserPromptSubmit` and `Stop` hooks there run the turn gate, which refuses a turn that completes a task group and ends without the pre-PR sequence's gate lines and the record `bun/pre-pr.ts` writes in the gate ledger for the commit the turn ends on, unless it ends on a `BLOCKED — <what the user must decide>` line instead. It also ends a `/goal` run at the round ceiling in `bun/goal-rounds.ts`, counted in stops the goal continued since the prompt, with a `goal-ceiling:` reason and the goal left set for a resume. Before the install they let every prompt and turn through.
- The `PreToolUse` and `PostToolUseFailure` hooks there with no matcher run the loop guard. It counts each tool call that fails the same way, in one session or sub-agent: the same tool and input, and the same error once digits and whitespace are set aside. On the third such failure it adds a warning beside the error. Until the next prompt it then refuses that identical call before it runs, with a reason starting `loop-guard:`, so a launcher can tell this refusal from any other. Before the install, every call runs and no failure is counted.
- The `PostToolUse` and `PostToolUseFailure` hooks there matching `Bash` run the flake watch. It reads bun's reporter in each Bash call's output, whatever the command and the exit code. When a command that failed then passes in the same session, from the same directory, on the same tree — the same `HEAD`, uncommitted changes and untracked files that are not ignored — it tells the agent, beside the result, that the run is flaky rather than green, naming the tests that failed, and asks for a `flaky` finding and a card. It never blocks. Before the install, every call passes unread.
- The `PreToolUse` hook there matching the Notion connector's `notion-update-page` under any server name runs the Notion update guard, which refuses a call carrying `properties` beside any command but `update_properties`, since the connector drops them without an error; before the install it lets every call through.
- The `PermissionRequest` hook there matching `notion-create-comment` under any server name runs the question gate, which answers the prompt for that tool with `allow` only for a question to the user on a board card, and gives every other call no answer, so it prompts as before. In a session whose first prompt holds the line `This session runs unattended.`, where no prompt can be shown, it answers `deny` instead, with a message naming the condition the call failed and what would meet it. Where the ask settings below exist, it answers `deny` to a question in any session, attended or not, naming the ask command, since no question goes out from the user's account there. Before the install it answers nothing.
- `bun node_modules/harness/bun/notion-ask.ts <card id> <file>` is the ask command. It posts the question in `<file>` as a page-level comment on the card from a second Notion integration, one with comment capabilities alone, connected to the boards and nothing else. Its settings are `$XDG_CONFIG_HOME/harness/notion-ask.json`, or `~/.config/harness/notion-ask.json`, holding the integration's `token` and the user's Notion id as `user`, with mode 0600 or 0400; they stay on the laptop, and the runner's `notion-bot.json` is never read in their place. It checks the text as the question gate does, reads the card's comments and posts nothing while a question waits there, prints one line, never the token, and exits 1 when it posted nothing. It reads no page and writes no property, so the session sets `Assign` itself. `sync.ts` writes no allow entry for it: add `Bash(bun node_modules/harness/bun/notion-ask.ts *)` to the project's `permissions.allow`, or an unattended session is refused the command and reports its question unposted.
- The command guard, the Notion update guard, the question gate, the loop guard, the flake watch, the turn gate, the pre-PR runner, the goal check and the board loop record what they decide in `$XDG_STATE_HOME/harness/gates.jsonl` when that variable is an absolute path, and in `~/.local/state/harness/gates.jsonl` otherwise. One file serves every project, and each line names its project. Each guard records each refusal. The question gate records every call it sees: allowed, refused in an unattended session or for the ask command, or passed to the prompt. The loop guard records each warning and each refusal. The flake watch records each flaky run it names, with the commit it read. The turn gate records each refusal, pass and release of a turn that completed a task group, and each end at the round ceiling. The runner records each run with the commit it read, the goal check each verdict with the commit it read, and the board loop the outcome of each pass. No line holds command text. The file lives outside the tree, so the project has nothing to ignore. `session-wrapup` counts this project's lines into the pipeline-yield entry.
- The `SessionEnd` hook there, registered with a `timeout` of 60 seconds, runs the transcript archive. It copies the ended session's `<id>.jsonl`, and the `<id>/` directory beside it, into `harness/transcripts/<project>/` under the same state directory as the gate ledger, `<project>` being the name Claude Code gives the session's directory under its `projects/`. Beside them it writes `<id>.meta.json`, naming the session's `cwd`, branch, `HEAD`, end reason and export date. Every file there is 0600 and every directory 0700, whatever the umask, and nothing is scrubbed from a copy. Archiving a session again replaces its copy, and each export deletes every archived session last active more than 180 days ago. The hook exits 0 on every fault, and before the install it does nothing.
- The values the gates run with live under a `"harness"` key in the project's `package.json`, typed in `bun/config.ts`. A gate whose key is absent fails, naming it.
- `bun node_modules/harness/bun/sync.ts`, from the project's root, writes `core/rules.md` and the docs beside it into a tracked `harness/`, which the project's `CLAUDE.md` imports and which its review bot reads once the project's `.coderabbit.yaml` names `harness/*.md` under `knowledge_base.code_guidelines.filePatterns`. A copy that differs from the pin fails the check below, naming each file; an edit to a rule belongs here, not in the copy. It also writes the harness's hooks, the `Bash(` entries of the `deny` and `ask` lists and the `mcp__` entries of the `ask` list into `.claude/settings.json`, and `[install]` into `bunfig.toml`, leaving every other entry and key as it found them; nobody copies those by hand. A hook it writes ends with `# harness-managed`, which is how it tells its own from a project's, so a project hook that calls a harness script survives.
- `bun node_modules/harness/bun/check.ts`, from the project's root, runs every check over its tree.
- `bun node_modules/harness/bun/settings-local.ts`, from the project's root, sweeps the untracked `.claude/settings.local.json` against the tracked `.claude/settings.json`. It names each entry the tracked file already decides and each gap it leaves, and it fails until only machine-local entries remain. It runs only where that file exists, which is never a clone or CI, so it is not one of `check.ts`'s checks.
- `bun node_modules/harness/bun/board-loop.ts` is one pass of the board loop, and only the user starts it: from a terminal of their own or a host timer they set up (`orchestrator/pass.sh`), never from a Claude Code session, at the root of a clone used for nothing else. Two passes at once need two clones, never two worktrees of one. It takes no argument. It refuses a clone Claude Code has not trusted, since a session there ignores the tracked `permissions.allow`: run `claude` once in the clone, accept the trust dialog and `/exit`. A pass brings that clone to the default branch's tip by fast-forward alone and installs from the lockfile, so no session it launches has to. It refuses a tracked edit, and a commit no remote holds unless that commit sits on the branch of a step the pass could carry: that branch keeps it for the session that carries the step, and a pass refused after leaving it switches back to it first, unless a session's process group outlived the session. It then lists the takeable changes and the answer candidates, changes whose every group is ticked. A short `claude -p` session reads `Board view` on the board `harness.board` names, picks the one whose card comes first, an answer candidate's card only when it holds an answer, the user's or the `harness-answer` of the runner's own Notion integration, and then ahead of the rest, and moves that card from `proposed` or `applied` to `applying`. The pass carries that change's next apply step, or the answer as its next group, in one unattended `claude -p` session under that step's goal, which pushes nothing and opens nothing. Both sessions start with an environment built from an allowlist in `bun/board-loop-session.ts`, so no GitHub token, SSH agent or other variable of the runner's reaches them unless that list names it. When the step's branch already exists, in the clone or on `origin`, the pass tells the stage session that an earlier session left it, and to switch to it rather than create it; the runner never deletes or resets the branch. Once the session and everything it started have ended, the runner pushes the step's branch to `origin`, never by force, and opens its pull request with the title and the body the session's final message names — only when `HEAD` is on that branch and the goal check's `--before-push` form reads `goal met`. Otherwise it pushes nothing, and the pass is `open`. Just before the push it appends the step's repository, branch, stage session and clone, with the time, to `~/orchestrator/pr-sessions.jsonl`, the PR → session table, which only the orchestrator reads; the stage session is started with that session's id as its `--session-id`. A table it cannot write pushes nothing, and the pass is `open`. It pushes and opens with its user's own git and `gh` credentials unless its environment names a GitHub App: `HARNESS_GITHUB_APP_ID`, the App's ID, and `HARNESS_GITHUB_APP_KEY`, the path of its private key, both or neither, since one alone refuses the pass. With both, it reads the App's bot user before any session, so both sessions author and commit as that user, and only after the stage session mints a token for the clone's repository alone, pushing and opening with it over HTTPS even where `origin` is an SSH URL. Keep the key's file readable by the runner's user alone. Both sessions run as that same user, so they can read the file whatever the allowlist keeps from their environment: set the two only where the sessions run as another user, who cannot. Where `$XDG_CONFIG_HOME/harness/notion-bot.json`, or `~/.config/harness/notion-bot.json`, holds a Notion integration's `token` and the user's Notion id as `user`, the runner posts each stage session's question itself: both sessions are launched with `notion-create-comment` withheld and with the variable on which the question gate refuses every comment, the stage session is told to name its question in a `QUESTION:` line of its final message instead, and before the push the runner posts it on the carried change's card from the integration and sets `Assign` to the user. Before any session it reads the integration's own id with `GET /v1/users/me`, and a read that fails refuses the pass; the pick counts a `harness-answer` comment by that id alone, and the user's comment after the same question overrides it, whichever came first. The file must have mode 0600 or 0400, since a mode that grants its group or others any access refuses the pass, and it stays on the VPS, in the home of the runner's user, which no session's user can read; its token reaches no session. Without it, where the ask settings exist, the stage session is told to post its question with the ask command instead. Afterwards the runner runs the full goal check itself, both forms from a copy of the pin under `node_modules/harness/` taken before any session, prints one line, records the outcome, and exits 0 only when the step met its goal or nothing was takeable. Nothing registers it, and `check.ts` does not run it.
- `bun node_modules/harness/bun/pr-sweep.ts <owner>/<repo>` is one sweep of that repository's open agent pull requests: `feat/` and `spec/` branches from the repository itself, authored by the login of the `gh` credential it runs with, or by the GitHub App's bot when one is configured. With the board loop's two App settings, `HARNESS_GITHUB_APP_ID` and `HARNESS_GITHUB_APP_KEY`, both or neither, it reads that login first and then makes every call, each update and mark included, as the App, with one token minted for the run that names the swept repository alone; with one alone it exits 1 before any call. It reads no clone and re-runs no CI. It updates a branch behind its base by merge, never by rebase, and otherwise judges the head: a conflict, a `harness/` copy that drifted from its pinned `core/`, red CI, or a green head whose description an agent should check. It prints one JSON line per agent pull request on standard output, naming what it handed off and to whom, and marks each judged head with a `harness/sweep` commit status, unless its checks or mergeability are still pending, so a later run hands off no kind twice at one SHA. It exits 1 when any line reads `failed`, when the listing or a mark fails, and 2 on a bad argument. Its listing reads GitHub's GraphQL API, so it runs on the VPS or a laptop, never in a cloud session, where GraphQL is closed. Nothing starts it yet.
- A session whose installed harness is not the pinned one, as after a `git pull` that brought a bump, starts with one line naming both commits; `bun install` clears it. The `SessionStart` hook that prints it is another of the hooks `sync.ts` writes. In a cloud session the same hook first runs `bun install --frozen-lockfile --ignore-scripts`; a consumer's cloud session gets the proxy's 403 for the harness tarball until its own cloud card is done.
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