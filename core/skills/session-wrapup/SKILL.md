---
name: session-wrapup
description: End-of-session ritual — confidence check on what was built, fix & capture pass for uncaptured lessons, OpenSpec workflow state with the next command and the session's board cards reconciled, an optional save-point doc for long exploratory sessions, and a pipeline-yield entry recording what each review skill actually found, what the harness's gates decided, what the session's lessons became and how many pull requests' first CodeRabbit review raised no Major-or-above finding.
allowed-tools: "Read, Edit(docs/context/**), Glob, Grep, Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(gh api:*), Bash(gh pr list:*), Bash(ls:*), Bash(date:*), Bash(mkdir:*), Bash(bun bun/board-state.ts), Bash(bun node_modules/harness/bun/board-state.ts), Bash(bun bun/transcript-archive.ts --catch-up), Bash(bun node_modules/harness/bun/transcript-archive.ts --catch-up), mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-update-page"
---

# Session Wrap-up

Walk the five steps below over **this session's conversation**, in order, under these exact headings. Be honest and specific — this is a debrief, not a victory lap.

## 1. Confidence check

State your confidence (1–10) in what was built this session. For anything below 9:

- name **exactly what is shaky** — the specific file, assumption, or untested path, not a vague "could be more robust";
- say **what would make it a 10** — the concrete verification or change (a test to run, an edge case to check, a decision to confirm).

If multiple distinct things were built, score them separately.

## 2. Lessons learned

Run the fix & capture loop over the session: look for mistakes that got corrected, user pushback, approaches that were reversed, or friction that repeated.

- For each, propose the capture the loop routes it to, tagged with its kind: `mechanism` (a test the branch adds), `card + rule` (a card for a gate, with its stop-gap rule), `rule` (a rule, saying why no mechanism fits), `skill edit` (name the skill and the exact change), or `memory` (a new memory).
- **Propose, don't apply** — the user decides what to keep (unattended: card — hand each proposed capture on, and apply none).
- If the session was clean, say exactly: `Nothing to capture.` Don't invent lessons to fill the section.

## 3. Workflow state

State which OpenSpec stage the work is in, named by its `/opsx:` command (explore / propose / apply / verify / sync / archive), or by the project's own stage name where it defines one — or "not using OpenSpec this session" — and give the **exact command to run first next session**, copy-pasteable. A command that cuts a branch fetches first and names its start point: `git fetch origin && git switch -c <name> --no-track origin/main`. If work stopped mid-task, one line on where.

Then reconcile the board for this session's own work. Run the harness's `bun/board-state.ts` (`bun node_modules/harness/bun/board-state.ts` in a consumer) and compare each card whose `Pointer` names a change directory this session touched with the floor printed for that slug. Set each card behind its floor with `update_properties` — in the harness itself with `bun bun/work.ts status --card <id> --to <floor>`, since its settings refuse the connector's `Status` write, and a refusal it prints is reported as the card left behind — re-read it, and report the correction beside the stage. A card at `discarded` is behind no floor: leave it, since only the user moves a card into or out of it. A session whose work pointed at no change directory says `Reconciled nothing.` and does not read the rest of the board.

Last, archive the transcripts no `SessionEnd` hook archived — a session the board loop killed, or one whose transcript grew after its hook. Run `bun bun/transcript-archive.ts --catch-up` (`bun node_modules/harness/bun/transcript-archive.ts --catch-up` in a consumer) and put the one line it prints in the report.

## 4. Save point

**Only if this was a long exploratory or debugging session** — where the value is in what was learned rather than what was shipped. Skip it (say "Skipped — not an exploratory session") when the work is already captured in commits, specs, or skill edits.

When it applies, write `docs/context/<topic>-<yyyy-mm>.md` (get the date with `date +%Y-%m`; create the directory if needed) for an **LLM reader** picking this up cold:

