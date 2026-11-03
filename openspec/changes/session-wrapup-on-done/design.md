# session-wrapup-on-done — design

## Context

`bun/work-status.ts` writes the card's `Status`, reads the status back from
Notion's answer, runs the `Assign` release (`cleared()`), and returns its
lines: the move, then the release's line when there is one. `bun/work.ts`
prints them to standard output. In the harness no other path writes `done`:
the status hook refuses the connector's `Status` write.

`session-wrapup` (`core/skills/session-wrapup/SKILL.md`) has no
`disable-model-invocation`, so the model can start it through the Skill tool
(`agent-autonomy`, *An unattended session runs `/session-wrapup` without
waiting on the user*). The harness's allow list names `Skill(triage)`,
`Skill(zombies)` and others, not `Skill(session-wrapup)`. Its step 5 appends
the yield entry to the tracked `docs/context/pipeline-yield-<yyyy-mm>.md`, and
`core/git-and-prs.md` says to commit it "to the branch in hand, never a branch
of their own".

On the VPS the persistent session runs in `$HOME/harness`, a clone on `main`
(`session-runner-image`); its subagents work in worktrees. Before each start
`orchestrator/runner/session.sh` runs `git pull --ff-only`, and a failed pull
starts claude on the old tree.

## Goals / Non-Goals

**Goals:** a session that writes `done` is told to wrap up and to offer
`/clear`; the wrap-up it starts on the VPS leaves the clone's `main` clean.

**Non-Goals:**

- A card a person moves to `done` on the board: no session reads Notion
  between turns. The user types `/session-wrapup` then; `SessionStart`
  (stage 3) or the events (stage 6) can cover it if the metric shows such
  steps.
- Other cards' context at WIP > 1, which `/clear` drops too: their state is in
  Notion and GitHub (stage 3, question 33).
- Consumers: they move a status through the connector and never see the line;
  stage 2.5 does not need it.
- The context-window threshold (card 40c39875c31b8105837eed7d739a8086).

## Decisions

### 1. One printed line, no hook

The trigger is the last line `status` prints after a read-back of `done`:

```text
next: run /session-wrapup unless it is already running, then tell the user «можно /clear»
```

`status` is the only writer of `done` here and its output is already in the
model's context, so a `PostToolUse` hook on Bash would see the same event and
repeat the same text with more code. "Unless it is already running" because
step 3 of the wrap-up may itself run `status --to done` while reconciling the
board, and must not start a second round. `/clear` is a built-in command, not
a skill: only the user can type it, so the line asks the session to say so.

The line is in English beside `status:` and `assign:`, as `core/rules.md`
keeps repository artefacts in British English; the card wrote it in Russian.
«можно /clear» stays as the card has it — it is the phrase the user waits for
in chat, and the session replies in Russian anyway.

It is printed when the read-back reads `done`, after the release's line and
whatever exit code the release leaves: a failed restore of `Assign` leaves the
card done all the same, and the debrief is still due. A read-back other than
`done` already exits 1 and prints none.

Alternatives: a `PostToolUse` hook (above); a rule in prose only — which is
the stop-gap this replaces (decision 5).

### 2. `Skill(session-wrapup)` in the allow list, pinned where it is defined

The user's answer to question 1 (03.11, «а»). Without the entry each `done`
on the VPS waits on a permission prompt in the Claude app. The skill writes
only its save point and its yield entry, and its `allowed-tools` bound the
rest; the status hook still refuses a connector `Status` write.

`status` names a skill that `.claude/settings.json` and `core/skills/` must
match, and a mismatch reads as a prompt or a silent no-op, so a case in
`bun/work-status.test.ts` reads the name from the printed line and checks the
skill's `SKILL.md` and the allow entry (`core/rules.md`, *Pin a name one
system looks up in another*).

### 3. The yield entry goes outside the tree on `main` — the pipeline-yield seam

