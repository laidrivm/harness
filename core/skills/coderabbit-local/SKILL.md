---
name: coderabbit-local
description: Run CodeRabbit locally with the `coderabbit` CLI against the changes this branch made since it diverged from its base — no PR needed — then triage the findings the same way the `coderabbit` skill triages PR comments. Use when the user wants a CodeRabbit review before pushing or opening a PR, asks to "run coderabbit", "coderabbit review", or wants the bot's take on the current branch.
argument-hint: "[base branch] [--all]"
allowed-tools: "Bash(coderabbit doctor:*), Bash(coderabbit review:*), Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Read, Edit, Grep, Glob"
---

# CodeRabbit (local CLI)

For findings on an existing PR, use the `coderabbit` skill instead — this one reviews the working branch before there is a PR.

## Arguments

Raw arguments: $ARGUMENTS

- A branch name → the **base branch** to review against. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`. Call the result `<base>`.
- `--all` → give 🔵 Trivial the same reading 🟡 Minor gets.

## Instructions

### 1. Preflight with `coderabbit doctor`

```bash
coderabbit doctor
```

It checks the CLI version, storage, auth state, git repository and backend/WebSocket connectivity, and **exits 1 on any failure**. A review takes minutes; this takes seconds — always run it first and stop on a non-zero exit rather than discovering stale auth at the end.

On failure, report which check failed and what fixes it — `coderabbit auth login` for auth, a network/VPN issue for connectivity, [the install docs](https://docs.coderabbit.ai/cli/overview) if `coderabbit` is missing. **Do not install it yourself**, and never pipe an install script into a shell.

Then confirm there is something to review: `git diff --stat <base>...HEAD` for what is committed, and `git status --short` for what is staged, unstaged or untracked — the review reads the first two kinds always and untracked files with `--include-untracked`. Stop only when the first prints nothing and the second lists nothing but untracked (`??`) files you are not including, and say so.

### 2. Review

```bash
coderabbit review --base <base> --agent --config .coderabbit.yaml CLAUDE.md
```

This reviews the branch's tracked changes (committed, staged and unstaged) against `<base>`. It commonly takes several minutes — give the call a generous timeout and don't rerun it because it seems slow. Add `--include-untracked` when new files aren't staged yet, and `--light` only if the user asks for a faster, shallower pass.

Never pipe the review through a command that buffers — `tail`, `head`, `sort`, `wc`. `--agent` emits one JSON object per line as the review proceeds, and a buffer holds all of them until the process exits: a run that hangs and a run that is merely slow both look like an empty file, and a run refused for quota looks like a run that found nothing. Read the stream directly, or `tee` it to a file and read that file while it grows.

The review quota is shared with the CodeRabbit web app, so a local run can be refused because of reviews started in the browser. The CLI's message mentions only billing, which reads as a plan problem when it is not.

`--agent` gives structured findings instead of prose — the CLI itself recommends it under Claude. `--config` takes the files the CLI does *not* pick up on its own; drop from the list whichever doesn't exist in the repo, and add other convention files (`AGENTS.md`, `.cursorrules`) when they do.

### 3. Sort by severity

Findings carry the same severity ladder as PR comments: `🔵 Trivial` < `🟡 Minor` < `🟠 Major` < `🔴 Critical`. If a finding has no explicit severity, infer it from the heading (`⚠️ Potential issue` → Major, `🛠️ Refactor suggestion` / `🧹 Nitpick` → Minor) and mark it `(inferred)`.

Severity budgets how much scrutiny a finding earns — it never decides whether the finding is right. A correct, cheap Minor gets fixed; a wrong Major gets rejected.

- 🔵 Trivial → **skipped** by default, one line each with the reason. No verification, no reading files.
- 🟡 Minor → **read it, then decide.** Skip when it is taste, when the project has a settled convention the bot does not know, or when the fix costs more than the defect is worth. Fix when it is correct and the change is small and self-contained. `below severity threshold` is not a reason on its own.
- 🟠 Major, 🔴 Critical → **verify** each one against the current code: read the file at the referenced path and line as it is now, then decide **fix**, **already fixed**, or **reject** (say concretely what the bot missed).
- `--all` → give 🔵 Trivial the same reading 🟡 Minor gets.

Ponytail applies to the fix itself: take the smallest correct change, not necessarily the bot's suggested diff.

### 4. Show the plan, then stop

```
## CodeRabbit — feat/voting vs main (5 findings)

### Fixing (2)

