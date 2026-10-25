# fresh-subagent-brief — design

## Context

Nothing in the tree says how a session delegates. The closest artefacts are
`core/autonomy.md`'s "An orchestrator copies the line into each worker's
brief, because a worker cannot see its parent's prompt" and `agent-autonomy`'s
scenario *A worker whose brief declares it unattended*: both assume a brief
and say nothing of its content or of forks.

What a fresh subagent already receives was observed, not assumed: a
subagent started by `Agent` with no fork, on 2026-10-25 in this repository,
opened with `CLAUDE.md`, the `core/rules.md` it imports, and the index lines
of the user's auto-memory — not the memory files those lines name and not the
parent's conversation. It reads the docs the rulebook links and the skills on
demand, as any session does. A board-loop session on the VPS runs `claude -p`
in a clone, so it loads the same `CLAUDE.md` and rulebook, and no user memory.

## Decisions

Numbered as on the card's two questions — items 1–8 of 2026-10-24, 9–12 of
2026-10-25 — and the user's answers.

1. **The stage prompt stays as it is.** User: а. The board loop's stage
   session loads the rulebook, so the line reaches it; `bun/board-loop-prompt.ts`
   and its five-line test are not touched.
2. **The brief repeats no rule of the harness.** User: а. Under answer 5 no
   tracked doc describes a brief, so the check the question proposed — a test
   failing when the doc copies a rulebook bullet — has nothing to read, and a
   brief lives only in a launch prompt, which no test sees. The line itself
   says "nothing the harness already loads", and the test pins that it does.
3. **One line, no doc.** Reverses the proposed `core/delegation.md`. With the
   brief cut to the task and its context (answer 5), what a doc would add to
   the line is a list of slots the line already names; a doc read on demand
   behind a line that says it all costs a file, a `CLAUDE.md` link and a
   check, for no reader. Nothing new goes into git but the line.
4. **The line sits in the `### Rules` preamble.** User: ok. Beside the
   `verification.md` and `autonomy.md` lines, outside the Code, Process and
   Safety sublists, whose counts it leaves as they are. Wording:

   > How a session hands a task to a subagent: start a fresh one, forking only
   > when the task needs this session's history, and write its brief into the
   > launch prompt, never into git — the task, the clone and branch, the acts
   > allowed, the user's words that apply and the report's form, and nothing
   > the harness already loads.

5. **A brief is the task and its context.** User direction. A fresh subagent
   runs on the same harness: it loads `CLAUDE.md` and the rulebook, and reads
   the indexed docs and skills on demand, so a brief copies none of them. What
   it carries is what only the delegating session knows — the task, the clone
   and branch to work in, the acts allowed (commit, push, a pull request, a
   card's status or `Assign`, a host), the user's words that bear on the task,
   and the form the report takes. The brief is written by the delegating
   session into the `Agent` prompt at launch and goes into git nowhere.
6. **Dropped.** It said the approval model before a pull request would be
   named in the doc as a slot, its wording left to its own card. With no doc
   and no slots there is nothing to name: once that card lands, the model is
   in the harness and a brief does not copy it; until then the user's words on
   it reach a brief as words that apply to the task.
7. **Assumption, user: ok.** The observation in *Context* stands; it is why
   a brief copies nothing.
8. **Assumption, user: ok.** A convention of this repository no file writes
   down (the 300-line cap, the `flock` cases that skip on macOS) is not in the
   harness, so it reaches a brief as the task's context until a change writes
   it into the tree; this change writes none.
9. **The form of 10–12 stands.** User: а — yes, "let's try it this way",
   and ok on 10–12.
10. **No `core/delegation.md`; one line and its test.** User: ok. The line
    of decision 4, pinned by `bun/delegation.test.ts` (decision 3).
11. **No test that a brief copies no rule.** User: ok. There is no tracked
    brief to read; the line itself carries the prohibition (decision 2).
12. **The stage prompt is not touched.** User: ok (decision 1).

## Risks

- The line rests on one observation in one Claude Code version of what a
  fresh subagent loads. If a later version stops passing `CLAUDE.md` to
  subagents, a brief that copies nothing would run without the rules; the
  observation is dated here so a reader can re-check it.
- Nothing checks a brief: it lives only in a launch prompt. A brief that
  restates a rule wastes its tokens and can drift from the rulebook; the line
  is the only guard.