On `main` the guard refuses the commit `core/git-and-prs.md` asks for, so the
entry can never be committed from there, and the dirty file stops the next
`git pull --ff-only` once the laptop's entry for the same month merges. Three
fixes were weighed:

- **Write outside the clone** (chosen). The entry goes to
  `<state>/harness/pipeline-yield-<yyyy-mm>.md`, `<state>` as step 5 already
  takes it for the gates line — `$XDG_STATE_HOME` when absolute, else
  `$HOME/.local/state` — beside `gates.jsonl`. The gates line reads that
  machine's ledger, so dating it from the previous entry of a ledger on the
  same machine is more exact than a repository file both machines append to.
  The VPS rules card keeps its manual-steps log in the home directory for the
  same reason. Cost: a host's entries do not reach the repository; they are
  read on the host.
- **Write through a pull request.** A branch, a pull request, CI, a
  CodeRabbit review and a merge per wrap-up, for a ledger line — and
  `core/git-and-prs.md` already rules out a branch of the artefacts' own.
- **Make the pull survive the dirty file** (`--autostash`, or a reset). The
  entry is still never committed, so the data is lost either way. Reasoned,
  not probed: an autostash re-applies an append to the end of a file the pull
  also appended to, which conflicts and leaves unmerged paths that stop the
  next pull; a new month's file is untracked, which `--autostash` leaves, and
  the pull refuses to overwrite it. A reset discards the entry outright.

Not a question for the user: the second option reverses a settled rule, the
third loses the entry, and the first matches a choice already made for the
VPS log. Carrying host entries into the repository later, if the monthly
count needs them, is a change of its own.

### 4. Decided by the branch, not by the host

The condition is the one the guard refuses a commit on: `git branch
--show-current` printing `main`, or nothing for a detached `HEAD`. It holds on
the laptop's `main` checkout too, where the entry was equally uncommittable,
and needs no host flag. The skill's `allowed-tools` gain `Bash(git branch
--show-current)` and `Edit(~/.local/state/harness/pipeline-yield-*.md)` — an
`Edit` rule covers the Write that creates a new month's file (to confirm
against Claude Code's permission docs on apply). With `$XDG_STATE_HOME` set
elsewhere the write asks once; the VPS sets none.

`first review` reads "an earlier `first review` line" from the ledger it
appends to as well, so the two ledgers measure independently: a pull request
measured on the laptop can be measured again on the host. Each ledger's count
stays honest on its own.

### 5. Rule 4 of the VPS rules leaves its prose home

Card 40c39875c31b81f0b1d1cbea945696bc adds `orchestrator/runner/CLAUDE.md`
with rule 4 — "When a card reaches done, run `/session-wrapup`, then write
«можно /clear»" — as the stop-gap for this mechanism. Once the line lands,
the rule is mechanised and leaves, as `agent-rulebook`'s *A mechanised
prohibition leaves its prose home* asks of a prohibition; what may stay is a pointer
saying the `status` line carries it. That file is not on `main` as this is
written, so the task is conditional on where it stands at apply.

## Risks / Trade-offs

- [The session ignores the line] → the same risk as the prose rule it
  replaces, with the text now at the moment it applies; the metric's
  manual-steps log would show missed wrap-ups as `/clear` steps the user asked
  for.
- [A host's entries stay on the host] → read there; a change of its own
  carries them if the monthly count needs both machines.
- [A save point written on `main`] → step 4 still writes
  `docs/context/<topic>-<yyyy-mm>.md`, an untracked file that stops a pull
  only if the same path arrives from elsewhere; left as is.
- [`$XDG_STATE_HOME` set to another path] → the ledger write prompts once
  instead of running; noted in the skill.

## Migration Plan

None: the line appears on the next `status --to done` after merge; consumers
take the skill change with their next pin bump. A dirty
`docs/context/pipeline-yield-*.md` already in a clone on `main` is the user's
to move or discard — this change writes no cleanup.
