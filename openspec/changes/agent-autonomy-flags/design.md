# agent-autonomy-flags — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/agent-permissions/spec.md` and `specs/agent-autonomy/spec.md`.

What Claude Code does with the flag was read from its skills page on
2026-10-18, and probed where a probe was possible.

- **The documentation** says the flag hides the skill's description from the
  model. If the model calls the skill anyway, Claude Code blocks the call and
  tells it not to carry out the steps another way. The flag also keeps the
  skill from being preloaded into a sub-agent, and from running when a
  scheduled task fires with the skill as its prompt. A `/name` at the start of
  the user's message still runs the skill directly.
- **Probed** in a sub-agent session started from an orchestrator's brief. The
  Skill tool refused `review-order` with "cannot be used with Skill tool due
  to disable-model-invocation … it is reserved for explicit user invocation".
  None of the five flagged skills linked in this repository appeared in that
  session's skill listing: `checklist`, `coderabbit`, `first-five`,
  `review-order` and `session-wrapup`. The orchestrator met the same refusal
  on `coderabbit`.
- **Not probed**: whether `claude -p` with a prompt that opens on `/name` runs
  a flagged skill. The page does not say, and a sub-agent here may not start
  `claude`. Nothing below depends on the answer.
- **`allowed-tools`** grants its tools without a prompt for the turn that
  invokes the skill, whoever invokes it. Deny rules, ask rules and hooks still
  apply.

`ship` step 5 invokes `coderabbit` through the Skill tool, and step 1 invokes
`pr-brief` the same way. Both calls are refused today.

Where each removed skill is referenced, outside the append-only history in
`docs/context/`:

| Skill | Referenced from |
| --- | --- |
| `code-review` | README skill table and severity note; `session-wrapup`'s example |
| `checklist` | README skill table; `.claude/skills/checklist` in the harness, `d2ass` and `mellon` |
| `first-five` | README skill table; `session-wrapup`'s example; the `.claude/skills/` link in all three checkouts |
| `review-order` | README skill table; `session-wrapup`'s example; the `.claude/skills/` link in all three checkouts; `bun/check.test.ts` (fixture name) |
| `pr-brief` | README skill table; `ship` steps 1 and 3; `triage`'s gate-line note |

`bun/check.test.ts` names `review-order` only inside a fabricated consumer
whose package lacks it. After the removal that case describes exactly what a
consumer that misses the migration sees, so it stays. `skills-lock.json`
lists none of the five, so all five are owned, and the README's *Skill
provenance* section needs no edit.

## Goals / Non-Goals

**Goals:**

- A flag stands only where a step of its skill stays with the user, and a
  check holds that.
- `/coderabbit` and `/session-wrapup` can run without anyone present.
  `/coderabbit` still cannot spend a session waiting for the bot.

**Non-Goals:**

- When `/session-wrapup` runs, and the handover to a fresh session. These
  belong to the card the proposal names.
- A tracked list of the flagged skills (D4).

## Decisions

### D1. The flag follows a `user` step

A skill under `core/skills/` carries the flag only when one of its steps is
marked `(unattended: user`. The table below records the user's settlement of
2026-10-18.

| Skill | Outcome | Reason |
| --- | --- | --- |
| `ship` | keep | Its merge belongs to the user, and merging normally goes through CI. The step gets the `user` marker. |
| `coderabbit` | drop | It reads the pull request and applies verified fixes, as the unflagged `/coderabbit-local` does. D2 guards the wait. |
| `session-wrapup` | drop | Agents end their own sessions and wrap up on the way out (D3). |
| `checklist`, `code-review`, `first-five`, `pr-brief`, `review-order` | remove | None of them is in a workflow or loop, and the user does not use them. `code-review` also collides with the bundled `/code-review`. |

Alternatives considered:

- A hand-written list of the flagged skills, pinned by a test. Rejected,
  because the marker is the reason and a list would restate it.
- A test over the skills that drop the flag, by name. Rejected, because it
  enumerates what it covers, which the scan rule in `core/rules.md` forbids.
- `skillOverrides` in settings. Rejected, because every consumer would have
  to repeat it.

### D2. `/coderabbit` waits for nothing

