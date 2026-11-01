---
name: coderabbit
description: Dispose of every CodeRabbit finding on a PR — read the bot's landed review of the head commit once, never wait for one (no review of HEAD ends OPEN), verify Major and above against the current code, apply verified fixes where the project's review policy says to, skip Trivial by default, fix or skip each Minor with a reason, and hold a Major-or-above dismissal for the user (handed on as a card when unattended). Use to process, triage, or address CodeRabbit comments on a PR.
argument-hint: "[PR number] [--all]"
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

Read in this order, so a review the bot posts before its check run or status is always in a read that follows them: the head commit, with `gh pr view N --repo OWNER/REPO --json headRefOid`; then the head's `CodeRabbit` check runs, with `gh api "repos/OWNER/REPO/commits/<head sha>/check-runs?check_name=CodeRabbit&filter=all&per_page=100" --paginate --jq '.check_runs[] | select(.app.slug == "coderabbitai") | [.status, .conclusion, .output.title]'`, and its `CodeRabbit` commit status, with `gh api repos/OWNER/REPO/commits/<head sha>/status --jq '.statuses[] | select(.context == "CodeRabbit") | [.state, .description]'`; then the third call below, the reviews.

The head commit is reviewed when any of these holds — a review with no findings submits no review object, only the status or the check run:

- a review whose `user.login` is exactly `coderabbitai[bot]` has a `commit_id` equal to it;
- the status reads `success` with the description `Review completed`, the bot's older report. The same `success` with `Review skipped: draft pull request`, or any description but `Review completed`, is no review;
- its check runs, every one of them `completed` (a `queued` run is no more done than an `in_progress` one), hold one that concluded `success` with a title not opening `Review skipped` — the rule `finish-review-arrives` sets in *CodeRabbit's state of a commit is read from its check runs*. Read the conclusion and the title, never the run's summary text. Runs that read anything else — skipped, rate limited, queued, in progress, none — are no review.

If none holds, stop there and end on `CODERABBIT gate: OPEN — no CodeRabbit review of <short sha> yet.`, naming the head commit's short SHA. Findings on an earlier commit belong to a snapshot the branch has moved past. Otherwise run the other calls. A head counted with no review object on it is disposed of like any review: every review body and comment is read for findings on it, and the re-fetch below runs. It ends on `PASS` only while the bot's walkthrough, in the second call, reads «No actionable comments were generated» and names the head as its `Commit`; otherwise it ends on the no-review `OPEN` line naming the head.

```bash
gh api "repos/OWNER/REPO/pulls/N/comments?per_page=100" --paginate
gh api "repos/OWNER/REPO/issues/N/comments?per_page=100" --paginate
gh api "repos/OWNER/REPO/pulls/N/reviews?per_page=100" --paginate
gh api graphql --paginate -f o=OWNER -f r=REPO -F n=N -f query='query($o:String!,$r:String!,$n:Int!,$endCursor:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated comments(first:100){nodes{fullDatabaseId}}}}}}}'
```

The first call returns inline review comments (where the findings live); the second returns the walkthrough / summary comments (where CodeRabbit sometimes parks extra findings in a collapsed "Outside diff range" or "Nitpick" section — read those bodies too, they contain findings that never became inline comments).

The third call returns the review bodies. A finding CodeRabbit cannot anchor to a diff line — its collapsed "Outside diff range comments" section — is posted there and appears in neither of the first two calls. A re-review that produces only such findings has an empty inline list, so an empty first call is never on its own evidence that the bot found nothing.

