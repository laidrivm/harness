# harness

The agent harness shared by several projects. It ships as a package (`package.json`, no lifecycle scripts).

## Layout

`core/` holds what any project can use. `core/skills/` holds personal [Claude Code skills](https://code.claude.com/docs/en/skills), one per directory as `core/skills/<name>/SKILL.md`, symlinked into projects (or globally) with `link.sh`.

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
| `session-wrapup` | End-of-session debrief: confidence check, fix & capture pass, OpenSpec state + next command, optional save-point doc, pipeline yield per review skill |
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

## Linking

`link.sh` symlinks a skill from `core/skills/` into a project's `.claude/skills/` (relative links, so they survive in git) or into `~/.claude/skills` for global use.

```bash
./link.sh triage /Project/d2ass          # link one skill into a project
./link.sh all /Project/d2ass             # link every skill
./link.sh triage global                  # link into ~/.claude/skills
./link.sh triage /Project/d2ass --unlink # remove the link (also works with `all`)
```

It refuses to overwrite existing files or links pointing elsewhere — use `--unlink` first.

## Adding a skill

Create `core/skills/<name>/SKILL.md` with `name` and `description` frontmatter; `link.sh all` picks it up automatically. Add a row to the table above — name and one line, nothing the frontmatter already says.

## Skill provenance

Skills listed in `skills-lock.json` are **vendored** — reference docs for someone else's tool, never edit them locally (edits get wiped on re-vendor, and an unedited copy is what keeps the doc in sync with the binary); re-vendor to update. Everything else is **owned** — forked or written here, edit freely via fix & capture. The lock's `computedHash` doubles as a drift detector: if it stops matching, someone edited a vendored skill.

To re-vendor (the skills CLI expects `.claude/skills/`, but this repo keeps skills in `core/skills/`, so the move is manual), from the repository root:

```bash
npx -y skills add microsoft/playwright-cli --skill playwright-cli --agent claude-code
rm -rf core/skills/playwright-cli && mv .claude/skills/playwright-cli core/skills/playwright-cli
rm -rf .claude/skills
git diff            # see what changed upstream
git add -A && git commit -m "re-vendor playwright-cli skill"
```

The installer updates the hash in `skills-lock.json` itself, so the lock stays consistent without hand-editing.

## Notes

Use `spec-generator` and `feature-generator` skills only if you don't want to follow [OpenSpec framework](https://github.com/fission-ai/openspec). Otherwise, don't link them to your project.