Step 1 reads the head commit with `gh pr view --json headRefOid` and the
reviews with the skill's existing `pulls/N/reviews` call. If no review from a
`coderabbitai` login has a `commit_id` equal to the head commit, the run ends
on `CODERABBIT gate: OPEN — no CodeRabbit review of <short sha> yet.` and does
nothing more. A run that finds a review of the head commit keeps the skill's
existing re-fetch before its gate line. That is one more read to reconcile
the bot's N + M, so a review that lands mid-run is dispositioned and is not
merged past. It is never a sleep or a loop. One new rule states both halves.
The `gh api graphql` line stays as it is, because
`bun/command-guard-gh-api.test.ts` reads it from the file.

Alternatives considered:

- **Any bot review counts as landed.** Rejected by the user. Findings on an
  earlier commit belong to a snapshot the branch has moved past.
- **Ending every run after one read.** Rejected in the PR review of #152.
  A review that lands while the first is being dispositioned would go
  unread, and `/ship` would merge on the `PASS`.
- **A hook refusing `sleep` while the skill runs.** Rejected, because a wait
  costs time, not safety. `git-and-prs.md` already says never to wait on a
  review bot, and the skill's `allowed-tools` grants no `sleep`.

### D3. `session-wrapup`'s steps, unattended

| Step | Unattended |
| --- | --- |
| 1 Confidence check, 5 Pipeline yield | Reports and the append-only ledger. Nothing names the user. |
| 2 Lessons learned | Proposes captures, and "the user decides what to keep". This step gets the marker `(unattended: card — hand each proposed capture on, and apply none)`, which matches `core/rules.md`'s own. |
| 3 Workflow state, card corrections | Already writes the cards behind their floor. Nothing names the user. |
| 4 Save point | Written when the session was exploratory. This is the handover a context-window wrap-up leaves, and no one is asked. |

### D4. `core/autonomy.md` names no skill

One paragraph goes under `user`: a skill whose frontmatter carries the flag is
a `user` step, so the session reports `BLOCKED` naming it and never carries out
its steps by other means. The frontmatter and the marker stay the single
source, as the README already says of the flag.

### D5. The check reads frontmatter where Claude Code does

`check()` in `bun/autonomy.ts` already reads every Markdown file under `core/`
for markers. For each `core/skills/*/SKILL.md` it also parses the leading
`---` block with `Bun.YAML.parse`, and treats the flag as set when the key is
present and not `false`. A flagged skill whose file holds no
`(unattended: user` marker is reported. A block that does not parse is
reported too, since Claude Code would load such a skill with empty metadata. A
file with no block carries no flag.

### D6. `ship` writes its own title and body

`ship` loses its dependence on `pr-brief`.

- Step 1 states the gate rule itself. It collects every gate line emitted in
  the session, takes the last one for each skill, and stops on any `BLOCKED`
  or `OPEN`.
- Step 3 writes the title and body to the project's pull request rules, which
  is `core/git-and-prs.md` wherever the harness is installed. It stops and
  asks when the project has no such rules (`card` by default).

The other route was to make `ship` require a body handed to it. That was
rejected because `ship` is user-only, and the user starting it does not
expect to supply a body.

### D7. Grants that model invocation newly reaches

Removing the flag puts two grants within reach of a run the model starts.
Each was checked against the guards that still apply:

- `coderabbit` grants `Bash(gh api:*)`, which matches writes. The command
  guard refuses those writes (*GitHub write commands are denied*), whatever
  the grant says.
- `session-wrapup` grants `Write` and a Notion page update. The Notion update
  guard reads every such update. The skill's prose limits writes to
  `docs/context/`, but nothing enforces that limit, so `Write` leaves the
  grant. A wrap-up's two files then go through the session's own permission
  settings, like any other edit. A `Write(path)` rule was not used to scope
  the grant instead.

## Risks / Trade-offs

- [Two more descriptions sit in every session's skill listing] → each is a
  few hundred characters, and the listing budget drops the descriptions of
  rarely used skills first.
- [A consumer's pin bump fails on the dangling links] → the proposal's
  *Impact* section says the bump deletes them, and the orchestrator files a
  card on each consumer's board.

## Migration Plan

`d2ass` and `mellon` delete `.claude/skills/{checklist,first-five,review-order}`
in the pull request that moves their pin past this change. Nothing else
migrates. Rollback is a revert.
