---
name: session-wrapup
description: End-of-session ritual — confidence check on what was built, fix & capture pass for uncaptured lessons, OpenSpec workflow state with the next command, an optional save-point doc for long exploratory sessions, and a pipeline-yield line recording what each review skill actually found.
disable-model-invocation: true
allowed-tools: "Read, Write, Glob, Grep, Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(ls:*), Bash(date:*), Bash(mkdir:*)"
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

- For each, propose the capture: a rule (CLAUDE.md line), a skill edit (name the skill and the exact change), or a new memory.
- **Propose, don't apply** — the user decides what to keep.
- If the session was clean, say exactly: `Nothing to capture.` Don't invent lessons to fill the section.

## 3. Workflow state

State which OpenSpec stage the work is in, named by its `/opsx:` command (explore / propose / apply / verify / sync / archive), or by the project's own stage name where it defines one — or "not using OpenSpec this session" — and give the **exact command to run first next session**, copy-pasteable. If work stopped mid-task, one line on where.

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

A skill that ran and found nothing is the point of this step, not a boring result — record it as `0 findings`. Over a month of sessions this is what shows which step of the pipeline has never once caught anything, so the pipeline gets shortened on evidence instead of by feel. Count only findings the skill itself reported; don't reclassify them.

Append the same lines to `docs/context/pipeline-yield-<yyyy-mm>.md` under a `## <yyyy-mm-dd> — <branch>` heading (get the date with `date +%F` and the month with `date +%Y-%m` — a new month starts a new file; create the file with a `# Pipeline yield` heading if it doesn't exist). Append only — never rewrite or prune earlier sessions; the value is in the accumulation.

Example:

```
- triage: OPEN — 4 groups, 2 high-risk — High/Medium read
- warm: PASS — 2 dependencies vetted, 0 findings, 0 acted on
- first-five: 3 findings, 2 acted on (1 rejected: false positive on a retried job)
- zombies: OPEN — 6 gaps, 6 acted on
- coderabbit-local: PASS — 7 findings, 7 dispositioned (3 fixed, 4 skipped)
- Not run: review-order, code-review, preflight
```

## Rules

- Always all five headings, in order — steps that don't apply get their one-line skip note, not silence.
- Ground every claim in the actual session: quote the correction, name the file, cite the commit. No generic retrospective filler.
- The only files this skill may touch are the step-4 save point and the step-5 yield ledger, and the ledger is append-only. Everything else is a report.
- **Never leave step 5 out because "nothing interesting ran".** A session where no review skill ran is itself the data point — record it as `Not run: <all of them>`.
