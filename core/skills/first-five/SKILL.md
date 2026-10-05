---
name: first-five
description: Scan a branch or diff against the First Five checklist (Error Handling, Input Boundaries, External Calls, State Mutations, Assumed Dependencies) and report only genuine concerns. Use when the user asks to "run the first five" on a branch or diff.
argument-hint: "[branch]"
disable-model-invocation: true
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Bash(find:*), Bash(ls:*), Bash(grep:*), Read, Grep, Glob"
---

# First Five

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as the **base branch** to diff against. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`.

## Goal

Scan the changed files between the base branch and `HEAD` against the **First Five** checklist and report **only the things worth investigating**. This is a short, scannable triage list — not a full review and not a dump of every line.

The five checks:

1. **Error Handling** — empty catches, missing error paths around fallible calls, swallowed exceptions, silent failures.
2. **Input Boundaries** — missing length/type/format validation on user input, request fields used without validation, unbounded inputs hitting the database or external systems.
3. **External Calls** — calls to methods/facades/APIs that may not exist or may not behave as assumed (wrong signature, wrong namespace, missing trait/macro).
4. **State Mutations** — destructive or surprising writes (deletes, overwrites, cascades) that other code relies on.
5. **Assumed Dependencies** — imports, classes, files, routes, views, or config keys that the code references but that may not exist.

## Instructions

### 1. Get the diff

Run `git diff <base>...HEAD` (three-dot — changes on this branch since it diverged) and `git diff --name-status <base>...HEAD` for a file-level overview. If there are no changes, say so and stop.

### 2. Scan changed files

For every changed file, read enough to evaluate it against the five checks. Skip auto-generated files unless something looks unexpected:
- Lockfiles: `composer.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `Cargo.lock`, `go.sum`, `poetry.lock`, `Gemfile.lock`
- Compiled assets: `public/build/`, `dist/`, `build/`
- Generated route/type definitions: Wayfinder action/route files, generated TS types, `*.generated.*`

### 3. Verify before flagging

Do not flag something on suspicion alone. Before listing a finding:

- **Assumed Dependencies** — use `find` or `ls` to confirm the imported file/class actually does (or doesn't) exist. Only flag if it really is missing.
- **External Calls** — `grep` for the method on the receiver class/facade. Only flag if it really isn't defined (or has a different signature).
- **Input Boundaries** — check the corresponding FormRequest / validator / migration column type. Only flag if validation is genuinely missing or doesn't match how the field is used.
- **Error Handling** — only flag if the call is genuinely fallible *and* there is no handling. Code wrapped in a job's automatic retry, or a global exception handler that does the right thing, is not a finding.
- **State Mutations** — only flag if another part of the codebase actually depends on the state being mutated.

If you can't confirm it's wrong, don't flag it.

### 4. Output the report

One section per check. **Only include a section if there's something to flag.** Skip clean sections entirely. Do not write "(nothing to flag)" placeholders.

Use this format exactly:

```
**Error Handling**
1. ⚠️ `file.php:42` — empty catch block hides notification failures
2. `file.php:80` — no error handling around the API call

**Input Boundaries**
3. ⚠️ `Request.php:15` — `message` field has no max length, goes into a text column

**External Calls**
4. ⚠️ `Controller.php:40` — `Notification::sendLater()` doesn't exist on the facade

**State Mutations**
5. `Observer.php:35` — deletes subscription permanently, other features read this relationship

**Assumed Dependencies**
6. ⚠️ `Controller.php:3` — imports `App\Notifications\IdeaStatusChanged` but file doesn't exist

**6 items across 4 files.**
```

If everything is clean, output exactly:

```
✅ Nothing flagged.
```

## Rules

- **Less is more.** Only flag things that are actually wrong or risky. 5 real findings beats 20 nitpicks.
- **⚠️ for high severity only** — data loss, security holes, silent failures, missing files/classes, broken external calls. Plain bullet for everything else.
- **Always include `file:line`.** Every bullet starts with a backticked path and line number.
- **One line per finding.** State what's wrong *and* why it matters in the same line. No multi-sentence explanations.
- **Number findings sequentially across the whole report**, never restarting per section — so the user can say "fix 3 and 7" and mean exactly two things.
- **Verify Assumed Dependencies before flagging.** Use `find` or `ls`. A false-positive missing-file claim is the worst outcome of this skill.
- **Skip auto-generated files** (lockfiles, compiled assets, generated route/type definitions).
- **No preamble, no closing summary** beyond the `**X items across Y files.**` line.
- **Don't propose fixes.** This is a triage list — name the concern and stop.
- **Don't restate the code.** "`if ($x) { … }` — this checks if x" is filler. Say what's wrong, not what's there.
