# gate-decision-ledger

## Why

The harness cannot say how often its own gates fire. `bun/command-guard.ts`
blocks with a reason on stderr, and `bun/turn-gate.ts` refuses the same way;
neither leaves a record. The only trace of a refusal is the session transcript,
which Claude Code prunes, and which cannot tell a refusal apart from a session
that read the guard's source. Measured on this machine on 2026-10-10: dota2's
oldest retained transcript was nine days old, and a grep for the guard's
reasons across the harness's transcripts counted this very session, which had
printed `bun/command-guard.ts` and `bun/turn-gate.ts` while exploring.

Without a record, two decisions are made by feel. One is the rulebook's own
trigger "rules from this file's middle are observably being ignored", which has
no instrument and so can never fire. The other is whether a gate earns its
place. `core/review-toolkit.md` dropped `/ponytail-review` on evidence from the
pipeline-yield ledger, but no such evidence exists for a hook.

## What Changes

- Each refusal a harness gate makes appends one line to a ledger: the time,
  the gate, the decision, a stable id for the prohibition it applied, the
  project and the session. The turn gate also records a turn that completed a
  task group and was let through because it reported, so that a refusal count
  has a denominator. It also records a turn let through only because it had
  already been refused once, which is the record of an agent walking past a
  refusal.
- The command guard's refusals each get a stable id, one per prohibition, which
  the ledger records in place of the reason's prose.
- The ledger holds no command text. Its counts are copied into a tracked file
  in a public repository, and a command line can carry a token or a
  machine-local path.
- The ledger lives outside every working tree, in the user's state directory,
  so no consumer has anything to add to `.gitignore` and nothing in it can be
  staged.
- Writing the ledger never changes a decision. A refusal whose line cannot be
  written still refuses, with the same exit code and the same reason.
- `session-wrapup` step 5 adds one line to the pipeline-yield entry: the gate
  decisions for this project since the previous entry, counted per gate,
  decision and id. A session in which no gate fired records that too.

## Non-goals

- Allowed Bash calls. The guard allows nearly every command, and a line per
  command would bury the refusals the ledger exists for.
- Claude Code's own `deny` and `ask` decisions, and git hooks. The harness does
  not run inside either. A gate that `policy-gate-beyond-bash` adds as a hook
  records through the same writer.
- Rotation. A refusal is rare, and one short line each grows the file by
  kilobytes a month.

## Capabilities

### New Capabilities

- `gate-ledger`: which gate decisions are recorded, what a record may hold,
  where it lives, that recording never changes a decision, and how the record
  reaches the pipeline-yield ledger.

### Modified Capabilities

None. `commit-gates`' *A turn that commits reports its gates before it ends*
and `agent-permissions`' *The git prohibitions are enforced by a hook* keep
every decision they fix. The ledger observes those decisions and does not
change any of them.

## Impact

- New `bun/gate-ledger.ts` (the writer), called from `bun/command-guard.ts` and
  `bun/turn-gate.ts`, with tests.
- `core/skills/session-wrapup/SKILL.md`: step 5 gains the gates line.
- Consumers: nothing to register. The hooks they already run gain the write
  when they bump their pin.
- Each refusal costs one append. An allowed call costs nothing.
