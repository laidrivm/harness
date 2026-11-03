# session-wrapup-on-done — design

## Context

`bun/work-status.ts` writes the card's `Status`, reads the status back from
Notion's answer, runs the `Assign` release (`cleared()`), and returns its
lines: the move, then the release's line when there is one. `bun/work.ts`
prints them to standard output. In the harness no other path writes `done`:
the status hook refuses the connector's `Status` write.

`session-wrapup` (`core/skills/session-wrapup/SKILL.md`, which Claude Code
finds through the `.claude/skills/session-wrapup` link) has no
`disable-model-invocation`, so the model can start it through the Skill tool
(`agent-autonomy`, *An unattended session runs `/session-wrapup` without
waiting on the user*). The harness's allow list names `Skill(triage)`,
`Skill(zombies)` and others, not `Skill(session-wrapup)`. Its step 5 appends
the yield entry to the tracked `docs/context/pipeline-yield-<yyyy-mm>.md`, and
`core/git-and-prs.md` says to commit it "to the branch in hand, never a branch
of their own".

The command guard refuses a commit on `main`, on a detached `HEAD`, and on a
branch `origin/main` already carries (`merged-branch`). `status --to done`
writes only once `origin/main` proves the merge, so when the line fires the
branch in hand is usually one of those three. Not always: `status` reads the
card's evidence from `origin/main`, never the checkout's branch, so a session
on an unrelated, unmerged branch can write `done` too. The ledger's place
must not depend on which (decision 3).

On the VPS the persistent session runs in `$HOME/harness`, a clone on `main`
(`session-runner-image`); its subagents work in worktrees. Before each start
`orchestrator/runner/session.sh` runs `git pull --ff-only`, and a failed pull
starts claude on the old tree.

## Goals / Non-Goals

**Goals:** the session the user talks to is told to wrap up and to offer
`/clear` once a card is done; the wrap-up's yield ledger changes no file of
any checkout's tree, so the VPS clone's pull is never stopped by it. The save
point is out of that promise (Non-Goals).

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
- The save point (step 4) keeps writing `docs/context/<topic>-<yyyy-mm>.md`:
  an untracked file stops a pull only when the same path arrives, and the
  step runs only for long exploratory sessions. On a branch the guard refuses
  a commit on it stays uncommitted, and the report names it.
- Deleting consumers' ledgers from here: each consumer does it once, in its
  own pull request (decision 4).

## Decisions

### 1. One printed line, no hook

The trigger is the last line `status` prints after it moved a card that read
another status to a read-back of `done`:

```text
next: run /session-wrapup unless it is already running, then tell the user «можно /clear»; a subagent passes this line to its caller instead
```

`status` is the only writer of `done` here and its output is already in the
model's context, so a `PostToolUse` hook on Bash would see the same event and
repeat the same text with more code.

- "Unless it is already running": step 3 of the wrap-up may itself run
  `status --to done` while reconciling the board, and must not start a second
  round.
- No line for a card already at `done`: a retried command or a reconcile would
  otherwise start a wrap-up that already ran, appending a duplicate entry.
- "A subagent passes this line to its caller": on the VPS a worktree subagent
  may archive and move the card; a wrap-up over its short conversation would
  debrief the wrong session and leave the one the user clears untouched. The
  caller, holding the line, runs the wrap-up.
- `/clear` is a built-in command, not a skill: only the user can type it, so
  the line asks the session to say so.

The line is in English beside `status:` and `assign:`, as `core/rules.md`
keeps repository artefacts in British English by default; the card wrote it
in Russian. «можно /clear» stays as the card has it — it is the phrase the
user waits for in chat, and the session replies in Russian anyway. That one
quoted phrase is the deliberate exception, and the constant's comment says so.

It is printed after the release's line and whatever exit code the release
leaves: a failed restore of `Assign` leaves the card done all the same, and
the debrief is still due. A read-back other than `done` already exits 1 and
prints none.

### 2. `Skill(session-wrapup)` in the allow list, pinned where it is looked up

