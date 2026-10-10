# gate-decision-ledger — design

## Context

Two harness gates decide on their own: `bun/command-guard.ts` on every Bash
call (`PreToolUse`), and `bun/turn-gate.ts` at each turn's end (`Stop`). Each
refuses by exiting 2 with a reason on stderr. Every guard refusal goes through
one `block(reason)` function, which is called in eight places. One of those
places is inside `blockDestination`, which chooses between two reasons. The turn gate refuses
in one place, `decide()`, and lets a turn through in three ways: the message
reports, nothing was completed, or it could not read something. Both scripts
run in the harness from the working tree and in a consumer from
`node_modules/harness/bun/`, through the texts in `bun/bootstrap.ts`. Those
texts run with `$CLAUDE_PROJECT_DIR` set, which is how they find the script.

The motivation is in proposal.md, *Why*. The requirements are in
`specs/gate-ledger/spec.md`.

## Goals / Non-Goals

**Goals:** one writer that both gates call, and ids for the guard's
prohibitions. The wrap-up reads the ledger with tools it already has.

**Non-Goals:** a reader script, a dashboard, and any change to what either gate
decides.

## Decisions

### One module writes; nothing new reads

`bun/gate-ledger.ts` exports the function that appends a JSON line, and the
guard's `block` (see below). The
wrap-up counts lines with `jq` over the file. It does not get a reader script.

- *Alternative: a `summary` CLI beside the writer.* It would be one more
  script with a different path in each consumer
  (`node_modules/harness/bun/…`) than in the harness itself (`bun/…`). No skill
  calls a harness script today. `jq` grouping three fields does the same work.
  No allow list here grants `jq`, so the wrap-up's one call prompts, which is
  acceptable for a command run once per session.

### JSON lines, one file, in the state directory

Each record is a line `{"at","gate","decision","rule","project","session"}`. The
path is `${XDG_STATE_HOME:-~/.local/state}/harness/gates.jsonl`.

- *Alternative: a file inside the project, gitignored.* Every consumer would
  have to add the ignore entry, and the rulebook's Safety rule on `.gitignore`
  would then apply to each of them. One forgotten entry stages a file that can
  hold session ids.
- *Alternative: the OS temp directory, where the turn gate keeps its marks.*
  The OS clears it on reboot. A mark is useful only within a session, but a
  ledger exists to accumulate across sessions.
- *Alternative: one file per project.* Every record already names its project,
  so `jq` filters on that field. One file means one path to document.

### The project is the basename of `$CLAUDE_PROJECT_DIR`

Every hook registration in this tree and in each consumer runs under that
variable, so the writer reads it from the environment. The fallback is the
basename of the event's `cwd`, then `unknown`. A worktree session started
inside a project reports that project's name.

- *Alternative: `git rev-parse --git-common-dir`.* That spawns git on every
  refusal, and the guard already spawns git to decide. The environment variable
  is free, and only the hooks' own registrations depend on it.

### The guard's ids are passed at each call site

`block(id, reason)` replaces `block(reason)`, and each of `blockDestination`'s
two reasons gets its own id. The id is a short kebab-case constant per
prohibition, for example `main-commit`, `main-push`, `force-push`,
`plus-refspec`, `push-to-main`, `unbounded-push`, `ref-wide-push`,
`gh-publish`, `unreadable-event` and `unreadable-branch`. The final list
follows the call sites as they stand when this is applied. A test asserts that
the ids are distinct across call sites.

`bun/command-guard.ts` stands at 299 lines against the 300-line cap that
`bun/file-size.ts` sets for `.ts`. Its `block` function therefore moves into
`bun/gate-ledger.ts`, which records and then exits 2. The guard drops four
lines and gains one import, so it ends below where it starts. The new tests go
in `bun/gate-ledger.test.ts` rather than in `bun/command-guard.test.ts`, which
is at 294 lines.

- *Alternative: derive the id from the reason's prose,* such as its first
  words. Rewording a message would then split one prohibition's counts in two,
  which is what the spec's *A reason reworded* scenario forbids.

### The turn gate records only when a group completed

Its decisions are `refused`, `passed` and `released`, all with the rule
`pre-pr-sequence`. A turn is `released` when the once-per-mark bound lets it end
although it still reports nothing. That is the only record of an agent walking
past a refusal, and the reason the ledger cannot count passes alone. A turn that completed nothing is not recorded. Neither is a
turn the gate could not read: "could not read" covers every session in a
repository that does not use OpenSpec, and would drown the ledger in turns
that carry no information.

`decide()` already computes the completed groups before it refuses. The pass
is recorded on the path where `reported(message)` is true. To get there, the
gate computes the groups before it checks `reported`, and that path then costs
the git reads the refusal path already pays. Today `reported` short-circuits
first.

- *Alternative: record passes without computing groups.* Every reported
  message would count as a pass, including one that completed nothing. That
  inflates the denominator with every turn that merely printed a gate line.

### The write is best-effort and silent

The writer catches every error and returns. The guard calls it immediately
before `process.exit(2)`, and the turn gate calls it before returning its
reason, so a thrown write cannot pre-empt either exit.

## Measurements

- **Append cost:** 0.10–0.31 ms per record over five runs of `appendFileSync`,
  `mkdirSync` included, measured on 2026-10-10. A record is about 130 bytes.
  The guard's own start costs 16–22 ms, per its header.
- **Consumers:** dota2 and mellon run both gates through the
  `bun/bootstrap.ts` texts, which this change does not alter. No decision
  changes, so neither tree can newly fail. What a consumer gains on its next
  pin bump is the write on refusal.

## Risks / Trade-offs

- [The ledger is never pruned] → Records are short and rare, and the cost is
  stated in the writer with a `ponytail:` comment naming rotation as the
  upgrade.
- [The wrap-up's window runs from the previous entry's date, so two sessions
  on one day count each other's records] → Accepted. The ledger exists for
  monthly counts, and the overlap is at most one day.
- [Computing groups before `reported` adds the batch read to a reported turn]
  → It is the 14 ms read that `ship-turn-gate-to-consumers` measured. It is
  paid only on a turn that commits, because without a commit `tip()` returns
  nothing and no read follows.
- [A session id in a file outside the tree] → It is the same id Claude Code
  already writes under `~/.claude/projects/`. Nothing in the ledger is staged
  or published, and the counts copied into the yield ledger carry no id.

## Migration Plan

Nothing to migrate. Consumers gain the write when they bump their pin. The
ledger file appears on the first refusal after that. Rolling back means
reverting the commit, and the file stays behind, inert.
