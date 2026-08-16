---
name: coderabbit
description: Chew through CodeRabbit's review comments on a PR — fetch them all, parse the severity line, drop Trivial/Minor into a "skipped, with reason" list, verify Major and above against the current code, show a fix / don't-fix plan, and apply only after approval. Use when the user asks to process, triage, or address CodeRabbit comments on a PR.
argument-hint: "[PR number] [--all]"
disable-model-invocation: true
allowed-tools: "Bash(gh api:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git status:*), Read, Edit, Grep, Glob"
---

# CodeRabbit

## Arguments

Raw arguments: $ARGUMENTS

- A number → that PR. If absent, resolve the PR for the current branch with `gh pr view --json number,headRepositoryOwner,headRepository,url`. If there is no PR, say so and stop.
- `--all` → give 🔵 Trivial the same reading 🟡 Minor gets.

Get `OWNER/REPO` from `gh repo view --json nameWithOwner` unless the argument carries its own.

## Goal

Every CodeRabbit finding on the PR gets an explicit disposition — **fixed**, **skipped (with reason)**, or **rejected (with reason)**. Nothing falls off the list silently. The count you report must equal the count you fetched.

## Instructions

### 1. Fetch

```bash
gh api "repos/OWNER/REPO/pulls/N/comments?per_page=100" --paginate
gh api "repos/OWNER/REPO/issues/N/comments?per_page=100" --paginate
gh api "repos/OWNER/REPO/pulls/N/reviews?per_page=100" --paginate
```

The first call returns inline review comments (where the findings live); the second returns the walkthrough / summary comments (where CodeRabbit sometimes parks extra findings in a collapsed "Outside diff range" or "Nitpick" section — read those bodies too, they contain findings that never became inline comments).

The third call returns the review bodies. A finding CodeRabbit cannot anchor to a diff line — its collapsed "Outside diff range comments" section — is posted there and appears in neither of the first two calls. A re-review that produces only such findings has an empty inline list, so an empty first call is never on its own evidence that the bot found nothing.

The review body's `Actionable comments posted: N` is the bot's own count of findings. Reconcile it against yours before reporting; when they differ, find the difference rather than trusting either — the inline list omits what the bot could not anchor, and one inline comment may carry several findings.

Keep only comments whose `user.login` starts with `coderabbitai`. Record for each: `id`, `path`, `line` (or `original_line`), `body`, `in_reply_to_id`.

One comment is not one finding: CodeRabbit packs several into one body when they share a line, each with its own severity line — so the unit you count, number and dispose of is the finding, never the comment.

Drop replies (`in_reply_to_id` set) and any comment already marked resolved or outdated — but **count them in the total** and list them under skipped as `already resolved`.

### 2. Parse severity

Each finding opens with a machine-readable line:

```
_🎯 Functional Correctness_ | _🟠 Major_ | _⚡ Quick win_
_📐 Maintainability & Code Quality_ | _🔵 Trivial_ | _⚡ Quick win_
```

→ category | severity | effort.

Take every such line in a body, not the first. A body carrying two is two findings at two severities, and reading only the first silently downgrades the other — which is how a Major gets disposed of under a Minor's rules.

Severity ladder, low to high: `🔵 Trivial` < `🟡 Minor` < `🟠 Major` < `🔴 Critical`.

If a comment has no such line, infer from its heading (`⚠️ Potential issue` → Major, `🛠️ Refactor suggestion` / `🧹 Nitpick` → Minor) and mark the severity `(inferred)` in the report.

