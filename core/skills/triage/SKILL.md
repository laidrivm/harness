---
name: triage
description: Triage a branch or diff by grouping changed files into feature areas, assigning each a risk tier (High/Medium/Low), and producing a scannable summary that helps decide where to spend review time. Use when the user asks to "triage" a branch, PR, or diff, and as the first step before reviewing a branch or PR that touches more than a couple of files.
argument-hint: "[branch]"
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Read, Grep, Glob"
---

# Triage

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as the **base branch** to diff against. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`.

## Goal

Produce a **risk-ordered map** of the changes between the base branch and `HEAD`, grouped by feature area, so the user can decide where to spend their review time. The output is a triage report — not a review.

It carries no suggestions, fixes or lines to verify: the user reads this map and decides for themselves what to dig into.

## Instructions

### 1. Get the diff

Run `git diff --name-status <base>...HEAD` for a file-level overview, `git diff --stat <base>...HEAD` for per-file sizes, then `git diff <base>...HEAD` to see the actual changes. If there are no changes, tell the user and stop.

### 2. Read the changed files

For every changed file, read enough of the file to understand what feature area it belongs to and how risky it is. You don't need to read every line of every file — read enough to categorise it.

### 3. Group by feature area

Group files by **what the code does**, not by file type. Good group names: "Authentication", "Notification Delivery", "User Data Mutations", "Schema & Config". Bad group names: "Controllers", "PHP Files", "Vue Components".

Heuristics:
- A controller + its route + its page + its tests usually form one feature group.
- A migration + the model changes that go with it form one feature group.
- A notification class + its trigger + its mail template form one feature group.
- A side-effect added to an existing flow (e.g. "voting now also subscribes you") is its own small group.
- Pure refactors with no behavioural change can be a single "Refactor" group.

Each file appears in exactly one group — pick the most relevant one. Keep group names short (2–4 words).

### 4. Assign a risk tier

Tier each group as **High**, **Medium**, or **Low**.

**Always High** if the group:
- Touches authentication or authorization
- Mutates user data, payments, or billing
- Modifies permissions or access control
- Handles sensitive data (passwords, tokens, PII)

**Bump up one tier** if the group:
- Has complex conditionals or branching logic
- Interacts with external services or APIs
- Contains a large amount of generated code (100+ lines that look like a single AI generation)

Otherwise: pick the tier that matches the blast radius of the change.

### 5. Identify auto-generated files

Auto-generated files go in a "Skip" section at the bottom:
- Lockfiles: `composer.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `Cargo.lock`, `go.sum`, `poetry.lock`, `Gemfile.lock`
- Compiled assets: `public/build/`, `dist/`, `build/`
- Generated route/type definitions: Wayfinder action/route files, generated TS types, `*.generated.*`

### 6. Output the report

Use this exact format:

```
### ⚠️ High Risk

**1. [Feature Area Name]** (+240/−12, 6 files)
Reason: [one sentence explaining why this is high risk]
- path/to/file.php (added/modified)
- path/to/other-file.php (modified)

**2. [Another Feature Area]** (+35/−4, 2 files)
Reason: [one sentence]
- path/to/file.php (added)

### Medium Risk

**3. [Feature Area Name]** (+80/−20, 3 files)
Reason: [one sentence]
- path/to/file.php (added)
- path/to/new-name.php (renamed from path/to/old-name.php)

### Low Risk

**4. [Feature Area Name]** (+6/−2, 1 file)
- path/to/file.php (modified)

### Skip

**Auto-generated** — 4 files (lockfile, compiled assets) — skip
```

End with a one-line summary: `X groups, Y high-risk files to focus on`, then the gate line, exactly one of:

- `TRIAGE gate: PASS — N groups, nothing above Low risk.`
- `TRIAGE gate: OPEN — N groups, M high-risk — High/Medium unread.`

Triage produces no findings, so it can never reach PASS on a diff that has High or Medium groups — it hands over an `OPEN` gate that only reading those groups closes. Whoever acts on the map re-emits the line as `TRIAGE gate: PASS — M high-risk groups reviewed.`, or `TRIAGE gate: BLOCKED — <what needs the user>.` — the prefix is what `pr-brief` files it under. `BLOCKED` needs a defect in the diff or a question only the user can answer — **a finding about the environment the diff lands in is not a defect in the diff**: a shared repo's conventions, a missing CI job, how the change gets consumed downstream. Close the gate and report the environment fact separately, below the gate line. The last gate line of the turn is the one that counts, and it's the artefact a PR template or hook can require — the reason "the report alone is never the deliverable" is checkable at all.

## Rules

- **Group by feature area, not by file type.** "Auth flow" not "Controllers". "Notification delivery" not "PHP files".
- **One group per file.** Pick the most relevant one.
- **Group names: 2–4 words.** Short and descriptive.
- **Number the groups sequentially across the whole map**, highest risk first, never restarting per tier — so "review 1 and 3" picks out exactly two groups. The Skip section isn't numbered; it's a counter, not a target.
- **One-line reason per group** explaining WHY it's that risk level. Only required for High and Medium tiers — Low can skip the reason.
- **Size suffix on each group**: `(+added/−deleted, N files)`, summed from `git diff --stat` — this is what lets the user budget review time.
- **Status suffix on each file**: `(added)`, `(modified)`, `(deleted)`, `(renamed from old/path)`, or `(copied from old/path)`. Match `git diff --name-status` (statuses `A`/`M`/`D`/`R*`/`C*`).
- **Skip section is a counter, not a list**: one line with the file count and what kinds of files they are — don't enumerate paths.
- **Order tiers from highest to lowest risk.** High first, then Medium, then Low, then Skip.
- **Omit a tier section if it's empty.**
- **If everything fits in one tier**, say so and suggest reviewing everything: "This diff is small — review all files".
- **No suggestions, no advice.** This is a triage map, not a review.
- **No emojis** other than the ⚠️ on the High Risk heading.
- **End with a one-line summary**: `X groups, Y high-risk files to focus on`, followed by the gate line as the very last line of the map.
- **The gate line ends the map, not the turn.** When another task invoked this skill, read the High and Medium groups and continue that task in the same turn; only a standalone `/triage` run stops at the gate line.
