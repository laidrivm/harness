---
name: ship
description: Land the branch — push it, open or update the PR, wait for CodeRabbit's review, work the findings through the `coderabbit` skill, repeat until the PR is clean, then merge on approval and return to an up-to-date base branch. Use when the user asks to "ship it", "land this", "push and merge", or wants the push → review → fix → merge loop driven end to end.
argument-hint: "[base branch]"
disable-model-invocation: true
allowed-tools: "Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git commit:*), Bash(git add:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(gh pr:*), Bash(gh api:*), Bash(gh repo view:*), Bash(sleep:*), Read, Edit, Grep, Glob, Skill"
---

# Ship

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as the **base branch** to merge into. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` and strip the `origin/` prefix — `<base>` gets checked out and merged into, so it must be a local branch name. Don't use `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. If the result is empty, fall back to `main`. Call the result `<base>`.

## Goal

Drive one branch from "gates pass" to "merged, and I'm back on an up-to-date `<base>`", without the user having to remember which of the six steps comes next. Every loop iteration ends in a state that is either clearly finished or clearly waiting on something named.

## Instructions

### 1. Preconditions

```bash
git status --porcelain
git rev-parse --abbrev-ref HEAD
```

Stop, with the reason, if:

- **HEAD is `<base>`** — there is nothing to ship. Never push or merge from the base branch.
- **The tree is dirty** — say which files. Ask whether to commit them or stash; don't decide.
- **A gate is `BLOCKED` or `OPEN`** this session — same rule as `pr-brief` step 1. The last gate line per skill counts.

If `pr-brief` hasn't run and there is no PR yet, run it first (or ask the user to) — step 3 needs its title and body.

### 2. Push

```bash
git push -u origin HEAD
```

Record the pushed SHA: `git rev-parse HEAD`. Call it `<sha>` — every wait in this skill is a wait for review *of that SHA*, not for any review at all.

### 3. Open or update the PR

```bash
gh pr view --json number,url,state,isDraft
```

- **No PR** → create it from the `pr-brief` output:
  ```bash
  gh pr create --base <base> --title "<title>" --body-file <(printf '%s' "<body>")
  ```
  If the brief isn't in context, stop and ask for it. Never invent a title and body here.
- **PR exists** → the push in step 2 already updated it. Report the URL and move on.

### 4. Wait for CodeRabbit on `<sha>`

```bash
for i in $(seq 1 18); do
  gh api "repos/OWNER/REPO/pulls/N/reviews" --jq \
    ".[] | select(.user.login | startswith(\"coderabbitai\")) | select(.commit_id==\"<sha>\") | .id" \
    | grep -q . && break
  sleep 30
done
```

Nine minutes, then give up — that is the ceiling on the wait, not a claim about how long CodeRabbit takes. If it expires, emit `SHIP gate: OPEN — no CodeRabbit review on <sha> after 9 min` and stop. Re-invoking the skill resumes here; that is cheaper than a longer blocking wait.

If the repo has CI, start `gh pr checks --watch --fail-fast` in the same waiting window rather than after it. Failing checks are handled like findings: fix, then back to step 2.

### 5. Work the findings

Invoke the `coderabbit` skill for this PR. It owns the triage, the plan and the approval — don't re-implement it here, and don't disposition findings yourself.

When it comes back:

- `CODERABBIT gate: PASS` with nothing changed on disk → go to step 6.
- Fixes applied → commit them (`git commit`, message naming the findings by their numbers, e.g. `address coderabbit findings 1, 3, 5`), then **return to step 2**. The new push is a new `<sha>`, and it gets its own review.
- `CODERABBIT gate: BLOCKED` → stop and report. A blocked gate is the user's call, never a reason to merge anyway.

Cap the loop at **three** round trips. If CodeRabbit still has findings on the fourth push, stop and report — repeated churn on the same PR is a signal to talk, not to keep pushing.

### 6. Merge — ask first

Show, in three lines: the PR URL, the number of round trips, and the final gate lines. Then ask for the merge explicitly and **wait for an answer**. Merging is not covered by any approval given earlier in the session.

On approval:

```bash
gh pr merge <N> --squash --delete-branch
```

Match the repo's existing merge style if it has one (`gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed`); `--squash` is the default only when the repo allows it.

### 7. Return to base

```bash
git checkout <base>
git pull --ff-only
```

Report the merge commit and the new `<base>` SHA.

### 8. Gate line

Every output ends with a machine-readable last line, exactly one of:

- `SHIP gate: PASS — PR #N merged in M round trips, on <base> at <sha>.`
- `SHIP gate: OPEN — <what it is waiting on>.` (review hasn't landed, checks still running, merge awaiting approval)
- `SHIP gate: BLOCKED — <what needs the user>.` (dirty tree, blocked upstream gate, failing check that isn't ours, round-trip cap hit)

## Rules

- **Merge only on an explicit answer in this turn.** Not on "sounds good" from earlier, not on a plan the user approved before the review ran. One question, one answer, then merge.
- **Never force-push.** If the branch has diverged from its remote, stop and say so.
- **Never merge with a check failing or a gate not `PASS`** — including checks the branch didn't break. Report it and stop; overriding is the user's decision to make out loud.
- **One SHA, one review.** Every fix pushed invalidates the previous review — go back to step 2, don't reuse the earlier findings list.
- **Don't post to the PR.** No comments, no resolves, no review replies. The `coderabbit` skill's read-only rule holds here too; the only writes this skill makes to GitHub are the PR itself and the merge.
- **Report the loop count.** How many round trips it took is the useful number — it's what says whether the pre-push gates are actually catching things.
- **No preamble.** Start with the step you're on.