Also pull out of the body, when present:
- the suggested diff (```suggestion block or fenced diff)
- the **Prompt for AI Agents** block — it's the finding restated for you, use it

### 3. Sort

Severity budgets how much scrutiny a finding earns — it never decides whether
the finding is right. A correct, cheap Minor gets fixed; a wrong Major gets
rejected.

- 🔵 Trivial → **skipped** by default, one line each with the reason. No
  verification, no reading files.
- 🟡 Minor → **read it, then decide.** Skip when it is taste, when the project
  has a settled convention the bot does not know, or when the fix costs more
  than the defect is worth. Fix when it is correct and the change is small and
  self-contained — "it is only Minor" is not a reason to leave a real defect in
  the branch. Report which you chose and why; `below severity threshold` is not
  a reason on its own.
- 🟠 Major, 🔴 Critical → **verify** each one against current code.
- `--all` → give 🔵 Trivial the same reading 🟡 Minor gets.

### 4. Verify each Major+ against the current code

Read the file at the referenced path and line **as it is now**. The comment may be stale — the code may have moved, already been fixed, or the bot may simply be wrong.

Decide one of:
- **fix** — the problem is real and still present
- **already fixed** — the code no longer has it
- **reject** — the bot is wrong, or the suggestion breaks something else. Say concretely why.

Ponytail applies to the fix itself: take the smallest correct change, not necessarily the bot's suggested diff.

### 5. Show the plan, then stop

```
## CodeRabbit — PR #16 (7 findings)

### Fixing (3)

**1. src/rules/loader.ts:41** — 🟠 Major · Functional Correctness
Empty rule file silently yields an empty ruleset instead of erroring.
→ throw on empty parse result

**2. src/cli.ts:88** — 🔴 Critical · Security
Path from argv joined without normalising; escapes the rules dir.
→ resolve and assert prefix

**3. src/cli.ts:34** — 🟡 Minor · Functional Correctness
`--limit` parsed with `parseInt`, so `--limit 5x` silently becomes 5.
→ correct and one line; `Number()` + isFinite check

### Not fixing (1)

**4. src/rules/loader.ts:12** — 🟠 Major · Performance
Claims the regex is recompiled per call; it's module-level const. Bot is wrong.

### Skipped (3)

5. src/cli.ts:20 — 🔵 Trivial · Trivial, skipped by default
6. README.md:8 — 🟡 Minor · read it: wants the options table alphabetised, the
   order is grouped by workflow on purpose
7. src/index.ts:5 — 🟠 Major · already fixed on this branch

7 findings, 3 to fix. Apply?
CODERABBIT gate: OPEN — 7 findings, 3 fixes awaiting approval.
```

Wait for approval. Then apply the approved fixes with `Edit`, and report what changed.

**The project overrides this.** If the repo's own review policy (`CLAUDE.md`, `docs/`, a gate the project defines) prescribes applying verified findings without asking, follow the project, not this skill: apply them before showing the plan, list them under `### Applied (N)`, and keep no approval gate on fixes at any severity. Where the project puts the approval on the dismissal instead, a 🟠 Major or 🔴 Critical you propose to reject or skip goes to the user with what the bot missed, and the gate stays OPEN until they settle it. Name the rule you followed in one line under the heading.

### 6. Gate line

Every output ends with a machine-readable last line, exactly one of:

- `CODERABBIT gate: PASS — N findings, N dispositioned.` (every finding fixed, skipped or rejected — nothing left to do)
- `CODERABBIT gate: OPEN — N findings, M fixes awaiting approval.` (the plan in step 5, before the user answers)
- `CODERABBIT gate: OPEN — N findings, M dismissals awaiting the user.` (fixes already applied under a project policy; what waits is a Major+ you propose to reject or skip)
- `CODERABBIT gate: BLOCKED — N findings, M undispositioned.` (the arithmetic didn't close, or the user declined a fix that is still a real defect — name them)

It exists so a driving agent, PR template or hook can check the step ran and closed without re-parsing the report.

## Rules

- **Never post to the PR.** No replies, no resolves, no reactions, no `gh pr comment`. Read-only against GitHub.
- **The arithmetic must close.** Applied + fixing + not fixing + skipped = findings fetched. Print the total in the heading and re-check it before showing the plan — a finding that appears in no section is exactly the failure this skill exists to prevent.
- **Skipped is a list, not a count.** One line per skipped finding with its path and reason, even for Trivial.
- **Number every finding sequentially across the whole report** — Applied, then Fixing, then Not fixing, then Skipped, never restarting per section. The last number equals the total in the heading, and "apply 3 and 7" means exactly two findings. Keep the same numbers when you report what changed after approval.
- **Severity budgets attention, not belief.** A Minor is skipped because you
  read it and judged the change not worth making, never because of its label.
- **Verify before believing.** A Major finding still gets read against current code; the bot reviews a snapshot, the branch has moved.
- **The environment is not a finding.** A fact about where the diff lands — repo conventions, a missing CI job, how downstream consumes the change — is not a defect in the diff and never holds the gate `BLOCKED`. Close the gate on the findings and report the environment fact separately, below the gate line.
- **No fixes before approval**, unless the project's own policy overrides it (step 5). Where it does, the approval moves rather than disappears: it attaches to dismissing a Major or above. Steps 1–4 change nothing on disk either way.
- **Rejections need a concrete reason** — what the bot missed, not "not applicable".
- **Fix the cause, not the line.** If the same finding pattern hits three files and the bot flagged one, fix all three and say so.
- **No preamble.** Start with the `## CodeRabbit — PR #N` heading.
- **Always end with the gate line.** It's the step's result and the only line the driving agent needs.
