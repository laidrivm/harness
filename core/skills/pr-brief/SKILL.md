---
name: pr-brief
description: Compose the pull request title and description for the current branch — the last step after the review gates pass and before the PR is opened. Use when the user asks to "write the PR", "prep the PR", or wants a PR title and body for the branch.
argument-hint: "[base branch]"
disable-model-invocation: true
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Read, Grep, Glob"
---

# PR Brief

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as the **base branch** to diff against. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`.

## Goal

Turn the branch into a title and a description a reviewer can act on without reading the diff first. This is the last step before the PR exists — it writes nothing, pushes nothing, opens nothing. `ship` does that.

## Instructions

### 1. Check the gates first

Collect every gate line emitted this session (`TRIAGE`, `WARM`, `ZOMBIES`, `CODERABBIT`, `CODERABBIT-LOCAL`, and any re-emitted by whoever acted on them). The last line per skill is the one that counts.

- Any `BLOCKED` → stop. Name the blocked gate and what would clear it. Don't write the brief.
- Any `OPEN` → stop. An `OPEN` gate means findings nobody dispositioned; the PR isn't ready to be described.
- No gate lines at all → say which review skills never ran and ask whether to proceed anyway. Don't silently pretend the pipeline ran.

### 2. Read the branch

```bash
git log --oneline <base>..HEAD
git diff --stat <base>...HEAD
git diff <base>...HEAD
```

Also read `PLAN.md`, the active `openspec/changes/**` proposal, or the task list if one exists — the *why* usually lives there, not in the diff.

### 3. Title

One line, imperative mood, ≤ 72 characters, no trailing period. It names the change, not the activity: `Fail the build when the README skill table drifts`, not `Various README improvements` or `Work on CI`.

If the project has a commit or PR title convention already in `git log` (a `type: ` prefix, a ticket key), match it.

### 4. Description

Four sections, in this order. Drop a section when it would be empty — never pad it.

```markdown
## What

Two to four sentences. What the branch changes, in the reviewer's vocabulary.

## Why

The problem this solves, and the decision behind the approach where a reviewer
would otherwise ask. Cite the plan, proposal or issue if there is one.

## Verify

Copy-pasteable: the commands to run, the pages to open, what a passing result
looks like. If this can only be verified by reading, say which files and in
what order.

## Risk

Only when there is one: migrations, config or env vars to set on merge, a
rollout ordering, a behaviour change existing users will notice. If `preflight`
ran, this section is its checklist condensed. Otherwise say "None beyond the
diff."
```

Then, as the last line of the body, the gate summary — one line per review skill that ran:

```
Gates: triage PASS · warm PASS (2 deps) · zombies PASS (6 gaps closed) · coderabbit-local PASS (7/7 dispositioned)
```

### 5. Output

Print the title on its own line, then the body in one fenced ```markdown block the user can copy whole. Then the gate line.

Nothing else — no summary of what you wrote, no offer to open the PR.

### 6. Gate line

Exactly one of:

- `PR-BRIEF gate: PASS — title and description ready.`
- `PR-BRIEF gate: BLOCKED — <which gate blocks, and what clears it>.`

## Rules

- **Describe the branch, not the session.** No "I refactored", no "as discussed", no narration of how the work went. The reader wasn't there.
- **No invented verification.** Only commands you actually know exist in this project — read `package.json` scripts, the Makefile, or CI config rather than guessing `npm test`.
- **Claims in the body must be checkable against the diff.** If the branch doesn't do it, it doesn't go in the description.
- **Never open, push, or comment.** This skill is read-only against git and GitHub both.
- **The gate summary is copied, not judged.** Report the gate lines as they were emitted; if you disagree with one, say so below the gate line, don't rewrite it.
- **No preamble.** Start with the title.