The user's answer to question 1 (03.11, «а»). Without the entry each `done`
on the VPS waits on a permission prompt in the Claude app. The skill writes
only its save point and its yield entry, and its `allowed-tools` bound the
rest; the status hook still refuses a connector `Status` write.

`status` names a skill that the allow list and Claude Code's skill directory
must match, and a mismatch reads as a prompt or a silent no-op, so a case in
`bun/work-status.test.ts` reads the name from the printed line and checks
`.claude/skills/<name>/SKILL.md` — the path Claude Code resolves, not the
`core/skills/` copy behind the link — and the allow entry (`core/rules.md`,
*Pin a name one system looks up in another*).

### 3. The yield ledger leaves the tree — the pipeline-yield seam

When the line fires, the branch in hand is usually `main`, detached or merged
(see Context): the guard refuses the commit `core/git-and-prs.md` asks for,
so an in-tree entry can never be committed from there, and on the VPS clone
the dirty file stops the next `git pull --ff-only` once the laptop's entry for
the same month merges. Three fixes were weighed:

- **Write outside the clone** (chosen). The entry goes to
  `~/.local/state/harness/pipeline-yield/<repo>/<yyyy-mm>.md` on every
  branch, whatever its state. `<repo>` is the `<owner>/<name>` that `git
  remote get-url origin` ends in, without `.git` (`laidrivm/harness`,
  `laidrivm/dota2`), or `local/` and `<top>`'s basename where there is no
  `origin` — two directories, so no owner and name can run together into
  another's: one machine runs several projects, and
  a ledger they shared would date one project's windows from another's entry
  and skip its pull request numbers. The path is fixed rather than
  `$XDG_STATE_HOME`-relative, so the one `allowed-tools` rule always matches
  it and an unattended wrap-up never stops at a prompt and ends without its
  entry; the gates line still reads `gates.jsonl` where `bun/gate-ledger.ts`
  writes it. The gates line reads that machine's ledger, so dating it from
  the previous entry of a ledger on the same machine is more exact than a
  repository file both machines append to. The VPS rules card keeps its manual-steps log in the
  home directory for the same reason. Cost: the tracked ledger stops growing;
  each machine's entries are read on that machine.
- **Write through a pull request.** A branch, a pull request, CI, a
  CodeRabbit review and a merge per wrap-up, for a ledger line — and
  `core/git-and-prs.md` already rules out a branch of the artefacts' own.
- **Make the pull survive the dirty file** (`--autostash`, or a reset). The
  entry is still never committed, so the data is lost either way. Reasoned,
  not probed: an autostash re-applies an append to the end of a file the pull
  also appended to, which conflicts and leaves unmerged paths that stop the
  next pull; a new month's file is untracked, which `--autostash` leaves, and
  the pull refuses to overwrite it. A reset discards the entry outright.

Question 2 on the card put this against a narrower form: outside the tree
only where the guard refuses the commit, and in `docs/context/` on a branch
that can still take it. The user chose this one (03.11, «а») and widened it:
the harness moves to it whole, on the VPS and the laptop; wrap-up ledgers no
longer reach git, and the tracked ones leave this repository and the
consumers.

### 4. One ledger per machine, and the tracked ones deleted

Every read of "the previous entry" in step 5 — `<gates-since>`, `<since>`, and
the earlier `first review` lines a pull request is skipped by — reads
`<repo>`'s files in the state ledger alone, so the windows never overlap on
one machine. A pull
request measured on the laptop can be measured again on the host, and each
ledger's count stays honest on its own.

No seed: a machine's first entry takes the rules step 5 already has for the
first entry ever — the `gates` line counts every record the gate ledger
holds for this project and its subdirectories, as its query already filters,
and `first review` starts today. Reading the tree's last entry instead
would stop working the moment those files are deleted, and the one-off long
`gates` line is that machine's history, which no remaining ledger counted.