- what we figured out (conclusions, with the evidence that supports them),
- what we ruled out (so it isn't re-investigated),
- where we stopped and the open questions.

Facts and dead ends, no narrative of the session. Link files as `path:line` where relevant.

## 5. Pipeline yield

Which review skills ran this session, and what each one actually produced. One line per skill that ran, in the order they ran:

```
- <skill>: <gate line state> — N findings, M acted on
```

Then one line naming the review skills that **didn't** run, so the gap is visible rather than assumed.

Then one `gates` line: what the harness's own gates decided in this project since the previous yield entry, counted per gate, decision and id. Take `<top>` from `git rev-parse --show-toplevel` and `<gates-since>` from the date in the heading of the previous entry that holds a `gates` line. When none does, `<gates-since>` is empty. Take `<state>` as `$XDG_STATE_HOME` when it is an absolute path, and `$HOME/.local/state` otherwise — the choice `bun/gate-ledger.ts` makes when it writes. Then run:

```bash
jq -rs --arg top "<top>" --arg since "<gates-since>" '[.[] | select(.at >= $since and (.project == $top or (.project | startswith($top + "/"))))] | group_by([.gate, .decision, .rule]) | map("\(.[0].gate) \(.[0].decision) \(.[0].rule) ×\(length)") | if length == 0 then "none fired" else join(", ") end' "<state>/harness/gates.jsonl"
```

Write its output as `- gates: <output>`. A record under a subdirectory of `<top>` counts, because a session started there records the subdirectory. If the file does not exist yet, write `- gates: none fired`.

Then one `captures` line counting step 2's proposals by kind, all five kinds in this order, zeros included: `- captures: N mechanism, N card + rule, N rule, N skill edit, N memory`. A capture the user declined still counts under the kind it was proposed as, and `Nothing to capture.` gives a line of zeros.

Then one `first review` line: of the pull requests whose first CodeRabbit review completed since the previous entry, how many raised no Critical or Major finding. Take `<since>` as the day before the date in the previous entry's heading (GitHub's times are UTC), or today on the first entry ever. The candidates are the numbers of the two `gh pr list` reads below, each once — an open one reviewed after `<since>` may show no update — less any an earlier `first review` line in `docs/context/pipeline-yield-*.md` names as measured; one named `(unmeasured)` is read again. Walk each one's commits oldest first and stop at the earliest with a `success` result reading `Review completed` for this pull request: a check run whose summary links its `/pull/<n>` (the whole number, not the start of a longer one), or a status on a commit `commits/<sha>/pulls` lists under this pull request alone. Drop it if that result predates `<since>`. Its findings are the bot's reviews of that commit, inline and in the body; none is zero findings, which the bot's walkthrough confirms with «No actionable comments were generated» only while its `Commit` names that commit. Read each finding's severity word yourself — after its icon, as in `<picture>…</picture> Major**`, or in its category line, as in `_🟠 Major_` — these are examples, not a pattern; a finding with no word takes the kind its heading implies (`⚠️ Potential issue` → Major) and marks the pull request `#a (Major+, inferred)` or `#a (inferred)`. Count the bot's Critical or Major as Major+, never re-graded, a dismissed one included. A pull request with no such commit is `(unmeasured)` and in neither number. The reads:

```bash
gh pr list --state all --search "updated:>=<since>" --limit 1000 --json number
gh pr list --state open --limit 1000 --json number
gh api 'repos/{owner}/{repo}/pulls/<n>/commits' --paginate --jq '.[].sha'
gh api 'repos/{owner}/{repo}/commits/<sha>/check-runs?filter=all' --paginate --jq '.check_runs[] | select(.name == "CodeRabbit" and .conclusion == "success") | [.started_at, .completed_at, .output.summary] | @tsv'
gh api 'repos/{owner}/{repo}/commits/<sha>/statuses' --paginate --jq '.[] | select(.context == "CodeRabbit" and (.state == "success" or .state == "pending")) | [.created_at, .state, .description] | @tsv'
gh api 'repos/{owner}/{repo}/commits/<sha>/pulls' --jq '.[].number'
gh api 'repos/{owner}/{repo}/pulls/<n>/reviews' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]" and .commit_id == "<sha>") | [.id, .body] | @tsv'
gh api 'repos/{owner}/{repo}/pulls/<n>/reviews/<id>/comments' --paginate --jq '.[].body'
gh api 'repos/{owner}/{repo}/issues/<n>/comments' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | .body'
```

Write `- first review: k of n without Major+ — #a, #b (Major+), #c (unmeasured)`, or `- first review: none reviewed` when none was measured, or the project has no CodeRabbit, still naming any `#c (unmeasured)` after a dash.

A skill that ran and found nothing is the point of this step, not a boring result — record it as `0 findings`. Over a month of sessions this is what shows which step of the pipeline has never once caught anything, so the pipeline gets shortened on evidence instead of by feel. Count only findings the skill itself reported; don't reclassify them.

Append the same lines to `docs/context/pipeline-yield-<yyyy-mm>.md` under a `## <yyyy-mm-dd> — <branch>` heading (get the date with `date +%F` and the month with `date +%Y-%m` — a new month starts a new file; create the file with a `# Pipeline yield` heading if it doesn't exist). Append only — never rewrite or prune earlier sessions; the value is in the accumulation.

Example:

```
- triage: OPEN — 4 groups, 2 high-risk — High/Medium read
- warm: PASS — 2 dependencies vetted, 0 findings, 0 acted on
- zombies: OPEN — 6 gaps, 6 acted on
- code-review: PASS — 7 findings, 7 dispositioned (3 fixed, 4 skipped)
- Not run: preflight
- gates: command-guard block main-commit ×2, turn-gate refused pre-pr-sequence ×1
- captures: 0 mechanism, 1 card + rule, 1 rule, 0 skill edit, 0 memory
- first review: 3 of 4 without Major+ — #41, #42 (Major+), #43, #44, #45 (unmeasured)
```

## Rules

- Always all five headings, in order — steps that don't apply get their one-line skip note, not silence.
- Ground every claim in the actual session: quote the correction, name the file, cite the commit. No generic retrospective filler.
- The only files this skill may touch are the step-4 save point and the step-5 yield ledger, and the ledger is append-only. The only other writes are step 3's card corrections and the transcript archive its catch-up writes, outside the tree. Everything else is a report.
- **Never leave step 5 out because "nothing interesting ran".** A session where no review skill ran is itself the data point — record it as `Not run: <all of them>`.