**1. src/cli.ts:34** — 🟡 Minor · Functional Correctness
`--limit` parsed with `parseInt`, so `--limit 5x` silently becomes 5.
→ `Number()` + isFinite check

**2. src/rules/loader.ts:41** — 🟠 Major · Functional Correctness
Empty rule file silently yields an empty ruleset instead of erroring.
→ throw on empty parse result

### Not fixing (1)

**3. src/rules/loader.ts:12** — 🟠 Major · Performance
Claims the regex is recompiled per call; it's module-level const. Bot is wrong.

### Skipped (2)

4. src/cli.ts:20 — 🔵 Trivial · Trivial, skipped by default
5. README.md:8 — 🟡 Minor · read it: wants the options table alphabetised, the
   order is grouped by workflow on purpose

5 findings, 2 to fix. Apply?
CODERABBIT-LOCAL gate: OPEN — 5 findings, 2 fixes awaiting approval.
```

Wait for approval. Then apply the approved fixes with `Edit`, and report what changed.

**The project overrides this.** If the repo's own review policy (`CLAUDE.md`, `docs/`, a gate the project defines) prescribes applying verified findings without asking, follow the project, not this skill: apply them before showing the plan, list them under `### Applied (N)`, and keep no approval gate on fixes at any severity. Where the project puts the approval on the dismissal instead, a 🟠 Major or 🔴 Critical you propose to reject or skip goes to the user with what the bot missed, and the gate stays OPEN until they settle it. Name the rule you followed in one line under the heading.

### 5. Gate line

Every output ends with a machine-readable last line, exactly one of:

- `CODERABBIT-LOCAL gate: PASS — N findings, N dispositioned.` (every finding fixed, skipped or rejected)
- `CODERABBIT-LOCAL gate: PASS — no findings.`
- `CODERABBIT-LOCAL gate: PASS — no changes on this branch.` (step 1 found nothing to review)
- `CODERABBIT-LOCAL gate: OPEN — N findings, M fixes awaiting approval.` (the plan in step 4, before the user answers)
- `CODERABBIT-LOCAL gate: OPEN — N findings, M dismissals awaiting the user.` (fixes already applied under a project policy; what waits is a Major+ you propose to reject or skip)
- `CODERABBIT-LOCAL gate: BLOCKED — N findings, M undispositioned.` (the arithmetic didn't close, or a real defect was declined — name them)
- `CODERABBIT-LOCAL gate: BLOCKED — coderabbit doctor failed: <check>.` (step 1 stopped the run; no review happened)
- `CODERABBIT-LOCAL gate: BLOCKED — review refused: <reason>.` (step 2 never produced findings — rate limit, auth revoked mid-run, service error; name the reason and the wait if the CLI gives one)
- `CODERABBIT-LOCAL gate: BLOCKED — review did not return: <what the last event was>.` (the CLI was still running and had stopped emitting; name the last event seen and how long it ran)

It exists so a driving agent, PR template or hook can check the step ran and closed without re-parsing the report.

## Rules

- **`coderabbit doctor` first, every time.** A failed check stops the skill; don't attempt the review anyway.
- **The arithmetic must close.** Applied + fixing + not fixing + skipped = findings reported. Print the total in the heading and re-check it before showing the plan.
- **Skipped is a list, not a count.** One line per skipped finding with its path and reason, even for Trivial.
- **Number every finding sequentially across the whole report** — Applied, then Fixing, then Not fixing, then Skipped, never restarting per section. The last number equals the total in the heading, and "apply 3 and 7" means exactly two findings. Keep the same numbers when you report what changed after approval.
- **Severity budgets attention, not belief.** A Minor is skipped because you read it and judged the change not worth making, never because of its label.
- **No fixes before approval**, unless the project's own policy overrides it (step 4). Where it does, the approval moves rather than disappears: it attaches to dismissing a Major or above. Steps 1–3 change nothing on disk either way.
- **Rejections need a concrete reason** — what the bot missed, not "not applicable".
- **The environment is not a finding.** A fact about where the diff lands — repo conventions, a missing CI job, how downstream consumes the change — is not a defect in the diff and never holds the gate `BLOCKED`. Close the gate on the findings and report the environment fact separately, below the gate line.
- **Fix the cause, not the line.** If the same finding pattern hits three files and the bot flagged one, fix all three and say so.
- **Read-only against git.** No commits, no stashing, no branch switching — review what is on disk now.
- **No preamble.** Start with the `## CodeRabbit — <branch> vs <base>` heading.
- **Always end with the gate line** — including when `coderabbit doctor` stops the run or the branch is empty.