The change deletes `docs/context/pipeline-yield-2026-10.md`, the one tracked
ledger here. Nothing executable reads it: no check, test, hook or
`bun/settings.ts` entry names `docs/context/` or `pipeline-yield`. Its
readers are prose — the skill's step 5, `core/git-and-prs.md`'s rule on
committing wrap-up artefacts, `core/review-toolkit.md`'s pointer to the
counts — and each moves to the state ledger. Its 2026-10-28 first-review
baseline stays in the archived `first-review-yield` change's `design.md`,
*Baseline*. Archived changes that cite the file are history and keep their
text. The save point (step 4) keeps writing `docs/context/<topic>-<yyyy-mm>.md`
— it is not a ledger, and the user's answer named only the ledgers.

Consumers carry their own copies (`dota2` holds `pipeline-yield-2026-07` to
`-10`, `mellon` holds `-10`, read through GitHub on 03.11). A pin bump syncs
the skill and docs but deletes nothing in a consumer's tree, and an automatic
delete of a consumer's tracked files is more than a one-off needs, so
README's *Consuming* gains a one-time step: after the bump that carries this
change, delete the tracked `docs/context/pipeline-yield-*.md` in a pull
request of the consumer's own. This change edits no other repository.

A detached `HEAD` has no branch for the entry's `## <yyyy-mm-dd> — <branch>`
heading; it names the detached commit as `git status` prints it.

The skill's `allowed-tools` gain `Edit(~/.local/state/harness/pipeline-yield/**)`
and `Bash(git remote get-url origin)` — an `Edit` rule covers the Write that
creates a new month's file: Claude Code's permission docs (*Read and Edit*,
read on apply, 03.11) say "`Edit` rules apply to all built-in tools that edit
files", a `~/` path is home-relative, and `**` matches across directories.
`core/review-toolkit.md`,
which points readers at `docs/context/pipeline-yield-*.md`, points at the
ledger step 5 names instead.

### 5. Rule 4 of the VPS rules shrinks to a pointer

Card 40c39875c31b81f0b1d1cbea945696bc adds `orchestrator/runner/CLAUDE.md`
with rule 4 — "When a card reaches done, run `/session-wrapup`, then write
«можно /clear»" — as the stop-gap for this mechanism, and its explore says
the rule leaves or shrinks to a pointer once the line lands. The line is
advisory, not a gate, so the rule shrinks rather than goes: one line telling
the session to act on the `next:` line `status` prints, without restating
its steps. That file is not on `main` as this is written, so the task is
conditional on where it stands at apply.

## Risks / Trade-offs

- [The session ignores the line] → the shortened rule 4 points at it, and the
  metric's manual-steps log shows missed wrap-ups as `/clear` steps the user
  asked for.
- [A machine's entries stay on that machine] → read there; a change of its
  own carries them if the monthly count needs both machines.
- [The state directory is lost — a new laptop, or the VPS's `agent_home`
  volume recreated] → the ledger goes with it, as `gates.jsonl` already does;
  the user chose a ledger outside git knowing it.
- [A consumer skips the one-time delete] → its tracked ledgers stay as
  frozen history; nothing writes to them after its bump.
- [Two clones of one repository with different `origin` names] → their
  entries split across two files; the name comes from `origin` so a worktree
  and its main checkout, which share it, share one file.

## Migration Plan

The line appears on the next `status --to done` after merge, and the
harness's tracked ledger is deleted in the same pull request. Consumers take
the skill change with their next pin bump, then delete their tracked ledgers
once, as README's *Consuming* says (decision 4). A dirty
`docs/context/pipeline-yield-*.md` already in a clone on `main` — the VPS's,
or the laptop's main checkout — goes when the pull brings the deletion: an
unmodified copy is removed by the pull, a modified one stops it, and the user
discards that file alone (`git checkout -- 'docs/context/pipeline-yield-*.md'`,
which leaves a save point beside it as it is) or copies its entries into
`~/.local/state/harness/pipeline-yield/<repo>/<yyyy-mm>.md` first.

Rollback: the revert restores the old contract, under which the ledger is
tracked, so its pull request is the one place host entries return to git — an
exception to decision 3 that only undoing this change makes. In it, append
each machine's
state-ledger entries for the harness, in date order, to the restored
`docs/context/pipeline-yield-<yyyy-mm>.md`, so the reverted skill's previous
entry is the latest one written and its windows neither skip nor re-count
what the state ledger counted.
