# judgement-step-record

## Why

The pre-PR sequence's judgement steps — `/zombies`, `/triage`, `/warm`,
`/coderabbit-local` — leave nothing in the gate ledger: each ends with a gate
line the model writes, and `core/review-toolkit.md` says of them that
"nothing proves they ran". Stage 2 of the roadmap makes harness code the gate
on opening a pull request, and that gate (`work.ts finish`, slice item 3)
needs evidence it can read for the exact `HEAD`, written without the model's
part in it.

The user settled the form on 2026-10-26 (stage 2, questions 25 and 30,
variant a; the card's answer to its own item 1, "the thin variant"): a
platform hook records each skill call as `{rule: the skill's name, commit:
HEAD of the hook's directory}`. There is no outcome, no count of findings, and
no `pre-pr.ts report` subcommand — the hook proves that the skill was called,
not that it was followed, and the review catches the rest.

## What Changes

- A new hook script, `bun/skill-record.ts`, registered for `PostToolUse` on
  the `Skill` tool (a call Claude makes) and for `UserPromptExpansion` (a
  `/skill` the user types; an MCP server's prompt is not recorded). It appends one ledger record: gate `skill`,
  decision `called`, rule the skill's name, the commit `HEAD` names in the
  hook's `cwd`, and that checkout's top level as the project. It writes no
  record when that directory has no `HEAD`, or when a tracked file differs
  from `HEAD`, the pre-PR runner's rule for tracked files. It never prints,
  never blocks, and records no argument the skill was given.
- `ran()` in `bun/gate-ledger.ts` matches a record by its gate (the runner's
  by default) and, when the reader names it, its `rule`, so a step's record
  never counts as another step's evidence. The goal check and the CI flow's
  push ask for `diff-budget` by name, the turn gate for any runner record as
  today; nothing they decide changes.
- The hook is registered only in the harness's own `.claude/settings.json`,
  without the `# harness-managed` mark and outside `bootstrap.ts`'s `HOOKS`,
  so `sync.ts` keeps it there and hands it to no consumer (stage 2, question
  28 a″). It runs from the harness's pin, as every hook there does, so it
  starts recording once the pin moves past this change.
- `README.md` and `core/review-toolkit.md` name the record and what it does
  not prove.

No reader requires the new records in this change: the user dropped the
interim reader in `goal-check` (the card's item 2), because the reader is
`work.ts finish`. Until then the wrap-up's gates line counts them, per gate,
decision and rule, as it counts every record.

## Order

- **Slice item 0** (card "subagents in worktrees, stripping `GIT_*` in
  fixtures", change `strip-inherited-git-env`): only once subagents work in a worktree
  (`isolation: "worktree"`) is the hook's `cwd` the subagent's branch, as the
  probe of 2026-10-26 showed. Until then a subagent works in a clone it
  reaches by path, its hook's `cwd` is the main checkout, and the record names
  that checkout's `HEAD`. This change can merge first: its records are
  correct for the directory they name, and item 0 makes that directory the
  branch's.
- **Slice item 1** (project checks in `pre-pr.ts`) and **`work-finish`**
  (#308, the draft rule in `work.ts finish`): both add `ran()`'s `rule`
  filter too. Whichever merges first carries it, and the others reuse it;
  this change adds the gate a skill record is read under (design.md D1).
- **Slice item 3** (`work.ts finish`, required steps from the diff): reads
  these records. It applies after this change merges.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gate-ledger`: a new requirement for the skill-call record, a new one
  saying a reader counts a record only for its own gate and step (`ran()`),
  and *A record
  holds no command text* naming the skill's name among the rules a record may
  carry.
- `harness-updates`: a new requirement that a gate hook the harness keeps to
  itself stays in its own settings through a sync and reaches no consumer.

## Impact

- New `bun/skill-record.ts` and its tests; `bun/gate-ledger.ts` (`ran`,
  `ranUnder`, header comment); the `ran` call in `bun/goal-check.ts`; the
  test fixture in `bun/ci-run.test.ts` that writes a passing `pre-pr` record
  with no `rule`.
- `.claude/settings.json` (two registrations), `bun/self-pin.test.ts`,
  `README.md`, `core/review-toolkit.md`.
- Consumers (`d2ass`, `mellon`): nothing new is registered for them; on
  their next bump, `ran()`'s narrower match changes no decision, since every
  `pre-pr` record carries `rule: "diff-budget"`.
- Closest existing artefacts: the archived `2026-10-13-pre-pr-run-record`
  (the runner's record and `ran()`), and the flake watch, the other
  `PostToolUse` hook that writes the ledger.