The fourth call returns each inline thread's `isResolved` and `isOutdated`, which no REST response carries; a comment's `fullDatabaseId` there, a decimal string, is its `id` in the first call (never `databaseId`, a 32-bit `Int` the bot's ids already pass). `--paginate` follows the threads past 100; a thread's comments are not paged, since every one past its first hundred is a reply.

`Actionable comments posted: N` counts only what the bot posted inline. A review's collapsed `Outside diff range comments (M)` section is additional — the finding total for that review is N + M, and a review body may carry M with no N at all.

Reconcile the bot's total for each review — N plus any M — against your own count before reporting. When they differ, find the difference rather than trusting either: one inline comment may carry several findings.

The bot re-reviews on every push, and a merged PR still accepts comments — so a finding posted after your last pass exists in the API and in no report. Before treating a PR as done, re-fetch once and reconcile against the bot's N + M again: a review submitted after your report is a review nobody has dispositioned. The re-fetch reads the head commit again too. If it moved since the first read and the bot has not reviewed the new head, by any of step 1's tests, end on the no-review `OPEN` line naming it, never on `PASS`. If the bot has reviewed it, the run reaches `PASS` only once every disposition and every finding of the new head's reviews is verified against the new head, as step 5 verifies a fix — a disposition verified against a head the branch has left is not verified.

Keep only reviews and comments whose `user.login` is exactly `coderabbitai[bot]` — a prefix would pass a login anyone can register. Record for each: `id`, `path`, `line` (or `original_line`), `body`, `in_reply_to_id`.

One comment is not one finding: CodeRabbit packs several into one body when they share a line, each with its own severity line — so the unit you count, number and dispose of is the finding, never the comment.

Drop any comment whose thread the fourth call marks resolved — but **count each finding it carries in the total** and list each under skipped as `already resolved`. A thread that is outdated and not resolved still holds the bot's approval back, so its findings are verified like any other: one already fixed on the head is `already fixed`, and its thread is named for `resolve` (step 6).

A reply (`in_reply_to_id` set) is discussion of a finding, not a finding, and says nothing about whether its parent is resolved — that is the thread's state alone. Leave it out of the total, unless it carries a severity line of its own, which makes it a finding.

### 2. Parse severity

Each finding opens with a line naming its severity, category and effort. Read its severity word yourself — `Trivial`, `Minor`, `Major` or `Critical` — wherever on the line it sits. These are examples of the markup, not a pattern to match, and the order on the line is not relied on:

```
**<picture>…</picture> Major** · **Functional Correctness** · **Quick win**
_🎯 Functional Correctness_ | _🟠 Major_ | _⚡ Quick win_
```

The first is the bot's current markup, severity first; the second its older one.

Take every such line in a body, not the first. A body carrying two is two findings at two severities, and reading only the first silently downgrades the other — which is how a Major gets disposed of under a Minor's rules.

Severity ladder, low to high: `🔵 Trivial` < `🟡 Minor` < `🟠 Major` < `🔴 Critical`.

If a comment has no such line, infer from its heading (`⚠️ Potential issue` → Major, `🛠️ Refactor suggestion` / `🧹 Nitpick` → Minor) and mark the severity `(inferred)` in the report.

Also pull out of the body, when present:
- the suggested diff (```suggestion block or fenced diff)
- the **Prompt for AI Agents** block — it's the finding restated for you, use it

### 3. Sort

Severity budgets how much scrutiny a finding earns — it never decides whether
the finding is right. A correct, cheap Minor gets fixed, unless a deferral
the project's policy makes (step 5) sends it to a card; a wrong Major gets
rejected.

- 🔵 Trivial → **skipped** by default, one line each with the reason. No
  verification, no reading files.
- 🟡 Minor → **read it, then decide.** Skip when it is taste, when the project
  has a settled convention the bot does not know, or when the fix costs more
  than the defect is worth. Fix when it is correct and the change is small and
  self-contained — "it is only Minor" is not a reason to leave a real defect in
  the branch, and a deferral the project's policy makes (step 5) is the one
  exception. Report which you chose and why; `below severity threshold` is not
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

Wait for approval (unattended: card — hand the plan on, and apply nothing until it is approved). Then apply the approved fixes with `Edit`, and report what changed.

Right before applying any fix, here or under the override below, and before naming a `resolve` command (step 6), read the head commit again. If it moved since step 1, read the new head's check runs and status, then all of step 1's calls — comments, reviews and threads — again in step 1's order, so a finding the new head's review added to a thread is counted before the thread is named, and verify each finding against the new head before applying it; if none of step 1's tests counts the new head as reviewed, end on the no-review `OPEN` line naming it. A fix verified against a head the branch has left is not verified.

**The project overrides this.** If the repo's own review policy (`CLAUDE.md`, `docs/`, a gate the project defines) prescribes applying verified findings without asking, follow the project, not this skill: apply them before showing the plan, list them under `### Applied (N)`, and keep no approval gate on fixes at any severity. Where the project puts the approval on the dismissal instead, a 🟠 Major or 🔴 Critical you propose to reject or skip goes to the user with what the bot missed, and the gate stays OPEN until they settle it (unattended: card — hand it on with what the bot missed). Name the rule you followed in one line under the heading.

**A project's policy may defer.** Whether or not it also applies fixes without asking, the repo's own review policy may defer a finding to a card by its severity, path and round. Apply nothing for such a finding: list it under Skipped as `deferred to <card>`, counted in the arithmetic. A 🟠 Major or 🔴 Critical deferred this way is a dismissal: it goes to the user, and the run ends on `CODERABBIT gate: OPEN — N findings, M dismissals awaiting the user.`, never `PASS`, until they settle it (unattended: card — hand it on with the policy that defers it).

### 6. The resolve command and the gate line

Right above the gate line, name the threads whose findings are settled, as one command, `bun bun/work.ts resolve --pr <n> --head <sha> --comment <id> …` (`bun node_modules/harness/bun/work.ts` where the harness is installed). The bot approves only once each of its threads is resolved, and resolves none itself; this skill still writes nothing to GitHub — the session runs the command.

- Name the first comment's id of each unresolved thread of the bot's whose every finding — the first comment's and each reply's carrying a severity line of its own — is fixed or already fixed. Never a reply's id: a resolve closes the whole thread, and `resolve` places only first comments. Never a thread that also holds a skipped or rejected finding — it is the user's. A finding from a review body has no thread and is never named. With no such thread, name no command.
- `--head`: when the run applied no fix, the full id of the head it verified against, and the session runs the command at once — but only while that head holds what step 4 read: step 4 reads the working tree, so when `git status --porcelain` prints anything, an untracked file included, or `git rev-parse HEAD` is not the pull request's `headRefOid`, an already-fixed finding may be fixed only locally, and the command takes `PUSHED_SHA` as for an applied fix, its fix committed first — `finish` pushes no untracked file. When it applied one, the literal `PUSHED_SHA`, which the session fills from `git rev-parse HEAD` once its own `finish` pushed the fixes, and only then runs the command — a thread resolved over a head without its fix lets the bot approve that head. Unfilled, `resolve` refuses it as malformed.
- When `resolve` refuses because the pull request's head is another commit, the session runs `/coderabbit` again over that head.
- A session whose launcher pushes for it runs no `finish`, so it runs no `resolve` either: it names the command in its final message.
- `resolve` acts only on the current branch's open pull request. For a merged one, name the threads in the report for the user to resolve by hand; for another branch's open one, the command runs from a checkout of that branch.

Every output ends with a machine-readable last line, exactly one of:

- `CODERABBIT gate: PASS — N findings, N dispositioned.` (every finding fixed, skipped or rejected — nothing left to do)
- `CODERABBIT gate: OPEN — no CodeRabbit review of <short sha> yet.` (step 1 found no review of the head commit, no `CodeRabbit` status reading `success` with `Review completed`, and no `CodeRabbit` check run of the bot's concluded `success` with a title not opening `Review skipped` while every one of them is `completed` — a success beside a `queued` or `in_progress` run is no review yet — and read nothing more; or the head was counted with no review object while the walkthrough names another commit)
- `CODERABBIT gate: OPEN — N findings, M fixes awaiting approval.` (the plan in step 5, before the user answers)
- `CODERABBIT gate: OPEN — N findings, M dismissals awaiting the user.` (fixes already applied under a project policy, or none to apply; what waits is a Major+ you propose to reject or skip, or one a project's policy defers)
- `CODERABBIT gate: BLOCKED — N findings, M undispositioned.` (the arithmetic didn't close, or the user declined a fix that is still a real defect — name them)

It exists so a driving agent, PR template or hook can check the step ran and closed without re-parsing the report.

## Rules

- **Read, never wait.** A run that finds no review of the head commit reads once and ends `OPEN`. A run that finds one reads the head again before applying fixes (step 5) and keeps its single re-fetch before the gate line, so a review that lands while the first is being dispositioned is dispositioned too. Neither sleeps, polls or loops: a review that has not landed is the next run's.
- **Never post to the PR.** No replies, no reactions, no `gh pr comment`, no `@coderabbitai resolve` or `@coderabbitai approve`, and no resolve of your own: a thread is resolved only by the session, through the `resolve` command step 6 names. The skill itself is read-only against GitHub; that command, run by the session once the fix is on the head, is the only GitHub write the skill delegates to the session.
- **The arithmetic must close.** Applied + fixing + not fixing + skipped = findings fetched. Print the total in the heading and re-check it before showing the plan — a finding that appears in no section is exactly the failure this skill exists to prevent.
- **Skipped is a list, not a count.** One line per skipped finding with its path and reason, even for Trivial.
- **Number every finding sequentially across the whole report** — Applied, then Fixing, then Not fixing, then Skipped, never restarting per section. The last number equals the total in the heading, and "apply 3 and 7" means exactly two findings. Keep the same numbers when you report what changed after approval.
- **Severity budgets attention, not belief.** A Minor is skipped because you
  read it and judged the change not worth making, or for a deferral the
  project's policy makes (step 5), never because of its label.
- **A skip reason that cites a file, a convention or a decision quotes it from that file as read in this pass** — a reason recalled rather than read is no reason, and the finding is fixed or re-read instead.
- **An empty inline list is not a clean review.** A whole review can be out-of-grid: zero inline comments, both findings parked in the review body's collapsed `Outside diff range comments` section. Read every review body before concluding the bot found nothing.
- **Verify before believing.** A Major finding still gets read against current code; the bot reviews a snapshot, the branch has moved.
- **The environment is not a finding.** A fact about where the diff lands — repo conventions, a missing CI job, how downstream consumes the change — is not a defect in the diff and never holds the gate `BLOCKED`. Close the gate on the findings and report the environment fact separately, below the gate line.
- **No fixes before approval**, unless the project's own policy overrides it (step 5). Where it does, the approval moves rather than disappears: it attaches to dismissing a Major or above. Steps 1–4 change nothing on disk either way.
- **Rejections need a concrete reason** — what the bot missed, not "not applicable".
- **Fix the cause, not the line.** If the same finding pattern hits three files and the bot flagged one, fix all three and say so.
- **No preamble.** Start with the `## CodeRabbit — PR #N` heading.
- **Always end with the gate line.** It's the step's result and the only line the driving agent needs.
