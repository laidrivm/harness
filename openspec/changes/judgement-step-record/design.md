# judgement-step-record — design

## Context

`bun/gate-ledger.ts` appends one JSON line per decision to
`harness/gates.jsonl` in the user's state directory. `record()` takes the
project from `CLAUDE_PROJECT_DIR` before the event's `cwd`, and never throws.
`ran(commit, top, decision?, ledger?)` answers whether a `pre-pr` record of
`commit` was written in the checkout whose top level is `top`; it ignores the
record's `rule`. Its three readers all mean the diff budget: the turn gate
(`ran(end, top)`, any outcome), the goal check (`ran(commit, top, "pass")`)
and, on the host, `ranUnder` for the goal check and the CI flow's push.
Today `bun/pre-pr.ts` is the only writer of `pre-pr` records, and every one
carries `rule: "diff-budget"`.

The harness's own `.claude/settings.json` registers the hooks `bootstrap.ts`
lists, each ending with `# harness-managed`, each running
`$CLAUDE_PROJECT_DIR/node_modules/harness/bun/<script>.ts`, the pinned copy
(`harness-updates`, *The harness's own sessions run its gates from its pin*).

Platform facts, from the hooks reference and the probe of 2026-10-26:
`PostToolUse` fires for the `Skill` tool, whose `tool_input` carries `skill`
and `args`; `UserPromptExpansion` fires when a typed command expands, with
`command_name` and `command_args`, and a typed `/skill` bypasses the `Skill`
tool. Inside a subagent run with `isolation: "worktree"`, the hook's `cwd` is
the worktree's root, and `session_id` is the main session's.

## Goals / Non-Goals

**Goals:** a record per skill call that the model takes no part in, keyed to
the commit and checkout the call ran in; `ran()` able to ask for one step by
its gate and rule.

**Non-Goals:**

- Any reader that requires a skill record: that is `work.ts finish` (slice
  item 3), which owns which steps a diff requires.
- An outcome or a count of findings (the user's answer on the card: the thin
  variant).
- Removing gate lines or `GATE_LINE` from `bun/turn-gate.ts` (stage 2,
  "Потом" 7).
- Handing the hook to consumers (stage 2, question 28 a″; roadmap stage 11).
- Making the hook's `cwd` a subagent's branch: slice item 0.

## Decisions

### D1. `ran()` matches the gate, and the rule when one is asked for

`ran(commit, top, decision?, ledger?, rule?, gate = "pre-pr")` keeps a
record whose `gate`, `commit` and `project` match, and whose `rule` and
`decision` match when the reader names them. The hook writes the gate
`skill` and the decision `called`, so `work.ts finish` will ask `ran(head,
top, undefined, undefined, "zombies", "skill")`. The goal check and `ranUnder`
ask for a `pass` of every one of `RUNNER_STEPS`, and the turn gate asks
nothing more than before: any record the runner wrote for the tip, since a
failing run still proves it ran.

*Applied (2026-10-27):* the proposal drafted an options object, `ran(commit,
top, {gate, rule, decision} = {}, ledger?)`. By apply time `pre-pr-project-checks`
(#316) had merged the `rule` half as a fifth positional parameter, with
`RUNNER_STEPS` and the goal check and `ranUnder` asking for every step, so
task 1.3's "keep its signature and add only the gate" holds: `gate` is a sixth
positional parameter defaulting to `pre-pr`, and no existing call changes.

- *Alternative: `ran()` matches by `rule` whatever gate wrote the record* (the
  card's first option). Rejected after the conflict check against
  `work-finish` (#308), whose `pre-pr-runner` delta keeps the gate (*A run
  record counts only for its own step*: "beside its gate") and has the turn
  gate ask only whether the runner ran. Without the gate, a turn gate naming
  no rule would be discharged by any record holding the tip's commit — a
  skill call, or a `finish` refusal, which records `HEAD`.
- *Alternative: the hook writes `gate: "pre-pr"`* (the card's second option).
  Rejected: the turn gate's "any runner record" would then be discharged by a
  skill call, and the wrap-up, which counts per gate, would count every skill
  call, stage skills included, as a pre-PR runner run.
- With the gate matched, a guard's refusal never counts for a skill or a
  runner step, whatever its id.

This is the fix the card's item 4 and the 2026-10-26 decision in its "Швы"
assign to whichever slice card merges first; `work-finish` (#308) and slice
item 1 carry the `rule` half too. Whichever merges first fixes the signature,
and the later ones reuse it, adding only what they lack — for this change,
the `gate` it asks for. A change in what this decision says is made in this
file in the same commit (`core/rules.md`, Process: grep a design for a
decision a fix reverses).

### D2. One script for both events, recording the name and nothing else

`bun/skill-record.ts` reads the event from stdin. The rule is
`tool_input.skill` for `PostToolUse` and `command_name` for
`UserPromptExpansion` whose `expansion_type` is `slash_command`; an event
carrying neither is not recorded. An expansion of type `mcp_prompt` is an MCP
server's prompt, not a skill, and a prompt that shares a skill's name would
otherwise read as that step. Arguments,
`tool_response` and the prompt are never read into the record
(`gate-ledger`, *A record holds no command text*): a skill's arguments are
free text and can carry a path or a token.

Every skill is recorded, not a list of the four review skills. The reader
picks which it requires, and stage 2 counts the stage skills' calls
(`opsx:propose`, `opsx:apply`, …) as evidence of the same kind (question 30).
A list in the hook would be a second copy of what `work.ts finish` owns.

- *Alternative: `PreToolUse`.* `PostToolUse` was the user's choice: it fires
  only once the tool returned, so a call the platform refused leaves nothing.

### D3. The commit and the project come from the hook's `cwd`

The hook runs `git rev-parse --verify -q HEAD` and `--show-toplevel` in the
event's `cwd`, then calls `record("skill", "called", <name>, {session_id,
cwd: <top>}, <HEAD>)` with `CLAUDE_PROJECT_DIR` removed from its own
environment first, as `bun/pre-pr.ts` does: that variable names the session's
project, which can be another checkout than the one the call ran in (the main
one, for a subagent in a worktree, where the probe saw only `cwd`), and
`ran()` matches the top level of the checkout the call ran in.

No record is written when there is no `HEAD`, or when `git status --porcelain
--untracked-files=no` prints anything, or fails — the pre-PR runner's rule for
tracked files. Since this was drafted the runner also counts an untracked
file (`pre-pr-runner`, *No record for a tree the commit does not hold*, after
#316 and #321), because its project checks run the whole tree; the hook keeps
the spec's *A skill called with only an untracked file* and records, since a
review skill reads the branch's commits and their diff. The record
names a commit, and a review skill run over an uncommitted edit read a tree no
commit holds; the reader checks the exact `HEAD` before a pull request opens
(stage 2, question 24 a′), so a record of a stale commit would mislead it. The
agent commits, then calls the skill, as the pre-PR sequence already orders.

### D4. Silent, and never in the way

The hook prints nothing and always exits 0. `PostToolUse` cannot undo a call,
but `UserPromptExpansion` can block an expansion, and its stdout can reach the
model's context; a recorder must do neither. Every failure — unreadable
stdin, no git, an unwritable ledger — ends in exit 0 with no record, as
`record()` already swallows its own errors.

### D5. Registered in the harness's own settings only, without the mark

Two registrations in `.claude/settings.json`: `PostToolUse` with the matcher
`Skill`, and `UserPromptExpansion` with no matcher, each running
`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/skill-record.ts"; if [ -f
"$g" ]; then bun "$g"; fi`. The command does not end with `# harness-managed`
and is not in `bootstrap.ts`'s `HOOKS`.

The re-check stage 2 question 28 a″ asked for: `sync-settings.ts` strips only
a hook whose command ends with the mark or equals a `HOOKS` entry without it
(`ours()`); a hook calling a harness script by its `node_modules/harness/`
path is the case `harness-updates`' *Sync leaves the consumer's own settings
as it found them* already keeps. `settings.ts` asserts the `HOOKS` entries are
present and refuses others only under a `sole` matcher (`Bash` in
`PreToolUse`). So a hook kept in the harness's own settings survives a sync
and reaches no consumer, and the fallback key in `package.json` is not needed.

The command runs the pinned copy, as `harness-updates` requires of every hook
there. The hook therefore records nothing until a pin bump moves the pin past
this change's merge; the live probe (task group 2) waits for that bump.

## Seams with sibling cards

- **Slice item 0** (worktrees, `GIT_*` stripping): makes the hook's `cwd` the
  subagent's branch. It also has to make `node_modules/harness` resolvable
  wherever `$CLAUDE_PROJECT_DIR` points inside a worktree session, which every
  gate hook needs, this one included. Until it lands, a subagent's call is
  recorded at the main checkout's `HEAD`.
- **Slice item 1** (project checks in `pre-pr.ts`): shares D1.
- **Slice item 3** (`work.ts finish`, required steps from the diff): the
  reader. It asks `ran()` per required step, with the gate `skill` for a
  skill and the decision `pass` for a runner step. `work-finish` (#308)
  routes the skill records to `finish` through the function a later change
  fills in; this change only makes them readable.
- **Card d / "Потом" 7** (`turn-gate.ts` reads evidence instead of gate
  lines): may read these records later; nothing here changes the turn gate's
  decision.
- **Reviewer rotation**: decides whether `coderabbit-local` is required at
  each SHA; this change records it like any skill.

## Conflict check (stage 2 roadmap question 14 b)

`openspec show judgement-step-record --json --deltas-only` touches
`gate-ledger` and `harness-updates`.

- `host-deploy`, open on `origin/main`, touches `orchestrator` alone: no
  shared capability.
- `work-finish` (#308, open) touches `commit-gates`, `gate-ledger`,
  `pre-pr-runner` and a new `work-finish`. Shared: `gate-ledger`. Its delta
  modifies *Every gate refusal is recorded* (adding the ready guard, the
  pre-push draft check and `finish`); this one adds two requirements and
  modifies *A record holds no command text*: different requirements, and
  neither contradicts the other. Its `pre-pr-runner` delta, *A run record
  counts only for its own step*, describes the same `ran()` as this change's
  *A reader counts a record only for its own gate and step*: both match the
  gate and the rule, and both leave the turn gate asking for any runner
  record (D1, after first drafting the gate away and then reading #308). No
  contradiction: the rule is stated once from the runner's side there and
  once from the ledger's here, and only this one adds the gate a skill record
  is read under. Order through prose: no `after:`, since neither change
  directory is on this branch.

## Risks / Trade-offs

- [The hook proves a call, not that the skill was followed] → accepted by the
  user (thin variant); the review on the pull request and its round counter
  catch a skill called and ignored.
- [A skill called before the commit leaves no record] → intended (D3); the
  reader names the missing step, and the agent calls it again on the commit.
- [Platform field names change] → the hook reads only documented fields
  (`tool_input.skill` is the `Skill` tool's own parameter); the live probe
  in group 2 runs against the real platform, not a stub.
- [Records pile up: every skill call in every harness session] → about 150
  bytes each; the ledger's own rotation note in `gate-ledger.ts` covers it.
- [A typed `/skill` and a `Skill` call for one invocation] → two records of
  the same rule and commit; `ran()` is a presence test, so a duplicate is
  harmless.

## Migration Plan

Merge, then the next self-pin bump past the merge activates the hook in the
harness's sessions. Rollback is reverting the two registrations; the records
already written are inert, since nothing requires them.
